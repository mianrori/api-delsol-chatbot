const cell=value=>String(value??'Sin datos').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
const number=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('es-PY',{maximumFractionDigits:6}).format(value):'Sin datos';
const date=value=>{if(value==null)return 'Sin datos';const iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));return iso?`${iso[3]}/${iso[2]}/${iso[1]}`:cell(value);};
// Preserve the ERP URL verbatim except Markdown delimiters/whitespace. Names and
// URLs are restored before escaping, and only fresh authorized rows are rendered.
const pdfLink=value=>{
 if(typeof value!=='string'||!value.trim()||!/^https?:\/\//i.test(value))return '\u2014';
 const url=value.replace(/[\s<>"|\\]/g,c=>encodeURIComponent(c));
 return `[Ver PDF](<${url}>)`;
};
export function buildInvoiceDetailResponse(calls=[],{restoreValue=v=>v}={}){
 const invoices=calls.filter(c=>c.name==='get_invoices');if(invoices.length!==1)return null;
 const result=restoreValue(invoices[0].result);
 if(!result||!Array.isArray(result.data)||!Number.isInteger(result.page)||result.page<1||result.success===false)return null;
 const lines=[`Se muestran ${result.data.length} de ${result.totalRows} registros (${result.totalInvoices} facturas distintas). P\u00e1gina ${result.page} de ${result.totalPages}.`,''];
 if(!result.data.length)lines.push('No se encontraron registros en esta p\u00e1gina.');
 else{
  lines.push('| Factura | Emisi\u00f3n | Cliente | Concepto | Per\u00edodo | Vencimiento | Contrato | Matr\u00edcula | Anulada | Moneda | Importe | PDF |','| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for(const row of result.data){
   const contract=[row.contract?.type,row.contract?.series,row.contract?.number].filter(v=>v!=null&&v!=='').join('-');
   lines.push('| '+[cell(row.invoiceNumber),date(row.issueDate),cell(row.customer?.name??row.customer?.businessName),cell(row.concept?.description),cell(row.period),date(row.dueDate),cell(contract||null),cell(row.plate),row.cancelled?'S\u00ed':'No',cell(row.currencySymbol),number(row.amount),pdfLink(row.pdfUrl)].join(' | ')+' |');
  }
 }
 if(result.hasMore&&result.nextPage!=null)lines.push('',`Puedes pedir la siguiente p\u00e1gina (${result.nextPage}).`);
 return lines.join('\n');
}
