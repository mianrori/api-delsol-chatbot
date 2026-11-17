// Independent control helpers: no service normalizers or SQL builders imported.
export const near = (a, b) => a != null && b != null && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a)-Number(b)) <= Math.max(1e-6, Math.abs(Number(b))*1e-10);
export const multisetEqual = (a,b) => JSON.stringify(a.map(x=>JSON.stringify(x)).sort()) === JSON.stringify(b.map(x=>JSON.stringify(x)).sort());
export const day = d => `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
export function relativeBounds(period, now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = k => Number(date.find(p=>p.type===k).value);
  const end = new Date(Date.UTC(get('year'),get('month')-1,get('day'))), start = new Date(end);
  if(period==='yesterday'){start.setUTCDate(start.getUTCDate()-1);end.setUTCDate(end.getUTCDate()-1);}
  else if(period==='thisWeek')start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));
  else if(period==='thisMonth')start.setUTCDate(1);
  else if(period==='thisYear')start.setUTCMonth(0,1);
  else if(period!=='today')throw Error('UNKNOWN_PERIOD');
  return {dateFrom:day(start),dateTo:day(end)};
}
export function validPage(p, page, rows, total, invoices) {
  const pages=Math.ceil(total/rows), more=page<pages;
  return p.page===page && p.rows===rows && p.totalRows===total && p.totalInvoices===invoices && p.totalPages===pages && p.returnedRows===p.data.length && p.data.length===Math.min(rows,Math.max(0,total-(page-1)*rows)) && p.hasMore===more && p.nextPage===(more?page+1:null);
}
export const invoiceTuple = r => [r.invoiceNumber,String(r.customer.customerId),String(r.concept.conceptId),r.currencySymbol,r.amount,r.quantity,r.vatAmount,r.plate];
// The established invoice contract returns a scalar for zero/one monetary
// group without dimensions, and {data} for multiple groups. Never merge them.
export function invoiceSummaryRows(result) {
  if (Array.isArray(result?.data)) return result.data;
  if (result && Object.hasOwn(result,'invoiceCount') && Object.hasOwn(result,'currencySymbol')) return [result];
  throw Error('INVOICE_SUMMARY_SHAPE_INVALID');
}
export const safeTechnicalCode = e => /^(ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code) ? e.code : 'PENDING_VARIANT_CONTROL_FAILED';
