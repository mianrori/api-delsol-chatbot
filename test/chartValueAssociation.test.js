import test from 'node:test';
import assert from 'node:assert/strict';
import {generateChart} from '../src/services/charts/chart.service.js';
import {chartMatchesSource} from '../scripts/chart-value-association.mjs';
const labels=['Enero','Febrero'];
const series=[{label:'Ventas',values:[100,200]},{label:'Canjes',values:[10,20]}];
const source={data:labels.map((month,i)=>({month,totalAmount:series[0].values[i],exchangeAmount:series[1].values[i],currency:{abbreviation:'PYG'}}))};
const render=async(type,multi=false)=>(await generateChart({type,labelPaths:['month'],datasets:[{label:'Ventas',valuePath:'totalAmount'},...(multi?[{label:'Canjes',valuePath:'exchangeAmount'}]:[])]},{sources:{source:{result:source}}})).chart;
const edit=(chart,fn)=>({...chart,url:'data:image/svg+xml;base64,'+Buffer.from(fn(Buffer.from(chart.url.split(',')[1],'base64').toString())).toString('base64')});
test('rendered points preserve label/value and series association for correct charts',async()=>{
 for(const [type,multi]of [['horizontalBar',false],['pie',false],['horizontalBar',true]])assert.equal(chartMatchesSource({chart:await render(type,multi),labels,series:multi?series:series.slice(0,1)}),true);
});
test('swapping values between labels fails even when all labels and values remain in SVG',async()=>{
 for(const type of ['horizontalBar','pie']){
  const chart=edit(await render(type),svg=>svg.replace(/Enero: ₲ 100/g,'Enero: ₲ 200').replace(/Febrero: ₲ 200/g,'Febrero: ₲ 100'));
  assert.equal(chartMatchesSource({chart,labels,series:series.slice(0,1)}),false);
 }
});
test('swapping both series fails despite matching global labels/values',async()=>{
 const chart=edit(await render('horizontalBar',true),svg=>svg.replace(/<title>(Enero|Febrero): ₲ (100|200|10|20)<\/title>/g,(_,label,n)=>`<title>${label}: ₲ ${{100:10,200:20,10:100,20:200}[n]}</title>`));
 assert.equal(chartMatchesSource({chart,labels,series}),false);
});
test('axis or unrelated text cannot substitute missing point values',async()=>{
 const chart=edit(await render('horizontalBar'),svg=>svg.replace(/<title>[^<]*<\/title>/g,''));
 assert.equal(chartMatchesSource({chart,labels,series:series.slice(0,1)}),false);
});
