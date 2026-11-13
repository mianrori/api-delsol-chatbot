export const INVOICE_BALANCE_FAILURE_MESSAGE='No se pudo completar la consulta de facturas pendientes. Inténtalo de nuevo.';

// A resolved promise is not evidence that Oracle returned a usable result.
export function classifyInvoiceBalanceResult(result){
 if(result?.status==='ACCESS_DENIED'||result?.code==='ACCESS_DENIED'||result?.error==='ACCESS_DENIED')return 'denied';
 if(!result||typeof result!=='object'||result.success===false||result.error)return 'failed';
 if(['INCONSISTENT_HISTORY','REQUIRES_SOURCE_IDENTITY'].includes(result.status))return 'blocked';
 if(!((result.status==='OK_DETAIL_ONLY'&&result.mode==='detail')||(result.status==='OK_SUMMARY'&&result.mode==='summary'))||!Array.isArray(result.data))return 'failed';
 return result.data.length?'data':'empty';
}
