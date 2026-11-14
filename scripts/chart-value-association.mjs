// Inspect rendered point/legend text, not axis ticks or unrelated SVG text.
const decode = s => s.replace(/&(amp|lt|gt|quot|apos);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[k]);
const fill = attrs => /\bfill="([^"]+)"/.exec(attrs)?.[1];
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
export function chartMatchesSource({chart,labels,series}) {
 if(!chart?.url?.startsWith('data:image/svg+xml;base64,')||!Array.isArray(labels)||!Array.isArray(series))return false;
 if(series.some(s=>s.values.length!==labels.length||s.values.some(v=>typeof v!=='number'||!Number.isFinite(v))))return false;
 const svg=Buffer.from(chart.url.split(',')[1],'base64').toString('utf8');
 const amount=v=>`${chart.valuePrefix?chart.valuePrefix+' ':''}${new Intl.NumberFormat('es-PY',{maximumFractionDigits:6}).format(v)}${chart.valueSuffix??''}`;
 const legends=[...svg.matchAll(/<rect\b([^>]*?)\/>\s*<text\b[^>]*>([^<]*)<\/text>/g)].map(m=>({color:fill(m[1]),text:decode(m[2])}));
 if(chart.type==='pie')return series.length===1&&same(legends.map(x=>x.text),labels.map((label,i)=>`${label.slice(0,22)}: ${amount(series[0].values[i])}`));
 if(legends.length!==series.length||new Set(legends.map(l=>l.color)).size!==series.length)return false;
 const points=[...svg.matchAll(/<(rect|circle)\b([^>]*)><title>([^<]*)<\/title><\/\1>/g)].map(m=>({color:fill(m[2]),text:decode(m[3])}));
 if(points.length!==labels.length*series.length)return false;
 return series.every((s,j)=>legends[j].text===s.label.slice(0,25)&&same(points.filter(p=>p.color===legends[j].color).map(p=>p.text),labels.map((label,i)=>`${label}: ${amount(s.values[i])}`)));
}
