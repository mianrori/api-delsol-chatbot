export const invoiceBalanceCell=value=>String(value??'Sin datos').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
const number=value=>value==null?'Desconocido':new Intl.NumberFormat('es-PY',{maximumFractionDigits:2}).format(value);
const currency=value=>['PYG','GS','GS.','GUARANIES','GUARANI'].includes(String(value).toUpperCase())?'₲':value??'Sin moneda';
const statuses={overdue:'Vencida',dueToday:'Vence hoy',upcoming:'Por vencer',undated:'Sin vencimiento válido',notDue:'No vencida'};
const labels={customer:'Cliente',invoice:'Factura',sector:'Sector',dueMonth:'Mes de vencimiento',dueStatus:'Estado de vencimiento',agingBand:'Antigüedad (días)'};
const table=(head,rows)=>['| '+head.join(' | ')+' |','| '+head.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.join(' | ')+' |')];
export function buildInvoiceBalanceResponse(calls=[],{display=invoiceBalanceCell}={}) {
  const matches=calls.filter(c=>c.name==='get_invoice_balances');
  if(matches.length!==1||calls.some(c=>!['get_invoice_balances','search_invoice_balance_customers'].includes(c.name)))return null;
  const r=matches[0].result;
  if(!r||!Array.isArray(r.data)||!Array.isArray(r.totalsByCurrency))return null;
  const lines=['**Saldos registrados de facturas**',`Vencimientos clasificados al ${display(r.asOfDate)}. Son saldos actuales; no reconstruyen un saldo histórico.`,''];
  lines.push(`Clientes distintos identificados: ${number(r.matchedCustomers)}. Facturas distintas identificadas: ${number(r.matchedInvoices)}.`,'');
  if(r.totalsByCurrency.length){
    lines.push('Totales del filtro completo, separados por moneda:',...table(['Moneda','Saldo neto','Deuda positiva','Saldo negativo','Vencido','Vence hoy','Por vencer','Sin vencimiento válido','Facturas distintas'],r.totalsByCurrency.map(t=>[
      display(currency(t.currencySymbol)),number(t.totalBalance),number(t.positiveBalance),number(t.negativeBalance),number(t.overdueBalance),number(t.dueTodayBalance),number(t.upcomingBalance),number(t.undatedBalance),number(t.invoiceCount)])),'');
    if(r.totalsByCurrency.some(t=>t.unknownBalanceRows))lines.push('Hay registros con saldo desconocido: no se consideran cero.');
    if(r.totalsByCurrency.some(t=>t.invalidDueDateRows))lines.push('Hay vencimientos vacíos o inválidos; se mantienen en «Sin vencimiento válido» salvo filtros explícitos.');
  }
  if(!r.data.length)lines.push(r.totalRows?'No hay registros en esta página; los totales corresponden al filtro completo.':'No se encontraron saldos para los filtros solicitados.');
  else if(r.mode==='detail')lines.push(...table(['Factura','Cliente','Razón social','RUC','Sector','Vencimiento','Estado','Días de atraso','Moneda','Saldo'],r.data.map(row=>[
    display(row.invoiceNumber),display(row.customerName),display(row.businessName),display(row.taxId),display(row.sector),display(row.dueDate),display(statuses[row.dueStatus]??row.dueStatus),number(row.daysOverdue),display(currency(row.currencySymbol)),number(row.balance)])));
  else lines.push(...table([...(r.groupBy??[]).map(g=>labels[g]),'Moneda','Saldo','Vencido','Facturas distintas','Registros'],r.data.map(row=>[
    ...(r.groupBy??[]).map(g=>display(g==='customer'?row.customerName??row.businessName:g==='invoice'?row.invoiceNumber:g==='dueStatus'?statuses[row.dueStatus]:g==='agingBand'?statuses[row.agingBand]??row.agingBand:row[g])),
    display(currency(row.currencySymbol)),number(row.totalBalance),number(row.overdueBalance),number(row.invoiceCount),number(row.totalRows)])));
  lines.push('',`Se muestran ${r.returnedRows} de ${r.totalRows} ${r.mode==='summary'?'grupos':'registros'}. Página ${r.page} de ${r.totalPages}.`);
  if(r.hasMore)lines.push(`Puedes pedir la siguiente página (${r.nextPage}).`);
  if(r.mode==='summary')lines.push('Los conteos distintos se calculan en cada grupo; no deben sumarse entre grupos.');
  return lines.join('\n');
}

export function resolveInvoiceBalancePage({message,history=[]}) {
  if(!/^(?:ver m[aá]s|mostrar m[aá]s|siguiente(?: p[aá]gina)?|continuar)[.!?]?$/i.test(String(message).trim()))return null;
  const blocks=history.flatMap(m=>m.content??[]),calls=blocks.filter(b=>b.toolUse&&!b.toolUse.name.startsWith('search_')).map(b=>b.toolUse),last=calls.at(-1);
  if(last?.name!=='get_invoice_balances')return null;
  const response=blocks.find(b=>b.toolResult?.toolUseId===last.toolUseId)?.toolResult,result=response?.content?.find(b=>b.json)?.json;
  if(response?.status!=='success'||!result?.queryContext)return null;
  if(!result.hasMore)return {answer:'No hay más páginas de saldos para los filtros consultados.'};
  return {toolName:'get_invoice_balances',input:{...structuredClone(result.queryContext),page:result.nextPage}};
}
