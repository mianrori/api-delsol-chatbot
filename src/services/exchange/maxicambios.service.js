import { contractBusinessConfig } from "../../config/contractBusiness.config.js";
import { getMaxicambiosQuote } from '../../repositories/exchange/maxicambios.repository.js';

const parseRate = (value) => {
  const normalized = String(value ?? "").trim();
  // Provider convention: ungrouped integer, comma decimals, dot thousands.
  // Dot-decimal / English grouping, signs, exponent and JS literals are not
  // part of this contract. Validate the complete token before Number().
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?$/.test(normalized)) return null;
  const numeric = Number(normalized.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export const getCurrentUsdSellRateFromMaxicambios = async ({ fetchImpl, timeoutMs = contractBusinessConfig.maxicambios.timeoutMs } = {}) => {
    const { html, retrievedAt } = await getMaxicambiosQuote({fetchImpl,timeoutMs});
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ");

    const matches = [...text.matchAll(/D[oó]lar\s+Compra\s+([\d.,]+)\s+Venta\s+([^\s]+)/gi)];
    const rates = matches.map(match=>{
      // Do not accept a prefix of a split/malformed number such as "7 100"
      // or "7.100 ,50" as a complete quote.
      const remainder = text.slice(match.index + match[0].length);
      return /^\s+[\d.,+-]/.test(remainder) ? null : parseRate(match[2]);
    });

    if (!matches.length) {
      throw new Error(
        "No se pudo identificar la cotización principal del dólar en Maxicambios.",
      );
    }

    const sellRate = rates[0];

    if (!Number.isFinite(sellRate) || sellRate <= 0) {
      throw new Error("La cotización de venta obtenida no es válida.");
    }
    if (rates.some(rate=>rate!==sellRate)) throw new Error('La cotización de venta del proveedor es ambigua.');

    return {
      source: "Maxicambios",
      currency: "USD",
      sellRate,
      rateType: 'sell', currentRate: true, retrievedAt,
      quotedAt: null,
      dateBasis: 'CURRENT_QUOTE_AT_RETRIEVAL_NOT_HISTORICAL',
    };
};
