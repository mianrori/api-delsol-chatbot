import {INVOICE_PARTIAL_ACCESS_MESSAGE} from '../../utils/invoiceAccess.js';
import {invoiceCell,invoiceCurrencyLabel,invoiceTable,invoicePagination,invoiceSingleCustomer,invoicePresentationNeeds} from './invoicePresentation.service.js';
export const INVOICE_PARTIAL_PRESENTATION_MESSAGE='Solo puedo mostrar los registros que tenés permiso para consultar.';
export function appendInvoiceAccessWarning(text,calls=[]){
 if(!calls.some(c=>c.name==='get_invoices'&&c.result?.hasRestrictedData===true))return text;
 const answer=text.replace(INVOICE_PARTIAL_ACCESS_MESSAGE,INVOICE_PARTIAL_PRESENTATION_MESSAGE);
 return answer.includes(INVOICE_PARTIAL_PRESENTATION_MESSAGE)?answer:answer+'\n\n'+INVOICE_PARTIAL_PRESENTATION_MESSAGE;
}
const number=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('es-PY',{maximumFractionDigits:6}).format(value):'No informado';
const date=value=>{if(value==null)return null;const iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));return iso?iso[3]+'/'+iso[2]+'/'+iso[1]:value;};
const pdfLink=value=>{
 if(typeof value!=='string'||!value.trim()||!/^https?:\/\//i.test(value))return '—';
 const url=value.replace(/[\s<>"|\\]/g,c=>encodeURIComponent(c));return '[Ver PDF](<'+url+'>)';
};
export function buildInvoiceDetailResponse(calls=[],{restoreValue=v=>v,display=invoiceCell,protectLink=v=>v,message=''}={}){
 const invoices=calls.filter(c=>c.name==='get_invoices');if(invoices.length!==1)return null;
 const result=restoreValue(invoices[0].result),input=restoreValue(invoices[0].input??{});
 if(!result||!Array.isArray(result.data)||!Number.isInteger(result.page)||result.page<1||result.success===false||result.error)return null;
 const needs=invoicePresentationNeeds(message),rows=result.data;
 const customer=invoiceSingleCustomer(rows,{customer:row=>({id:row.customer?.customerId,name:row.customer?.name??row.customer?.businessName}),customerIds:input.customerIds,totalRows:result.totalRows});
 const lines=[rows.length?'Estas son las facturas solicitadas'+(customer?' de '+display(customer):'')+'.':result.totalRows?'No hay registros en esta página.':'No encontré facturas para los filtros solicitados.'];
 const fields=rows.some(row=>row.invoiceSeries!=null)?[['Serie',row=>display(row.invoiceSeries)],['Número',row=>display(row.invoiceNumber)]]:[['Factura',row=>display(row.invoiceNumber)]];
 fields.push(['Emisión',row=>display(date(row.issueDate))]);
 if(!customer||needs.customerColumn)fields.push(['Cliente',row=>display(row.customer?.name??row.customer?.businessName)]);
 if(needs.business)fields.push(['Razón social',row=>display(row.customer?.businessName)]);
 if(needs.tax)fields.push(['RUC',row=>display(row.customer?.taxId)]);
 if(rows.some(row=>row.concept?.description!=null))fields.push(['Concepto',row=>display(row.concept?.description)]);
 if(rows.some(row=>row.dueDate!=null)||/venc/i.test(message))fields.push(['Vencimiento',row=>display(date(row.dueDate))]);
 if(needs.period||input.period)fields.push(['Período',row=>display(row.period)]);
 if(needs.contract)fields.push(['Contrato',row=>display([row.contract?.type,row.contract?.series,row.contract?.number].filter(v=>v!=null&&v!=='').join('-')||null)]);
 if(needs.plate||input.plate)fields.push(['Matrícula',row=>display(row.plate)]);
 if(needs.annulled||rows.some(row=>row.cancelled===true))fields.push(['Anulada',row=>row.cancelled===true?'Sí':row.cancelled===false?'No':'No informado']);
 fields.push(['Moneda',row=>display(invoiceCurrencyLabel(row))],['Importe',row=>number(row.amount)]);
 if(rows.some(row=>pdfLink(row.pdfUrl)!=='—'))fields.push(['PDF',row=>protectLink(pdfLink(row.pdfUrl))]);
 if(rows.length)lines.push('',...invoiceTable(fields.map(([label])=>label),rows.map(row=>fields.map(([,format])=>format(row)))));
 lines.push('',invoicePagination(result,rows.length));return appendInvoiceAccessWarning(lines.join('\n'),calls);
}
