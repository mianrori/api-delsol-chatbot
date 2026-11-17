import { getMemberPromoPurchasesRepository,promoDimensions,promoPageLimit } from "../../repositories/members/memberPromoPurchase.repository.js";
import {getPromotionSelectionRepository} from "../../repositories/promotions/promotionSelection.repository.js";
import {throwIfRequestAborted} from "../requestContext.service.js";

const validDate=s=>{const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s??''));if(!m)return null;const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]?d:null;};

export const getMemberPromoPurchases = async (args, connection) => {
  throwIfRequestAborted();
  const {documentNumber,dateFrom,dateTo,origin,mode='summary',groupBy=[],metrics=['totalAmount','purchaseCount'],page=1,rows=20}=args;
  if(typeof documentNumber!=='string'||!documentNumber.trim())throw Error('Documento obligatorio.');
  if((dateFrom!=null||dateTo!=null)&&(!validDate(dateFrom)||!validDate(dateTo)||validDate(dateFrom)>validDate(dateTo)))throw Error('Rango de fechas inválido.');
  if(!['summary','detail'].includes(mode)||origin!==undefined&&!['bank','nonBank'].includes(origin))throw Error('Modo u origen inválido.');
  if(!Array.isArray(groupBy)||groupBy.some(g=>!Object.hasOwn(promoDimensions,g))||new Set(groupBy).size!==groupBy.length)throw Error('Agrupación inválida.');
  if(!Array.isArray(metrics)||!metrics.length||metrics.some(m=>!['totalAmount','purchaseCount'].includes(m))||new Set(metrics).size!==metrics.length)throw Error('Métricas inválidas.');
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(rows)||rows<1||!Number.isSafeInteger(page*Math.min(rows,promoPageLimit())))throw Error('Paginación inválida.');
  const ids={};for(const name of ['promotionIds','campaignIds','customerIds','categoryIds']){
    const values=args[name]??[];
    if(!Array.isArray(values)||values.some(v=>!['string','number'].includes(typeof v)||!String(v).trim()||typeof v==='number'&&!Number.isFinite(v)||name==='campaignIds'&&(!Number.isSafeInteger(Number(v))||Number(v)<0)))throw Error('Identificadores inválidos.');
    ids[name]=[...new Set(values.map(v=>name==='campaignIds'?Number(v):String(v).trim()))];
  }
  const input={documentNumber:documentNumber.trim(),...ids,dateFrom,dateTo,origin,mode,groupBy,metrics,page,rows:Math.min(rows,promoPageLimit())};
  if(ids.promotionIds.length||ids.campaignIds.length){
    const options=await getPromotionSelectionRepository({...ids,connection});
    const explicitMultiple=ids.promotionIds.length>1||ids.campaignIds.length>1||(mode==='summary'&&groupBy.includes('campaign')&&groupBy.includes('promotion'));
    if(!options.length||options.length>1&&!explicitMultiple)return {documentNumber:input.documentNumber,mode,status:options.length?'AMBIGUOUS':'SELECTION_NOT_FOUND',reason:options.length?'La promoción o campaña no es única; elige una opción antes de consultar compras.':'La selección no corresponde a una promoción/campaña del catálogo autorizado.',options:options.slice(0,promoPageLimit()).map((o,i)=>({optionId:String(i+1),...o})),totalOptions:options.length,data:[]};
  }
  const result=await getMemberPromoPurchasesRepository({...input,connection});
  return {...result,status:mode==='detail'?result.totalRows?'OK':'NO_PURCHASES':result.data.length?'OK':'NO_PURCHASES',...(result.data.length?{}:{reason:mode==='detail'&&result.totalRows?'Fin del recorrido; esta página no contiene más compras.':'No hay compras para los filtros seleccionados.'})};
};
