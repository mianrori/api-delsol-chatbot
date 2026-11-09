import {getMonthlySalesComparisonIntent} from './salesComparisonIntent.service.js';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const domain=word=>word.startsWith('local')?'search_customers':'search_categories';
const removeVerbs=new Set(['quita','quitar','elimina','eliminar','retira','retirar','saca','sacar','desactiva','desactivar']);
const verbs='quita|quitar|elimina|eliminar|retira|retirar|saca|sacar|desactiva|desactivar|anade|anadir|agrega|agregar|incluye|incluir|activa|activar|busca|buscar|cambia|cambiar|selecciona|seleccionar|filtra';

// An explicit subject and complete period make this a new sales question.
// Imperatives such as “filtra también por …” deliberately stay incremental.
// Return text-derived scope, never infer removal from missing model arguments.
export function getAutonomousCategorySalesIntent(message){
 const match=/^(?:consulta (?:las )?)?ventas del rubro (.+?) (?:durante|en|para)(?: el ano)? ((?:19|20)\d{2})(?:,? por (mes|ano|dia|local|rubro))?[.!?]*$/.exec(normalize(message));
 if(!match)return null;
 return {search:match[1],dateFrom:`01/01/${match[2]}`,dateTo:`31/12/${match[2]}`,
  ...(match[3]?{groupBy:[{mes:'month',ano:'year',dia:'day',local:'customer',rubro:'category'}[match[3]]]}:{})};
}

// Preserve an explicit sales period even when a lookup returns ambiguity and
// the model has not yet proposed a consumer call to capture its arguments.
export function getExplicitSalesRange(message){
 const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
 const month=months.join('|');
 const match=new RegExp(`^ventas\\b.+?\\bde (${month}) a (${month}) de ((?:19|20)\\d{2})(?:,? por (mes|ano|dia|local|rubro))?[.!?]*$`).exec(normalize(message));
 if(!match)return null;
 const from=months.indexOf(match[1])+1,to=months.indexOf(match[2])+1,year=Number(match[3]);if(from>to)return null;
 const last=new Date(Date.UTC(year,to,0)).getUTCDate(),pad=n=>String(n).padStart(2,'0');
 return {dateFrom:`01/${pad(from)}/${year}`,dateTo:`${last}/${pad(to)}/${year}`,
  ...(match[4]?{groupBy:[{mes:'month',ano:'year',dia:'day',local:'customer',rubro:'category'}[match[4]]]}:{})};
}

// Match the whole instruction. Additional dates/groupings are not pure removals
// and must not be discarded by this shortcut.
export const isExclusiveLocalRemoval=message=>/^(?:ahora )?(?:todos los locales|(?:quita|quitar|elimina|eliminar|retira|retirar|saca|sacar|desactiva|desactivar) (?:el )?filtro de local)(?: (?:manteniendo|conservando) (?:el mismo periodo|los demas filtros))?$/.test(normalize(message).replace(/[.!?]+$/,''));

export function getSalesLocalRemovalChange(message){
 if(isExclusiveLocalRemoval(message))return {};
 const text=normalize(message).replace(/,/g,' ').replace(/\s+/g,' ').replace(/[.!?]+$/,'');
 // A bounded explicit compound request. Derive changes from the user's words,
 // never grant the model unrelated keys. Other wording keeps its existing flow.
 const match=/^(?:ahora )?todos los locales(?: (?:durante|en|para)(?: el ano)? ((?:19|20)\d{2}))?(?: (?:y )?(?:agrupa )?por (ano|mes|dia|local|rubro))?$/.exec(text);
 if(!match||!match[1]&&!match[2])return null;
 return {...(match[1]?{dateFrom:`01/01/${match[1]}`,dateTo:`31/12/${match[1]}`}:{}) ,...(match[2]?{groupBy:[{ano:'year',mes:'month',dia:'day',local:'customer',rubro:'category'}[match[2]]]}:{})};
}

// Deliberately narrow imperative grammar. Omitted tool arguments and a model's
// proposed IDs are never evidence that the user removed or re-enabled a filter.
export function getSearchFilterActions(message){
 const text=normalize(message),actions=[];
 if(/^(?:ahora )?todos los rubros\b/.test(text))actions.push({search:'search_categories',action:'remove'});
 if(/^(?:ahora )?todos los locales\b/.test(text))actions.push({search:'search_customers',action:'remove'});
 const matches=[...text.matchAll(new RegExp(`(?:^|[,;]|\\by\\s+)(?:(?:ahora|por favor)\\s+)?(?:(?:vuelve|volver)\\s+a\\s+)?(${verbs})\\s+`,'g'))];
 for(let i=0;i<matches.length;i++){
  const m=matches[i],body=text.slice(m.index+m[0].length,matches[i+1]?.index??text.length)
   .replace(/^(?:solo|solamente)\s+/,'').replace(/^(?:por|con)\s+/,'').replace(/^(?:el|los|la|las|un|una)\s+/,'').replace(/^filtros?(?:\s+(?:de|del))?\s+/,'');
  const targets=/^ambos(?: filtros)?\b/.test(body)?['search_customers','search_categories']:(()=>{
   const first=/^(local(?:es)?|rubro(?:s)?)\b/.exec(body);if(!first)return [];
   const result=[domain(first[1])],rest=body.slice(first[0].length);
   const second=/^\s+y\s+(?:(?:el|los|de|del)\s+)*(?:filtros?\s+(?:de\s+)?)?(local(?:es)?|rubro(?:s)?)\b/.exec(rest);
   if(second)result.push(domain(second[1]));return [...new Set(result)];
  })();
  for(const search of targets)actions.push({search,action:removeVerbs.has(m[1])?'remove':'add'});
 }
 return actions;
}

export function isExplicitSearchRequest(message,search,input={}){
 const comparison=search==='search_categories'?getMonthlySalesComparisonIntent(message):null;
 if(comparison?.search)return input.search==null||normalize(input.search)===comparison.search;
 const autonomous=search==='search_categories'?getAutonomousCategorySalesIntent(message):null;
 if(autonomous)return input.search==null||normalize(input.search)===autonomous.search;
 const text=normalize(message),action=getSearchFilterActions(message).filter(a=>a.search===search).at(-1);
 if(action)return action.action==='add';
 const query=normalize(input.search);
 if(search==='search_categories'&&query&&/^filtra(?: tambien)? por (?:el rubro )?(.+?)[.!?]*$/.exec(text)?.[1]===query)return true;
 // A positive, directly named lookup also counts, including protected tokens.
 // Merely mentioning a former label (or asking not to use it) cannot revive it.
 const named=/^(?:ahora )?(?:busca|buscar|consulta|consultar|selecciona|seleccionar)\s+(?:(?:el|la|al)\s+)?(.+)$/.exec(text)?.[1];
 return query.length>=3&&Boolean(named&&(named===query||named.startsWith(query+' ')));
}
