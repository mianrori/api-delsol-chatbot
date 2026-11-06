import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import config from "../config.js";
import { contractBusinessConfig } from "../src/config/contractBusiness.config.js";
import { withOracleProxySession, getValidOracleSession } from "../src/services/sessions/oracleSession.service.js";
import { getSalesPerSqm } from "../src/services/sales/salesPerSqm.service.js";
import { createRequire } from "node:module";
import { router } from "../src/routes/index.js";
import { getConversation, setConversation, clearConversation } from "../src/state/conversation.store.js";
import { protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
const require=createRequire(import.meta.url);

const report={suite:"sales-per-sqm-oracle",startedAt:new Date().toISOString(),checks:[],coverage:{}};
const check=(condition,code)=>{report.checks.push({code,passed:Boolean(condition)});};
const close=(a,b)=>a===b||(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b)));
const currency=(r)=>{
  const value=String(r.CURRENCY_CODE||r.CURRENCY_DESCRIPTION||"").trim().toUpperCase();
  if(["PYG","GS","GS.","₲","GUARANIES"].includes(value))return "PYG";
  if(["USD","$","US$","DOLARES"].includes(value))return "USD";
  return value||null;
};
const from=process.env.BOT_TEST_SQM_FROM||"01/01/2023",to=process.env.BOT_TEST_SQM_TO||"31/05/2023";
const validDate=(s)=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);if(!m)return false;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCDate()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCFullYear()===+m[3];};
try{
  if(config.env!=="development"||config.bedrockDebugPayloads||config.piiDebugShowRaw)throw Error("UNSAFE_DEV_CONFIGURATION");
  if(!process.env.BOT_TEST_SESSION_ID?.trim())throw Error("SESSION_REQUIRED");
  if(!validDate(from)||!validDate(to)||from.split('/').reverse().join('')>to.split('/').reverse().join(''))throw Error("INVALID_PERIOD");
  report.profile={from,to};
  let positiveClosed=false;
  let permissionProbe;
  await withOracleProxySession(process.env.BOT_TEST_SESSION_ID,async({connection})=>{
    const originalClose=connection.close.bind(connection);
    connection.close=async(...args)=>{const result=await originalClose(...args);positiveClosed=true;return result;};
    // Independent controls: two simple selects, no application repositories,
    // no SQL join/KEEP/scalar area expression shared with the implementation.
    const sales=(await connection.execute(`SELECT COD_CLIENTE, COD_RUBRO,
      TO_CHAR(FECHA,'YYYY-MM-DD HH24:MI:SS') AS SALE_AT,
      SUM(MONTO_TOTAL) AS AMOUNT, SUM(CANTIDAD_FACTURAS) AS INVOICES,
      COUNT(*) AS SOURCE_ROWS, SIGLAS_MONEDA AS CURRENCY_CODE, DES_MONEDA AS CURRENCY_DESCRIPTION
      FROM VW_BOT_VENTAS_LOCALES
      WHERE FECHA >= TO_DATE(:dateFrom,'DD/MM/YYYY') AND FECHA < TO_DATE(:dateTo,'DD/MM/YYYY') + 1
      GROUP BY COD_CLIENTE, COD_RUBRO, FECHA, SIGLAS_MONEDA, DES_MONEDA`,{dateFrom:from,dateTo:to},{maxRows:200001})).rows??[];
    const contracts=(await connection.execute(`SELECT COD_CLIENTE,
      TO_CHAR(FEC_CONTRATO,'YYYY-MM-DD HH24:MI:SS') AS START_AT,
      TO_CHAR(FEC_VENCIMIENTO,'YYYY-MM-DD HH24:MI:SS') AS END_AT, TOTAL_SUP_LOCAL AS AREA
      FROM VW_BOT_CONTRATOS_LOCALES
      WHERE TIP_CONTRATO=:contractType AND FEC_CONTRATO < TO_DATE(:dateTo,'DD/MM/YYYY')+1
        AND (FEC_VENCIMIENTO IS NULL OR FEC_VENCIMIENTO >= TO_DATE(:dateFrom,'DD/MM/YYYY'))`,
      {dateFrom:from,dateTo:to,contractType:contractBusinessConfig.currentContract.contractType},{maxRows:20001})).rows??[];
    if(sales.length===0||sales.length>200000||contracts.length>20000)throw Error("CONTROL_FIXTURE_EMPTY_OR_LIMIT_EXCEEDED");
    const byCustomer=new Map();for(const c of contracts){const key=String(c.COD_CLIENTE);if(!byCustomer.has(key))byCustomer.set(key,[]);byCustomer.get(key).push(c);}
    for(const s of sales){s.matches=(byCustomer.get(String(s.COD_CLIENTE))??[]).filter(c=>c.START_AT&&c.START_AT<=s.SALE_AT&&(!c.END_AT||c.END_AT>=s.SALE_AT));s.area=s.matches.length===1&&Number(s.matches[0].AREA)>0?Number(s.matches[0].AREA):null;}
    const customerSales=new Map();for(const s of sales){const key=String(s.COD_CLIENTE);if(!customerSales.has(key))customerSales.set(key,[]);customerSales.get(key).push(s);}
    const fixtures={};
    for(const [key,items] of customerSales){
      if(items.every(s=>s.area!==null))fixtures.complete??=key;
      if(items.every(s=>s.area===null)&&items.every(s=>s.matches.length<2))fixtures.missing??=key;
      if(items.some(s=>s.area===null)&&items.some(s=>s.area!==null))fixtures.partial??=key;
      if(items.some(s=>s.matches.length>1))fixtures.ambiguous??=key;
      if(items.some(s=>s.matches.length===1&&Number(s.matches[0].AREA)===0))fixtures.zero??=key;
      if(new Set(items.filter(s=>s.area!==null).map(s=>s.area)).size>1)fixtures.changedArea??=key;
    }
    for(const key of ["complete","missing","partial","ambiguous","zero","changedArea"])report.coverage[key]=Boolean(fixtures[key]);
    check(Boolean(fixtures.complete),"POSITIVE_HISTORICAL_AREA_FIXTURE");
    const selected=[...new Set(Object.values(fixtures))].slice(0,6);
    permissionProbe={customerIds:[fixtures.complete??selected[0]],dateFrom:from,dateTo:to,groupBy:[]};
    const compare=(result,source,label)=>{
      const amount=source.reduce((n,s)=>n+Number(s.AMOUNT??0),0),invoices=source.reduce((n,s)=>n+Number(s.INVOICES??0),0);
      const currencies=new Set(source.map(currency));
      const expected=source.length&&source.every(s=>s.area!==null)&&currencies.size===1?source.reduce((n,s)=>n+Number(s.AMOUNT??0)/s.area,0):null;
      check(currencies.size>1?result.totalSales===null:close(result.totalSales,amount),label+"_SALES_CONTROL");
      check(close(result.totalInvoices,invoices),label+"_INVOICE_CONTROL");
      check(close(result.sourceSalesPerSqm,expected),label+"_HISTORICAL_RATIO_CONTROL");
      const areas=source.map(s=>s.area).filter(a=>a!==null);
      check(result.area?.min===(areas.length?Math.min(...areas):null)&&result.area?.max===(areas.length?Math.max(...areas):null),label+"_AREA_CONTROL");
      if(source.some(s=>s.matches.length>1))check(result.status==="AREA_AMBIGUOUS"&&result.salesPerSqm?.pyg===null&&result.salesPerSqm?.usd===null,label+"_AMBIGUITY_NOT_GUESSED");
      if(expected!==null&&currencies.size===1&&currencies.has("PYG")){
        check(close(result.sales?.pyg,amount)&&close(result.salesPerSqm?.pyg,expected),label+"_PYG_METRICS");
        if(result.exchange?.available){check(Number.isFinite(result.exchange.sellRate)&&result.exchange.sellRate>0
          &&close(result.sales.usd,amount/result.exchange.sellRate)&&close(result.salesPerSqm.usd,expected/result.exchange.sellRate)
          &&result.exchange.currentRate===true&&result.exchange.rateType==="sell",label+"_LIVE_USD_CONVERSION");report.coverage.liveUsdConversion=true;}
        else{check(result.sales.usd===null&&result.salesPerSqm.usd===null,label+"_NO_INVENTED_EXCHANGE");report.coverage.exchangeUnavailable=true;}
      }
      if(expected===null)check(result.salesPerSqm?.pyg===null&&result.salesPerSqm?.usd===null,label+"_NO_UNSUPPORTED_RATIO");
    };
    const controlRows=(args)=>{
      const source=sales.filter(s=>(args.customerIds??[]).includes(String(s.COD_CLIENTE))
        &&(!(args.categoryIds?.length)||args.categoryIds.includes(String(s.COD_RUBRO)))
        &&s.SALE_AT.slice(0,10)>=args.dateFrom.split('/').reverse().join('-')&&s.SALE_AT.slice(0,10)<=args.dateTo.split('/').reverse().join('-'));
      return source.filter(s=>{const day=new Date(s.SALE_AT.slice(0,10)+'T00:00:00Z').getUTCDay();return !args.dayType||(args.dayType==='weekend'?[0,6].includes(day):![0,6].includes(day));});
    };
    const compareResult=(result,args,label)=>{
      const source=controlRows(args);
      if(!Array.isArray(result.data)){compare(result,source,label);return;}
      check(result.data.length>0,label+"_GROUPS_PRESENT");
      for(let i=0;i<result.data.length;i++){
        const row=result.data[i];
        const rows=source.filter(s=>(row.month===undefined||row.month===s.SALE_AT.slice(5,7)+'/'+s.SALE_AT.slice(0,4))
          &&(row.customerId===undefined||String(row.customerId)===String(s.COD_CLIENTE)));
        compare({...row,exchange:result.exchange},rows,label+"_GROUP_"+(i+1));
      }
    };
    const evaluate=async(args,label)=>{
      const result=await getSalesPerSqm(args,connection);
      compareResult(result,args,label);
      return result;
    };
    for(let i=0;i<selected.length;i++)await evaluate({customerIds:[selected[i]],dateFrom:from,dateTo:to,groupBy:[]},"FIXTURE_"+(i+1));
    if(fixtures.complete){
      const key=fixtures.complete,first=customerSales.get(key)[0];
      const month=first.SALE_AT.slice(5,7),year=first.SALE_AT.slice(0,4),last=new Date(Date.UTC(+year,+month,0)).getUTCDate();
      await evaluate({customerIds:[key],dateFrom:`01/${month}/${year}`,dateTo:`${last}/${month}/${year}`,groupBy:[]},"CHANGED_PERIOD");
      await evaluate({customerIds:[key],categoryIds:[String(first.COD_RUBRO)],dateFrom:from,dateTo:to,groupBy:[]},"CATEGORY_FILTER");
      await evaluate({customerIds:[key],categoryIds:["-999999999"],dateFrom:from,dateTo:to,groupBy:[]},"EMPTY_CATEGORY_FILTER");
      await evaluate({customerIds:[key],dateFrom:from,dateTo:to,groupBy:["month"]},"MONTHLY_HISTORY");
      const baselineArgs={customerIds:[key],categoryIds:[String(first.COD_RUBRO)],dayType:"weekday",dateFrom:from,dateTo:to,groupBy:[]};
      await evaluate(baselineArgs,"WEEKDAY_FILTER");
      if(process.env.BOT_TEST_SQM_HTTP==='true'){
        const customers=(await connection.execute(`SELECT COD_CLIENTE,MAX(NOMBRE_CLIENTE) AS LABEL FROM VW_BOT_VENTAS_LOCALES
          WHERE FECHA>=TO_DATE(:dateFrom,'DD/MM/YYYY') AND FECHA<TO_DATE(:dateTo,'DD/MM/YYYY')+1
          GROUP BY COD_CLIENTE`,{dateFrom:from,dateTo:to},{maxRows:10001})).rows??[];
        const categories=(await connection.execute(`SELECT COD_RUBRO,MAX(DES_RUBRO) AS LABEL FROM VW_BOT_VENTAS_LOCALES
          WHERE FECHA>=TO_DATE(:dateFrom,'DD/MM/YYYY') AND FECHA<TO_DATE(:dateTo,'DD/MM/YYYY')+1 GROUP BY COD_RUBRO`,{dateFrom:from,dateTo:to})).rows??[];
        const other=customers.find(c=>String(c.COD_CLIENTE)!==key&&String(c.LABEL??'').trim()&&!String(c.LABEL).includes('"'));
        const category=categories.find(c=>String(c.COD_RUBRO)!==String(first.COD_RUBRO)&&String(c.LABEL??'').trim()&&!String(c.LABEL).includes('"'));
        check(Boolean(other&&category),"FOLLOWUP_LOOKUP_FIXTURES");
        if(other&&category){
          const sessionId=process.env.BOT_TEST_SESSION_ID;
          const seedResult=await getSalesPerSqm(baselineArgs,connection);
          const seedInput=protectPiiDeep(sessionId,baselineArgs);
          const seedJson=protectPiiDeep(sessionId,seedResult,null,['get_sales_per_sqm']);
          // Genuine values from Oracle form a known prior result, isolating the
          // follow-up from initial name disambiguation. Names remain in memory.
          setConversation(sessionId,[{role:'user',content:[{text:'Ventas por m² del local seleccionado'}]},
            {role:'assistant',content:[{toolUse:{name:'get_sales_per_sqm',toolUseId:'sqm-seed',input:seedInput}}]},
            {role:'user',content:[{toolResult:{toolUseId:'sqm-seed',status:'success',content:[{json:seedJson}]}}]},
            {role:'assistant',content:[{text:'Resultado de ventas por m² para el período consultado.'}]}]);
          const express=require('express'),app=express();app.use(express.json());app.use('/chatbot/api',router);
          const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
          let expectedArgs=structuredClone(baselineArgs);
          try{
            for(const [label,message,changes] of [
              ['PERIOD',`Ahora cambia el período a 01/${month}/${year} al ${last}/${month}/${year}; conserva los demás filtros`,{dateFrom:`01/${month}/${year}`,dateTo:`${last}/${month}/${year}`}],
              ['CUSTOMER',`Ahora cambia el local a "${other.LABEL}"; conserva los demás filtros`,{customerIds:[String(other.COD_CLIENTE)]}],
              ['CATEGORY',`Ahora cambia el rubro a "${category.LABEL}"; conserva los demás filtros`,{categoryIds:[String(category.COD_RUBRO)]}],
            ]){
              expectedArgs={...expectedArgs,...changes};
              const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(90000)});
              const body=await response.json();check(response.status===200&&body.success===true,'FOLLOWUP_'+label+'_HTTP_SUCCESS');
              const h=getConversation(sessionId);let start=-1;for(let j=h.length-1;j>=0;j--)if(h[j].role==='user'&&h[j].content?.some(b=>typeof b.text==='string')){start=j;break;}
              const blocks=h.slice(start+1).flatMap(m=>m.content??[]),calls=blocks.map(b=>b.toolUse).filter(t=>t?.name==='get_sales_per_sqm');
              check(calls.length===1,'FOLLOWUP_'+label+'_QUERY_EXECUTED');
              if(calls.length!==1)break;
              const input=restorePiiDeep(sessionId,calls[0].input);
              check(['customerIds','categoryIds','dateFrom','dateTo','dayType','groupBy'].every(k=>JSON.stringify(input[k]??(k.endsWith('Ids')||k==='groupBy'?[]:null))===JSON.stringify(expectedArgs[k]??(k.endsWith('Ids')||k==='groupBy'?[]:null))),'FOLLOWUP_'+label+'_FILTERS_PRESERVED');
              const toolResult=blocks.map(b=>b.toolResult).find(r=>r?.toolUseId===calls[0].toolUseId);
              check(toolResult?.status==='success','FOLLOWUP_'+label+'_TOOL_SUCCESS');
              if(toolResult?.status==='success')compareResult(restorePiiDeep(sessionId,toolResult.content.find(c=>c.json)?.json),expectedArgs,'FOLLOWUP_'+label);
              check(!body.actions?.salesExport&&!body.actions?.chart,'FOLLOWUP_'+label+'_NO_STALE_ACTIONS');
            }
          }finally{clearConversation(sessionId);await new Promise(resolve=>server.close(resolve));}
        }
      }
    }
  });
  check(positiveClosed,"ORACLE_CONNECTION_CLOSED");
  const session=await getValidOracleSession(process.env.BOT_TEST_SESSION_ID);
  check(Boolean(session.username),"SESSION_RESOLVED_SERVER_SIDE");
  if(process.env.BOT_TEST_DENIED_SESSION_ID?.trim()){
    report.coverage.realDeniedUserConfigured=true;
    const denied=await getValidOracleSession(process.env.BOT_TEST_DENIED_SESSION_ID);
    check(denied.username!==session.username,"REAL_DISTINCT_ORACLE_USERS");
    if(denied.username!==session.username){
      let deniedByOracle=false,deniedClosed=false;
      try{
        await withOracleProxySession(process.env.BOT_TEST_DENIED_SESSION_ID,async({connection})=>{
          const originalClose=connection.close.bind(connection);
          connection.close=async(...args)=>{const result=await originalClose(...args);deniedClosed=true;return result;};
          await getSalesPerSqm(permissionProbe,connection);
        });
      }catch(error){deniedByOracle=[942,1031].includes(Number(error.errorNum));}
      check(deniedByOracle,"REAL_ORACLE_ACCESS_DENIED_NO_DATA");
      check(deniedClosed,"DENIED_ORACLE_CONNECTION_CLOSED");
    }
  }else report.coverage.realDeniedUserConfigured=false;
  report.pending=[];
  if(!report.coverage.zero)report.pending.push("ZERO_AREA_DEV_FIXTURE_NOT_FOUND");
  if(!report.coverage.changedArea)report.pending.push("CHANGED_AREA_DEV_FIXTURE_NOT_FOUND");
  if(!report.coverage.realDeniedUserConfigured)report.pending.push("REAL_DENIED_USER_NOT_CONFIGURED");
  if(!report.coverage.liveUsdConversion)report.pending.push("LIVE_USD_CONVERSION_NOT_EXERCISED");
  report.success=report.checks.every(c=>c.passed);
}catch(error){report.success=false;report.error=String(error.message??'').match(/^[A-Z_]+$/)?.[0]??"SQM_DEV_VALIDATION_ERROR";if(Number.isInteger(error.errorNum))report.oracleErrorNum=error.errorNum;}
report.finishedAt=new Date().toISOString();
await writeFile(process.env.BOT_TEST_REPORT||join(tmpdir(),"sales-per-sqm-dev.json"),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));process.exit(report.success?0:1);
