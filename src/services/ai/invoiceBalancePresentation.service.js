export const invoiceBalanceCell=value=>String(value??'Sin datos').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
const number=value=>value==null?'Desconocido':new Intl.NumberFormat('es-PY',{maximumFractionDigits:2}).format(value);
const exactBalance=value=>{if(value==null)return 'Desconocido';const m=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));return m?m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+(m[3]??'').padEnd(2,'0'):'Importe no representable';};
const statuses={overdue:'Vencida',dueToday:'Vence hoy',upcoming:'Por vencer',undated:'Sin vencimiento válido',notDue:'No vencida'};
const table=(head,rows)=>['| '+head.join(' | ')+' |','| '+head.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.join(' | ')+' |')];
export function buildInvoiceBalanceResponse(calls=[],{display=invoiceBalanceCell}={}) {
  const matches=calls.filter(c=>c.name==='get_invoice_balances');
  if(matches.length!==1||calls.some(c=>!['get_invoice_balances','search_invoice_balance_customers'].includes(c.name)))return null;
  const r=matches[0].result;
  if(r?.status==='REQUIRES_SOURCE_IDENTITY')return 'Estos datos no identifican inequívocamente la divisa ni la factura. Por eso solo puedo mostrar registros individuales: no sumar saldos ni elaborar rankings monetarios.';
  if(!r||r.mode!=='detail'||!Array.isArray(r.data))return null;
  const lines=['**Saldos registrados de facturas**',`Vencimientos clasificados al ${display(r.asOfDate)}. Son saldos actuales; no reconstruyen un saldo histórico.`,''];
  lines.push(`Clientes distintos identificados: ${number(r.matchedCustomers)}. Números de factura distintos: ${number(r.matchedInvoiceNumbers)}.`,'');
  lines.push('Cada fila es un registro de la vista, no una factura única. El símbolo no identifica inequívocamente la divisa; no se suman importes ni se infiere pago o crédito por su signo.','');
  if(r.unknownBalanceRows)lines.push('Hay registros con saldo desconocido; no se consideran cero.');
  if(r.invalidDueDateRows)lines.push('Hay vencimientos vacíos o inválidos, clasificados como sin vencimiento válido.');
  if(!r.data.length)lines.push(r.totalRows?'No hay registros en esta página; los conteos corresponden al filtro completo.':'No se encontraron saldos para los filtros solicitados.');
  else lines.push(...table(['Número de factura','Cliente','Razón social','RUC','Sector','Vencimiento','Estado','Días de atraso','Símbolo informado','Saldo'],r.data.map(row=>[
    display(row.invoiceNumber),display(row.customerName),display(row.businessName),display(row.taxId),display(row.sector),display(row.dueDate),display(statuses[row.dueStatus]??row.dueStatus),number(row.daysOverdue),display(row.currencySymbol??'Sin símbolo'),exactBalance(row.balance)])));
  lines.push('',`Se muestran ${r.returnedRows} de ${r.totalRows} registros. Página ${r.page} de ${r.totalPages}.`);
  if(r.hasMore)lines.push(`Puedes pedir la siguiente página (${r.nextPage}).`);
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
