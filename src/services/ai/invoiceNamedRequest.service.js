import {getSearchResolutions,setSearchResolutions,getSearchSelectionTurn,setSearchSelectionTurn} from '../../state/conversation.store.js';
import {restorePiiDeep} from './pii.service.js';
import {ACCESS_DENIED_MESSAGE} from './toolErrors.service.js';

// Separate the two explicitly named roles before a model can swap their tools.
// Unqualified "facturas de X" remains outside this bounded grammar.
export function parseNamedInvoiceRequest(message){
 const text=String(message??'').trim().replace(/^[\u00bf\u00a1]\s*/,'').replace(/[.!?]+$/,'');
 if(/\b(?:sin anulad[ao]s|por mes|con matr[i\u00ed]cula|p[a\u00e1]gina|solo importe|solo facturas)\b/iu.test(text))return null;
 const prefix='(?:(?:muestra(?:me)?|consulta) (?:las )?)?(?:las )?facturas (?:de|del concepto) ';
 const year='(?:del?|durante)(?: el)?(?: a[\u00f1n]o)? ((?:19|20)\\d{2})';
 const first=new RegExp('^'+prefix+'(.+?) '+year+' del (?:local|cliente) (.+)$','i').exec(text);
 if(first)return {conceptQuery:first[1].trim(),customerQuery:first[3].trim(),dateFrom:'01/01/'+first[2],dateTo:'31/12/'+first[2]};
 const last=new RegExp('^'+prefix+'(.+?) del (?:local|cliente) (.+?) '+year+'$','i').exec(text);
 return last?{conceptQuery:last[1].trim(),customerQuery:last[2].trim(),dateFrom:'01/01/'+last[3],dateTo:'31/12/'+last[3]}:null;
}
const choiceOf=text=>/^(?:(?:la )?(?:opci[o\u00f3]n|n[u\u00fa]mero)\s*)?(\d+)[.!]?$/.exec(String(text??'').trim())?.[1];
const idKey=role=>role==='concept'?'conceptId':'customerId';
const labelKey=role=>role==='concept'?'description':'customerName';
const minimal=(role,value)=>Object.fromEntries(['option','optionId',idKey(role),labelKey(role),'businessName'].filter(k=>value?.[k]!=null).map(k=>[k,value[k]]));

export async function executeNamedInvoiceRequest({sessionId,message,execute}){
 const initial=parseNamedInvoiceRequest(message),stored=getSearchResolutions(sessionId).invoiceNamedRequest;
 const choice=choiceOf(message);let request=initial?{...initial,phase:'concept'}:stored;
 const pending=request&&['conceptPending','customerPending'].includes(request.phase);
 const save=()=>{const state=getSearchResolutions(sessionId);state.invoiceNamedRequest=request;setSearchResolutions(sessionId,state);};
 if(!initial&&(!pending||!choice)){if(stored){const state=getSearchResolutions(sessionId);delete state.invoiceNamedRequest;setSearchResolutions(sessionId,state);}return null;}
 const display=value=>String(restorePiiDeep(sessionId,value)??'').replace(/([\\`*_[\]<>|])/g,'\\$1').replace(/[\r\n]+/g,' ');
 const pendingAnswer=role=>['Selecciona '+(role==='concept'?'el concepto de facturaci\u00f3n':'el cliente/local de facturaci\u00f3n')+':',...(request.options??[]).map(o=>String(o.optionId??o.option)+'. '+display(o[labelKey(role)]??o.businessName))].join('\n');
 if(!initial&&pending){
  const role=request.phase==='conceptPending'?'concept':'customer',option=request.options?.find(o=>String(o.optionId??o.option)===String(Number(choice)));
  if(!option)return {answer:pendingAnswer(role)};
  request[role]={status:'RESOLVED',...minimal(role,option)};delete request.options;request.phase=role==='concept'?'customer':'query';
 }
 const turn=getSearchSelectionTurn(sessionId);turn.invoiceNamedRequest=true;setSearchSelectionTurn(sessionId,turn);save();
 for(const role of ['concept','customer']){
  if(request[role]?.status==='RESOLVED')continue;
  const result=await execute(role==='concept'?'search_invoice_concepts':'search_invoice_customers',role==='concept'?{query:request.conceptQuery}:{query:request.customerQuery,dateFrom:request.dateFrom,dateTo:request.dateTo});
  if(result?.status==='ACCESS_DENIED'){
   request.phase='denied';save();return {answer:ACCESS_DENIED_MESSAGE};
  }
  if(result?.status==='AMBIGUOUS'){
   request.options=(result.options??[]).map(o=>minimal(role,o));request.phase=role+'Pending';save();return {answer:pendingAnswer(role)};
  }
  if(result?.status!=='RESOLVED'||result[idKey(role)]==null){
   request.phase='stopped';save();return {answer:result?.status==='NOT_FOUND'?'No se encontr\u00f3 '+(role==='concept'?'el concepto de facturaci\u00f3n ':'el cliente/local de facturaci\u00f3n para el per\u00edodo consultado: ')+display(role==='concept'?request.conceptQuery:request.customerQuery)+'. No se consultaron facturas.':'No fue posible resolver '+(role==='concept'?'el concepto':'el cliente/local')+'. No se consultaron facturas.'};
  }
  request[role]={status:'RESOLVED',...minimal(role,result)};request.phase=role==='concept'?'customer':'query';save();
 }
 const input={customerIds:[request.customer.customerId],conceptIds:[request.concept.conceptId],dateFrom:request.dateFrom,dateTo:request.dateTo,mode:'detail',page:1,rows:20};
 const result=await execute('get_invoices',input);request.phase='complete';request.input=input;save();
 return {answer:Array.isArray(result?.data)?'Detalle de facturas consultado.':'No fue posible consultar las facturas del concepto y cliente/local indicados.'};
}
