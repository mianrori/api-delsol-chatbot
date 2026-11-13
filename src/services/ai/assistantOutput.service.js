// Structured reasoning is never public text. Also remove provider/model markup
// if it arrives inside a text block, including split or unfinished segments.
export function stripInternalReasoning(value=''){
 let text=String(value);
 const names='think|thinking|analysis|reasoning|reasoning_content';
 text=text.replace(new RegExp('<('+names+')\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>','gi'),'');
 text=text.replace(new RegExp('<(?:'+names+')\\b[^>]*>[\\s\\S]*$','gi'),'');
 text=text.replace(new RegExp('^[\\s\\S]*?<\\/(?:'+names+')\\s*>','i'),'');
 text=text.replace(/<\|(?:analysis|reasoning)\|>[\s\S]*?(?:<\|final\|>|$)/gi,'');
 return text.replace(/<\|final\|>/gi,'').trim();
}
export function publicAssistantText(message){
 return stripInternalReasoning((message?.content??[]).filter(block=>!block.reasoningContent&&!block.reasoning&&!block.analysis&&!block.reasoning_content&&typeof block.text==='string').map(block=>block.text).join('\n'));
}
