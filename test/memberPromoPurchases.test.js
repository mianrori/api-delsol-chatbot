import test from 'node:test';
import assert from 'node:assert/strict';
import {getMemberPromoPurchases} from '../src/services/members/memberPromoPurchase.service.js';
import {promoPageLimit} from '../src/repositories/members/memberPromoPurchase.repository.js';
import {buildMemberPromoResponse,preserveMemberPromoFollowup,resolveMemberPromoPage,resolveMemberPromoSelection} from '../src/services/ai/memberPromoPurchasesPresentation.service.js';
import {getMemberPromoPurchasesTool} from '../src/tools/members/getMemberPromoPurchases.tool.js';
import {runWithRequestSignal} from '../src/services/requestContext.service.js';
const args={documentNumber:"SYNTHETIC'DOCUMENT",promotionIds:['P'],campaignIds:[1],dateFrom:'01/01/2023',dateTo:'31/05/2023',mode:'summary',groupBy:[]};
const selection=(id=1)=>({COD_PROMOCION:'P',COD_CAMPANIA:id,NOMBRE_PROMOCION:'Synthetic promotion',NOMBRE_CAMPANIA:'Synthetic campaign'});
const aggregate=(extra={})=>({TOTAL_AMOUNT:100,PURCHASE_COUNT:2,SOURCE_ROWS:2,CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_SYMBOL:'PYG',...extra});
const detail=(extra={})=>({REGISTER_DATE:'02/01/2023',PURCHASE_DATE:'01/01/2023',COD_PROMOCION:'P',PROMOCION:'Synthetic promotion',COD_CAMPANIA:1,CAMPANIA:'Synthetic campaign',COD_CLIENTE:'C',LOCAL:'Synthetic local',COD_RUBRO:'R',RUBRO:'Synthetic category',CURRENCY_DESCRIPTION:'GUARANIES',CURRENCY_SYMBOL:'PYG',INVOICE_NUMBER:'SYNTHETIC',AMOUNT:100,ORIGEN_BANCARIO:null,...extra});
const db=(options={})=>({queries:[],async execute(sql,binds){this.queries.push({sql,binds});return {rows:sql.includes('VW_BOT_PROMOCIONES')?options.selection??[selection()]:sql.includes('SELECT COUNT(*) AS TOTAL_ROWS')?[{TOTAL_ROWS:options.count??3}]:sql.includes('RESULT_ROW_NUMBER')?options.detail??[detail()]:options.summary??[aggregate()]};}});
test('promo filters are bound, use purchase dates inclusively, preserve identities and never log the document',async()=>{
 const c=db(),logs=[],original=console.log;let r;try{console.log=(...values)=>logs.push(values);r=await getMemberPromoPurchases({...args,customerIds:['C'],categoryIds:['R'],origin:'nonBank',connection:{execute:()=>assert.fail('Untrusted connection')},username:'UNTRUSTED'},c);}finally{console.log=original;}
 assert.equal(r.status,'OK');assert.equal(r.documentNumber,args.documentNumber);assert.deepEqual(logs,[]);
 const {sql,binds}=c.queries.at(-1);assert.equal(binds.documentNumber,args.documentNumber);assert.equal(binds.promotionId0,'P');assert.equal(binds.campaignId0,1);assert.equal(binds.customerId0,'C');assert.equal(binds.categoryId0,'R');assert.equal(binds.bankOrigin,'N');
 assert.match(sql,/FECHA_COMPRA >= TO_DATE\(:dateFrom/);assert.match(sql,/FECHA_COMPRA < TO_DATE\(:dateTo, 'DD\/MM\/YYYY'\) \+ 1/);assert.ok(!sql.includes(args.documentNumber));
 assert.ok(!JSON.stringify(c.queries).includes('UNTRUSTED'));
});
test('promo pagination always recounts Oracle, clamps configured page size and orders all visible tie breakers',async()=>{
 const c=db();const r=await getMemberPromoPurchases({...args,mode:'detail',page:2,rows:1,knownTotalRows:0},c);
 assert.equal(r.totalRows,3);assert.equal(r.totalPages,3);assert.equal(r.nextPage,3);assert.equal(r.hasMore,true);
 assert.ok(c.queries.some(q=>q.sql.includes('COUNT(*) AS TOTAL_ROWS')));assert.equal(c.queries.at(-1).binds.startRow,2);assert.equal(c.queries.at(-1).binds.endRow,2);
 assert.match(c.queries.at(-1).sql,/ROW_NUMBER\(\) OVER/);assert.match(c.queries.at(-1).sql,/COD_PROMOCION, COD_CAMPANIA, COD_CLIENTE, COD_RUBRO/);
 const capped=await getMemberPromoPurchases({...args,mode:'detail',rows:1000},db());assert.equal(capped.rows,promoPageLimit());
 assert.ok(!Object.hasOwn(getMemberPromoPurchasesTool.toolSpec.inputSchema.json.properties,'knownTotalRows'));
});
test('the last and beyond-last pages retain the member and stop without inventing another page',async()=>{
 for(const page of [3,4]){const r=await getMemberPromoPurchases({...args,mode:'detail',page,rows:1},db({detail:page===4?[]:[detail()]}));assert.equal(r.documentNumber,args.documentNumber);assert.equal(r.totalRows,3);assert.equal(r.hasMore,false);assert.equal(r.nextPage,null);assert.equal(r.status,'OK');}
});
test('ambiguous selection, nonexistent selection and valid selection without purchases are distinct',async()=>{
 const ambiguous=db({selection:[selection(),selection(2)]});const a=await getMemberPromoPurchases({...args,campaignIds:[]},ambiguous);
 assert.equal(a.status,'AMBIGUOUS');assert.equal(a.totalOptions,2);assert.deepEqual(a.data,[]);assert.equal(ambiguous.queries.length,1);
 const missing=await getMemberPromoPurchases(args,db({selection:[]}));assert.equal(missing.status,'SELECTION_NOT_FOUND');
 const empty=await getMemberPromoPurchases(args,db({summary:[]}));assert.equal(empty.status,'NO_PURCHASES');assert.ok(empty.reason);
 const broad=await getMemberPromoPurchases({documentNumber:args.documentNumber},db());assert.equal(broad.status,'OK');
 const explicit=await getMemberPromoPurchases({...args,campaignIds:[1,2]},db({selection:[selection(),selection(2)]}));assert.equal(explicit.status,'OK');
});
test('summary currencies stay separate, genuine zero stays zero and unknown or missing amounts are not invented',async()=>{
 const r=await getMemberPromoPurchases(args,db({summary:[aggregate({TOTAL_AMOUNT:0}),aggregate({CURRENCY_DESCRIPTION:'DOLARES',CURRENCY_SYMBOL:'USD',TOTAL_AMOUNT:20}),aggregate({CURRENCY_DESCRIPTION:'DOLARES',CURRENCY_SYMBOL:'PYG'}),aggregate({TOTAL_AMOUNT:null})]}));
 assert.equal(r.status,'OK');assert.deepEqual(r.data.map(d=>d.totalAmount),[0,20,null,null]);assert.deepEqual(r.data.map(d=>d.currency.code),['PYG','USD',null,'PYG']);
 assert.ok(r.data[2].reason);assert.ok(r.data[3].reason);assert.ok(!Object.hasOwn(r,'totalAmount'));
 const text=buildMemberPromoResponse([{name:'get_member_promo_purchases',input:args,result:r}]);assert.match(text,/USD \| 20/);assert.match(text,/Sin calcular/);assert.match(text,/Moneda no identificada/);
});
test('detail retains null amounts and never labels an unknown bank code nonbank',async()=>{
 const r=await getMemberPromoPurchases({...args,mode:'detail'},db({detail:[detail({AMOUNT:null,ORIGEN_BANCARIO:'X'})]}));
 assert.equal(r.data[0].amount,null);assert.ok(r.data[0].reason);assert.equal(r.data[0].bankOrigin,null);assert.equal(r.data[0].origin,'Origen no identificado');
 const c=db({summary:[aggregate({BANK_ORIGIN:'N'})]});await getMemberPromoPurchases({...args,groupBy:['bankOrigin']},c);assert.match(c.queries.at(-1).sql,/NVL\(ORIGEN_BANCARIO, 'N'\) AS BANK_ORIGIN/);
});
test('invalid promo dates, IDs, page numbers and groups fail before any Oracle query',async()=>{
 for(const fields of [{documentNumber:''},{documentNumber:{}},{dateFrom:'31/02/2023'},{dateTo:'01/01/2022'},{dateFrom:undefined},{promotionIds:'P'},{campaignIds:['bad']},{campaignIds:[Infinity]},{customerIds:[{}]},{categoryIds:[' ']},{page:0},{page:1.5},{rows:NaN},{rows:0},{origin:'unknown'},{groupBy:['month','month']},{groupBy:['__proto__']},{metrics:[]}]){
  const c=db();await assert.rejects(getMemberPromoPurchases({...args,...fields},c));assert.equal(c.queries.length,0);
 }
});
const history=(input,result)=>[{role:'user',content:[{text:'Compras promocionales'}]},{role:'assistant',content:[{toolUse:{name:'get_member_promo_purchases',toolUseId:'p',input}}]},{role:'user',content:[{toolResult:{toolUseId:'p',status:'success',content:[{json:result}]}}]},{role:'assistant',content:[{text:'Compras'}]}];
test('promo page continuations freeze every filter and cannot change documents or cross topics',()=>{
 const input={...args,mode:'detail',origin:'bank',customerIds:['C'],categoryIds:['R'],rows:1,page:1},result={documentNumber:args.documentNumber,status:'OK',page:1,rows:1,totalRows:3,hasMore:true,nextPage:2};
 assert.deepEqual(resolveMemberPromoPage({message:'Siguiente página',history:history(input,result)}),{input:{...input,page:2}});
 assert.equal(resolveMemberPromoPage({message:'Siguiente página',history:history(input,{...result,documentNumber:'OTHER'})}),null);
 assert.equal(resolveMemberPromoPage({message:'Siguiente página',history:[...history(input,result),{role:'user',content:[{text:'Ventas'}]}]}),null);
 assert.ok(resolveMemberPromoPage({message:'Siguiente página',history:history(input,{...result,hasMore:false,nextPage:null})}).answer);
});
test('single-filter promo followups preserve member, promotion, campaign, origin and all remaining filters',()=>{
 const input={...args,origin:'bank',customerIds:['C'],categoryIds:['R'],rows:1,page:2},h=history(input,{documentNumber:args.documentNumber,status:'OK'});
 const follow=(message,value)=>preserveMemberPromoFollowup({message,history:h,input:value});
 assert.deepEqual(follow('Ahora cambia el período a 01/02/2023 al 28/02/2023; conserva los demás filtros',{dateFrom:'01/02/2023',dateTo:'28/02/2023'}),{...input,page:1,dateFrom:'01/02/2023',dateTo:'28/02/2023'});
 assert.deepEqual(follow('Ahora cambia el local a "Otro"; conserva los demás filtros',{customerIds:['NEW']}),{...input,page:1,customerIds:['NEW']});
 assert.deepEqual(follow('Ahora cambia el socio a "Otro"; conserva los demás filtros',{documentNumber:'OTHER'}),{...input,page:1,documentNumber:'OTHER'});
 assert.equal(follow('Ahora cambia el socio y elimina la campaña',{}),null);
});
test('explicit ambiguity selection uses the exact stored pair and preserves the member and period',()=>{
 const r={documentNumber:args.documentNumber,status:'AMBIGUOUS',options:[{optionId:'2',promotionId:'P2',campaignId:20}]};
 assert.deepEqual(resolveMemberPromoSelection({message:'Opción 2',history:history(args,r)}),{input:{...args,promotionIds:['P2'],campaignIds:[20],page:1}});
 assert.equal(resolveMemberPromoSelection({message:'Opción 1',history:history(args,r)}),null);
});
test('promo rendering restores only the matched member, distinguishes ambiguity and escapes commercial labels',()=>{
 const input={...args,groupBy:['campaign']};const result={status:'OK',documentNumber:args.documentNumber,mode:'summary',data:[{campaignName:'SYNTHETIC|CAMPAIGN\nX',currency:{code:'PYG'},purchaseCount:2,totalAmount:100}]};
 const text=buildMemberPromoResponse([{name:'get_member_promo_purchases',input,result}]);assert.match(text,/SYNTHETIC\\\|CAMPAIGN X/);assert.match(text,/100/);
 assert.equal(buildMemberPromoResponse([{name:'get_member_promo_purchases',input,result:{...result,documentNumber:'OTHER'}}]),null);
});
test('aborted promo operations do not open more queries',async()=>{
 const abort=new AbortController();abort.abort();const c=db();await assert.rejects(runWithRequestSignal(abort.signal,()=>getMemberPromoPurchases(args,c)),{code:'REQUEST_ABORTED'});assert.equal(c.queries.length,0);
});
