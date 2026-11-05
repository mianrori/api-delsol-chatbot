import test from 'node:test';
import assert from 'node:assert/strict';
import {getCurrentUsdSellRateFromMaxicambios as quote} from '../src/services/exchange/maxicambios.service.js';
import {getContractCostPerSqm as cost} from '../src/services/contracts/contractCostPerSqm.service.js';
const html='<table><tr><td>Dólar</td><td>Compra</td><td>7.000</td><td>Venta</td><td>7.100</td></tr></table>';
const ok=async()=>({ok:true,text:async()=>html});
test('current sell quote keeps retrieval time separate from unknown publication/historical dates',async()=>{
 const before=Date.now(),r=await quote({fetchImpl:async(url,options)=>{assert.equal(url,'https://www.maxicambios.com.py/');assert.equal(options.redirect,'error');return ok();}});
 assert.equal(r.sellRate,7100);assert.equal(r.currency,'USD');assert.equal(r.rateType,'sell');assert.equal(r.currentRate,true);
 assert.ok(Date.parse(r.retrievedAt)>=before&&Date.parse(r.retrievedAt)<=Date.now());assert.equal(r.quotedAt,null);assert.equal(r.dateBasis,'CURRENT_QUOTE_AT_RETRIEVAL_NOT_HISTORICAL');
});
test('provider HTTP/network/timeout errors expose safe codes without transport cause',async()=>{
 const fixtures=[['EXCHANGE_PROVIDER_HTTP',async()=>({ok:false,status:500})],['EXCHANGE_PROVIDER_NETWORK',async()=>{throw Object.assign(Error('PRIVATE'),{cause:{password:'PRIVATE'},code:'PRIVATE'});}],['EXCHANGE_PROVIDER_TIMEOUT',async(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('PRIVATE'))))]];
 for(const [code,fetchImpl] of fixtures){await assert.rejects(quote({fetchImpl,timeoutMs:10}),e=>{assert.equal(e.code,code);assert.equal(e.cause,undefined);assert.ok(!JSON.stringify(e).includes('PRIVATE'));assert.ok(!e.message.includes('PRIVATE'));return true;});}
});
test('provider missing, zero, negative or malformed rates never become valid quotes',async()=>{
 for(const body of ['Sin cotización','Dólar Compra 7000 Venta 0','Dólar Compra 7000 Venta -2','Dólar Compra 7000 Venta 7..100','Dólar Compra 7000 Venta 7100 Dólar Compra 7000 Venta 7200'])await assert.rejects(quote({fetchImpl:async()=>({ok:true,text:async()=>body})}));
});
const connection=(currency='PYG',symbol=currency)=>({calls:0,async execute(sql){this.calls++;
 if(sql.includes('VW_BOT_CONTRATOS_CONCEPTOS'))return {rows:[{COD_CONCEPTO:'6',SIGLAS_MONEDA_FACTURA:currency,FEC_DESDE:new Date('2023-01-01Z')}]};
 if(sql.includes('VW_BOT_FACTURAS'))return {rows:[{COD_CONCEPTO:'6',IMPORTE:1100,IVA:100,IMPORTE_SIN_IVA:1000,SIMBOLO_MONEDA:symbol,FECHA_EMISION:new Date('2023-03-01Z')}]};
 return {rows:[{COD_CLIENTE:'SYNTHETIC',TIP_CONTRATO:'CNT',SER_CONTRATO:'S',NRO_CONTRATO:7,TOTAL_SUP_LOCAL:20,FEC_CONTRATO:new Date('2023-01-01Z')}]};
}});
const args={customerId:'SYNTHETIC',conceptCode:'6'};
test('cost accepts PYG and USD, converts net/area in both directions using current sell quote',async()=>{
 const original=globalThis.fetch;globalThis.fetch=ok;
 try{for(const [source,target,factor] of [['PYG','USD',1/7100],['USD','PYG',7100]]){
  const r=await cost({...args,targetCurrency:target},connection(source));assert.equal(r.status,'OK');assert.equal(r.targetAmountExcludingTax,1000*factor);assert.equal(r.costPerSqm,source==='PYG'?50/7100:50*7100);assert.equal(r.exchangeRate.sellRate,7100);assert.equal(r.exchangeRate.currentRate,true);assert.equal(r.exchangeRate.quotedAt,null);assert.ok(r.exchangeRate.retrievedAt);assert.equal(r.lastInvoice.invoiceDate.getFullYear(),2023);
 }}finally{globalThis.fetch=original;}
});
test('ambiguous or contradictory source currency remains uncalculated; target invalid before Oracle',async()=>{
 for(const [currency,symbol] of [['$','$'],['EUR','EUR'],['PYG','USD']]){const r=await cost(args,connection(currency,symbol));assert.equal(r.status,'CURRENCY_NOT_SUPPORTED');assert.equal(r.costPerSqm,undefined);assert.ok(r.reason);}
 for(const targetCurrency of ['$','EUR',null]){const c=connection();await assert.rejects(cost({...args,targetCurrency},c));assert.equal(c.calls,0);}
});
test('provider failure propagates safely; same-currency costs never request a rate',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('PRIVATE');};
 try{const same=await cost(args,connection());assert.equal(same.exchangeRate,null);assert.equal(calls,0);await assert.rejects(cost({...args,targetCurrency:'USD'},connection()),e=>e.code==='EXCHANGE_PROVIDER_NETWORK'&&!e.message.includes('PRIVATE'));}finally{globalThis.fetch=original;}
});
