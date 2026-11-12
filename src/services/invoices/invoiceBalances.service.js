import {getInvoiceBalancesRepository, searchInvoiceBalanceCustomersRepository} from '../../repositories/invoices/invoiceBalances.repository.js';

const fail = message => {throw new Error(message);};
const today = () => {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part = type => parts.find(p=>p.type===type).value;
  return `${part('day')}/${part('month')}/${part('year')}`;
};
const date = value => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value));
  if (!m) fail('Fecha inválida: utiliza DD/MM/YYYY.');
  const [,d,mth,y] = m.map(Number), parsed = new Date(0);
  parsed.setUTCFullYear(y,mth-1,d); parsed.setUTCHours(0,0,0,0);
  if (y<1 || parsed.getUTCFullYear()!==y || parsed.getUTCMonth()!==mth-1 || parsed.getUTCDate()!==d) fail('Fecha inválida.');
  return parsed.getTime();
};
const array = (value, key) => {
  if (value===undefined) return [];
  if (!Array.isArray(value)||value.length>100||value.some(v=>typeof v!=='string'||!v.trim()||v.length>120)) fail(`${key} debe ser una lista de textos no vacíos (máximo 100).`);
  return [...new Set(value.map(v=>v.trim()))];
};
const option = (value, allowed, key) => {if(!allowed.includes(value)) fail(`${key} no soportado.`);return value;};
const integer = (value, min, max, key) => {if(!Number.isInteger(value)||value<min||value>max) fail(`${key} fuera de rango.`);return value;};

export function normalizeInvoiceBalanceArgs(args={}) {
  const allowed=['customerIds','invoiceNumbers','sectors','currencies','currencyCodes','dueDateFrom','dueDateTo','asOfDate','dueStatus','balanceStatus','minBalance','maxBalance','minDaysOverdue','maxDaysOverdue','mode','groupBy','orderBy','page','rows'];
  if(Object.keys(args).some(k=>!allowed.includes(k))) fail('Filtro de saldos no soportado.');
  const result={...args};
  for(const key of ['customerIds','invoiceNumbers','sectors','currencies','currencyCodes'])result[key]=array(args[key],key);
  result.asOfDate=args.asOfDate??today();date(result.asOfDate);
  for(const key of ['dueDateFrom','dueDateTo'])if(args[key]!==undefined)date(args[key]);
  if(args.dueDateFrom&&args.dueDateTo&&date(args.dueDateFrom)>date(args.dueDateTo))fail('Rango de vencimientos inválido.');
  result.mode=option(args.mode??'detail',['detail','summary'],'mode');
  result.dueStatus=option(args.dueStatus??'all',['all','overdue','dueToday','upcoming','undated'],'dueStatus');
  result.balanceStatus=option(args.balanceStatus??'all',['all','positive','zero','negative','nonZero','unknown'],'balanceStatus');
  result.groupBy=array(args.groupBy,'groupBy');
  for(const group of result.groupBy)option(group,['customer','invoice','sector','dueMonth','dueStatus','agingBand'],'groupBy');
  if(result.mode==='detail'&&result.groupBy.length)fail('groupBy requiere mode summary.');
  result.orderBy=option(args.orderBy??(result.mode==='detail'?'dueDateAsc':'balanceDesc'),result.mode==='detail'?['dueDateAsc','balanceDesc','balanceAsc','overdueDaysDesc','invoiceNumber']:['balanceDesc','balanceAsc','invoiceCountDesc','group'],'orderBy');
  result.page=integer(args.page??1,1,1000000,'page');result.rows=integer(args.rows??20,1,100,'rows');
  for(const key of ['minBalance','maxBalance'])if(args[key]!==undefined&&(typeof args[key]!=='number'||!Number.isFinite(args[key])))fail(`${key} debe ser numérico.`);
  for(const key of ['minDaysOverdue','maxDaysOverdue'])if(args[key]!==undefined)integer(args[key],0,3652058,key);
  for(const [lo,hi]of [['minBalance','maxBalance'],['minDaysOverdue','maxDaysOverdue']])if(args[lo]!==undefined&&args[hi]!==undefined&&args[lo]>args[hi])fail('Rango inválido.');
  return result;
}

export async function getInvoiceBalances(args, connection) {
  const scope=normalizeInvoiceBalanceArgs(args);
  return getInvoiceBalancesRepository({connection,...scope});
}

export async function searchInvoiceBalanceCustomers(args={}, connection) {
  if(Object.keys(args).some(k=>!['query'].includes(k))||typeof args.query!=='string'||!args.query.trim()||args.query.length>120)fail('Indica un cliente, razón social, RUC o código válido.');
  const matches=await searchInvoiceBalanceCustomersRepository({connection,query:args.query.trim()});
  const hasMore=matches.length>20,options=matches.slice(0,20).map((item,index)=>({option:index+1,...item}));
  if(!matches.length)return {status:'NOT_FOUND',query:args.query,options:[],hasMore:false};
  if(matches.length===1)return {status:'RESOLVED',query:args.query,...matches[0],hasMore:false};
  return {status:'AMBIGUOUS',query:args.query,options,hasMore};
}
