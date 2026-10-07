import config from "../../../config.js";
import { getInvoicesRepository } from "../../repositories/invoices/invoices.repository.js";

const normalizeCurrencySymbol = (value) => {
  if (value === undefined || value === null || value === "") {
    return value ?? null;
  }

  const normalized = String(value).trim().toUpperCase();

  if (
    ["PYG", "GS", "GS.", "GUARANI", "GUARANIES"].includes(normalized)
  ) {
    return "₲";
  }

  return value;
};

const buildPdfUrl = (pdf) => {
  if (!pdf) {
    return null;
  }

  const base = String(config.urlEndPointDePdf ?? "").replace(/\/+$/, "");

  const path = String(pdf).replace(/^\/+/, "");

  if (!base) {
    return null;
  }

  return `${base}/${path}`;
};

export const getInvoices = async (args, connection) => {
  const result = await getInvoicesRepository({
    connection,
    ...args,
  });

  if (!Array.isArray(result?.data)) {
    if (
      result &&
      typeof result === "object" &&
      "currencySymbol" in result
    ) {
      return {
        ...result,
        currencySymbol: normalizeCurrencySymbol(
          result.currencySymbol,
        ),
      };
    }

    return result;
  }

  return {
    ...result,

    data: result.data.map((item) => ({
      ...item,
      currencySymbol: normalizeCurrencySymbol(
        item.currencySymbol,
      ),
      pdfUrl: item.pdf ? buildPdfUrl(item.pdf) : null,
      pdf: undefined,
    })),
  };
};
