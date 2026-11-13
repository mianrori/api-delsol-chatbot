export const SAFE_ASSISTANT_RESPONSE='No pude generar una respuesta segura. Volvé a intentar la consulta.';
const xmlNames=['think','thinking','analysis','reasoning','reasoning_content'];
const roleNames=['analysis','reasoning','final'];
const hasTruncatedMarker=text=>{
 const start=text.lastIndexOf('<');
 if(start<0||text.indexOf('>',start)>=0)return false;
 const tail=text.slice(start),role=tail.startsWith('<|');
 const word=/^<(?:\||\s*\/?\s*)([a-z_]+)/i.exec(tail)?.[1]?.toLowerCase();
 return Boolean(word&&word.length>=2&&(role?roleNames:xmlNames).some(name=>name.startsWith(word)));
};

// Only well-delimited reasoning can be removed safely. A malformed/truncated
// boundary rejects the whole candidate; never salvage a suffix after it.
export function stripInternalReasoning(value=''){
 const text=String(value);
 if(hasTruncatedMarker(text))return SAFE_ASSISTANT_RESPONSE;
 const tokens=/<(?:\|(analysis|reasoning|final)\b|\s*(\/?)\s*(think|thinking|analysis|reasoning|reasoning_content)\b)/gi;
 const stack=[];let output='',cursor=0,seen=false,match;
 while((match=tokens.exec(text))){
  if(!stack.length)output+=text.slice(cursor,match.index);
  seen=true;
  if(match[1]){
   if(text.slice(tokens.lastIndex,tokens.lastIndex+2)!=='|>')return SAFE_ASSISTANT_RESPONSE;
   const name=match[1].toLowerCase();
   if(name==='final'){
    if(stack.at(-1)?.kind==='role')stack.pop();
    else if(stack.length||match.index!==0)return SAFE_ASSISTANT_RESPONSE;
   }else{
    if(stack.length)return SAFE_ASSISTANT_RESPONSE;
    stack.push({kind:'role',name});
   }
   cursor=tokens.lastIndex+2;
  }else{
   const name=match[3].toLowerCase(),end=text.indexOf('>',tokens.lastIndex);
   if(end<0||text.slice(tokens.lastIndex,end).includes('<'))return SAFE_ASSISTANT_RESPONSE;
   if(match[2]){
    if(stack.at(-1)?.kind!=='xml'||stack.at(-1).name!==name||!/^\s*$/.test(text.slice(tokens.lastIndex,end)))return SAFE_ASSISTANT_RESPONSE;
    stack.pop();
   }else{
    if(!/^\s*\/?\s*$/.test(text.slice(tokens.lastIndex,end)))return SAFE_ASSISTANT_RESPONSE;
    if(!/\/\s*$/.test(text.slice(tokens.lastIndex,end)))stack.push({kind:'xml',name});
   }
   cursor=end+1;
  }
  tokens.lastIndex=cursor;
 }
 if(stack.length)return SAFE_ASSISTANT_RESPONSE;
 output=(output+text.slice(cursor)).trim();
 return seen&&!output?SAFE_ASSISTANT_RESPONSE:output;
}
export function publicAssistantText(message){
 const blocks=(message?.content??[]).filter(block=>!block.reasoningContent&&!block.reasoning&&!block.analysis&&!block.reasoning_content&&typeof block.text==='string');
 if(blocks.some(block=>hasTruncatedMarker(block.text)))return SAFE_ASSISTANT_RESPONSE;
 const text=stripInternalReasoning(blocks.map(block=>block.text).join('\n'));
 return !text&&(message?.content??[]).some(block=>block.reasoningContent||block.reasoning||block.analysis||block.reasoning_content)?SAFE_ASSISTANT_RESPONSE:text;
}
