import {getSearchFilterActions,isExplicitSearchRequest} from './searchFilterIntent.service.js';
const specs={
 search_customers:{consumers:['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance','get_contract_conditions','get_contract_cost_per_sqm','analyze_contract_cost_incidence'],fields:o=>({customerIds:[o.codCliente],customerId:o.codCliente})},
 search_categories:{consumers:['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','get_soles_usage','compare_member_purchases_vs_sales','analyze_campaign_sales_performance'],fields:o=>({categoryIds:[o.codRubro]})},
 search_members:{consumers:['get_member','get_member_purchases','get_member_promo_purchases','get_member_soles','get_soles_usage','get_member_vehicles'],fields:o=>({documentNumber:o.documentNumber})},
 search_invoice_customers:{consumers:['get_invoices'],fields:o=>({customerIds:[String(o.customerId)]})},
 search_invoice_concepts:{consumers:['get_invoices'],fields:o=>({conceptIds:[String(o.conceptId)]})},
 search_soles_types:{consumers:['get_member_soles','get_soles_usage'],fields:(o,name)=>({[name==='get_member_soles'?'typeIds':'solesTypeIds']:[o.typeId]})},
 search_soles_usage_destinations:{consumers:['get_soles_usage'],fields:o=>({destinations:[{destinationType:o.destinationType,destinationCode:o.destinationCode}]})},
 search_soles_usage_movement_types:{consumers:['get_soles_usage'],fields:o=>({movementTypes:[o.movementType]})},
};
const fail=()=>{throw Object.assign(Error('Selecciona una opción válida del buscador antes de consultar.'),{code:'SEARCH_SELECTION_REQUIRED'});};
const userText=message=>message?.role==='user'?message.content?.find(b=>typeof b.text==='string')?.text:null;
const selection=text=>String(text).trim().match(/^(?:(?:la\s+)?(?:opci[oó]n|n[uú]mero)\s*)?(\d+)\s*[.!]?$/i)?.[1];
const required={search_customers:['codCliente'],search_categories:['codRubro'],search_members:['documentNumber'],search_invoice_customers:['customerId'],search_invoice_concepts:['conceptId'],search_soles_types:['typeId'],search_soles_usage_destinations:['destinationType','destinationCode'],search_soles_usage_movement_types:['movementType']};
const optionFrom=result=>result.customer??result.category??result.member??result;

// Reconstruct resolution state across turns and tool iterations. A failed query
// or a non-selection message must not erase an unresolved lookup.
export function preserveSearchSelection({name,input,history=[],currentCalls=[],removedFilters=[]}){
 const states=new Map(),calls=new Map(),queries=[],turnTexts=new Map();let turn=-1,currentText='';
 for(const search of removedFilters)if(['search_customers','search_categories'].includes(search))states.set(search,{kind:'cleared',originTurn:-1,clearedTurn:-1});
 const update=(call,result)=>{
  if(!specs[call.name]||!result)return;
  const prior=states.get(call.name),originTurn=prior&&['pending','cleared'].includes(prior.kind)?prior.originTurn:call.turn;
  if(prior?.kind==='cleared'&&!isExplicitSearchRequest(turnTexts.get(call.turn),call.name,call.input))return;
  if(['AMBIGUOUS','LISTED','NOT_FOUND'].includes(result.status))states.set(call.name,{kind:'pending',call,result,originTurn});
  else if(result.status==='RESOLVED'&&result.hasMore!==true)states.set(call.name,{kind:prior?.kind==='pending'||prior?.kind==='selected'?'selected':'resolved',call,result,originTurn,selected:optionFrom(result),selectedTurn:call.turn});
 };
 for(const message of history){
  const text=userText(message);
  if(text!=null){
   currentText=text;
   turn++;turnTexts.set(turn,text);
   for(const {search,action} of getSearchFilterActions(text)){
    const prior=states.get(search),originTurn=prior?.originTurn??turn;
    if(action==='remove')states.set(search,{kind:'cleared',originTurn,clearedTurn:turn});
    else if(prior?.kind==='cleared')states.set(search,{kind:'pending',originTurn,call:{input:{}},result:{status:'AMBIGUOUS',options:[]}});
   }
   const choice=selection(text),pending=[...states].filter(([,s])=>s.kind==='pending');
   const selectable=pending.length?pending:[...states].filter(([,s])=>s.kind==='selected');
   if(choice&&selectable.length===1){const [search,state]=selectable[0];const selected=state.result.options?.find(o=>String(o.optionId??o.option)===String(Number(choice)));
    states.set(search,selected?{...state,kind:'selected',selected,selectedTurn:turn}:{...state,kind:'pending'});
   }else if(choice&&selectable.length>1){for(const [search,state] of selectable)states.set(search,{...state,kind:'pending'});
   }
  }
  for(const block of message.content??[]){
   if(block.toolUse){const call={...block.toolUse,turn};calls.set(call.toolUseId,call);if(!specs[call.name])queries.push(call);}
   if(block.toolResult){const call=calls.get(block.toolResult.toolUseId);if(call){call.resultStatus=block.toolResult.status;if(call.resultStatus==='success')update(call,block.toolResult.content?.find(b=>b.json)?.json);}}
  }
 }
 for(const call of currentCalls)if(specs[call.name])update({...call,turn},call.result);
 if(states.get(name)?.kind==='cleared'&&!isExplicitSearchRequest(currentText,name,input))throw Object.assign(Error('El filtro fue retirado. Solicita volver a añadirlo antes de buscarlo.'),{code:'SEARCH_FILTER_REMOVED'});
 const resolutions=[],removed=[];
 for(const [search,spec] of Object.entries(specs)){
  if(!spec.consumers.includes(name))continue;
  const state=states.get(search);if(!state)continue;
  if(state.kind==='pending')fail();
  if(state.kind==='cleared'){removed.push(search);continue;}
  const {selected}=state;
  if(required[search].some(key=>selected[key]==null))fail();
  resolutions.push({search,spec,state,selected});
 }
 // Recover context once, independently of resolver order. A later resolver must
 // never merge the original model proposal over identifiers already validated.
 const origins=new Set(resolutions.map(r=>r.state.originTurn));
 const origin=queries.filter(c=>c.name===name&&origins.has(c.turn)).sort((a,b)=>a.turn-b.turn)[0];
 const successful=queries.filter(c=>c.name===name&&c.turn<turn&&c.resultStatus==='success').at(-1);
 const original=(successful&&successful.turn>=(origin?.turn??-1)?successful:origin)?.input??{};
 const selectingNow=Boolean(selection(currentText))&&resolutions.some(r=>r.state.selectedTurn===turn);
 const result=selectingNow?{...input,...original}:{...original,...input};
 const identifiers={};
 for(const {search,spec,state,selected} of resolutions){
  for(const [key,value] of Object.entries(spec.fields(selected,name))){
   // customerId and customerIds are alternate contracts, not extra tool fields.
   if(key==='customerId'&&['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance'].includes(name))continue;
   if(key==='customerIds'&&['get_contract_conditions','get_contract_cost_per_sqm','analyze_contract_cost_incidence'].includes(name))continue;
   if(value==null||Array.isArray(value)&&value.some(v=>v==null))fail();identifiers[key]=value;
  }
  if(search==='search_invoice_customers')for(const key of ['dateFrom','dateTo'])if(state.call.input?.[key]!=null)result[key]=state.call.input[key];
 }
 // Detach nested filters too, so a consumer cannot mutate the stored history.
 const finalInput={...result,...identifiers};
 for(const search of removed)for(const key of search==='search_customers'?['customerId','customerIds']:['categoryIds'])delete finalInput[key];
 return structuredClone(finalInput);
}

// Called only on the arguments returned by the guard. A still-retired domain
// has no IDs there, so model proposals cannot clear its persistent marker.
export const reenabledSearchFilters=(name,input,removedFilters=[])=>[...removedFilters].filter(search=>{
 if(!specs[search]?.consumers.includes(name))return false;
 return search==='search_customers'?Boolean(input.customerId)||(Array.isArray(input.customerIds)&&input.customerIds.length>0):Array.isArray(input.categoryIds)&&input.categoryIds.length>0;
});
