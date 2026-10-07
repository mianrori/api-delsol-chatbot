import { contractBusinessConfig } from "../../config/contractBusiness.config.js";

const parseRate = (value) => {
  const normalized = String(value ?? "").trim().replace(/\s/g, "");
  if (!normalized) return null;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    return Number(normalized.replace(/\./g, ""));
  }
  const numeric = Number(normalized.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

export const getCurrentUsdSellRateFromMaxicambios = async () => {
  const { url, timeoutMs } = contractBusinessConfig.maxicambios;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Maxicambios respondió HTTP ${response.status}.`);
    }

    const html = await response.text();
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ");

    const match = text.match(
      /D[oó]lar\s+Compra\s+([\d.,]+)\s+Venta\s+([\d.,]+)/i,
    );

    if (!match) {
      throw new Error(
        "No se pudo identificar la cotización principal del dólar en Maxicambios.",
      );
    }

    const sellRate = parseRate(match[2]);

    if (!Number.isFinite(sellRate) || sellRate <= 0) {
      throw new Error("La cotización de venta obtenida no es válida.");
    }

    return {
      source: "Maxicambios",
      currency: "USD",
      sellRate,
    };
  } finally {
    clearTimeout(timer);
  }
};
