const allowed=new Set(['birthMonth','gender','ageMin','ageMax','activityStatus','activityMonths','referenceDate','purchasePeriods','purchasePeriodMatch','customerIds','categoryIds','amountMin','amountMax','recurrenceMin','recurrenceMax','amountSegments','recurrenceSegments','breakdownBy','metrics','orderBy','orderDirection','limit','resultMode']);
const date=value=>{
 const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value??''));if(!m)return null;
 const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return +m[3]>=100&&d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]?d:null;
};
export const validateMemberAnalysisInput=args=>{
 const fail=()=>{throw Error('Filtros de segmentación inválidos.');};
 if(Object.keys(args).some(k=>!allowed.has(k)))fail();
 for(const [key,values] of Object.entries({gender:['male','female'],activityStatus:['active','inactive'],purchasePeriodMatch:['all','any'],resultMode:['summary','members'],orderBy:['totalAmount','purchaseCount','recurrenceMonths','fullName'],orderDirection:['asc','desc']}))if(args[key]!=null&&!values.includes(args[key]))fail();
 for(const key of ['birthMonth','ageMin','ageMax','activityMonths','recurrenceMin','recurrenceMax','limit'])if(args[key]!=null&&(!Number.isSafeInteger(args[key])||args[key]<(key==='birthMonth'||key==='activityMonths'||key==='limit'?1:0)))fail();
 if(args.birthMonth>12||args.activityMonths>120||args.limit>500)fail();
 for(const key of ['amountMin','amountMax'])if(args[key]!=null&&(!Number.isFinite(args[key])||args[key]<0))fail();
 for(const [min,max] of [['ageMin','ageMax'],['amountMin','amountMax'],['recurrenceMin','recurrenceMax']])if(args[min]!=null&&args[max]!=null&&args[min]>args[max])fail();
 if(args.referenceDate!=null&&!date(args.referenceDate))fail();
 if(args.purchasePeriods!=null&&(!Array.isArray(args.purchasePeriods)||args.purchasePeriods.length>24||args.purchasePeriods.some(p=>!date(p?.dateFrom)||!date(p?.dateTo)||date(p.dateFrom)>date(p.dateTo))))fail();
 for(const key of ['customerIds','categoryIds'])if(args[key]!=null&&(!Array.isArray(args[key])||args[key].some(v=>!['string','number'].includes(typeof v)||!String(v).trim()||typeof v==='number'&&!Number.isFinite(v))))fail();
 for(const [key,values] of [['metrics',['totalAmount','purchaseCount','recurrenceMonths']],['breakdownBy',['category','customer','gender','month','year','amountSegment','recurrenceSegment']]])if(args[key]!=null&&(!Array.isArray(args[key])||new Set(args[key]).size!==args[key].length||args[key].some(v=>!values.includes(v))))fail();
 for(const key of ['amountSegments','recurrenceSegments'])if(args[key]!=null&&(!Array.isArray(args[key])||args[key].some(s=>typeof s?.label!=='string'||!s.label.trim()||!Number.isFinite(s.min)||!Number.isFinite(s.max)||s.min<0||s.min>s.max||key==='recurrenceSegments'&&(!Number.isSafeInteger(s.min)||!Number.isSafeInteger(s.max)))))fail();
};
