// One affected real PYG campaign profile; the invalid-currency cases are unit
// controls, not purported Oracle business fixtures. No resolver/provider calls.
import {buildCampaignSalesPerformanceResponse} from '../src/services/ai/campaignSalesPerformancePresentation.service.js';
const format=d=>`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
const parse=s=>{const[d,m,y]=s.split('/').map(Number);return new Date(Date.UTC(y,m-1,d));};
const offset=(d,n)=>new Date(d.getTime()+86400000*n);
const near=(a,b)=>a!=null&&Number.isFinite(a)&&Math.abs(a-b)<=Math.max(.0001,Math.abs(b)*1e-10);
const round=n=>Math.round((n+Number.EPSILON)*10000)/10000;
export async function campaignCurrencyControl({query,tool,check,run,missing,mark,discover}){
 await run('CAMPAIGN_CURRENCY_REAL_PYG_PROFILE',async()=>{
  const pool=await query("SELECT COD_PROMOCION P,COD_CAMPANIA C,TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') F,TO_CHAR(FECHA_HASTA,'DD/MM/YYYY') T FROM VW_BOT_PROMOCIONES WHERE FECHA_DESDE IS NOT NULL AND FECHA_HASTA>=FECHA_DESDE AND FECHA_HASTA-FECHA_DESDE<=60 ORDER BY FECHA_DESDE,COD_PROMOCION,COD_CAMPANIA FETCH FIRST 10 ROWS ONLY");
  let inspected=0;
  for(const campaign of pool){
   inspected++;
   if((await query('SELECT COD_PROMOCION FROM VW_BOT_PROMOCIONES WHERE COD_PROMOCION=:p AND COD_CAMPANIA=:c',{p:String(campaign.P),c:String(campaign.C)})).length!==1)continue;
   const f=parse(campaign.F),t=parse(campaign.T),days=Math.round((t-f)/86400000)+1;
   const bounds=[[offset(f,-days),offset(f,-1)],[f,t],[offset(t,1),offset(t,days)]],groups=[];
   for(const[from,to]of bounds)groups.push(await query("SELECT DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A,SUM(NVL(CANTIDAD_FACTURAS,0)) I,COUNT(*) N FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA<TO_DATE(:t,'DD/MM/YYYY')+1 GROUP BY DES_MONEDA,SIGLAS_MONEDA",{f:format(from),t:format(to)}));
   // A deliberately narrow, independently identifiable PYG profile. Do not
   // infer the identity of other metadata or claim invalid fixtures are real.
   if(!groups.every(g=>g.length===1&&String(g[0].D).trim().toUpperCase()==='GUARANIES'&&['PYG','GS','GS.','₲'].includes(String(g[0].S).trim().toUpperCase())))continue;
   discover('CAMPAIGN_CURRENCY_PROFILE',{candidateLimit:10,inspectedCandidates:inspected,periodCount:3});mark('REAL_CAMPAIGN_DISPATCH');
   const got=await tool('analyze_campaign_sales_performance',{promotionId:String(campaign.P),campaignId:String(campaign.C),campaignDateFrom:campaign.F,campaignDateTo:campaign.T});
   check(got.currency.consistent,'CAMPAIGN_REAL_CURRENCY_CONSISTENT');
   for(const[i,key]of ['before','during','after'].entries()){
    const p=got.periods[key],r=groups[i][0];
    check(p.dateFrom===format(bounds[i][0])&&p.dateTo===format(bounds[i][1])&&p.sourceRows===r.N&&p.totalInvoices===Number(r.I)&&near(p.totalAmount,Number(r.A))&&near(p.averageDailyAmount,round(Number(r.A)/days)),'CAMPAIGN_REAL_PERIOD_TOTALS_DATES_SQL');
    check(p.currency.status==='identified'&&p.currency.code==='PYG'&&p.currency.description===r.D&&p.currency.abbreviation===r.S&&p.reasonCode===null&&p.calculationReason===null&&p.currencyGroups.length===1&&near(p.currencyGroups[0].totalAmount,Number(r.A)),'CAMPAIGN_REAL_IDENTITY_GROUPS_SQL');
   }
   for(const[name,previous,current]of [['duringVsBefore',0,1],['afterVsDuring',1,2],['afterVsBefore',0,2]]){
    const c=got.comparisons[name],a=Number(groups[previous][0].A),b=Number(groups[current][0].A),percent=a===0?null:round((b-a)/a*100);
    check(c.reasonCode===null&&c.calculationReason===null&&c.currency.code==='PYG'&&near(c.totalAmount.previousValue,a)&&near(c.totalAmount.currentValue,b)&&near(c.totalAmount.absoluteChange,b-a)&&(percent===null?c.totalAmount.percentageChange===null:near(c.totalAmount.percentageChange,percent))&&near(c.averageDailyAmount.previousValue,round(a/days))&&near(c.averageDailyAmount.currentValue,round(b/days)),'CAMPAIGN_REAL_PAIR_AMOUNT_PERCENTAGE_SQL');
   }
   const text=buildCampaignSalesPerformanceResponse([{name:'analyze_campaign_sales_performance',result:got}]);
   const num=n=>new Intl.NumberFormat('es-PY',{maximumFractionDigits:4}).format(n);
   check(typeof text==='string'&&text.includes('₲')&&!text.includes('Moneda sin identificar')&&!text.includes('Motivo (')&&groups.every(g=>text.includes(num(Number(g[0].A))))&&bounds.every(b=>b.every(d=>text.includes(format(d)))),'CAMPAIGN_REAL_PRESENTATION_PERIOD_CURRENCY_VALUES');
   return;
  }
  discover('CAMPAIGN_CURRENCY_PROFILE',{candidateLimit:10,inspectedCandidates:inspected});missing('CAMPAIGN_RECOGNIZED_PYG_PROFILE_NOT_FOUND_IN_10_CAMPAIGNS');
 });
}
