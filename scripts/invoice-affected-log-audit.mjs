// Never return raw log text or values. Accept only explicit metadata schemas.
export function auditAffectedLogs(raw,service){
 const lines=String(raw).split(/\r?\n/).filter(x=>x.trim()),known=['search_invoice_concepts','search_invoice_customers','get_invoices','search_invoice_balance_customers','get_invoice_balances','resolve_invoice_balance_currency'];
 if(service==='erp'){const safe=lines.every(l=>{try{const v=JSON.parse(l);return v.event==='ERP_DEV_SAFE_AUTH_TEST_LOG'&&Object.keys(v).every(k=>['event','correlationId','level','code'].includes(k));}catch{return false;}});return {lines:lines.length,safe,recognized:'ERP protected auth metadata'};}
 let inspectorLines=0,permissionLines=0,unknown=0,calls=0,results=0,permissionErrors=0,bedrockRequests=0,bedrockResponses=0;const retained=[];
 for(const line of lines){const t=line.trim();
  if(/^Debugger (?:listening|ending) on ws:\/\/127\.0\.0\.1:9229\/[a-f0-9-]+$/.test(t)||t==='Debugger attached.'||['For help, see: https://nodejs.org/en/docs/inspector','For help, see: https://nodejs.org/learn/getting-started/debugging'].includes(t)){inspectorLines++;continue;}
  if(/^Error ejecutando tool "(?:search_invoice_concepts|search_invoice_customers|get_invoices)": El usuario no tiene permisos para consultar esta informaci\u00f3n\.$/.test(t)){permissionLines++;continue;}
  retained.push(line);
 }
 for(const block of retained.join('\n').split(/\n(?=\[CHATBOT-DEV\] )/).map(s=>s.trim()).filter(Boolean)){
  const end=block.indexOf('\n'),title=block.slice(0,end).trim();try{const v=JSON.parse(block.slice(end+1)),keys=Object.keys(v).sort().join(',');
   if(title==='[CHATBOT-DEV] TOOL CALL'&&keys==='input,name,sessionId'&&known.includes(v.name)&&v.input==='[payload oculto]'&&/^.{2}\*\*\*.{2}$/.test(v.sessionId))calls++;
   else if(title==='[CHATBOT-DEV] TOOL RESULT'&&keys==='name,result'&&known.includes(v.name)&&v.result==='[payload oculto]')results++;
   else if(title==='[CHATBOT-DEV] TOOL RESULT ERROR'&&keys==='errorNum,message,name'&&known.includes(v.name)&&v.message==='El usuario no tiene permisos para consultar esta informaci\u00f3n.'&&(v.errorNum===null||[942,1031].includes(v.errorNum)))permissionErrors++;
   else if(title==='[CHATBOT-DEV] BEDROCK REQUEST'&&keys==='iteration,messageCount,modelId,toolCount'&&typeof v.modelId==='string'&&Number.isInteger(v.iteration)&&Number.isInteger(v.messageCount)&&Number.isInteger(v.toolCount))bedrockRequests++;
   else if(title==='[CHATBOT-DEV] BEDROCK RESPONSE'&&keys==='contentTypes,iteration,stopReason,usage'&&Number.isInteger(v.iteration)&&Array.isArray(v.contentTypes))bedrockResponses++;
   else unknown++;
  }catch{unknown++;}
 }
 return {lines:lines.length,safe:unknown===0,toolCalls:calls,toolResults:results,permissionErrors,permissionConsoleLines:permissionLines,inspectorMetadataLines:inspectorLines,unknownRecords:unknown,bedrockRequestEvents:bedrockRequests,bedrockResponseEvents:bedrockResponses,payloadsHidden:unknown===0,sessionsMasked:unknown===0};
}
