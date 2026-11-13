import {getSearchFilterActions,isExplicitSearchRequest,getSalesLocalRemovalChange,getAutonomousCategorySalesIntent,getExplicitSalesRange} from './searchFilterIntent.service.js';
import {getSearchResolutions,setSearchResolutions,getSearchSelectionTurn,setSearchSelectionTurn} from '../../state/conversation.store.js';
import {getSalesMetricIntent,defaultSalesMetrics} from './salesMetrics.service.js';
import {getMonthlySalesComparisonIntent} from './salesComparisonIntent.service.js';
import {getInvoicePlateRequest} from './invoicePlateRequest.service.js';
import {isPendingInvoiceRequest,getInvoiceDebtStatusIntent,pendingInvoiceInput} from './invoicePendingRequest.service.js';
const specs={
 search_customers:{consumers:['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','compare_member_purchases_vs_sales','analyze_campaign_sales_performance','get_contract_conditions','get_contract_cost_per_sqm','analyze_contract_cost_incidence'],fields:o=>({customerIds:[o.codCliente],customerId:o.codCliente})},
 search_categories:{consumers:['get_sales','get_sales_per_sqm','analyze_members','get_member_purchases','get_member_promo_purchases','get_soles_usage','compare_member_purchases_vs_sales','analyze_campaign_sales_performance'],fields:o=>({categoryIds:[o.codRubro]})},
 search_members:{consumers:['get_member','get_member_purchases','get_member_promo_purchases','get_member_soles','get_soles_usage','get_member_vehicles'],fields:o=>({documentNumber:o.documentNumber})},
 search_invoice_customers:{consumers:['get_invoices'],fields:o=>({customerIds:[String(o.customerId)]})},
 search_invoice_balance_customers:{consumers:['get_invoice_balances'],fields:o=>({customerIds:[String(o.customerId)]})},
 search_invoice_concepts:{consumers:['get_invoices'],fields:o=>({conceptIds:[String(o.conceptId)]})},
 search_soles_types:{consumers:['get_member_soles','get_soles_usage'],fields:(o,name)=>({[name==='get_member_soles'?'typeIds':'solesTypeIds']:[o.typeId]})},
 search_soles_usage_destinations:{consumers:['get_soles_usage'],fields:o=>({destinations:[{destinationType:o.destinationType,destinationCode:o.destinationCode}]})},
 search_soles_usage_movement_types:{consumers:['get_soles_usage'],fields:o=>({movementTypes:[o.movementType]})},
};
const fail=()=>{throw Object.assign(Error('Selecciona una opción válida del buscador antes de consultar.'),{code:'SEARCH_SELECTION_REQUIRED'});};
const userText=message=>message?.role==='user'?message.content?.find(b=>typeof b.text==='string')?.text:null;
const selection=text=>String(text).trim().match(/^(?:(?:la\s+)?(?:opci[oó]n|n[uú]mero)\s*)?(\d+)\s*[.!]?$/i)?.[1];
const required={search_customers:['codCliente'],search_categories:['codRubro'],search_members:['documentNumber'],search_invoice_customers:['customerId'],search_invoice_balance_customers:['customerId'],search_invoice_concepts:['conceptId'],search_soles_types:['typeId'],search_soles_usage_destinations:['destinationType','destinationCode'],search_soles_usage_movement_types:['movementType']};
const optionFrom=result=>result.customer??result.category??result.member??result;
const persistentSearches=['search_customers','search_categories'];
const domainFields=search=>search==='search_customers'?['customerId','customerIds']:['categoryIds'];
const validId=value=>typeof value==='string'?value.trim().length>0:typeof value==='number'&&Number.isFinite(value);
const validOption=(name,option)=>required[name].every(key=>validId(option?.[key]));
const optionNumber=o=>String(o?.optionId??o?.option??'');
const validOptions=(name,options)=>Array.isArray(options)&&options.every(o=>validOption(name,o)&&/^[1-9]\d*$/.test(optionNumber(o)))&&new Set(options.map(optionNumber)).size===options.length;
const lookupShape=(name,result)=>{
 const resolved=result?.status==='RESOLVED'&&result.hasMore!==true&&validOption(name,optionFrom(result??{}));
 const listed=['AMBIGUOUS','LISTED'].includes(result?.status)&&validOptions(name,result.options)&&result.options.length>=1&&(result.status!=='AMBIGUOUS'||result.options.length>=2||result.hasMore===true&&Number(result.totalMatches)>result.options.length);
 const missing=result?.status==='NOT_FOUND'&&(result.options==null||Array.isArray(result.options)&&result.options.length===0);
 return {resolved,valid:result?.success!==false&&!result?.error&&(resolved||listed||missing)};
};

// Applied once to the protected user message, never by replaying bounded history.
export function beginSearchSelectionTurn(sessionId,message){
 const state=getSearchResolutions(sessionId),turn={selectedThisTurn:[],validLookups:[],capturedConsumers:[],requestedDomains:[],salesLocalRemovalChange:getSalesLocalRemovalChange(message)};let changed=false;
 turn.pendingInvoice=isPendingInvoiceRequest(message);
 turn.invoiceDebtStatus=getInvoiceDebtStatusIntent(message);
 if(turn.invoiceDebtStatus){delete state.invoiceNamedRequest;changed=true;}
 const balanceText=String(message??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 turn.invoiceBalanceAll=/\b(?:saldo|saldos|deuda|deudas|debe|deben|adeuda|adeudan)\b/.test(balanceText)&&(/\b(?:todos|todas) (?:los |las )?(?:clientes|locales)\b/.test(balanceText)||/\bsaldos? generales?(?: por (?:moneda|sector))?\s*[?.!]?\s*$/.test(balanceText));
 if(turn.invoiceBalanceAll){delete state.domains.search_invoice_balance_customers;state.contexts.get_invoice_balances={customerIds:[]};if(state.choiceFocus==='search_invoice_balance_customers')delete state.choiceFocus;changed=true;}
 turn.invoicePlateRequest=getInvoicePlateRequest(message);
 if(turn.invoicePlateRequest?.autonomous){
  state.contexts.get_invoices=structuredClone(turn.invoicePlateRequest.input);
  delete state.invoiceNamedRequest;
  delete state.domains.search_invoice_customers;delete state.domains.search_invoice_concepts;
  if(['search_invoice_customers','search_invoice_concepts'].includes(state.choiceFocus))delete state.choiceFocus;
  changed=true;
 }
 const comparison=getMonthlySalesComparisonIntent(message,state);
 if(comparison?.autonomous){
  delete state.salesMetrics;
  state.domains.search_customers={kind:'cleared'};
  state.domains.search_categories=comparison.search?{kind:'pending',result:{options:[]}}:{kind:'cleared'};
  state.contexts.get_sales=structuredClone(comparison.inputs[0]);
  delete state.choiceFocus;
  if(comparison.search)turn.requestedDomains.push('search_categories');
  state.salesComparison={...structuredClone(comparison),pending:Boolean(comparison.search)};changed=true;
 }else if(state.salesComparison?.pending&&!/^(?:(?:la )?(?:opci[oó]n|n[uú]mero)\s*)?\d+[.!]?$/.test(String(message).trim())){
  delete state.salesComparison;changed=true;
 }
 turn.salesComparison=comparison;
 turn.autonomousCategorySales=getAutonomousCategorySalesIntent(message);
 if(turn.autonomousCategorySales){
  delete state.salesMetrics;
  state.domains.search_customers={kind:'cleared'};
  state.domains.search_categories={kind:'pending',result:{options:[]}};
  const {search,...scope}=turn.autonomousCategorySales;
  state.contexts.get_sales=scope;
  delete state.choiceFocus;
  turn.requestedDomains.push('search_categories');changed=true;
 }
 const metricIntent=getSalesMetricIntent(message);
 if(metricIntent){state.salesMetrics=metricIntent;changed=true;}
 turn.salesMetrics=state.salesMetrics??[...defaultSalesMetrics];
 turn.salesExplicitRange=getExplicitSalesRange(message);
 if(turn.salesExplicitRange){state.contexts.get_sales={...state.contexts.get_sales,...turn.salesExplicitRange};changed=true;}
 const normalized=String(message??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const newLookup=/^(?:(?:realiza|haz) (?:una )?)?nueva busqueda\b|^busca (?:de nuevo|opciones)\b/.test(normalized);
 turn.allowLookup=Object.fromEntries(persistentSearches.map(name=>[name,isExplicitSearchRequest(message,name)||newLookup]));
 for(const {search,action} of getSearchFilterActions(message)){
  if(action==='remove'){state.domains[search]={kind:'cleared'};changed=true;}
  else turn.requestedDomains.push(search);
 }
 if(state.domains[state.choiceFocus]?.kind==='cleared'&&changed)delete state.choiceFocus;
 const choice=selection(message),pending=Object.entries(state.domains).filter(([,s])=>s.kind==='pending');
 const focused=Object.entries(state.domains).find(([name,s])=>name===state.choiceFocus&&['pending','selected'].includes(s.kind));
 // The focused catalog owns a reselection. Two unresolved catalogs still need
 // clarification; a choice must never resolve both or alter an unrelated one.
 const selectable=pending.length>1?pending:focused?[focused]:pending.length?pending:Object.entries(state.domains).filter(([,s])=>s.kind==='selected');
 if(choice&&selectable.length===1&&(!state.choiceFocus||state.choiceFocus===selectable[0][0])){
  const [name,s]=selectable[0],options=s.result?.options;
  const selected=validOptions(name,options)?options.find(o=>optionNumber(o)===String(Number(choice))):null;
  if(selected){state.domains[name]={...s,kind:'selected',selected};turn.selectedThisTurn.push(name);changed=true;}
 }
 turn.selectionRejected=Boolean(choice)&&turn.selectedThisTurn.length===0&&(!state.choiceFocus||persistentSearches.includes(state.choiceFocus));
 if(choice&&turn.selectedThisTurn.includes('search_categories')&&state.salesComparison?.pending)turn.salesComparison={...structuredClone(state.salesComparison),autonomous:false};
 if(changed)setSearchResolutions(sessionId,state);
 setSearchSelectionTurn(sessionId,turn);
}

// Store only protected resolver IDs/options and arguments, never business rows.
export function recordSearchToolResult(sessionId,name,input,result){
 const state=getSearchResolutions(sessionId);
 if(['search_invoice_balance_customers','search_invoice_customers'].includes(name)){
  const {resolved,valid}=lookupShape(name,result);if(!valid)return false;
  const minimal=o=>Object.fromEntries(['option','customerId','customerName','businessName','taxId'].filter(k=>o?.[k]!=null).map(k=>[k,o[k]]));
  state.domains[name]=resolved?{kind:'resolved',selected:minimal(result),call:{input:structuredClone(input)},result:{options:[]}}:{kind:'pending',call:{input:structuredClone(input)},result:{options:(result.options??[]).map(minimal)}};
  state.invoiceLastTool=name==='search_invoice_customers'?'get_invoices':'get_invoice_balances';
  state.choiceFocus=name;setSearchResolutions(sessionId,state);return true;
 }
 if(persistentSearches.includes(name)){
  const selected=optionFrom(result??{}),minimal=o=>Object.fromEntries(['optionId','option',...required[name]].filter(k=>o?.[k]!=null).map(k=>[k,o[k]]));
  const {resolved,valid}=lookupShape(name,result);if(!valid)return false;
  state.domains[name]=resolved
   ?{kind:'selected',selected:minimal(selected),result:{options:[]}}
   :{kind:'pending',result:{options:(result?.options??[]).map(minimal)}};
  state.choiceFocus=name;
  const turn=getSearchSelectionTurn(sessionId);turn.validLookups=[...new Set([...(turn.validLookups??[]),name])];setSearchSelectionTurn(sessionId,turn);
 }else if(persistentSearches.some(s=>specs[s].consumers.includes(name))&&result?.success!==false&&!result?.error){
  state.contexts[name]=structuredClone(input);
 }else if(Object.hasOwn(specs,name)&&lookupShape(name,result).valid||name==='search_promotions'&&result?.success!==false&&!result?.error&&['RESOLVED','AMBIGUOUS','LISTED','NOT_FOUND'].includes(result?.status)){
  state.choiceFocus=name;
 }else return false;
 setSearchResolutions(sessionId,state);return true;
}

// A query proposal may supply context for a lookup already validated this turn.
// Rejected lookups have no such evidence and cannot write even query metadata.
export function captureSearchQueryContext(sessionId,name,input){
 const turn=getSearchSelectionTurn(sessionId);
 if(!turn.validLookups?.some(search=>specs[search].consumers.includes(name))||turn.capturedConsumers?.includes(name))return;
 const state=getSearchResolutions(sessionId);
 const autonomous=name==='get_sales'?turn.autonomousCategorySales:null;
 const captured={...state.contexts[name],...input};
 if(name==='get_sales'&&turn.salesExplicitRange)Object.assign(captured,turn.salesExplicitRange);
 if(autonomous){
  const {search,...scope}=autonomous;Object.assign(captured,scope);
  delete captured.customerId;delete captured.customerIds;delete captured.dayType;
 }
 state.contexts[name]=structuredClone(captured);setSearchResolutions(sessionId,state);
 turn.capturedConsumers=[...(turn.capturedConsumers??[]),name];setSearchSelectionTurn(sessionId,turn);
}

// Balances commit only after a usable result; billing retains its existing policy.
// Persist only protected scope metadata, never invoice rows.
export function recordInvoiceQueryContext(sessionId,name,input){
 if(name==='get_invoice_balances'){const state=getSearchResolutions(sessionId);state.invoiceLastTool=name;state.contexts[name]=structuredClone(input);setSearchResolutions(sessionId,state);return;}
 if(name!=='get_invoices')return;
 const state=getSearchResolutions(sessionId);state.invoiceLastTool=name;state.contexts.get_invoices=structuredClone(input);setSearchResolutions(sessionId,state);
}

// Reconstruct resolution state across turns and tool iterations. A failed query
// or a non-selection message must not erase an unresolved lookup.
export function preserveSearchSelection({name,input,history=[],currentCalls=[],removedFilters=[],resolutionState,selectionTurn={}}){
 const states=new Map(),calls=new Map(),queries=[],turnTexts=new Map();let turn=-1,currentText='';
 const persistent=search=>Boolean(resolutionState)&&persistentSearches.includes(search);
 if(resolutionState)for(const [search,state] of Object.entries(resolutionState.domains))states.set(search,{...state,originTurn:-1,selectedTurn:selectionTurn.selectedThisTurn?.includes(search)?Infinity:-1});
 for(const search of removedFilters)if(['search_customers','search_categories'].includes(search))states.set(search,{kind:'cleared',originTurn:-1,clearedTurn:-1});
 const update=(call,result)=>{
  if(!specs[call.name]||!result)return;
  if(persistent(call.name))return;
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
   if(getInvoiceDebtStatusIntent(text)){states.delete('search_invoice_customers');states.delete('search_invoice_concepts');}
   if(getInvoicePlateRequest(text)?.autonomous){
    states.delete('search_invoice_customers');states.delete('search_invoice_concepts');
    for(let i=queries.length-1;i>=0;i--)if(queries[i].name==='get_invoices')queries.splice(i,1);
   }
   for(const {search,action} of getSearchFilterActions(text)){
    if(persistent(search))continue;
    const prior=states.get(search),originTurn=prior?.originTurn??turn;
    if(action==='remove')states.set(search,{kind:'cleared',originTurn,clearedTurn:turn});
    else if(prior?.kind==='cleared')states.set(search,{kind:'pending',originTurn,call:{input:{}},result:{status:'AMBIGUOUS',options:[]}});
   }
   const choice=selection(text),pending=[...states].filter(([search,s])=>!persistent(search)&&s.kind==='pending');
   const selectable=pending.length?pending:[...states].filter(([search,s])=>!persistent(search)&&s.kind==='selected');
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
 if(persistent(name)){
  if(typeof input?.search!=='string'||Object.keys(input).some(key=>key!=='search'))throw Object.assign(Error('Los argumentos del buscador no son válidos.'),{code:'SEARCH_ARGUMENTS_INVALID'});
  if(name==='search_categories'&&selectionTurn.autonomousCategorySales&&!isExplicitSearchRequest(currentText,name,input))fail();
  const state=states.get(name);
  if(state?.kind==='cleared'&&!selectionTurn.requestedDomains?.includes(name)&&!isExplicitSearchRequest(currentText,name,input))throw Object.assign(Error('El filtro fue retirado. Solicita volver a añadirlo antes de buscarlo.'),{code:'SEARCH_FILTER_REMOVED'});
  if(state&&!selectionTurn.allowLookup?.[name]&&!isExplicitSearchRequest(currentText,name,input))fail();
 }
 if(!persistent(name)&&states.get(name)?.kind==='cleared'&&!isExplicitSearchRequest(currentText,name,input))throw Object.assign(Error('El filtro fue retirado. Solicita volver a añadirlo antes de buscarlo.'),{code:'SEARCH_FILTER_REMOVED'});
 if(name==='get_invoice_balances'&&selectionTurn.invoiceBalanceAll)states.delete('search_invoice_balance_customers');
 const invoiceDebtStatus=selectionTurn.invoiceDebtStatus??(selectionTurn.pendingInvoice?'pending':null);
 if(name==='get_invoice_balances'&&invoiceDebtStatus&&resolutionState?.invoiceLastTool==='get_invoices'&&!currentCalls.some(c=>c.name==='search_invoice_balance_customers'))states.delete('search_invoice_balance_customers');
 const resolutions=[],removed=[];
 for(const [search,spec] of Object.entries(specs)){
  if(!spec.consumers.includes(name))continue;
  if(persistent(search)&&(selectionTurn.selectionRejected||selectionTurn.requestedDomains?.includes(search)&&!selectionTurn.validLookups?.includes(search)))fail();
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
 // Persisted sales context is a complete scope, including absent keys. Merging
 // older history back into it would resurrect filters removed by a new query.
 const original=['get_sales','get_invoices','get_invoice_balances'].includes(name)&&resolutionState?.contexts[name]
  ?structuredClone(resolutionState.contexts[name])
  :{...(successful?.input??{}),...((successful&&successful.turn>=(origin?.turn??-1)?successful:origin)?.input??{}),...(resolutionState?.contexts[name]??{})};
 const selectingNow=Boolean(selection(currentText))&&resolutions.some(r=>r.state.selectedTurn===turn||persistent(r.search)&&selectionTurn.selectedThisTurn?.includes(r.search));
 const removalChange=name==='get_sales'?(selectionTurn.salesLocalRemovalChange??getSalesLocalRemovalChange(currentText)):null;
 if(removalChange&&!(original.dateFrom&&original.dateTo)&&!(removalChange.dateFrom&&removalChange.dateTo))throw Object.assign(Error('No hay una consulta anterior con período confirmado. Indica el período para consultar todos los locales.'),{code:'SEARCH_QUERY_CONTEXT_REQUIRED'});
 // A pure removal changes one domain, not arbitrary proposed dates, metrics,
 // grouping or previously absent keys. The successful context survives trimming.
 const autonomous=name==='get_sales'?selectionTurn.autonomousCategorySales:null;
 let result;
 if(name==='get_invoice_balances'&&selectionTurn.invoiceBalanceGlobalInput){
  result=structuredClone(selectionTurn.invoiceBalanceGlobalInput);
 }else if(name==='get_invoice_balances'&&invoiceDebtStatus){
  const freshCustomer=currentCalls.some(c=>c.name==='search_invoice_balance_customers'&&c.result?.status==='RESOLVED');
  result={...(freshCustomer?{mode:'detail',rows:20}:pendingInvoiceInput(resolutionState??{domains:{},contexts:{}},invoiceDebtStatus)),...input,debtStatus:invoiceDebtStatus,page:1};
 }else if(name==='get_invoice_balances'&&selectionTurn.invoiceBalanceAll){
  result={...input,customerIds:[]};
 }else if(name==='get_invoices'&&selectionTurn.invoicePlateRequest?.autonomous){
  result={...selectionTurn.invoicePlateRequest.input};
 }else if(name==='get_invoices'&&selectionTurn.invoiceNamedRequest){
  result={...input};
 }else if(name==='get_sales'&&selectionTurn.salesComparison){
  result={...input};
 }else if(autonomous){
  result={...input,dateFrom:autonomous.dateFrom,dateTo:autonomous.dateTo,...(autonomous.groupBy?{groupBy:autonomous.groupBy}:{})};
  delete result.dayType;
 }else if(removalChange)result={...structuredClone(original),...removalChange};
 else if(selectingNow)result=name==='get_sales'&&resolutionState?.contexts[name]?structuredClone(original):{...input,...original};
 else result={...original,...input};
 if(name==='get_sales'&&selectionTurn.salesExplicitRange)Object.assign(result,selectionTurn.salesExplicitRange);
 const identifiers={};
 // A confirmed lookup may have left the bounded history, while its executed
 // arguments remain. Those IDs still outrank an unsolicited model proposal.
 // Explicit domain changes keep their existing resolution/selection path.
 const actions=getSearchFilterActions(currentText);
 for(const search of ['search_customers','search_categories']){
  if(states.has(search)||!specs[search].consumers.includes(name)||actions.some(a=>a.search===search&&a.action==='add'))continue;
  for(const key of search==='search_customers'?['customerId','customerIds']:['categoryIds']){
   if(successful&&Object.hasOwn(successful.input??{},key))identifiers[key]=successful.input[key];
  }
 }
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
 if(resolutionState)for(const search of persistentSearches){
  if(specs[search].consumers.includes(name)&&!states.has(search)&&domainFields(search).some(k=>finalInput[k]!=null&&(!Array.isArray(finalInput[k])||finalInput[k].length)))fail();
 }
 for(const search of removed)for(const key of search==='search_customers'?['customerId','customerIds']:['categoryIds'])delete finalInput[key];
 return structuredClone(finalInput);
}

// Called only on the arguments returned by the guard. A still-retired domain
// has no IDs there, so model proposals cannot clear its persistent marker.
export const reenabledSearchFilters=(name,input,removedFilters=[])=>[...removedFilters].filter(search=>{
 if(!specs[search]?.consumers.includes(name))return false;
 return search==='search_customers'?Boolean(input.customerId)||(Array.isArray(input.customerIds)&&input.customerIds.length>0):Array.isArray(input.categoryIds)&&input.categoryIds.length>0;
});
