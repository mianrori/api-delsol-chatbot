// Metadata only. Never execute a referenced function or read its business tables.
import {extractViewProjection, publicProjectionShape} from './projection.mjs';

const builtins=new Set('TRIM LTRIM RTRIM UPPER LOWER REPLACE TRANSLATE REGEXP_REPLACE REGEXP_SUBSTR REGEXP_LIKE NVL NVL2 COALESCE DECODE CAST TO_CHAR TO_NUMBER TO_DATE SUBSTR INSTR LENGTH ROUND TRUNC COUNT SUM MIN MAX ABS CONCAT SYS_CONTEXT NULLIF'.split(' '));
const strip=s=>String(s??'').replace(/'(?:''|[^'])*'|--[^\r\n]*|\/\*[\s\S]*?\*\//g,m=>m.startsWith("'")?"'<literal>'":' ');
export function metadataShape(value){
 const s=strip(value).replace(/[^\x09\x0a\x0d\x20-\x7e]/g,'?');
 // Preserve only a fixed set of technical builtin names, never application names.
 const shaped=publicProjectionShape(s,[...builtins,...'FUNCTION PROCEDURE PACKAGE BODY BEGIN RETURN RETURNS EXCEPTION IF ELSIF LOOP FOR WHILE INTO HAVING GROUP BY ORDER UNION ALL WITH INTERSECT MINUS USING JOIN FULL OUTER LEFT RIGHT INNER ON LIKE BETWEEN NOT IN DISTINCT WHEN OTHERS RAISE NO_DATA_FOUND VARCHAR2 CHAR DATE IS OPEN FETCH CLOSE CURSOR END'.split(' ')]);
 return {shape:shaped?.slice(0,14000)??null,truncated:(shaped?.length??0)>14000};
}
export function metadataSignals(value){
 const s=strip(value),calls=[...new Set((s.match(/\b[A-Z_][A-Z0-9_$#]*(?=\s*\()/gi)??[]).map(x=>x.toUpperCase()))].filter(x=>!['IN','EXISTS','SELECT','VALUES','IF','ELSIF','RETURN','AND','OR','NOT','AS','IS'].includes(x));
 return {builtinCalls:calls.filter(x=>builtins.has(x)),unclassifiedCallCount:calls.filter(x=>!builtins.has(x)).length,referencesUser:/\b(?:USER|SESSION_USER|CURRENT_USER|SYS_CONTEXT)\b/i.test(s),referencesPermission:/\bUSER_CAN_CONSULT\b/i.test(s),containsNull:/\bNULL\b/i.test(s),returnsNull:/\bRETURN\s+NULL\b/i.test(s),containsPredicate:/\b(?:WHERE|JOIN|HAVING|CONNECT\s+BY)\b/i.test(s),containsDynamicSql:/\b(?:EXECUTE\s+IMMEDIATE|DBMS_SQL)\b/i.test(s),wrapped:/\bwrapped\b/i.test(s)};
}

export async function auditInvoiceDependencies(query,opaque){
 const result={status:'metadata_inspected',metadataOnly:true,noReferencedFunctionsExecuted:true,noBaseTableDataRead:true,objects:[],blockers:[],limits:{maxObjects:30,maxDepth:5,maxSourceLines:6000},caseResolved:false};
 const safe=async(sql,binds,scope)=>{try{return await query(sql,binds);}catch(e){result.blockers.push({scope,code:/^(?:ORA-\d{5}|NJS-\d{3}|DPI-\d{4})$/.test(e?.code??'')?e.code:'METADATA_QUERY_FAILED'});return null;}};
 const roots=await safe('SELECT OWNER,VIEW_NAME,TEXT FROM ALL_VIEWS WHERE VIEW_NAME=:v',{v:'VW_BOT_FACTURAS'},'root_definition');
 if(roots?.length!==1){result.blockers.push({scope:'root_definition',code:'UNIQUE_VISIBLE_DEFINITION_REQUIRED'});return result;}
 const queue=[{owner:roots[0].OWNER,name:roots[0].VIEW_NAME,type:'VIEW',depth:0,text:roots[0].TEXT}],seen=new Map();
 const enqueue=(owner,name,type,depth)=>{if(!owner||!name)return null;const key=owner+'.'+name+'.'+type;let label=seen.get(key);if(!label){label='object_'+opaque(key).slice(0,16);seen.set(key,label);queue.push({owner,name,type,depth,label});}return label;};
 seen.set(queue[0].owner+'.'+queue[0].name+'.VIEW','requested_view');queue[0].label='requested_view';
 while(queue.length&&result.objects.length<30){
  const item=queue.shift(),{owner,name,type,depth,label}=item,binds={o:owner,n:name};
  const out={label,type,depth,definitionReadable:false,dependencies:[]};result.objects.push(out);
  let text=item.text;
  if(type==='VIEW'&&text===undefined){const rows=await safe('SELECT TEXT FROM ALL_VIEWS WHERE OWNER=:o AND VIEW_NAME=:n',binds,label+'_definition');text=rows?.length===1?rows[0].TEXT:undefined;}
  if(['FUNCTION','PROCEDURE','PACKAGE','TYPE','PACKAGE BODY','TYPE BODY'].includes(type)){
   const lines=[];let complete=false;
   for(let lo=1;lo<=6000;lo+=500){const rows=await safe("SELECT TYPE,LINE,TEXT FROM ALL_SOURCE WHERE OWNER=:o AND NAME=:n AND TYPE IN ('FUNCTION','PROCEDURE','PACKAGE','PACKAGE BODY','TYPE','TYPE BODY') AND LINE>=:lo AND LINE<:hi ORDER BY TYPE,LINE",{...binds,lo,hi:lo+500},label+'_source');if(!rows)break;lines.push(...rows);if(!rows.some(r=>Number(r.LINE)>=lo+499)){complete=true;break;}}
   out.sourceReadComplete=complete;out.sourceTypes=[...new Set(lines.map(r=>r.TYPE))];
   if(lines.length)text=lines.sort((a,b)=>a.TYPE.localeCompare(b.TYPE)||Number(a.LINE)-Number(b.LINE)).map(r=>r.TEXT).join('');
   if(!complete)result.blockers.push({scope:label,code:'SOURCE_READ_CAPPED_OR_FAILED'});
  }
  if(typeof text==='string'&&text.length){
   out.definitionReadable=true;out.definitionOpaque=opaque(text);out.signals=metadataSignals(text);out.definitionShape=metadataShape(text);
   if(type==='VIEW'){const p=extractViewProjection(text);out.plate=metadataShape(p.plate);out.permission=metadataShape(p.permission);out.projectionParsed=p.parsed;}
   if(out.signals.wrapped)result.blockers.push({scope:label,code:'SOURCE_WRAPPED'});
  }else if(type!=='TABLE'&&type!=='SYNONYM')result.blockers.push({scope:label,code:'DEFINITION_NOT_VISIBLE'});
  if(['TABLE','VIEW','SYNONYM'].includes(type)){
   const policies=await safe('SELECT PF_OWNER,PACKAGE,FUNCTION,SEL,ENABLE FROM ALL_POLICIES WHERE OBJECT_OWNER=:o AND OBJECT_NAME=:n',binds,label+'_policies');
   out.visiblePolicies=policies?.map(p=>({select:p.SEL,enabled:p.ENABLE,implementation:enqueue(p.PF_OWNER,p.PACKAGE||p.FUNCTION,p.PACKAGE?'PACKAGE':'FUNCTION',depth+1)}))??null;
   out.emptyPolicyCatalogDoesNotProveNoPolicy=true;
   if(type==='SYNONYM'){const synonyms=await safe('SELECT TABLE_OWNER,TABLE_NAME,DB_LINK FROM ALL_SYNONYMS WHERE OWNER=:o AND SYNONYM_NAME=:n',binds,label+'_synonym');out.synonyms=synonyms?.map(s=>({remote:Boolean(s.DB_LINK),targetOpaque:opaque(s.TABLE_OWNER+'.'+s.TABLE_NAME)}))??null;if(!synonyms?.length)result.blockers.push({scope:label,code:'SYNONYM_TARGET_NOT_VISIBLE'});}
  }
  if(depth>=5){result.blockers.push({scope:label,code:'DEPENDENCY_DEPTH_LIMIT'});continue;}
  const deps=await safe('SELECT REFERENCED_OWNER O,REFERENCED_NAME N,REFERENCED_TYPE T,REFERENCED_LINK_NAME L FROM ALL_DEPENDENCIES WHERE OWNER=:o AND NAME=:n',binds,label+'_dependencies');
  for(const d of deps??[]){if(d.L){out.dependencies.push({remote:true,type:d.T});result.blockers.push({scope:label,code:'REMOTE_DEPENDENCY_NOT_INSPECTED'});continue;}if(!['VIEW','TABLE','SYNONYM','FUNCTION','PROCEDURE','PACKAGE','TYPE'].includes(d.T)){out.dependencies.push({type:d.T,notTraversed:true});continue;}out.dependencies.push({label:enqueue(d.O,d.N,d.T,depth+1),type:d.T});}
 }
 if(queue.length)result.blockers.push({scope:'graph',code:'OBJECT_LIMIT_REACHED'});
 result.catalogVisibilityNotCompletenessProof=true;
 return result;
}
