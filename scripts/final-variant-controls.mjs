// Independent read-only controls. No repository SQL builders imported.
const str=v=>v==null?null:String(v),near=(a,b)=>a!=null&&b!=null&&Math.abs(Number(a)-Number(b))<=Math.max(1e-6,Math.abs(Number(b))*1e-10);
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normSql=c=>`REGEXP_REPLACE(UPPER(TRANSLATE(${c},'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN')),'[^A-Z0-9]','')`;
const dateSql="FECHA_EMISION>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA_EMISION<TO_DATE(:f,'DD/MM/YYYY')+1 AND NVL(USER_CAN_CONSULT,'S')<>'N'";
const fields=['COD_CLIENTE','RUC','MATRICULA','NOM_CLIENTE','RAZON_SOCIAL'];
const identity=v=>str(v)?.trim();
const ids=r=>r.status==='RESOLVED'?[identity(r.customerId)]:r.options?.map(o=>identity(o.customerId))??[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const bag=a=>a.map(x=>JSON.stringify(x)).sort();
const fmt=d=>`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
const parse=s=>{const[d,m,y]=s.split('/').map(Number);return new Date(Date.UTC(y,m-1,d));};
const shift=(d,n)=>new Date(d.getTime()+n*86400000);
// Row-vector edit distance, independent from the resolver's matrix code.
const words=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const sim=(a,b)=>{a=words(a);b=words(b);if(!a&&!b)return 1;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return 1-row[b.length]/Math.max(a.length,b.length);};
const score=(a,b)=>{const x=words(a).split(' ').filter(w=>!['SOL','SOLES'].includes(w)).join(' '),y=words(b).split(' ').filter(w=>!['SOL','SOLES'].includes(w)).join(' ');return Math.max(sim(a,b),x&&y?sim(x,y):0);};
export async function finalVariantControls({query,tool,check,run,missing,mark,pageSize,minSimilarity=70,discover=()=>{}}){
 let invoicePool;
 const invoiceSamples=async()=>invoicePool??=await query(`SELECT COD_CLIENTE C,NOM_CLIENTE N,RAZON_SOCIAL B,RUC R,MATRICULA P,TO_CHAR(FECHA_EMISION,'DD/MM/YYYY') F FROM VW_BOT_FACTURAS WHERE NVL(USER_CAN_CONSULT,'S')<>'N' AND FECHA_EMISION IS NOT NULL AND COD_CLIENTE IS NOT NULL AND ROWNUM<=20`);
 for(const [name,field]of [['F1_RUC_POSITIVE','R'],['F1_PLATE_POSITIVE','P']])await run(name,async()=>{
  const samples=await invoiceSamples();discover(name,{rowLimit:20,inspectedRows:samples.length});const sample=samples.find(r=>norm(r[field]));if(!sample)missing(name+'_NOT_FOUND_IN_20_ROWS');const q=norm(sample[field]),b={q,f:sample.F};
  const rows=await query(`SELECT DISTINCT COD_CLIENTE C FROM VW_BOT_FACTURAS WHERE ${dateSql} AND (${fields.map(c=>normSql(c)+'=:q').join(' OR ')}) ORDER BY C`,b);
  mark('EXACT_IDENTITY_DISPATCH');const got=await tool('search_invoice_customers',{query:str(sample[field]),dateFrom:sample.F,dateTo:sample.F});
  const expected=[...new Set(rows.map(r=>identity(r.C)))];
  check(expected.length>0&&(expected.length===1?got.status==='RESOLVED'&&same(ids(got),expected):got.status==='AMBIGUOUS'&&ids(got).length===Math.min(10,expected.length)&&new Set(ids(got)).size===ids(got).length&&ids(got).every(id=>expected.includes(id))),'F1_EXACT_IDENTITIES_PERIOD_SECURITY_SQL');
 });
 await run('F1_FUZZY_POSITIVE',async()=>{
  for(const s of (await invoiceSamples()).slice(0,6)){
   const base=norm(s.N??s.B);if(base.length<7)continue;const i=Math.floor(base.length/2),q=base.slice(0,i)+(base[i]==='Z'?'Q':'Z')+base.slice(i+1),b={q,f:s.F};
   const strong=await query(`SELECT COD_CLIENTE FROM VW_BOT_FACTURAS WHERE ${dateSql} AND (${fields.map(c=>normSql(c)+'=:q').join(' OR ')} OR INSTR(${normSql('NOM_CLIENTE')},:q)>0 OR INSTR(${normSql('RAZON_SOCIAL')},:q)>0) FETCH FIRST 1 ROWS ONLY`,b);if(strong.length)continue;
   const threshold=Math.max(minSimilarity,q.length<=4?90:q.length<=6?85:80);
   const rows=await query(`SELECT DISTINCT COD_CLIENTE C,NOM_CLIENTE N,GREATEST(NVL(UTL_MATCH.JARO_WINKLER_SIMILARITY(${normSql('NOM_CLIENTE')},:q),0),NVL(UTL_MATCH.JARO_WINKLER_SIMILARITY(${normSql('RAZON_SOCIAL')},:q),0)) S FROM VW_BOT_FACTURAS WHERE ${dateSql} ORDER BY S DESC,N,C`,b);
   const expected=[...new Map(rows.filter(r=>Number(r.S)>=threshold).map(r=>[identity(r.C),r])).keys()];
   // Map keys preserve first occurrence, but duplicate values do not influence IDs.
   if(!expected.length)continue;mark('FUZZY_DISPATCH_AFTER_ZERO_STRONG_MATCHES');
   const got=await tool('search_invoice_customers',{query:q,dateFrom:s.F,dateTo:s.F});
   check((expected.length===1?got.status==='RESOLVED':got.status==='AMBIGUOUS')&&same(ids(got),expected.slice(0,10)),'F1_FUZZY_DISTINCT_IDENTITIES_ORDER_PERIOD_SQL');return;
  }discover('F1_FUZZY_POSITIVE',{candidateLimit:6,inspectedCandidates:Math.min(6,(await invoiceSamples()).length)});missing('F1_FUZZY_POSITIVE_NOT_FOUND_IN_6_CANDIDATES');
 });
 await run('F2_FUZZY_POSITIVE',async()=>{
  const types=await query('SELECT COD_TIPO_SOL T,DESCRIPCION D FROM VW_BOT_TIPOS_SOLES ORDER BY DESCRIPCION,COD_TIPO_SOL');
  for(const s of types.slice(0,8)){
   const base=words(s.D);if(base.length<4)continue;const q=base.slice(0,-1)+(base.at(-1)==='Z'?'Q':'Z');
   const direct=await query("SELECT COD_TIPO_SOL FROM VW_BOT_TIPOS_SOLES WHERE INSTR(UPPER(TRIM(TRANSLATE(DESCRIPCION,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN'))),:q)>0 OR TO_CHAR(COD_TIPO_SOL)=:q",{q});if(direct.length)continue;
   const expected=types.map(r=>({...r,s:score(q,r.D)})).filter(r=>r.s>=.65).sort((a,b)=>b.s-a.s);if(!expected.length)continue;
   const auto=expected[0].s>=.8&&(!expected[1]||expected[0].s-expected[1].s>=.1);
   mark('SOLES_FUZZY_DISPATCH_AFTER_ZERO_DIRECT_MATCHES');const got=await tool('search_soles_types',{query:q});
   check(auto?got.status==='RESOLVED'&&Number(got.typeId)===Number(expected[0].T):got.status==='AMBIGUOUS'&&same(got.options.map(r=>Number(r.typeId)),expected.map(r=>Number(r.T))),'F2_INDEPENDENT_EDIT_DISTANCE_AND_IDENTITY_SQL');return;
  }discover('F2_FUZZY_POSITIVE',{candidateLimit:8,inspectedCandidates:Math.min(8,types.length)});missing('F2_FUZZY_POSITIVE_NOT_FOUND_IN_8_TYPES');
 });
 await run('F3_CAMPAIGN_EXCEPTIONAL_PERIODS',async()=>{
  const pool=await query("SELECT COD_PROMOCION P,COD_CAMPANIA C,TO_CHAR(FECHA_DESDE,'DD/MM/YYYY') F,TO_CHAR(FECHA_HASTA,'DD/MM/YYYY') T FROM VW_BOT_PROMOCIONES WHERE FECHA_DESDE IS NOT NULL AND FECHA_HASTA>=FECHA_DESDE AND FECHA_HASTA-FECHA_DESDE<=60 ORDER BY FECHA_DESDE,COD_PROMOCION,COD_CAMPANIA FETCH FIRST 10 ROWS ONLY");
  discover('F3_CAMPAIGN_COHORT',{candidateLimit:10,inspectedCandidates:pool.length,maxDurationDays:61});
  const found=new Set();let checkedChangedQuery=false;
  for(const s of pool){
   if((await query('SELECT COD_PROMOCION FROM VW_BOT_PROMOCIONES WHERE COD_PROMOCION=:p AND COD_CAMPANIA=:c',{p:str(s.P),c:str(s.C)})).length!==1)continue;
   const from=parse(s.F),to=parse(s.T),n=Math.round((to-from)/86400000)+1;
   const bounds=[[shift(from,-n),shift(from,-1)],[from,to],[shift(to,1),shift(to,n)]],groups=[];
   for(const[f,t]of bounds)groups.push(await query("SELECT DES_MONEDA D,SIGLAS_MONEDA S,SUM(NVL(MONTO_TOTAL,0)) A,SUM(NVL(CANTIDAD_FACTURAS,0)) I,COUNT(*) N FROM VW_BOT_VENTAS_LOCALES WHERE FECHA>=TO_DATE(:f,'DD/MM/YYYY') AND FECHA<TO_DATE(:t,'DD/MM/YYYY')+1 GROUP BY DES_MONEDA,SIGLAS_MONEDA",{f:fmt(f),t:fmt(t)}));
   const flags=[groups.some(g=>!g.length)?'EMPTY':null,groups[0].length===1&&Number(groups[0][0].A)===0?'REFERENCE_ZERO':null,groups.some(g=>g.length>1)||new Set(groups.flat().map(r=>JSON.stringify([r.D,r.S]))).size>1?'MIXED':null,groups.some(g=>g.length>0&&g.every(r=>Number(r.A)===0))?'RECORDED_ZERO':null].filter(Boolean);
   // One normal profile is affected by the repository change; otherwise only new exceptional branches.
   if(checkedChangedQuery&&!flags.some(f=>!found.has(f)))continue;mark('CAMPAIGN_CHANGED_QUERY_DISPATCH');
   const got=await tool('analyze_campaign_sales_performance',{promotionId:str(s.P),campaignId:str(s.C),campaignDateFrom:s.F,campaignDateTo:s.T});
   for(const [i,key]of ['before','during','after'].entries()){
    const p=got.periods[key],g=groups[i];check(p.dateFrom===fmt(bounds[i][0])&&p.dateTo===fmt(bounds[i][1])&&p.sourceRows===g.reduce((a,r)=>a+Number(r.N),0)&&p.totalInvoices===g.reduce((a,r)=>a+Number(r.I),0)&&p.currencyGroups.length===g.length&&g.every(r=>p.currencyGroups.some(x=>x.currency.description===r.D&&x.currency.abbreviation===r.S&&near(x.totalAmount,r.A)&&near(x.totalInvoices,r.I)&&x.sourceRows===r.N)),'F3_PERIOD_CURRENCY_GROUPS_RECORD_COUNTS_SQL');
    check(g.length>1?p.totalAmount===null&&p.averageDailyAmount===null&&Boolean(p.calculationReason):near(p.totalAmount,g[0]?.A??0),'F3_NO_MIXED_TOTAL_OR_ZERO_INVENTION');
   }
   if(flags.includes('MIXED'))check(got.currency.consistent===false&&Object.values(got.comparisons).every(c=>c.totalAmount===null),'F3_MIXED_COMPARISONS_UNCALCULATED');
   if(flags.includes('REFERENCE_ZERO'))check(got.comparisons.duringVsBefore.totalAmount?.percentageChange==null,'F3_ZERO_REFERENCE_NO_PERCENTAGE');checkedChangedQuery=true;flags.forEach(f=>found.add(f));if(found.size===4)break;
  }
  for(const code of ['EMPTY','REFERENCE_ZERO','MIXED','RECORDED_ZERO'])if(!found.has(code))await run('F3_MISSING_'+code,async()=>missing('F3_'+code+'_NOT_FOUND_IN_10_CAMPAIGNS'));
  if(!checkedChangedQuery)missing('F3_UNIQUE_CAMPAIGN_NOT_FOUND_IN_10_CAMPAIGNS');
 });
 await run('F4_REAL_MULTICURRENCY_MEMBER',async()=>{
  const pool=await query("SELECT COD_SOCIO D,MONEDA M,SIMBOLO_MONEDA S FROM VW_BOT_COMPRAS_SOCIO WHERE FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' AND COD_SOCIO IS NOT NULL AND ROWNUM<=1000");
  discover('F4_MEMBER_COHORT',{rowLimit:1000,inspectedRows:pool.length,period:'2023-01_TO_2023-05',maxDetailRows:100});
  const docs=new Map();for(const r of pool){const d=str(r.D);if(!docs.has(d))docs.set(d,new Set());docs.get(d).add(JSON.stringify([r.M,r.S]));}
  const sample=[...docs].find(([,c])=>c.size>1);if(!sample)missing('F4_MULTICURRENCY_NOT_FOUND_IN_1000_ROWS_JAN_MAY_2023');const d=sample[0];
  const expected=await query("SELECT MONEDA M,SIMBOLO_MONEDA S,SUM(NVL(IMPORTE,0)) A,COUNT(*) N FROM VW_BOT_COMPRAS_SOCIO WHERE COD_SOCIO=:d AND FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01' GROUP BY MONEDA,SIMBOLO_MONEDA",{d});
  const total=expected.reduce((n,r)=>n+r.N,0);if(total>100)missing('F4_REAL_COHORT_EXCEEDS_100_DETAIL_ROW_BUDGET');
  const args={documentNumber:d,dateFrom:'01/01/2023',dateTo:'31/05/2023'};mark('MULTICURRENCY_SUMMARY_DETAIL_DISPATCH');const summary=await tool('get_member_purchases',{...args,mode:'summary',metrics:['totalAmount','purchaseCount']});
  check(summary.data.length===expected.length&&expected.every(r=>summary.data.some(g=>g.currency.description===r.M&&g.currency.symbol===r.S&&near(g.totalAmount,r.A)&&g.purchaseCount===r.N)),'F4_RAW_CURRENCY_GROUPS_AMOUNTS_COUNTS_SQL');
  const rows=await query("SELECT TO_CHAR(FECHA_COMPRA,'DD/MM/YYYY') F,TO_CHAR(NRO_FACTURA) I,MONEDA M,SIMBOLO_MONEDA S,IMPORTE A FROM VW_BOT_COMPRAS_SOCIO WHERE COD_SOCIO=:d AND FECHA_COMPRA>=DATE '2023-01-01' AND FECHA_COMPRA<DATE '2023-06-01'",{d});let all=[];
  for(let page=1;page<=Math.ceil(total/pageSize);page++){const got=await tool('get_member_purchases',{...args,mode:'detail',page,rows:pageSize});check(got.documentNumber===d&&got.totalRows===total&&got.hasMore===(page*pageSize<total)&&got.nextPage===(got.hasMore?page+1:null),'F4_REAL_PAGINATION_METADATA');all.push(...got.data);}
  check(same(bag(all.map(r=>[r.purchaseDate,r.invoiceNumber,r.currency.description,r.currency.symbol,r.amount])),bag(rows.map(r=>[r.F,r.I,r.M,r.S,Number(r.A??0)]))),'F4_FULL_DETAIL_MULTISET_SQL');
 });
 await run('M7_REAL_SHARED_ACTIVE_PLATE',async()=>{
  const pool=await query("SELECT MATRICULA P,COD_SOCIO D FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND MATRICULA IS NOT NULL AND COD_SOCIO IS NOT NULL AND NOT REGEXP_LIKE(TRIM(MATRICULA),'[[:space:]]') AND ROWNUM<=1000");discover('M7_PLATE_COHORT',{rowLimit:1000,inspectedRows:pool.length});const plates=new Map();for(const r of pool){const p=str(r.P).trim().toUpperCase();if(!plates.has(p))plates.set(p,new Set());plates.get(p).add(str(r.D));}const p=[...plates].find(([,d])=>d.size>1)?.[0];if(!p)missing('M7_SHARED_ACTIVE_PLATE_NOT_FOUND_IN_1000_ROWS');
  const rows=await query("SELECT COD_SOCIO D,MATRICULA P,MARCA B,MODELO M,COLOR C FROM VW_BOT_VEHICULOS WHERE ACTIVO='S' AND UPPER(TRIM(MATRICULA))=:p",{p});mark('SHARED_PLATE_DISPATCH');const got=await tool('get_member_vehicles',{plate:p});
  check(got.status==='AMBIGUOUS'&&!got.owner&&same(bag(got.registrations.map(r=>[r.owner.documentNumber,r.vehicle.plate,r.vehicle.brand,r.vehicle.model,r.vehicle.color])),bag(rows.map(r=>[str(r.D),r.P,r.B,r.M,r.C]))),'M7_ALL_OWNERS_NO_ARBITRARY_SELECTION_SQL');
 });
}
