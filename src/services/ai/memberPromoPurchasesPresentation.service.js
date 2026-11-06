const keys = new Set(['documentNumber','promotionIds','campaignIds','customerIds','categoryIds','dateFrom','dateTo','origin','mode','groupBy','metrics','page','rows']);
const allowed = new Set(['get_member_promo_purchases','search_promotions','search_members','search_customers','search_categories']);
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
const previousQuery=(history,restoreValue)=>{
 let start=-1;for(let i=history.length-1;i>=0;i--)if(history[i].role==='user'&&history[i].content?.some(b=>typeof b.text==='string')){start=i;break;}
 if(start<0)return null;
 const blocks=history.slice(start+1).flatMap(m=>m.content??[]),calls=blocks.map(b=>b.toolUse).filter(Boolean),queries=calls.filter(c=>c.name==='get_member_promo_purchases');
 if(queries.length!==1||calls.some(c=>!allowed.has(c.name)))return null;
 const call=queries[0],block=blocks.map(b=>b.toolResult).find(b=>b?.toolUseId===call.toolUseId),result=block?.content?.find(b=>b.json)?.json;
 if(block?.status!=='success'||!call.input||Object.keys(call.input).some(k=>!keys.has(k))||!result||result.error||result.success===false)return null;
 const doc=String(restoreValue(call.input.documentNumber)??'').trim();
 return doc&&doc===String(restoreValue(result.documentNumber)??'').trim()?{input:call.input,result}:null;
};
export const resolveMemberPromoPage=({message,history=[],restoreValue=v=>v})=>{
 if(!/^(siguiente pagina|siguiente pagina de compras promocionales|ver mas|continuar)$/.test(normalize(message)))return null;
 const previous=previousQuery(history,restoreValue);if(!previous||previous.input.mode!=='detail'||!['OK','NO_PURCHASES'].includes(previous.result.status))return null;
 const {input,result}=previous;
 if(!Number.isSafeInteger(result.page)||!Number.isSafeInteger(result.rows)||result.rows<1||!Number.isSafeInteger(result.totalRows)||result.totalRows<0)return null;
 if(!result.hasMore)return {answer:'No hay más páginas de compras promocionales para estos filtros.'};
 if(result.nextPage!==result.page+1||result.nextPage>Math.ceil(result.totalRows/result.rows))return null;
 return {input:{...structuredClone(input),page:result.nextPage,rows:result.rows}};
};
export const resolveMemberPromoSelection=({message,history=[],restoreValue=v=>v})=>{
 const choice=/^opci[oó]n\s+(\d+)[.!]?$/i.exec(String(message??'').trim());if(!choice)return null;
 const previous=previousQuery(history,restoreValue);if(previous?.result.status!=='AMBIGUOUS')return null;
 const option=previous.result.options?.find(o=>String(o.optionId)===String(Number(choice[1])));
 if(!option||option.promotionId==null||option.campaignId==null)return null;
 return {input:{...structuredClone(previous.input),promotionIds:[option.promotionId],campaignIds:[option.campaignId],page:1}};
};
export const preserveMemberPromoFollowup=({message,history=[],input,restoreValue=v=>v})=>{
 const previous=previousQuery(history,restoreValue);if(!previous||!input||Object.keys(input).some(k=>!keys.has(k)))return null;
 const text=String(message??'').normalize('NFC').trim();
 const period=/^Ahora cambia el per[ií]odo a (\d{2}\/\d{2}\/\d{4}) al (\d{2}\/\d{2}\/\d{4}); conserva los dem[aá]s filtros[.!]?$/i.exec(text);
 const entity=/^Ahora cambia el (socio|local|rubro) a "[^"\r\n]+"; conserva los dem[aá]s filtros[.!]?$/i.exec(text);
 const mode=/^Ahora muestra (el resumen|el detalle); conserva los dem[aá]s filtros[.!]?$/i.exec(text);
 const grouping=/^Ahora desglosa por (mes|local|rubro|origen|promoci[oó]n y campa[nñ]a); conserva los dem[aá]s filtros[.!]?$/i.exec(text);
 const base={...structuredClone(previous.input),page:1};
 if(period)return input.dateFrom===period[1]&&input.dateTo===period[2]?{...base,dateFrom:period[1],dateTo:period[2]}:null;
 if(entity){const key={socio:'documentNumber',local:'customerIds',rubro:'categoryIds'}[entity[1].toLowerCase()];return key==='documentNumber'?typeof input[key]==='string'&&input[key].trim()?{...base,[key]:input[key]}:null:Array.isArray(input[key])&&input[key].length?{...base,[key]:structuredClone(input[key])}:null;}
 if(mode)return {...base,mode:mode[1].toLowerCase()==='el detalle'?'detail':'summary',groupBy:mode[1].toLowerCase()==='el detalle'?[]:base.groupBy??[]};
 if(grouping){const g=normalize(grouping[1]);return {...base,mode:'summary',groupBy:{mes:['month'],local:['customer'],rubro:['category'],origen:['bankOrigin'],'promocion y campana':['promotion','campaign']}[g]};}
 if(/^Ahora conserva los mismos filtros[.!]?$/i.test(text))return base;
 return null;
};
const number=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('es-PY',{maximumFractionDigits:20}).format(v):'Sin calcular';
const dims={month:['Mes','month'],year:['Año','year'],promotion:['Promoción','promotionName'],campaign:['Campaña','campaignName'],customer:['Local','customerName'],category:['Rubro','categoryName'],bankOrigin:['Origen','origin']};
export const buildMemberPromoResponse=(calls=[],{restoreValue=v=>v}={})=>{
 const queries=calls.filter(c=>c.name==='get_member_promo_purchases');if(queries.length!==1||calls.some(c=>!allowed.has(c.name)))return null;
 const {input={},result:r}=queries[0];if(!r||!Array.isArray(r.data)||!r.status)return null;
 const cell=v=>String(restoreValue(v)??'—').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
 const currency=d=>d.currency?.code==='PYG'?'₲':d.currency?.code==='USD'?'USD':'Moneda no identificada';
 if(!input.documentNumber||String(restoreValue(input.documentNumber)).trim()!==String(restoreValue(r.documentNumber)).trim())return null;
 const lines=['**Compras del socio por promoción y campaña**','',`Documento: ${cell(r.documentNumber)}.`];
 if(input.dateFrom&&input.dateTo)lines.push(`Período: ${cell(input.dateFrom)} a ${cell(input.dateTo)}.`);
 const table=(headers,rows)=>lines.push('',`| ${headers.join(' | ')} |`,`| ${headers.map(()=>'---').join(' | ')} |`,...rows.map(row=>`| ${row.join(' | ')} |`));
 if(r.status==='AMBIGUOUS'){
  lines.push('',cell(r.reason));table(['Opción','Promoción','Campaña'],(r.options??[]).map(o=>[cell(o.optionId),cell(o.promotionName),cell(o.campaignName)]));
  lines.push('Elige una opción o precisa el nombre de la promoción o campaña.');return lines.join('\n');
 }
 if(r.status==='SELECTION_NOT_FOUND'){lines.push('',cell(r.reason));return lines.join('\n');}
 if(!['OK','NO_PURCHASES'].includes(r.status))return null;
 if(r.mode==='detail'){
  lines.push('',`Página ${r.page} de ${r.totalPages}; ${r.totalRows} compras en total.`);
  table(['Fecha','Promoción','Campaña','Local','Rubro','Moneda','Importe'],r.data.map(d=>[cell(d.purchaseDate),cell(d.promotion?.name),cell(d.campaign?.name),cell(d.customer?.name),cell(d.category?.name),currency(d),number(d.amount)]));
  for(const reason of new Set(r.data.map(d=>d.reason).filter(Boolean)))lines.push('',cell(reason));
  if(r.hasMore)lines.push('Puedes pedir «siguiente página» de compras promocionales.');
 }else{
  const groups=(input.groupBy??[]).map(k=>dims[k]),metrics=input.metrics??['totalAmount','purchaseCount'];
  if(groups.some(g=>!g)||metrics.some(m=>!['totalAmount','purchaseCount'].includes(m)))return null;
  table([...groups.map(g=>g[0]),'Moneda',...metrics.map(m=>m==='totalAmount'?'Importe':'Compras')],r.data.map(d=>[...groups.map(g=>cell(d[g[1]])),currency(d),...metrics.map(m=>number(d[m]))]));
  for(const reason of new Set(r.data.map(d=>d.reason).filter(Boolean)))lines.push('',cell(reason));
 }
 if(!r.data.length)lines.push('',cell(r.reason??'No hay compras para los filtros seleccionados.'));
 lines.push('Los importes se mantienen separados por moneda; la cantidad cuenta registros de participación, no facturas distintas.');
 return lines.join('\n');
};
