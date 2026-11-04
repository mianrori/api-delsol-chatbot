const specs={
 search_customers:{consumers:['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance','get_contract_conditions','get_contract_cost_per_sqm','analyze_contract_cost_incidence'],fields:o=>({customerIds:[o.codCliente],customerId:o.codCliente})},
 search_categories:{consumers:['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance'],fields:o=>({categoryIds:[o.codRubro]})},
 search_members:{consumers:['get_member','get_member_purchases','get_member_promo_purchases','get_member_soles','get_soles_usage','get_member_vehicles'],fields:o=>({documentNumber:o.documentNumber})},
 search_invoice_customers:{consumers:['get_invoices'],fields:o=>({customerIds:[String(o.customerId)]})},
 search_invoice_concepts:{consumers:['get_invoices'],fields:o=>({conceptIds:[String(o.conceptId)]})},
 search_soles_types:{consumers:['get_member_soles','get_soles_usage'],fields:(o,name)=>({[name==='get_member_soles'?'typeIds':'solesTypeIds']:[o.typeId]})},
 search_soles_usage_destinations:{consumers:['get_soles_usage'],fields:o=>({destinations:[{destinationType:o.destinationType,destinationCode:o.destinationCode}]})},
 search_soles_usage_movement_types:{consumers:['get_soles_usage'],fields:o=>({movementTypes:[o.movementType]})},
};
const fail=()=>{throw Object.assign(Error('Selecciona una opción válida del buscador antes de consultar.'),{code:'SEARCH_SELECTION_REQUIRED'});};
const userText=message=>message?.role==='user'?message.content?.find(b=>typeof b.text==='string')?.text:null;
const callsFrom=messages=>{
 const calls=messages.filter(m=>m.role==='assistant').flatMap(m=>m.content??[]).map(b=>b.toolUse).filter(Boolean);
 const results=messages.filter(m=>m.role==='user').flatMap(m=>m.content??[]).map(b=>b.toolResult).filter(Boolean);
 return calls.map(c=>({...c,result:results.find(r=>r.toolUseId===c.toolUseId&&r.status==='success')?.content?.find(b=>b.json)?.json}));
};

// A same-turn ambiguous search cannot be followed by a guessed business query.
// An explicit numbered selection reuses only the displayed option and old filters.
export function preserveSearchSelection({name,input,history=[],currentCalls=[]}){
 for(const [search,spec] of Object.entries(specs)){
  if(!spec.consumers.includes(name))continue;
  const pending=currentCalls.filter(c=>c.name===search).at(-1)?.result;
  if(pending&&['AMBIGUOUS','NOT_FOUND','LISTED'].includes(pending.status))fail();
 }
 const turns=history.map((m,i)=>userText(m)!=null?i:-1).filter(i=>i>=0);
 const latest=turns.at(-1);const text=latest==null?'':userText(history[latest]);
 const match=String(text).trim().match(/^(?:(?:la\s+)?(?:opci[oó]n|n[uú]mero)\s*)?(\d+)\s*[.!]?$/i);
 if(!match||turns.length<2)return input;
 const previous=history.slice(turns.at(-2),latest),calls=callsFrom(previous);
 const pendingSearches=calls.filter(c=>specs[c.name]?.consumers.includes(name)&&['AMBIGUOUS','LISTED'].includes(c.result?.status));
 if(new Set(pendingSearches.map(c=>c.name)).size>1)fail();
 let result={...input};
 for(const [search,spec] of Object.entries(specs)){
  if(!spec.consumers.includes(name))continue;
  const call=calls.filter(c=>c.name===search).at(-1);
  if(call?.result?.status==='NOT_FOUND')fail();
  if(!call||!['AMBIGUOUS','LISTED'].includes(call.result?.status))continue;
  const selected=call.result.options?.find(o=>String(o.optionId??o.option)===String(Number(match[1])));
  if(!selected)fail();
  const required={search_customers:['codCliente'],search_categories:['codRubro'],search_members:['documentNumber'],search_invoice_customers:['customerId'],search_invoice_concepts:['conceptId'],search_soles_types:['typeId'],search_soles_usage_destinations:['destinationType','destinationCode'],search_soles_usage_movement_types:['movementType']}[search];
  if(required.some(key=>selected[key]==null))fail();
  const previousInput=calls.filter(c=>c.name===name).at(-1)?.input??{};
  result={...result,...previousInput};
  for(const [key,value] of Object.entries(spec.fields(selected,name))){
   // customerId and customerIds are alternate contracts, not extra tool fields.
   if(key==='customerId'&&['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance'].includes(name))continue;
   if(key==='customerIds'&&['get_contract_conditions','get_contract_cost_per_sqm','analyze_contract_cost_incidence'].includes(name))continue;
   if(value==null||Array.isArray(value)&&value.some(v=>v==null))fail();result[key]=value;
  }
  if(search==='search_invoice_customers')for(const key of ['dateFrom','dateTo'])if(call.input?.[key]!=null)result[key]=call.input[key];
 }
 return result;
}
