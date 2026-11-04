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
export function preserveSearchSelection({name,input,history=[],currentCalls=[]}){
 const states=new Map(),calls=new Map(),queries=[];let turn=-1;
 const update=(call,result)=>{
  if(!specs[call.name]||!result)return;
  const prior=states.get(call.name),originTurn=prior?.kind==='pending'?prior.originTurn:call.turn;
  if(['AMBIGUOUS','LISTED','NOT_FOUND'].includes(result.status))states.set(call.name,{kind:'pending',call,result,originTurn});
  else if(result.status==='RESOLVED'&&result.hasMore!==true)states.set(call.name,{kind:prior?.kind==='pending'||prior?.kind==='selected'?'selected':'resolved',call,result,originTurn,selected:optionFrom(result),selectedTurn:call.turn});
 };
 for(const message of history){
  const text=userText(message);
  if(text!=null){
   turn++;const choice=selection(text),pending=[...states].filter(([,s])=>s.kind==='pending');
   const selectable=pending.length?pending:[...states].filter(([,s])=>s.kind==='selected');
   if(choice&&selectable.length===1){const [search,state]=selectable[0];const selected=state.result.options?.find(o=>String(o.optionId??o.option)===String(Number(choice)));
    states.set(search,selected?{...state,kind:'selected',selected,selectedTurn:turn}:{...state,kind:'pending'});
   }else if(choice&&selectable.length>1){for(const [search,state] of selectable)states.set(search,{...state,kind:'pending'});
   }
  }
  for(const block of message.content??[]){
   if(block.toolUse){const call={...block.toolUse,turn};calls.set(call.toolUseId,call);if(!specs[call.name])queries.push(call);}
   if(block.toolResult?.status==='success'){const call=calls.get(block.toolResult.toolUseId);if(call)update(call,block.toolResult.content?.find(b=>b.json)?.json);}
  }
 }
 for(const call of currentCalls)if(specs[call.name])update({...call,turn},call.result);
 let result={...input};
 for(const [search,spec] of Object.entries(specs)){
  if(!spec.consumers.includes(name))continue;
  const state=states.get(search);if(!state)continue;
  if(state.kind==='pending')fail();
  // Older resolved lookups must not bind an unrelated new request. Explicitly
  // selected identities remain authoritative for continuations until re-searched.
  if(state.kind==='resolved'&&state.selectedTurn<turn)continue;
  const {selected}=state;
  if(required[search].some(key=>selected[key]==null))fail();
  const previousInput=queries.filter(c=>c.name===name&&c.turn===state.originTurn).at(-1)?.input??{};
  result=state.selectedTurn===turn?{...result,...previousInput}:{...previousInput,...result};
  for(const [key,value] of Object.entries(spec.fields(selected,name))){
   // customerId and customerIds are alternate contracts, not extra tool fields.
   if(key==='customerId'&&['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance'].includes(name))continue;
   if(key==='customerIds'&&['get_contract_conditions','get_contract_cost_per_sqm','analyze_contract_cost_incidence'].includes(name))continue;
   if(value==null||Array.isArray(value)&&value.some(v=>v==null))fail();result[key]=value;
  }
  if(search==='search_invoice_customers')for(const key of ['dateFrom','dateTo'])if(state.call.input?.[key]!=null)result[key]=state.call.input[key];
 }
 return result;
}
