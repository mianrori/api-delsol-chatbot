// Read-only DEV validation. Business values stay in memory; reports contain checks only.
import fs from 'node:fs';
import crypto from 'node:crypto';
import config from '../config.js';
import driver from 'oracledb';
import {withOracleProxySession,getValidOracleSession} from '../src/services/sessions/oracleSession.service.js';
import {closeOracleSessionsPool} from '../src/database/oracleSessions.database.js';
const emit=process.stdout.write.bind(process.stdout);for(const key of ['log','info','warn','error','debug','trace','dir','table'])console[key]=()=>{};
const report={suite:'invoice-balances-dev',commit:process.argv[2],mode:process.argv[3],success:false,checks:[],startedAt:new Date().toISOString(),providerCalls:0,pdfDownloads:0};
export function parseBalanceDueDate(value){
 const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value??'').trim());if(!m)return null;
 const [,d,month,y]=m.map(Number),date=new Date(0);date.setUTCFullYear(y,month-1,d);date.setUTCHours(0,0,0,0);
 return y>=1&&date.getUTCFullYear()===y&&date.getUTCMonth()===month-1&&date.getUTCDate()===d?date:null;
}
const check=(ok,code)=>{report.checks.push({code,passed:Boolean(ok)});if(!ok)throw Error(code);};
let sessionId,opened=0,closed=0,closeErrors=0;
const originalGetConnection=driver.getConnection;
driver.getConnection=async(...args)=>{const c=await originalGetConnection.apply(driver,args);opened++;c.callTimeout=60000;const close=c.close.bind(c);let done=false;c.close=async()=>{try{await close();if(!done){done=true;closed++;}}catch(e){closeErrors++;throw e;}};return c;};
async function profile(connection){
 const run=async(sql,binds={})=>(await connection.execute(sql,binds,{outFormat:4002,maxRows:20})).rows;
 const meta=await connection.execute('SELECT * FROM VW_BOT_FACTURAS_SALDOS WHERE 1=0',{}, {outFormat:4002});
 const columns=meta.metaData.map(c=>c.name);report.columns=columns;check(!columns.includes('USER_CAN_CONSULT'),'NO_USER_CAN_CONSULT_COLUMN_ASSUMPTION');
 check(['NRO_FACTURA','SECTOR','VENCIMIENTO','COD_CLIENTE','NOM_CLIENTE','RAZON_SOCIAL','RUC','SIMBOLO_MONEDA','SALDO'].every(c=>columns.includes(c)),'EXPECTED_BALANCE_COLUMNS_PRESENT');
 const inventory=(await run(`SELECT COUNT(*) R,COUNT(DISTINCT NRO_FACTURA) I,
 SUM(CASE WHEN SALDO>0 THEN 1 ELSE 0 END) P,SUM(CASE WHEN SALDO=0 THEN 1 ELSE 0 END) Z,
 SUM(CASE WHEN SALDO<0 THEN 1 ELSE 0 END) N,SUM(CASE WHEN SALDO IS NULL THEN 1 ELSE 0 END) U,
 SUM(CASE WHEN VENCIMIENTO IS NULL THEN 1 ELSE 0 END) D,
 COUNT(DISTINCT SIMBOLO_MONEDA) M FROM VW_BOT_FACTURAS_SALDOS`))[0];
 report.samples={anyRows:Number(inventory.R)>0,positive:Number(inventory.P)>0,zero:Number(inventory.Z)>0,negative:Number(inventory.N)>0,nullBalance:Number(inventory.U)>0,nullDue:Number(inventory.D)>0,multipleSymbols:Number(inventory.M)>1,rowsEqualDistinctInvoiceNumbers:Number(inventory.R)===Number(inventory.I)};
 const duplicate=async(group,having)=>Number((await run(`SELECT CASE WHEN EXISTS (SELECT 1 FROM VW_BOT_FACTURAS_SALDOS WHERE NRO_FACTURA IS NOT NULL GROUP BY ${group} HAVING ${having}) THEN 1 ELSE 0 END V FROM DUAL`))[0].V)===1;
 report.granularity={repeatedInvoiceNumber:await duplicate('NRO_FACTURA','COUNT(*)>1'),
 invoiceAcrossCustomers:await duplicate('NRO_FACTURA','COUNT(DISTINCT COD_CLIENTE)>1'),
 invoiceAcrossSectors:await duplicate('NRO_FACTURA','COUNT(DISTINCT SECTOR)>1'),
 invoiceAcrossSymbols:await duplicate('NRO_FACTURA','COUNT(DISTINCT SIMBOLO_MONEDA)>1'),
 repeatedCandidateKey:await duplicate('NRO_FACTURA,COD_CLIENTE,SECTOR,SIMBOLO_MONEDA','COUNT(*)>1'),
 identicalVisibleRows:await duplicate('NRO_FACTURA,SECTOR,VENCIMIENTO,COD_CLIENTE,NOM_CLIENTE,RAZON_SOCIAL,RUC,SIMBOLO_MONEDA,SALDO','COUNT(*)>1'),
 businessKeyProven:false};
 const dates=await connection.execute('SELECT DISTINCT VENCIMIENTO FROM VW_BOT_FACTURAS_SALDOS',{}, {outFormat:4002,resultSet:true});
 let seen=0,valid=0,invalid=0,nulls=0,iso=0,complete=false;
 try{while(seen<=10000){const rows=await dates.resultSet.getRows(500);if(!rows.length){complete=true;break;}for(const r of rows){seen++;if(r.VENCIMIENTO==null||!String(r.VENCIMIENTO).trim())nulls++;else if(parseBalanceDueDate(r.VENCIMIENTO))valid++;else{invalid++;if(/^\d{4}-\d{2}-\d{2}$/.test(String(r.VENCIMIENTO).trim()))iso++;}}}}finally{await dates.resultSet.close();}
 report.dueDate={scanComplete:complete,distinctValuesCapped:!complete,validDDMMYYYYPresent:valid>0,invalidPresent:invalid>0,nullOrBlankPresent:nulls>0,isoShapePresent:iso>0,allNonBlankValidDDMMYYYY:complete&&invalid===0&&valid>0};
 const nonce=crypto.randomBytes(32);report.definition={readable:false};
 try{
  const defs=await run('SELECT TEXT FROM ALL_VIEWS WHERE VIEW_NAME=:name',{name:'VW_BOT_FACTURAS_SALDOS'});
  if(defs.length===1&&typeof defs[0].TEXT==='string'){
   const text=defs[0].TEXT;report.definition={readable:true,opaque:crypto.createHmac('sha256',nonce).update(text).digest('hex'),hasGrouping:/\bGROUP\s+BY\b/i.test(text),hasUnion:/\bUNION\b/i.test(text),mentionsNativeCurrencyKey:/\b(?:COD_MONEDA|MONEDA_ID|CURRENCY_ID)\b/i.test(text),saldoExpressionUsesSum:/\bSUM\s*\([^)]*\bSALDO\b/i.test(text),businessMeaningNotEstablished:true};
  }
 }catch(e){report.definition={readable:false,technicalCode:/^(?:ORA-\d{5}|NJS-\d{3})$/.test(e?.code??'')?e.code:'DEFINITION_UNAVAILABLE'};}
 report.currency={nativeIdentifierExposed:columns.some(c=>['COD_MONEDA','MONEDA_ID','CURRENCY_ID','ISO_CURRENCY_CODE'].includes(c)),symbolsAreNotProvenCurrencyKeys:true,conversionPerformed:false};
 report.semanticLimits=['zero balance does not prove payment','negative balance does not prove credit/refund without business contract','observed uniqueness is not a documented invoice business key'];
}
try{
 check(config.env==='development'&&!config.bedrockDebugPayloads&&!config.piiDebugShowRaw,'SAFE_DEV_CONFIGURATION');
 if(report.mode==='--preflight'){report.success=true;}
 else{
  let raw='';for await(const c of process.stdin){raw+=c;if(raw.length>4096)throw Error('INPUT_TOO_LARGE');}sessionId=JSON.parse(raw).sessionId;raw='';check(/^[a-f0-9-]{36}$/i.test(sessionId??''),'OWNED_LOGIN_SESSION_REQUIRED');
  const owned=await getValidOracleSession(sessionId);
  await withOracleProxySession(sessionId,async({connection})=>{
   const id=(await connection.execute("SELECT USER U,SYS_CONTEXT('USERENV','SESSION_USER') S,SYS_CONTEXT('USERENV','PROXY_USER') P FROM DUAL",{}, {outFormat:4002})).rows[0],norm=v=>String(v??'').trim().toUpperCase();
   check(norm(id.U)===norm(owned.username)&&norm(id.S)===norm(owned.username)&&Boolean(id.P),'SESSION_ID_RESOLVES_POSTGRES_ORACLE_PROXY_IDENTITY');
   if(report.mode==='--profile')await profile(connection);else throw Error('VALIDATION_MODE_NOT_PREPARED');
  });report.success=true;
 }
}catch(e){report.error={code:/^[A-Z][A-Z0-9_]+$/.test(e?.message??'')?e.message:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'BALANCE_DEV_CONTROL_FAILED'};}
finally{driver.getConnection=originalGetConnection;await closeOracleSessionsPool();report.cleanup={driverRestored:driver.getConnection===originalGetConnection,opened,closed,closeErrors,allConnectionsClosed:opened===closed&&!closeErrors,postgresPoolClosed:true};if(!report.cleanup.allConnectionsClosed)report.success=false;sessionId=null;}
report.finishedAt=new Date().toISOString();emit(JSON.stringify(report));process.exitCode=report.success?0:1;
