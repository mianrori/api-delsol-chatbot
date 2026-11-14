import {normalizeInvoicePlate} from '../../utils/invoicePlate.js';

// A complete plate query owns its scope; explicit additive wording is a follow-up.
export function getInvoicePlateRequest(message){
 const text=String(message??'').trim().replace(/[.!?]+$/,'');
 const match=/^(?:(?:muestra(?:me)?|consulta) (?:las )?)?(?:las )?facturas de (?:la )?matr[i\u00ed]cula (.+?)(?: (?:del?|durante)(?: el)?(?: a[\u00f1n]o)? ((?:19|20)\d{2}))?$/i.exec(text);
 const followup=/^(?:filtra|filtrar|a[\u00f1n]ade|agrega)(?: tambi[e\u00e9]n)? (?:por |con )?(?:la )?matr[i\u00ed]cula (.+)$/i.exec(text);
 const plate=match?.[1]??followup?.[1];
 if(!plate||!(/^[a-z0-9\s-]{2,30}$/i.test(plate)&&/\d/.test(plate)||/^\[PII_PLATE_\d+\]$/.test(plate)))return null;
 const normalized=plate.startsWith('[PII_')?plate:normalizeInvoicePlate(plate);
 return {autonomous:Boolean(match),input:{plate:normalized,...(match?.[2]?{dateFrom:'01/01/'+match[2],dateTo:'31/12/'+match[2]}:{}),mode:'detail',page:1,...(match?{rows:20}:{})}};
}
