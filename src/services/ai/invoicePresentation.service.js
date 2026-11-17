// Display helpers only: no lookups, conversion, aggregation or scope changes.
export const invoiceCell=value=>String(value??'No informado').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
export const invoiceNumber=value=>value==null?'No informado':new Intl.NumberFormat('es-PY',{maximumFractionDigits:2}).format(value);
const currencies={PYG:'Gs.','GS':'Gs.','GS.':'Gs.','₲':'Gs.',GUARANI:'Gs.',GUARANIES:'Gs.',USD:'USD','US$':'USD','U$S':'USD',EUR:'EUR','€':'EUR',EURO:'EUR',EUROS:'EUR',BRL:'BRL','R$':'BRL',ARS:'ARS',UYU:'UYU',CLP:'CLP',GBP:'GBP','£':'GBP',JPY:'JPY',CHF:'CHF',CAD:'CAD',AUD:'AUD'};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export function invoiceCurrencyLabel({currencyCode,currencySymbol}={}){
 const code=currencies[normalize(currencyCode)],symbol=currencies[normalize(currencySymbol)];
 if(code&&symbol&&code!==symbol)return 'Moneda no informada';
 if(symbol||code)return symbol??code;
 return String(currencySymbol??'').trim()==='$'?'$ (moneda no identificada)':'Moneda no informada';
}
export const invoiceTable=(head,rows)=>['| '+head.join(' | ')+' |','| '+head.map(()=>'---').join(' | ')+' |',...rows.map(row=>'| '+row.join(' | ')+' |')];
export function invoicePagination(result,returnedRows){
 let text=`Mostrando ${invoiceNumber(returnedRows)} de ${invoiceNumber(result.totalRows)} registros.`;
 if(Number.isInteger(result.totalPages)&&result.totalPages>0)text+=` Página ${invoiceNumber(result.page)} de ${invoiceNumber(result.totalPages)}.`;
 if(result.hasMore)text+=' Podés pedir la siguiente página.';
 return text;
}
export function invoiceSingleCustomer(rows,{customer,customerIds=[],totalRows}={}){
 if(!rows.length)return null;
 const people=rows.map(customer),first=people[0];
 if(first?.id==null||!people.every(p=>p?.id!=null&&String(p.id)===String(first.id)))return null;
 const scoped=customerIds.length===1&&String(customerIds[0])===String(first.id);
 const complete=Number.isInteger(totalRows)&&totalRows===rows.length;
 // COUNT(DISTINCT customer) ignores NULL identities on other pages.
 return scoped||complete?first.name??null:null;
}
export function invoicePresentationNeeds(message=''){
 const text=normalize(message).toLowerCase();
 return {tax:/\bruc\b/.test(text),business:/razon social/.test(text),sector:/\bsector\b/.test(text),contract:/\bcontrato\b/.test(text),plate:/matricula|chapa/.test(text),period:/periodo/.test(text),annulled:/anulad/.test(text),
  customerColumn:/\bcolumna\s+(?:(?:de|del|el)\s+)?cliente\b|\bcliente\s+(?:en\s+)?cada\s+(?:fila|registro)\b|\bcada\s+(?:fila|registro)\s+(?:el\s+)?cliente\b/.test(text),
  late:/atraso|mora|dias.*venc/.test(text),dueState:/vencidas?|por vencer|vencen hoy/.test(text),rank:/ranking|posicion|mayores|menores/.test(text),
  historical:/histor|a la fecha|al \d|a fecha|\b(?:19|20)\d{2}\b/.test(text),paymentDate:/cuando.*(?:pag|cancel)|fecha.*(?:pago|cancel)|(?:pago|cancelacion).*fecha/.test(text)};
}
