// Parses only top-level view projections. Does not execute SQL or export literals.
export function extractViewProjection(text){
 const sql=String(text??'');let depth=0,quote=null,start=-1,end=-1;
 for(let i=0;i<sql.length;i++){const c=sql[i];if(quote){if(c===quote){if(sql[i+1]===quote)i++;else quote=null;}continue;}if(c==="'"||c==='"'){quote=c;continue;}if(c==='('){depth++;continue;}if(c===')'){depth--;continue;}if(depth===0&&start<0&&/^SELECT\b/i.test(sql.slice(i))&&(i===0||!/\w/.test(sql[i-1]))){start=i+6;i+=5;continue;}if(depth===0&&start>=0&&/^FROM\b/i.test(sql.slice(i))&&!/\w/.test(sql[i-1])){end=i;break;}}
 if(start<0||end<0)return {parsed:false};
 const parts=[];let from=start;depth=0;quote=null;
 for(let i=start;i<end;i++){const c=sql[i];if(quote){if(c===quote){if(sql[i+1]===quote)i++;else quote=null;}continue;}if(c==="'"||c==='"')quote=c;else if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0){parts.push(sql.slice(from,i).trim());from=i+1;}}parts.push(sql.slice(from,end).trim());
 const find=name=>parts.find(p=>new RegExp('(?:\\b|\\")'+name+'\\"?\\s*$','i').test(p))??null;
 return {parsed:true,plate:find('MATRICULA'),permission:find('USER_CAN_CONSULT')};
}
export function publicProjectionShape(expression){
 if(!expression)return null;
 const known=new Set('SELECT FROM WHERE AND OR NOT CASE WHEN THEN ELSE END DECODE NVL COALESCE NULL AS MAX MIN DISTINCT USER_CAN_CONSULT MATRICULA USER SYS_CONTEXT ROWNUM UPPER TRIM TO_CHAR TO_NUMBER IN IS EXISTS ON JOIN LEFT RIGHT INNER OUTER CAST VARCHAR2 NUMBER COUNT SUM'.split(' '));
 return expression.replace(/'(?:''|[^'])*'/g,"'<literal>'").replace(/\b\d+(?:\.\d+)?\b/g,'<number>').replace(/"(?:""|[^"])*"/g,'<identifier>').replace(/[A-Za-z_][A-Za-z0-9_$#]*/g,w=>known.has(w.toUpperCase())?w.toUpperCase():['literal','number','identifier'].includes(w)?w:'identifier').replace(/\s+/g,' ').trim();
}
