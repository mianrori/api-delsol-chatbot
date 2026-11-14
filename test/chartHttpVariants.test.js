import test from 'node:test';
import assert from 'node:assert/strict';
import {contrastChartHttp} from '../scripts/chart-http-variant-controls.mjs';
import {generateChart} from '../src/services/charts/chart.service.js';
test('pending HTTP horizontal/pie/multiseries reconcile labels values currency and source period',{timeout:15000},async()=>{
 const checks=[];await contrastChartHttp({sessionId:'synthetic-chart-http',sourceName:'get_sales',controlledAuth:true,sourceArgs:{dateFrom:'01/01/2023',dateTo:'31/05/2023'},sourceResult:{data:[{month:'01/2023',totalAmount:1000,exchangeAmount:100,currency:{abbreviation:'PYG'}},{month:'02/2023',totalAmount:2000,exchangeAmount:200,currency:{abbreviation:'PYG'}}]},check:(ok,code)=>{checks.push(code);assert.ok(ok,code);}});
 assert.equal(checks.length,21);
});
test('chart cannot use ambiguous dollars; recognized code takes precedence and source context stays intact',async()=>{
 const args={type:'horizontalBar',labelPaths:['month'],datasets:[{label:'Importe',valuePath:'totalAmount'}]};
 const result={data:[{month:'01/2023',totalAmount:10,currency:{symbol:'$',code:null}}]};
 await assert.rejects(generateChart(args,{sources:{s:{result}}}),/moneda/);
 result.data[0].currency={code:'USD',symbol:'₲'};
 await assert.rejects(generateChart(args,{sources:{s:{result}}}),/moneda/);
 result.data[0].currency={code:'USD',symbol:'$'};
 const r=await generateChart(args,{sources:{s:{result,queryContext:{dateFrom:'01/01/2023',dateTo:'31/01/2023'}}}});
 assert.equal(r.chart.valuePrefix,'US$');assert.match(r.chart.subtitle,/31\/01\/2023/);
});
