import {getSearchResolutions,setSearchResolutions,getSearchSelectionTurn,setSearchSelectionTurn} from '../../state/conversation.store.js';
import {classifyInvoiceBalanceResult,INVOICE_BALANCE_FAILURE_MESSAGE} from './invoiceBalanceResult.service.js';
import {ACCESS_DENIED_MESSAGE} from './toolErrors.service.js';
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[.!?]+$/,'');
export const isGlobalPendingTotal=message=>/^deudas? pendientes? total(?:es)? de todos los clientes por monedas?(?: hasta la fecha)?$/.test(normalized(message));
export const isUsdBalanceDetail=message=>/^(?:detalla|detallame|detalle de) las que son en (?:dolares|usd)$/.test(normalized(message));

// Explicit global intent owns its scope; no per-customer requests or due-date inference.
export async function executeGlobalInvoiceBalanceRequest({sessionId,message,execute,previousState}){
 const initial=isGlobalPendingTotal(message),detail=isUsdBalanceDetail(message);
 if(!initial&&!detail)return null;
 const previous=previousState??getSearchResolutions(sessionId),current=getSearchResolutions(sessionId),scope=current.contexts.get_invoice_balances;
 if(!initial&&(current.invoiceLastTool!=='get_invoice_balances'||!scope||scope.customerIds?.length!==0||scope.debtStatus!=='pending'))return {answer:'Primero indicá el alcance de saldos pendientes que querés detallar.'};
 let input={customerIds:[],debtStatus:'pending',mode:'summary',groupBy:[],orderBy:'group',page:1,rows:20},currency;
 if(detail){
  currency=await execute('resolve_invoice_balance_currency',{currency:'USD'});
  if(currency?.status==='ACCESS_DENIED')return {answer:ACCESS_DENIED_MESSAGE};
  if(!currency||currency.success===false||currency.error)return {answer:INVOICE_BALANCE_FAILURE_MESSAGE};
  if(currency.status!=='RESOLVED'||!currency.currencyCode)return {answer:'No pude identificar un código inequívoco de USD entre los saldos autorizados. No se consultó el detalle; esto no demuestra ausencia de deuda en dólares.'};
  input={...scope,customerIds:[],debtStatus:'pending',currencyCodes:[currency.currencyCode],mode:'detail',groupBy:[],orderBy:'dueDateAsc',page:1};
  delete input.currencies;
 }
 const turn=getSearchSelectionTurn(sessionId);turn.invoiceBalanceGlobalInput=input;setSearchSelectionTurn(sessionId,turn);
 const result=await execute('get_invoice_balances',input),outcome=classifyInvoiceBalanceResult(result);
 if(['failed','denied'].includes(outcome)){setSearchResolutions(sessionId,previous);return {answer:outcome==='denied'?ACCESS_DENIED_MESSAGE:INVOICE_BALANCE_FAILURE_MESSAGE};}
 if(currency){const state=getSearchResolutions(sessionId);state.invoiceBalanceCurrencyLabels={...state.invoiceBalanceCurrencyLabels,[currency.currencyCode]:'USD'};setSearchResolutions(sessionId,state);}
 return {answer:outcome==='blocked'?'No puedo calcular un total confiable con estos registros.':'Consulta de saldos actuales realizada.'};
}
