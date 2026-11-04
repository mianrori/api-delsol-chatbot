import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {clearConversation,getConversation} from '../src/state/conversation.store.js';
import {protectPiiDeep} from '../src/services/ai/pii.service.js';

// Actual candidate route/controller/chat/PII, with deterministic model output.
// Only business consumers are doubles: this check verifies their exact inputs,
// and never queries purchases/usages outside the narrowly affected lookup flow.
export async function checkSearchCorrectionsHttp({sessionId,deniedSessionId,lookup,uniqueSearch,ambiguousSearch,compositionProfile,validateSession,check}){
 const context=vm.createContext({console,process,structuredClone,Intl,Date,Map,Set,Number,String,Array,JSON,Math,RegExp,Object,Boolean,Error,AbortController});
 const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});
 const plans=[];let consumerCalls=0,lastLookup,expectedConsumer,requestSessionId=sessionId;
 const canonical=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]))):v;
 const command=(name,input,id)=>({toolUse:{name,toolUseId:id,input}});
 const protectModelBlock=b=>{
  if(!b.toolUse)return b;const {name}=b.toolUse,input={...b.toolUse.input};
  // A real model sees the protected user query. Seed commercial lookup names
  // the same way, before its synthetic toolUse is ever stored in history.
  if(typeof input.search==='string'&&['search_customers','search_categories'].includes(name)){
   const key=name==='search_customers'?'customer':'category';
   input.search=protectPiiDeep(requestSessionId,{[key]:{name:input.search}},null,[name])[key].name;
  }
  return {...b,toolUse:{...b.toolUse,input:protectPiiDeep(requestSessionId,input)}};
 };
 const model={BedrockRuntimeClient:class{async send(){const content=plans.shift()?.map(protectModelBlock);return {stopReason:content?'tool_use':'end_turn',output:{message:{role:'assistant',content:content??[{text:'Selecciona una opción válida para continuar.'}]}}};}},ConverseCommand:class{}};
 const executeTool=async({name,arguments:args,context:toolContext})=>{
  if(name==='search_categories'||name==='search_customers'){lastLookup=await lookup(args,toolContext,name);return lastLookup;}
  check(name===expectedConsumer?.name,'HTTP_EXPECTED_CONSUMER_ONLY');consumerCalls++;
  check(JSON.stringify(canonical(args))===JSON.stringify(canonical(expectedConsumer.input)),'HTTP_SELECTED_ID_AND_FILTERS_EXACT');
  return name==='get_soles_usage'?{mode:'summary',data:[],queryContext:args}:{data:[]};
 };
 const load=async(relative,stubs)=>{
  const url=new URL(relative,import.meta.url),main=new vm.SourceTextModule(await readFile(url,'utf8'),{context});
  await main.link(async spec=>synthetic(stubs[spec]??await import(spec.startsWith('.')?new URL(spec,url).href:spec)));await main.evaluate();return main.namespace;
 };
 const chat=await load('../src/services/ai/chat.service.js',{'@aws-sdk/client-bedrock-runtime':model,'./toolExecutor.service.js':{executeTool}});
 const controller=await load('../src/controllers/chat.controller.js',{'../services/ai/chat.service.js':{chatService:chat.chatService},...(validateSession?{'../services/sessions/oracleSession.service.js':{getValidOracleSession:validateSession}}:{})});
 const routes=await load('../src/routes/index.js',{'../controllers/chat.controller.js':controller});
 const app=express();app.use(express.json());app.use('/chatbot/api',routes.router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const post=async(message,session=sessionId)=>{requestSessionId=session;const snapshot=compositionProfile?structuredClone(getConversation(session)):null;const response=await fetch(`http://127.0.0.1:${server.address().port}/chatbot/api/bot/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:session,message}),signal:AbortSignal.timeout(90000)});const body=await response.json();check(response.status===200&&body.success===true,'HTTP_CANDIDATE_CHAT_SUCCESS');if(snapshot)check(JSON.stringify(canonical(getConversation(session).slice(0,snapshot.length)))===JSON.stringify(canonical(snapshot)),'HTTP_PRIOR_HISTORY_UNCHANGED');return body;};
 const sales={dateFrom:'01/01/2023',dateTo:'31/01/2023',customerIds:['SYNTHETIC-C'],categoryIds:['SYNTHETIC-ARBITRARY'],groupBy:['month'],metrics:['totalAmount']};
 const usage={documentNumber:'SYNTHETIC-M',dateFrom:'01/01/2023',dateTo:'31/05/2023',movementTypes:['SYNTHETIC-MOVEMENT'],destinations:[{destinationType:'LOCAL',destinationCode:'SYNTHETIC-D'}],categoryIds:['SYNTHETIC-ARBITRARY'],mode:'summary'};
 try{
  if(compositionProfile){
   const profiles={search_customers:compositionProfile.customers,search_categories:compositionProfile.categories};
   const field={search_customers:'customerIds',search_categories:'categoryIds'};
   const selectedId=(name,result)=>name==='search_customers'?result.options[1].codCliente:result.options[1].codRubro;
   for(const order of [['search_customers','search_categories'],['search_categories','search_customers']]){
    clearConversation(sessionId);plans.length=0;let before=consumerCalls;
    const second=profiles[order[1]],initial={...sales};
    expectedConsumer={name:'get_sales',input:{...initial,customerIds:[compositionProfile.customers[0].id],categoryIds:[compositionProfile.categories[0].id]}};
    plans.push([...order.map((name,i)=>command(name,{search:profiles[name][0].search},'combined-'+i)),command('get_sales',initial,'combined-query')]);
    await post(order[0]==='search_customers'?'Busca local y luego rubro para ventas de enero':'Busca rubro y luego local para ventas de enero');
    check(consumerCalls===before+1,'HTTP_COMBINED_IDENTITIES_EXECUTED_'+order[0]);
    plans.push([command('get_sales',{customerIds:['MODEL-C'],categoryIds:['MODEL-R']},'combined-conflicting')]);
    await post('continúa');
    expectedConsumer={name:'get_sales',input:{...initial,customerIds:[compositionProfile.customers[1].id],categoryIds:[compositionProfile.categories[0].id]}};
    plans.push([command('search_customers',{search:compositionProfile.customers[1].search},'changed-local'),command('get_sales',initial,'changed-local-query')]);
    await post('Cambia solo el local y conserva el rubro y los demás filtros');
    expectedConsumer={name:'get_sales',input:{...initial,customerIds:[compositionProfile.customers[1].id],categoryIds:[compositionProfile.categories[1].id]}};
    plans.push([command('search_categories',{search:compositionProfile.categories[1].search},'changed-category'),command('get_sales',initial,'changed-category-query')]);
    await post('Cambia solo el rubro y conserva el local y los demás filtros');
    expectedConsumer.input={...expectedConsumer.input,dateFrom:'01/02/2023',dateTo:'28/02/2023'};
    plans.push([command('get_sales',{dateFrom:'01/02/2023',dateTo:'28/02/2023',customerIds:['MODEL-C'],categoryIds:['MODEL-R']},'changed-period')]);
    await post('Cambia el período a febrero de 2023 y conserva local y rubro');
    plans.push([command('get_sales',{customerIds:['MODEL-C'],categoryIds:['MODEL-R']},'continue-new-period')]);
    await post('continúa');
    check(consumerCalls===before+6,'HTTP_EXPLICIT_CHANGES_KEEP_OTHER_IDENTITIES_'+order[0]);
    clearConversation(sessionId);plans.length=0;before=consumerCalls;
    const oneDomain={...sales};delete oneDomain[field[order[1]]];
    plans.push([command(order[0],{search:order[0]==='search_customers'?compositionProfile.ambiguousCustomerSearch:compositionProfile.ambiguousCategorySearch},'selected-origin'),command('get_sales',oneDomain,'selected-origin-guess')]);
    await post('Busca opciones para esta consulta');
    check(lastLookup.status==='AMBIGUOUS'&&lastLookup.options?.length>=2,'HTTP_CONFIRMED_OPTION_PROFILE');
    const confirmed=selectedId(order[0],lastLookup);
    expectedConsumer={name:'get_sales',input:{...oneDomain,[field[order[0]]]:[confirmed]}};
    plans.push([command('get_sales',oneDomain,'confirmed-query')]);await post('opción 2');
    expectedConsumer.input={...expectedConsumer.input,[field[order[1]]]:[second[1].id]};
    plans.push([command(order[1],{search:second[1].search},'other-domain'),command('get_sales',sales,'other-domain-query')]);
    await post(order[1]==='search_customers'?'Cambia el local y conserva la selección confirmada':'Cambia el rubro y conserva la selección confirmada');
    check(consumerCalls===before+2,'HTTP_CONFIRMED_SELECTION_SURVIVES_OTHER_RESOLVER_'+order[0]);
   }
   if(deniedSessionId){clearConversation(deniedSessionId);plans.length=0;plans.push([command('search_customers',{search:compositionProfile.customers[0].search},'denied-combined-c'),command('search_categories',{search:compositionProfile.categories[0].search},'denied-combined-r'),command('get_sales',sales,'denied-combined-query')]);const denied=await post('Consulta con local y rubro',deniedSessionId);check(denied.response==='El usuario no tiene permisos para consultar esta información.'&&Object.keys(denied.actions??{}).length===0&&Object.keys(denied).every(k=>['env','success','response','actions'].includes(k)),'HTTP_COMBINED_DENIED_NO_DATA_OR_ACTIONS');}
   return;
  }
  for(const [name,original] of [['get_sales',sales],['get_soles_usage',usage]]){
   clearConversation(sessionId);plans.length=0;const before=consumerCalls;
   plans.push([command('search_categories',{search:ambiguousSearch},name+'-lookup'),command(name,original,name+'-guess')]);
   await post('Busca un rubro y conserva los filtros de la consulta');
   check(lastLookup?.status==='AMBIGUOUS'&&lastLookup.options?.length>=2,'HTTP_LOOKUP_AMBIGUOUS_PROFILE');
   const selected=lastLookup.options[1].codRubro;
   check(consumerCalls===before,'HTTP_AMBIGUITY_BLOCKS_SAME_TURN_'+name);
   for(let i=0;i<2;i++){
    plans.push([command(name,{categoryIds:['SYNTHETIC-ARBITRARY'],dateFrom:'01/01/2000'},name+'-continue-'+i)]);
    await post('continúa');check(consumerCalls===before,'HTTP_CONTINUE_KEEPS_SELECTION_PENDING_'+name+'_'+i);
   }
   expectedConsumer={name,input:{...original,categoryIds:[selected]}};
   plans.push([command(name,{},name+'-selected')]);await post('opción 2');
   check(consumerCalls===before+1,'HTTP_EXPLICIT_SELECTION_EXECUTES_ONCE_'+name);
  }
  clearConversation(sessionId);plans.length=0;const before=consumerCalls;
  plans.push([command('search_categories',{search:ambiguousSearch},'new-lookup'),command('get_sales',sales,'new-guess')]);
  await post('Busca un rubro para esta consulta');check(consumerCalls===before,'HTTP_NEW_LOOKUP_PENDING');
  // Discover the exact option privately; the model still proposes an arbitrary ID.
  const resolved=await lookup({search:uniqueSearch},{sessionId});
  check(resolved.status==='RESOLVED','HTTP_UNIQUE_LOOKUP_PROFILE');
  expectedConsumer={name:'get_sales',input:{...sales,categoryIds:[resolved.category.codRubro]}};
  plans.push([command('search_categories',{search:uniqueSearch},'new-exact'),command('get_sales',{categoryIds:['SYNTHETIC-ARBITRARY']},'new-resolved-query')]);
  await post('Realiza una nueva búsqueda exacta');check(consumerCalls===before+1,'HTTP_UNIQUE_NEW_SEARCH_RELEASES_CORRECT_ID');
  if(deniedSessionId){
   clearConversation(deniedSessionId);plans.length=0;
   plans.push([command('search_categories',{search:ambiguousSearch},'denied-lookup')]);
   const denied=await post('Busca este rubro',deniedSessionId);
   check(denied.response==='El usuario no tiene permisos para consultar esta información.'&&Object.keys(denied.actions??{}).length===0&&Object.keys(denied).every(k=>['env','success','response','actions'].includes(k)),'HTTP_DENIED_NO_DATA_OR_ACTIONS');
  }
 }finally{clearConversation(sessionId);if(deniedSessionId)clearConversation(deniedSessionId);await new Promise(resolve=>server.close(resolve));}
}
