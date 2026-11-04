const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const domain=word=>word.startsWith('local')?'search_customers':'search_categories';
const removeVerbs=new Set(['quita','quitar','elimina','eliminar','retira','retirar','saca','sacar','desactiva','desactivar']);
const verbs='quita|quitar|elimina|eliminar|retira|retirar|saca|sacar|desactiva|desactivar|anade|anadir|agrega|agregar|incluye|incluir|activa|activar|busca|buscar|cambia|cambiar|selecciona|seleccionar|filtra';

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
 const text=normalize(message),action=getSearchFilterActions(message).filter(a=>a.search===search).at(-1);
 if(action)return action.action==='add';
 const query=normalize(input.search);
 // A positive, directly named lookup also counts, including protected tokens.
 // Merely mentioning a former label (or asking not to use it) cannot revive it.
 const named=/^(?:ahora )?(?:busca|buscar|consulta|consultar|selecciona|seleccionar)\s+(?:(?:el|la|al)\s+)?(.+)$/.exec(text)?.[1];
 return query.length>=3&&Boolean(named&&(named===query||named.startsWith(query+' ')));
}
