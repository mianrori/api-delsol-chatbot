import { contractBusinessConfig } from "../../config/contractBusiness.config.js";
import { getMaxicambiosQuote } from '../../repositories/exchange/maxicambios.repository.js';

const parseRate = (value) => {
  const normalized = String(value ?? "").trim().replace(/\s/g, "");
  if (!normalized) return null;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/\./g, ""));
  }
  const numeric = Number(normalized.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

export const getCurrentUsdSellRateFromMaxicambios = async ({ fetchImpl, timeoutMs = contractBusinessConfig.maxicambios.timeoutMs } = {}) => {
    const { html, retrievedAt } = await getMaxicambiosQuote({fetchImpl,timeoutMs});
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ");

    const matches = [...text.matchAll(/D[oó]lar\s+Compra\s+([\d.,]+)\s+Venta\s+([^\s]+)/gi)];
    const rates = matches.map(match=>parseRate(match[2]));

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
