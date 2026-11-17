const words=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
const edit=(a,b)=>{let costs=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,costs[j+1]+1,costs[j]+Number(a[i]!==b[j])));costs=next;}return costs.at(-1);};
export const promotionControlKey=r=>JSON.stringify([String(r.COD_PROMOCION),r.COD_CAMPANIA==null?null:Number(r.COD_CAMPANIA),r.NOMBRE_PROMOCION??null,r.NOMBRE_CAMPANIA??null,r.FECHA_DESDE??null,r.FECHA_HASTA??null]);
const date=v=>String(v??'').split('/').reverse().join('');
export function promotionApproximateControl(source,minSimilarity){
 // Independently derive a misspelling that has no direct substring/identifier hit.
 const unique=[...new Map(source.map(r=>[promotionControlKey(r),r])).values()];
 for(const row of unique)for(const word of words(row.NOMBRE_PROMOCION+' '+row.NOMBRE_CAMPANIA).filter(w=>w.length>=5)){
  const search=word.slice(0,-1)+(word.endsWith('X')?'Z':'X');
  if(unique.some(r=>words(r.NOMBRE_PROMOCION+' '+r.NOMBRE_CAMPANIA).some(w=>w.includes(search))||String(r.COD_PROMOCION).toUpperCase()===search||String(r.COD_CAMPANIA)===search))continue;
  const selected=[];
  for(const r of unique){const tokens=words(r.NOMBRE_PROMOCION+' '+r.NOMBRE_CAMPANIA);if(!tokens.some(t=>t.includes(search.slice(0,4))))continue;
   const score=Math.max(...tokens.map(t=>Math.round(100*(1-edit(search,t)/Math.max(search.length,t.length)))));
   if(score>=minSimilarity&&score>=60)selected.push({...r,score});
  }
  if(!selected.length)continue;
  selected.sort((a,b)=>b.score-a.score||date(b.FECHA_DESDE).localeCompare(date(a.FECHA_DESDE))||String(a.COD_PROMOCION).localeCompare(String(b.COD_PROMOCION))||String(a.COD_CAMPANIA).localeCompare(String(b.COD_CAMPANIA))||(promotionControlKey(a)<promotionControlKey(b)?-1:promotionControlKey(a)>promotionControlKey(b)?1:0));
  return {search,expected:selected};
 }
 return null;
}
