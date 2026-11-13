export const invoiceBalanceCell=value=>String(value??'Sin datos').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
const number=value=>value==null?'Desconocido':new Intl.NumberFormat('es-PY',{maximumFractionDigits:2}).format(value);
const exactBalance=value=>{if(value==null)return 'Desconocido';const m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));return m?m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+(m[3]??'').padEnd(2,'0'):'Importe no representable';};
const statuses={overdue:'Vencida',dueToday:'Vence hoy',upcoming:'Por vencer',undated:'Sin vencimiento válido',notDue:'No vencida'};
const table=(head,rows)=>['| '+head.join(' | ')+' |','| '+head.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.join(' | ')+' |')];
export function buildInvoiceBalanceResponse(calls=[],{display=invoiceBalanceCell}={}) {
  const matches=calls.filter(c=>c.name==='get_invoice_balances');
  if(matches.length!==1||calls.some(c=>!['get_invoice_balances','search_invoice_balance_customers'].includes(c.name)))return null;
  const r=matches[0].result;
  if(r?.status==='INCONSISTENT_HISTORY')return 'Hay registros históricos inconsistentes o información incompleta. No se calculan los totales, rankings ni conteos de facturas afectados. Puedes consultar el detalle, que conserva todos los registros.';
  if(r?.status==='OK_SUMMARY')return ['**Deudas por moneda**',`Referencia de vencimiento: ${display(r.asOfDate)}. Cálculos sobre identidades serie/número sin repeticiones en el alcance comprobado; sin conversión de moneda.`,
    ...table(['Moneda (código)',...r.queryContext.groupBy,'Facturas','Deuda','Posición en su moneda'],r.data.map(row=>[display(row.currencyCode),...r.queryContext.groupBy.map(k=>k==='invoice'?`${display(row.invoiceSeries)} / ${display(row.invoiceNumber)}`:display(row[{customer:'customerId',sector:'sector',dueMonth:'dueMonth',dueStatus:'dueStatus',agingBand:'agingBand'}[k]])),number(row.invoiceCount),exactBalance(row.debt),number(row.currencyRank)])),
    `Página ${r.page} de ${r.totalPages}.`].join('\n');
  if(r?.status==='REQUIRES_SOURCE_IDENTITY')return 'No puedo sumar estas deudas sin confirmar qué representa cada registro y cómo identificar cada factura. Para ordenar importes individuales necesito además una única moneda identificada por su código.';
  if(!r||r.mode!=='detail'||!Array.isArray(r.data))return null;
  const settled=r.queryContext?.debtStatus==='settled';
  const lines=[settled?'**Facturas con deuda cancelada**':'**Deudas registradas de facturas**',`Vencimientos clasificados al ${display(r.asOfDate)}. Son importes actuales; no reconstruyen un saldo histórico.`,''];
  if(settled)lines.push('Deuda cancelada significa deuda cero. No indica que la factura esté anulada.','');
  if(r.warning)lines.push(display(r.warning),'');
  lines.push(`Clientes distintos identificados: ${number(r.matchedCustomers)}. Pares serie/número distintos: ${number(r.matchedInvoicePairs)}.`,'');
  lines.push('Cada fila es un registro: serie/número todavía no demuestra una factura única. Los negativos se excluyen; cero indica deuda cancelada. No se suman importes ni se mezclan monedas.','');
  if(r.unknownDebtRows)lines.push('Hay registros con deuda desconocida; no se consideran cero ni cancelados.');
  if(r.invalidDueDateRows)lines.push('Hay vencimientos vacíos o inválidos, clasificados como sin vencimiento válido.');
  if(!r.data.length)lines.push(r.totalRows?'No hay registros en esta página; los conteos corresponden al filtro completo.':settled?'No se encontraron facturas con deuda cancelada para los filtros solicitados.':'No se encontraron saldos para los filtros solicitados.');
  else lines.push(...table(['Serie de factura','Número de factura','Estado de deuda','Cliente','Razón social','RUC','Sector','Vencimiento','Estado de vencimiento','Días de atraso','Moneda (código)','Símbolo informado','Deuda'],r.data.map(row=>[
    display(row.invoiceSeries),display(row.invoiceNumber),display({pending:'Pendiente',settled:'Deuda cancelada',unknown:'Desconocida'}[row.debtState]),display(row.customerName),display(row.businessName),display(row.taxId),display(row.sector),display(row.dueDate),display(statuses[row.dueStatus]??row.dueStatus),number(row.daysOverdue),display(row.currencyCode),display(row.currencySymbol??'Sin símbolo'),exactBalance(row.debt)])));
  lines.push('',`Se muestran ${r.returnedRows} de ${r.totalRows} registros. Página ${r.page} de ${r.totalPages}.`);
  if(r.hasMore)lines.push(`Puedes pedir la siguiente página (${r.nextPage}).`);
  return lines.join('\n');
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
