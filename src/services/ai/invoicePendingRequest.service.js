import {getSearchResolutions,setSearchResolutions} from '../../state/conversation.store.js';
import {ACCESS_DENIED_MESSAGE} from './toolErrors.service.js';
import {classifyInvoiceBalanceResult,INVOICE_BALANCE_FAILURE_MESSAGE} from './invoiceBalanceResult.service.js';

const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function isPendingInvoiceRequest(message){
 const text=normalized(message);
 return /\bfacturas?\b.*\bpendientes?\b|\bpendientes? de pago\b|\bcuanto (?:le )?debe\b|^\s*solo las pendientes[.!?]?\s*$/.test(text);
}

// Only the customer crosses from billing to balances. Emission, concepts, plate,
// invoice pagination and old balance filters cannot narrow a fresh pending query.
export function pendingInvoiceInput(state){
 const source=state.invoiceLastTool??(state.contexts.get_invoices?'get_invoices':'get_invoice_balances');
 const domain=state.domains[source==='get_invoices'?'search_invoice_customers':'search_invoice_balance_customers'];
 if(domain?.kind==='pending')throw Object.assign(Error('Selecciona el cliente antes de consultar sus facturas pendientes.'),{code:'SEARCH_SELECTION_REQUIRED'});
 const ids=domain?.selected?.customerId!=null?[String(domain.selected.customerId)]:state.contexts[source]?.customerIds??[];
 return {customerIds:ids,mode:'detail',debtStatus:'pending',page:1,rows:20};
}

export async function executePendingInvoiceRequest({sessionId,message,execute}){
 if(!isPendingInvoiceRequest(message))return null;
 const text=String(message).trim().replace(/^[¿¡]\s*/,'').replace(/[.!?]+$/,'');
 const match=/^(?:(?:muestra(?:me)?|consulta) (?:las )?)?(?:las )?facturas pendientes(?: de pago)?(?: (?:de|del)(?: (?:cliente|local))? (.+))?$|^(?:las )?pendientes de pago(?: (?:de|del)(?: (?:cliente|local))? (.+))?$|^cu[aá]nto (?:le )?debe(?: (?:el )?(?:cliente|local))?(?: (.+))?$|^solo las pendientes$|^qu[eé] facturas pendientes(?: de pago)? tiene (.+)$/i.exec(text);
 if(!match)return null; // More complex filters remain with the model and executor guard.
 const previous=getSearchResolutions(sessionId);
 const finish=result=>{
  const outcome=classifyInvoiceBalanceResult(result);
  if(['failed','denied'].includes(outcome))setSearchResolutions(sessionId,previous);
  return {answer:outcome==='denied'?ACCESS_DENIED_MESSAGE:outcome==='failed'?INVOICE_BALANCE_FAILURE_MESSAGE:outcome==='empty'?'No se encontraron facturas pendientes para los filtros solicitados.':outcome==='blocked'?'No se pueden calcular los saldos con la información disponible.':'Consulta de facturas pendientes realizada.'};
 };
 const customerQuery=match[1]??match[2]??match[3]??match[4];
 if(customerQuery){
  const state=getSearchResolutions(sessionId);
  state.contexts.get_invoice_balances={mode:'detail',debtStatus:'pending',page:1,rows:20};
  setSearchResolutions(sessionId,state);
  const result=await execute('search_invoice_balance_customers',{query:customerQuery});
  if(result?.status==='ACCESS_DENIED'){setSearchResolutions(sessionId,previous);return {answer:ACCESS_DENIED_MESSAGE};}
  if(!result||result.success===false||result.error){setSearchResolutions(sessionId,previous);return {answer:INVOICE_BALANCE_FAILURE_MESSAGE};}
  if(result?.status!=='RESOLVED'||result.hasMore)return {answer:result?.status==='AMBIGUOUS'?'Selecciona el cliente para consultar sus facturas pendientes:\n'+(result.options??[]).map(o=>`${o.optionId??o.option}. ${o.customerName??o.businessName}`).join('\n'):'No se pudo resolver el cliente en los saldos de facturas. Precisa el cliente.'};
  const resultQuery=await execute('get_invoice_balances',{customerIds:[result.customerId],mode:'detail',debtStatus:'pending',page:1,rows:20});
  return finish(resultQuery);
 }
 let input;
 try{input=pendingInvoiceInput(getSearchResolutions(sessionId));}catch(e){return {answer:e.message};}
 const result=await execute('get_invoice_balances',input);
 return finish(result);
}
