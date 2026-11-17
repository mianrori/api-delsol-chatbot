import {defaultSalesMetrics} from './salesMetrics.service.js';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
const year='((?:19|20)\\d{2})';
export const salesComparisonRange=y=>({dateFrom:`01/01/${y}`,dateTo:`31/12/${y}`,groupBy:['month']});

// Complete, anchored subjects distinguish autonomous comparisons from omitted
// arguments in incremental requests. Category text is resolved by Oracle only.
export function getMonthlySalesComparisonIntent(message,state={}){
 const text=normalize(message);
 const match=new RegExp(`^compara (?:las )?ventas mensuales(?: del rubro (.+?))? de ${year} con (?:las de )?${year}$`).exec(text);
 if(match&&match[2]!==match[3])return {autonomous:true,...(match[1]?{search:match[1]}:{}),inputs:[match[2],match[3]].map(y=>({...salesComparisonRange(y),metrics:[...defaultSalesMetrics]}))};
 const legacy=/^(?:compara(?: las)? |comparar(?: las)? )?ventas (?:de|del) ((?:19|20)\d{2}) (?:contra|vs\.?|versus|frente a) ((?:19|20)\d{2}) (?:mes a mes|por mes)(?: con (?:monto total|importe total)(?: y (?:cantidad de )?facturas)?)?$/.exec(text.replaceAll(',',''));
 if(legacy&&legacy[1]!==legacy[2])return {autonomous:true,inputs:[legacy[1],legacy[2]].map(y=>({...salesComparisonRange(y),metrics:[...defaultSalesMetrics]}))};
 const followup=new RegExp(`^(?:ahora )?compara ese mismo rubro con ${year}$`).exec(text);
 const prior=state.contexts?.get_sales;
 const shift=(value,y)=>{const [d,m]=value.split('/').map(Number);return `${String(Math.min(d,new Date(Date.UTC(Number(y),m,0)).getUTCDate())).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;};
 const previousYear=/\/(\d{4})$/.exec(prior?.dateTo??'')?.[1];
 if(followup&&previousYear&&/^\d{2}\/\d{2}\/\d{4}$/.test(prior?.dateFrom??'')&&prior.dateFrom.endsWith('/'+previousYear)&&followup[1]!==previousYear&&state.domains?.search_categories?.kind==='selected')return {autonomous:false,inputs:[previousYear,followup[1]].map(y=>({...structuredClone(prior),dateFrom:shift(prior.dateFrom,y),dateTo:shift(prior.dateTo,y),groupBy:['month'],metrics:[...(state.salesMetrics??defaultSalesMetrics)]}))};
 if(/^(?:(?:la )?(?:opcion|numero)\s*)?\d+$/.test(text)&&state.salesComparison?.pending&&state.domains?.search_categories?.kind==='selected')return {...structuredClone(state.salesComparison),autonomous:false};
 return null;
}
