import {getCurrentUsdSellRateFromMaxicambios} from '../src/services/exchange/maxicambios.service.js';
const report={suite:'live-conversion-provider',startedAt:new Date().toISOString(),source:'real public provider; no Oracle, login or controlled response',status:'not_available'};
let html;
try{
 const rate=await getCurrentUsdSellRateFromMaxicambios({fetchImpl:async(url,options)=>{const r=await fetch(url,options);html=await r.clone().text();return r;}});
 const words=html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').trim().split(/\s+/);
 const i=words.findIndex((w,i)=>w.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()==='DOLAR'&&words[i+1]?.toUpperCase()==='COMPRA'&&words[i+3]?.toUpperCase()==='VENTA');
 const v=words[i+4],independent=i>=0&&/^\d{1,3}(\.\d{3})+$/.test(v)?Number(v.split('.').join('')):i>=0?Number(v?.replace(',','.')):NaN;
 report.independentRateMatches=Number.isFinite(independent)&&independent>0&&independent===rate.sellRate;
 report.retrievalDateValid=Date.parse(rate.retrievedAt)>=Date.parse(report.startedAt)&&Date.parse(rate.retrievedAt)<=Date.now();
 report.currentNotHistorical=rate.currentRate===true&&rate.quotedAt===null&&rate.dateBasis==='CURRENT_QUOTE_AT_RETRIEVAL_NOT_HISTORICAL';
 report.status=report.independentRateMatches&&report.retrievalDateValid&&report.currentNotHistorical?'passed':'failed';
}catch(e){report.code=['EXCHANGE_PROVIDER_TIMEOUT','EXCHANGE_PROVIDER_HTTP','EXCHANGE_PROVIDER_NETWORK','EXCHANGE_PROVIDER_RESPONSE_LIMIT'].includes(e?.code)?e.code:'EXCHANGE_PROVIDER_QUOTE_UNAVAILABLE';}
html=null;report.finishedAt=new Date().toISOString();process.stdout.write(JSON.stringify(report));process.exitCode=report.status==='failed'?1:0;
