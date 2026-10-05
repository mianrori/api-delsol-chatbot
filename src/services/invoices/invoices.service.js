import config from "../../../config.js";
import { getInvoicesRepository } from "../../repositories/invoices/invoices.repository.js";

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
    return result;
  }

  return {
    ...result,

    data: result.data.map((item) => ({
      ...item,
      pdfUrl: item.pdf ? buildPdfUrl(item.pdf) : null,
      pdf: undefined,
    })),
  };
};
