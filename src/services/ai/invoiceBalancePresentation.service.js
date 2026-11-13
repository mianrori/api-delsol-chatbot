import {invoiceCell,invoiceNumber,invoiceCurrencyLabel,invoiceTable,invoicePagination,invoiceSingleCustomer,invoicePresentationNeeds} from './invoicePresentation.service.js';
export const invoiceBalanceCell=invoiceCell;
const exactBalance=value=>{if(value==null)return 'No informada';const m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));return m?m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+(m[3]??'').padEnd(2,'0'):'Importe no representable';};
const statuses={overdue:'Vencida',dueToday:'Vence hoy',upcoming:'Por vencer',undated:'No informado',notDue:'No vencida'};
const integrityWarning=r=>r.duplicateRows>0?'Hay registros históricos duplicados; por eso no puedo calcular un total confiable.':r.missingIdentityRows>0?'Faltan datos para identificar algunas facturas; no puedo calcular un total confiable.':r.unknownDebtRows>0?'Hay registros con deuda no informada; no puedo calcular un total confiable.':r.missingCurrencyRows>0?'Falta identificar la moneda de algunos importes; no puedo calcular un total confiable.':'Hay registros históricos inconsistentes o datos incompletos; no puedo calcular un total confiable.';
export function buildInvoiceBalanceResponse(calls=[],{display=invoiceCell,message='',currencyLabels={}}={}){
 const matches=calls.filter(c=>c.name==='get_invoice_balances');
 if(matches.length!==1||calls.some(c=>!['get_invoice_balances','search_invoice_balance_customers','resolve_invoice_balance_currency'].includes(c.name)))return null;
 const r=matches[0].result,needs=invoicePresentationNeeds(message);
 if(r?.status==='INCONSISTENT_HISTORY')return integrityWarning(r)+' Podés consultar el detalle.';
 if(r?.status==='REQUIRES_SOURCE_IDENTITY')return 'No puedo calcular un total confiable con estos datos. Para ordenar o filtrar importes, necesito una sola moneda identificada.';
 if(!r||r.success===false||r.error||!Array.isArray(r.data))return null;
 const lines=[];
 const historical=()=>{if(needs.historical)lines.push('La deuda que se muestra es la actual; no reconstruye el saldo de una fecha pasada.');if(needs.paymentDate)lines.push('No tengo la fecha de pago para indicar cuándo se canceló la deuda.');};
 if(r.status==='OK_SUMMARY'){
  lines.push(r.data.length?'Este es el resumen de deudas por moneda.':r.totalRows?'No hay registros en esta página.':'No encontré deudas para los filtros solicitados.');historical();
  const settled=r.queryContext?.debtStatus==='settled';
  const groups=r.queryContext?.groupBy??[],labels={customer:'Cliente',sector:'Sector',dueMonth:'Mes de vencimiento',dueStatus:settled?'Vencimiento respecto de la referencia':'Vencimiento',agingBand:settled?'Antigüedad del vencimiento':'Antigüedad'};
  const dueLabels=settled?{overdue:'Anterior a la referencia',dueToday:'En la fecha de referencia',upcoming:'Posterior a la referencia',notDue:'En o después de la referencia',undated:'No informado'}:statuses;
  const agingLabels={undated:'No informado',notDue:'En o después de la referencia',dueToday:'En la fecha de referencia'};
  if(settled&&groups.some(group=>['dueStatus','agingBand'].includes(group)))lines.push('La fecha de vencimiento no indica mora actual ni la fecha de pago.');
  const fields=[['Moneda',row=>display(invoiceCurrencyLabel({...row,currencyCode:currencyLabels[row.currencyCode]??row.currencyCode}))]];
  for(const group of groups){if(group==='invoice'){fields.push(['Serie',row=>display(row.invoiceSeries)],['Número',row=>display(row.invoiceNumber)]);continue;}
   fields.push([labels[group]??'Grupo',row=>display(group==='customer'?row.customerName??'Nombre no informado':group==='dueStatus'?dueLabels[row.dueStatus]??'No informado':group==='agingBand'?agingLabels[row.agingBand]??row.agingBand:row[{sector:'sector',dueMonth:'dueMonth'}[group]])]);}
  if(r.monetaryAggregationAvailable===true)fields.push(['Facturas',row=>invoiceNumber(row.invoiceCount)]);
  fields.push(['Deuda',row=>exactBalance(row.debt)]);if(needs.rank)fields.push(['Posición en su moneda',row=>invoiceNumber(row.currencyRank)]);
  if(r.data.length)lines.push('',...invoiceTable(fields.map(([label])=>label),r.data.map(row=>fields.map(([,format])=>format(row)))));
  lines.push('',invoicePagination(r,r.data.length));return lines.join('\n');
 }
 if(r.mode!=='detail')return null;
 const settled=r.queryContext?.debtStatus==='settled';
 const customer=invoiceSingleCustomer(r.data,{customer:row=>({id:row.customerId,name:row.customerName??row.businessName}),customerIds:r.queryContext?.customerIds,matchedCustomers:r.matchedCustomers,totalRows:r.totalRows});
 const kind=settled?'con deuda cancelada':r.queryContext?.debtStatus==='pending'?'pendientes de pago':'con saldos registrados';
 lines.push(r.data.length?'Estas son las facturas '+kind+(customer?' de '+display(customer):'')+'.':r.totalRows?'No hay registros en esta página.':'No encontré facturas '+kind+' para los filtros solicitados.');historical();
 if(needs.annulled&&settled)lines.push('Deuda cancelada significa deuda cero; no indica que la factura esté anulada.');
 if(r.duplicateRows>0||r.missingIdentityRows>0)lines.push(integrityWarning(r));else if(r.warning)lines.push(display(r.warning));
 if(r.unknownDebtRows>0)lines.push('Hay registros con deuda no informada; no se consideran saldados.');
 if(r.invalidDueDateRows>0)lines.push('Algunos registros no tienen un vencimiento válido.');
 const fields=[['Serie',row=>display(row.invoiceSeries)],['Número',row=>display(row.invoiceNumber)]];
 if(!customer||needs.customerColumn)fields.push(['Cliente',row=>display(row.customerName??row.businessName)]);
 if(needs.business)fields.push(['Razón social',row=>display(row.businessName)]);
 if(needs.tax)fields.push(['RUC',row=>display(row.taxId)]);
 if(needs.sector)fields.push(['Sector',row=>display(row.sector)]);
 fields.push(['Vencimiento',row=>display(row.dueDate)]);
 if(!settled&&needs.dueState)fields.push(['Estado del vencimiento',row=>row.debtState==='pending'?display(statuses[row.dueStatus]??row.dueStatus):'—']);
 if(!settled&&needs.late)fields.push(['Días de atraso',row=>row.debtState==='pending'?invoiceNumber(row.daysOverdue):'—']);
 if(!['pending','settled'].includes(r.queryContext?.debtStatus))fields.push(['Estado de deuda',row=>display({pending:'Pendiente',settled:'Sin deuda',unknown:'No informada'}[row.debtState]??'No informado')]);
 fields.push(['Moneda',row=>display(invoiceCurrencyLabel({...row,currencyCode:currencyLabels[row.currencyCode]??row.currencyCode}))],['Deuda',row=>exactBalance(row.debt)]);
 if(r.data.length)lines.push('',...invoiceTable(fields.map(([label])=>label),r.data.map(row=>fields.map(([,format])=>format(row)))));
 lines.push('',invoicePagination(r,r.data.length));return lines.join('\n');
}

export function resolveInvoiceBalancePage({message,history=[],pageState}) {
  if(!/^(?:ver m[aá]s|mostrar m[aá]s|siguiente(?: p[aá]gina)?|continuar)[.!?]?$/i.test(String(message).trim()))return null;
  const blocks=history.flatMap(m=>m.content??[]),calls=blocks.filter(b=>b.toolUse&&!b.toolUse.name.startsWith('search_')).map(b=>b.toolUse),last=calls.at(-1);
  if(last&&last.name!=='get_invoice_balances')return null;
  const response=last?blocks.find(b=>b.toolResult?.toolUseId===last.toolUseId)?.toolResult:pageState;
  const result=last?response?.content?.find(b=>b.json)?.json:pageState;
  if(response?.status!=='success'||!result?.queryContext)return null;
  if(!result.hasMore)return {answer:'No hay más páginas de saldos para los filtros consultados.'};
  return {toolName:'get_invoice_balances',input:{...structuredClone(result.queryContext),page:result.nextPage}};
}
