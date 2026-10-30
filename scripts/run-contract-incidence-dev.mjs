import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import config from '../config.js';
import { withOracleProxySession, getValidOracleSession } from '../src/services/sessions/oracleSession.service.js';
import { analyzeContractCostIncidence } from '../src/services/contracts/contractCostIncidence.service.js';
import { contractBusinessConfig } from '../src/config/contractBusiness.config.js';
import { getHistoricalContractByMonthRepository } from '../src/repositories/contracts/contractHistoryByPeriod.repository.js';
const report={suite:'contract-incidence-dev',startedAt:new Date().toISOString(),checks:[],coverage:{},pending:[]};
const check=(ok,code)=>report.checks.push({code,passed:Boolean(ok)});
const codes=contractBusinessConfig.incidenceConceptCodes.map(String);
const from=process.env.BOT_TEST_INCIDENCE_FROM||'01/01/2023',to=process.env.BOT_TEST_INCIDENCE_TO||'31/05/2023';
const iso=s=>s.split('/').reverse().join('-');
const currency=s=>{const v=String(s??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return ['PYG','GS','GS.','₲','GUARANIES'].includes(v)?'PYG':['USD','$','US$','DOLARES'].includes(v)?'USD':null;};
const near=(a,b)=>a===b||(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(0.0001,Math.abs(b)*1e-9));
const identity=c=>[c.TIP_CONTRATO,c.SER_CONTRATO,c.NRO_CONTRATO].join('|');
try{
 if(config.env!=='development'||config.bedrockDebugPayloads||config.piiDebugShowRaw)throw Error('UNSAFE_CONFIGURATION');
 if(!process.env.BOT_TEST_SESSION_ID?.trim())throw Error('SESSION_REQUIRED');
 let closed=false;
 await withOracleProxySession(process.env.BOT_TEST_SESSION_ID,async({connection})=>{
  const close=connection.close.bind(connection);connection.close=async()=>{await close();closed=true;};
  const binds={dateFrom:from,dateTo:to};
  // Independent source reads. Association, invoice ordering and aggregation are
  // performed below, without invoking the application's repositories.
  const sales=(await connection.execute(`SELECT COD_CLIENTE,TO_CHAR(FECHA,'YYYY-MM-DD HH24:MI:SS') AS AT,
   MONTO_TOTAL AS AMOUNT,SIGLAS_MONEDA AS CURRENCY,DES_MONEDA AS CURRENCY_DESCRIPTION
   FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=TO_DATE(:dateFrom,'DD/MM/YYYY') AND FECHA<TO_DATE(:dateTo,'DD/MM/YYYY')+1`,binds,{maxRows:200001})).rows??[];
  const contracts=(await connection.execute(`SELECT COD_CLIENTE,TIP_CONTRATO,SER_CONTRATO,NRO_CONTRATO,NRO_LOCAL,
   TO_CHAR(FEC_CONTRATO,'YYYY-MM-DD HH24:MI:SS') AS START_AT,TO_CHAR(FEC_VENCIMIENTO,'YYYY-MM-DD HH24:MI:SS') AS END_AT
   FROM VW_BOT_CONTRATOS_LOCALES WHERE TIP_CONTRATO='CNT'`,{},{maxRows:20001})).rows??[];
  const concepts=(await connection.execute(`SELECT TIP_CONTRATO,SER_CONTRATO,NRO_CONTRATO,COD_CONCEPTO,
   TO_CHAR(FEC_DESDE,'YYYY-MM-DD HH24:MI:SS') AS EFFECTIVE_AT FROM VW_BOT_CONTRATOS_CONCEPTOS`,{},{maxRows:100001})).rows??[];
  const invoices=(await connection.execute(`SELECT COD_CLIENTE,COD_CONCEPTO,NRO_FACTURA,SIMBOLO_MONEDA AS CURRENCY,
   TO_CHAR(FECHA_EMISION,'YYYY-MM-DD HH24:MI:SS') AS AT,IMPORTE,IVA
   FROM VW_BOT_FACTURAS WHERE FECHA_EMISION>=TO_DATE(:dateFrom,'DD/MM/YYYY') AND FECHA_EMISION<TO_DATE(:dateTo,'DD/MM/YYYY')+1
   AND NVL(ANULADO,'N')<>'S' AND NVL(USER_CAN_CONSULT,'S')<>'N'`,binds,{maxRows:200001})).rows??[];
  if(!sales.length||sales.length>200000||contracts.length>20000||concepts.length>100000||invoices.length>200000)throw Error('EMPTY_OR_TRUNCATED_CONTROLS');
  const months=[];for(let d=new Date(iso(from)+'T00:00:00Z'),end=new Date(iso(to)+'T00:00:00Z');d<=end;d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)))months.push(d.toISOString().slice(0,7));
  const customers=[...new Set(invoices.filter(i=>codes.includes(String(i.COD_CONCEPTO))).map(i=>String(i.COD_CLIENTE)))];
  const selected=[];
  const control=(key,month)=>{
   const start=[month+'-01 00:00:00',iso(from)+' 00:00:00'].sort().at(-1);
   const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10);
   const end=[last+' 23:59:59',iso(to)+' 23:59:59'].sort()[0];
   const cs=contracts.filter(c=>String(c.COD_CLIENTE)===key&&c.START_AT&&c.START_AT<=end&&(!c.END_AT||c.END_AT>=start));
   const ss=sales.filter(s=>String(s.COD_CLIENTE)===key&&s.AT.slice(0,7)===month);
   const sm=new Set(ss.map(s=>{const a=currency(s.CURRENCY),b=currency(s.CURRENCY_DESCRIPTION);return String(s.CURRENCY??'').trim()&&!a?null:a&&b&&a!==b?null:a??b;}));
   const amount=ss.reduce((n,s)=>n+Number(s.AMOUNT??0),0);
   if(cs.length!==1)return {valid:false,reason:cs.length?'CONTRACT_AMBIGUOUS':'CONTRACT_NOT_AVAILABLE',sales:sm.size>1||sm.has(null)?null:amount,salesCurrency:[...sm][0],salesRows:ss.length};
   if(cs[0].START_AT>start||(cs[0].END_AT&&cs[0].END_AT<end))return {valid:false,reason:'CONTRACT_PARTIAL_PERIOD',sales:sm.size>1||sm.has(null)?null:amount,salesCurrency:[...sm][0],salesRows:ss.length};
   const cc=concepts.filter(c=>identity(c)===identity(cs[0])&&codes.includes(String(c.COD_CONCEPTO))&&(!c.EFFECTIVE_AT||c.EFFECTIVE_AT<=end));
   const expectedCodes=[...new Set(cc.map(c=>String(c.COD_CONCEPTO)))];
   const selectedInvoices=[];
   for(const code of expectedCodes){
    const ii=invoices.filter(i=>String(i.COD_CLIENTE)===key&&String(i.COD_CONCEPTO)===code&&i.AT.slice(0,7)===month).sort((a,b)=>b.AT.localeCompare(a.AT)||String(b.NRO_FACTURA).localeCompare(String(a.NRO_FACTURA),undefined,{numeric:true}));
    const i=ii[0];if(i&&cc.some(c=>String(c.COD_CONCEPTO)===code&&(!c.EFFECTIVE_AT||c.EFFECTIVE_AT<=i.AT)))selectedInvoices.push(i);
   }
   const cm=new Set(selectedInvoices.map(i=>currency(i.CURRENCY)));
   const cost=cm.size!==1||cm.has(null)||selectedInvoices.some(i=>i.IMPORTE==null)?null:selectedInvoices.reduce((n,i)=>n+Number(i.IMPORTE)-Number(i.IVA??0),0);
   const valid=selectedInvoices.length>0&&selectedInvoices.length===expectedCodes.length&&sm.size===1&&!sm.has(null)&&cm.size===1&&!cm.has(null)&&[...cm][0]===[...sm][0]&&ss.length>0&&amount!==0;
   return {valid,reason:valid?'OK':!ss.length?'NO_SALES':amount===0?'ZERO_SALES':cost===null||sm.size!==1||[...cm][0]!==[...sm][0]?'CURRENCY_MISMATCH':'PARTIAL_COST',sales:sm.size>1||sm.has(null)?null:amount,salesCurrency:[...sm][0],costCurrency:[...cm][0],cost,ratio:valid?Number((cost/amount*100).toFixed(4)):null,salesRows:ss.length,contract:cs[0]};
  };
  const verify=(result,controls,prefix)=>{
   if(result.groupBy==='month'){
    for(let j=0;j<controls.length;j++){
     const {month,c}=controls[j],r=result.data?.find(p=>p.month===month.slice(5,7)+'/'+month.slice(0,4));
     check(Boolean(r),prefix+'_MONTH_'+j+'_PRESENT');if(!r)continue;
     check(near(r.sales.amount,c.sales),prefix+'_MONTH_'+j+'_SALES_CONTROL');
     if(c.cost!==undefined)check(near(r.shoppingCost.amount,c.cost),prefix+'_MONTH_'+j+'_COST_CONTROL');
     check(c.valid?near(r.incidencePercentage,c.ratio):r.incidencePercentage===null,prefix+'_MONTH_'+j+'_VALID_INCIDENCE_ONLY');
     if(r.incidencePercentage===null)check(typeof r.reason==='string'&&r.reason.length>0,prefix+'_MONTH_'+j+'_REASON_PRESENT');
     if(r.exchange?.available||result.exchange?.available){const rate=(r.exchange??result.exchange).sellRate;
      check((r.sales.currency.code!=='PYG'||r.sales.amount===null||near(r.sales.usd,r.sales.amount/rate))&&(r.shoppingCost.currency.code!=='PYG'||r.shoppingCost.amount===null||near(r.shoppingCost.usd,r.shoppingCost.amount/rate)),prefix+'_MONTH_'+j+'_USD_ARITHMETIC');}
    }
   }else{
    const cs=controls.map(v=>v.c),currencies=new Set(cs.map(c=>c.salesCurrency));
    const valid=cs.every(c=>c.valid)&&currencies.size===1;
    check(valid?near(result.incidencePercentage,Number((cs.reduce((n,c)=>n+c.cost,0)/cs.reduce((n,c)=>n+c.sales,0)*100).toFixed(4))):result.incidencePercentage===null,prefix+'_SUMMARY_VALID_INCIDENCE_ONLY');
    if(cs.every(c=>c.sales!==null&&c.salesCurrency)&&currencies.size===1)check(near(result.sales.amount,cs.reduce((n,c)=>n+c.sales,0)),prefix+'_SUMMARY_SALES_CONTROL');
    if(cs.every(c=>c.cost!=null&&c.costCurrency)&&new Set(cs.map(c=>c.costCurrency)).size===1)check(near(result.shoppingCost.amount,cs.reduce((n,c)=>n+c.cost,0)),prefix+'_SUMMARY_COST_CONTROL');
    if(result.incidencePercentage===null)check(typeof result.reason==='string'&&result.reason.length>0,prefix+'_SUMMARY_REASON_PRESENT');
   }
  };
  // Find a compact set of real profiles; names and amounts never enter reports.
  for(const key of customers){
   const controls=months.map(m=>control(key,m));
   for(const reason of new Set(controls.map(c=>c.reason)))if(!report.coverage[reason]){report.coverage[reason]=true;if(!selected.includes(key))selected.push(key);}
   if(selected.length>=6)break;
  }
  if(!selected.length)throw Error('NO_CONTROL_FIXTURES');
  let index=0;
  for(const key of selected){
   const prefix='FIXTURE_'+(++index);
   const monthly=await analyzeContractCostIncidence({customerId:key,dateFrom:from,dateTo:to,groupBy:'month'},connection);
   const controls=months.map(month=>({month,c:control(key,month)}));
   verify(monthly,controls,prefix);
   const summary=await analyzeContractCostIncidence({customerId:key,dateFrom:from,dateTo:to,groupBy:'summary'},connection);
   verify(summary,controls,prefix);
  }
  if(process.env.BOT_TEST_INCIDENCE_HTTP==='true'){
   const filteredCustomer=selected.find(k=>months.some(m=>control(k,m).valid));
   if(filteredCustomer){
    const month=months.find(m=>control(filteredCustomer,m).valid),c=control(filteredCustomer,month),contract=c.contract;
    const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();
    const args={customerId:filteredCustomer,dateFrom:`01/${month.slice(5,7)}/${month.slice(0,4)}`,dateTo:`${last}/${month.slice(5,7)}/${month.slice(0,4)}`,groupBy:'summary',contractType:contract.TIP_CONTRATO,contractSeries:contract.SER_CONTRATO,contractNumber:String(contract.NRO_CONTRATO)};
    if(contract.NRO_LOCAL!=null)args.localNumber=String(contract.NRO_LOCAL);
    verify(await analyzeContractCostIncidence(args,connection),[{month,c}],'EXACT_CONTRACT_AND_LOCAL_FILTERS');
    const absent=await analyzeContractCostIncidence({...args,localNumber:'-999999999'},connection);
    check(absent.incidencePercentage===null&&absent.status==='CONTRACT_NOT_AVAILABLE','NONMATCHING_LOCAL_FILTER_DENIES_CALCULATION');
   }
   // Execute the actual generated Oracle SQL over synthetic CTE rows only.
   // No CREATE/INSERT/UPDATE or alteration of a DEV source view/table.
   const timestamp=s=>s?`TO_DATE('${s}','YYYY-MM-DD HH24:MI:SS')`:'CAST(NULL AS DATE)';
   const fixtureRow=(start,end,n=1)=>`SELECT 'SYNTHETIC' COD_CLIENTE,'Synthetic' NOM_CLIENTE,'Synthetic' RAZON_SOCIAL,'L' NRO_LOCAL,'CNT' TIP_CONTRATO,'S' SER_CONTRATO,${n} NRO_CONTRATO,${timestamp(start)} FEC_CONTRATO,${timestamp(end)} FEC_VENCIMIENTO,10 TOTAL_SUP_LOCAL FROM DUAL`;
   for(const [label,rows,expected] of [
    ['EXACT_START_OPEN_END',[fixtureRow('2023-01-15 00:00:00',null)],'APPLICABLE'],
    ['EXACT_EXPIRY',[fixtureRow('2023-01-15 00:00:00','2023-01-31 23:59:59')],'APPLICABLE'],
    ['START_ONE_SECOND_LATE',[fixtureRow('2023-01-15 00:00:01',null)],'CONTRACT_PARTIAL_PERIOD'],
    ['EXPIRY_ONE_SECOND_EARLY',[fixtureRow('2023-01-01 00:00:00','2023-01-31 23:59:58')],'CONTRACT_PARTIAL_PERIOD'],
    ['EXPIRED_BEFORE_PERIOD',[fixtureRow('2023-01-01 00:00:00','2023-01-14 23:59:59')],'CONTRACT_NOT_AVAILABLE'],
    ['START_AFTER_PERIOD',[fixtureRow('2023-02-01 00:00:00',null)],'CONTRACT_NOT_AVAILABLE'],
    ['OVERLAP',[fixtureRow('2023-01-01 00:00:00',null),fixtureRow('2023-01-01 00:00:00',null,2)],'CONTRACT_AMBIGUOUS'],
   ]){
    const synthetic={execute:(sql,binds)=>connection.execute(sql.replace('WITH MONTHS AS',`WITH SYNTHETIC_CONTRACTS AS (${rows.join(' UNION ALL ')}), MONTHS AS`).replace(/VW_BOT_CONTRATOS_LOCALES/g,'SYNTHETIC_CONTRACTS'),binds)};
    const result=await getHistoricalContractByMonthRepository({connection:synthetic,customerId:'SYNTHETIC',dateFrom:'15/01/2023',dateTo:'31/01/2023'});
    check(result.length===1&&result[0].resolution===expected,'ORACLE_CTE_BOUNDARY_'+label);
   }
   const {router}=await import('../src/routes/index.js');
   const {getConversation,setConversation,clearConversation}=await import('../src/state/conversation.store.js');
   const {protectPiiDeep,restorePiiDeep}=await import('../src/services/ai/pii.service.js');
   const {default:express}=await import('express');
   const first=selected.find(k=>months.some(m=>control(k,m).valid));
   check(Boolean(first),'HTTP_VALID_FIXTURE');
   if(first){
    const sessionId=process.env.BOT_TEST_SESSION_ID;
    const args={customerId:first,dateFrom:from,dateTo:to,groupBy:'month'};
    const seed=await analyzeContractCostIncidence(args,connection);
    setConversation(sessionId,[{role:'user',content:[{text:'Incidencia contractual del local seleccionado'}]},
     {role:'assistant',content:[{toolUse:{name:'analyze_contract_cost_incidence',toolUseId:'inc-seed',input:protectPiiDeep(sessionId,args)}}]},
     {role:'user',content:[{toolResult:{toolUseId:'inc-seed',status:'success',content:[{json:protectPiiDeep(sessionId,seed,null,['analyze_contract_cost_incidence'])}]}}]},
     {role:'assistant',content:[{text:'Incidencia del período seleccionado.'}]}]);
    const other=selected.find(k=>k!==first&&sales.some(s=>String(s.COD_CLIENTE)===k))??sales.map(s=>String(s.COD_CLIENTE)).find(k=>k!==first),month=months.find(m=>control(first,m).valid);
    const end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).getUTCDate();
    const customer=other?(await connection.execute(`SELECT MAX(NOMBRE_CLIENTE) AS LABEL FROM VW_BOT_VENTAS_LOCALES WHERE COD_CLIENTE=:customerId`,{customerId:other})).rows?.[0]?.LABEL:null;
    const steps=[['SUMMARY','Ahora muestra el resumen; conserva los demás filtros',{groupBy:'summary'}],
     ['PERIOD',`Ahora cambia el período a 01/${month.slice(5,7)}/${month.slice(0,4)} al ${end}/${month.slice(5,7)}/${month.slice(0,4)}; conserva los demás filtros`,{dateFrom:`01/${month.slice(5,7)}/${month.slice(0,4)}`,dateTo:`${end}/${month.slice(5,7)}/${month.slice(0,4)}`}]];
    if(customer&&!String(customer).includes('"'))steps.push(['CUSTOMER',`Ahora cambia el local a "${customer}"; conserva los demás filtros`,{customerId:other}]);
    else report.pending.push('HTTP_CUSTOMER_FOLLOWUP_FIXTURE_NOT_FOUND');
    const app=express();app.use(express.json());app.use('/chatbot/api',router);
    const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    let expected=structuredClone(args);
    try{for(const [label,message,change] of steps){
     expected={...expected,...change};
     const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(90000)});
     const body=await response.json();check(response.status===200&&body.success===true,'HTTP_'+label+'_SUCCESS');
     const h=getConversation(sessionId);let start=-1;for(let j=h.length-1;j>=0;j--)if(h[j].role==='user'&&h[j].content?.some(b=>typeof b.text==='string')){start=j;break;}
     const blocks=h.slice(start+1).flatMap(m=>m.content??[]),queries=blocks.map(b=>b.toolUse).filter(t=>t?.name==='analyze_contract_cost_incidence');
     check(queries.length===1,'HTTP_'+label+'_QUERY_EXECUTED');if(queries.length!==1)break;
     const input=restorePiiDeep(sessionId,queries[0].input);
     check(['customerId','dateFrom','dateTo','groupBy','localNumber','contractType','contractSeries','contractNumber'].every(k=>JSON.stringify(input[k]??null)===JSON.stringify(expected[k]??null)),'HTTP_'+label+'_FILTERS_PRESERVED');
     const result=blocks.map(b=>b.toolResult).find(b=>b?.toolUseId===queries[0].toolUseId);
     check(result?.status==='success','HTTP_'+label+'_TOOL_SUCCESS');
     if(result?.status==='success')verify(restorePiiDeep(sessionId,result.content.find(c=>c.json)?.json),months.filter(m=>m>=iso(expected.dateFrom).slice(0,7)&&m<=iso(expected.dateTo).slice(0,7)).map(month=>({month,c:control(expected.customerId,month)})),'HTTP_'+label);
     check(String(body.response??'').includes('Incidencia del costo contractual sobre ventas'),'HTTP_'+label+'_DETERMINISTIC_PRESENTATION');
    }}finally{clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
   }
  }
 });
 check(closed,'CONTROL_CONNECTION_CLOSED');
 if(process.env.BOT_TEST_DENIED_SESSION_ID?.trim()){
  const allowed=await getValidOracleSession(process.env.BOT_TEST_SESSION_ID),denied=await getValidOracleSession(process.env.BOT_TEST_DENIED_SESSION_ID);
  check(allowed.username!==denied.username,'DISTINCT_ORACLE_USERS');
  if(allowed.username!==denied.username){let rejected=false,closed=false;
   try{await withOracleProxySession(process.env.BOT_TEST_DENIED_SESSION_ID,async({connection})=>{const close=connection.close.bind(connection);connection.close=async()=>{await close();closed=true;};await analyzeContractCostIncidence({customerId:'-999999999',dateFrom:from,dateTo:to},connection);});}catch(e){rejected=[942,1031].includes(Number(e.errorNum));}
   check(rejected,'REAL_DENIAL_NO_DATA');check(closed,'DENIED_CONNECTION_CLOSED');report.coverage.deniedUser=true;
  }
 }else report.pending.push('REAL_DENIED_USER_NOT_CONFIGURED');
 for(const reason of ['OK','NO_SALES','ZERO_SALES','CONTRACT_AMBIGUOUS','CONTRACT_PARTIAL_PERIOD','CURRENCY_MISMATCH'])if(!report.coverage[reason])report.pending.push(reason+'_DEV_FIXTURE_NOT_FOUND');
 report.success=report.checks.every(c=>c.passed);
}catch(e){report.success=false;report.error=/^[A-Z_]+$/.test(e.message??'')?e.message:'INCIDENCE_DEV_CHECK_FAILED';if(Number.isInteger(e.errorNum))report.oracleErrorNum=e.errorNum;}
report.finishedAt=new Date().toISOString();
await writeFile(process.env.BOT_TEST_REPORT||'/tmp/contract-incidence-dev.json',JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));process.exit(report.success?0:1);
