import {protectPiiValue,restorePiiDeep} from './pii.service.js';

// Restore authorized catalog codes only in this selection display. CUSTOMER_ID
// remains internal everywhere else, including model payloads and stored history.
export function buildCustomerSelectionResponse(sessionId,calls=[]){
 const call=calls.at(-1);
 if(!['search_customers','search_invoice_customers','search_invoice_balance_customers'].includes(call?.name))return null;
 const result=restorePiiDeep(sessionId,call.result);
 if(result?.status!=='AMBIGUOUS'||result.success===false||result.error||!Array.isArray(result.options)||!result.options.length)return null;
 const cell=value=>protectPiiValue(sessionId,'CUSTOMER_SELECTION_DISPLAY',String(value??'No informado').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' '));
 const lines=['Hay varios clientes que coinciden. Seleccioná una opción:','','| Opción | Código de cliente | Cliente |','| --- | --- | --- |'];
 for(const o of result.options)lines.push('| '+[o.optionId??o.option,o.customerId??o.codCliente,o.customerName??o.name??o.businessName].map(cell).join(' | ')+' |');
 if(result.hasMore)lines.push('','La lista está limitada. Podés precisar el nombre para ver otras coincidencias.');
 return lines.join('\n');
}
