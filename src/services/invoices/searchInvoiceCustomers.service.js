import { searchInvoiceCustomersRepository } from "../../repositories/invoices/invoiceCustomers.repository.js";

const normalizeCustomerId = (value) =>
  String(value ?? "").trim();

const deduplicateCustomers = (results = []) => {
  const byCustomerId = new Map();

  for (const item of results) {
    const customerId = normalizeCustomerId(item?.customerId);

    if (!customerId || byCustomerId.has(customerId)) {
      continue;
    }

    /*
     * El repository ya devuelve las filas ordenadas por relevancia.
     * Conservamos la primera aparición de cada COD_CLIENTE para
     * mantener la mejor coincidencia y evitar opciones duplicadas
     * causadas por variantes históricas de RUC u otros datos.
     */
    byCustomerId.set(customerId, item);
  }

  return [...byCustomerId.values()];
};

export const searchInvoiceCustomers = async ({ query }, connection) => {
  /*
   * Pedimos más filas que las que mostraremos porque una misma identidad
   * puede aparecer varias veces en VW_BOT_FACTURAS. Luego deduplicamos
   * por customerId y limitamos las opciones únicas a 10.
   */
  const rawResults = await searchInvoiceCustomersRepository({
    connection,
    query,
    limit: 50,
  });

  const results = deduplicateCustomers(rawResults).slice(0, 10);

  if (results.length === 0) {
    return {
      status: "NOT_FOUND",
      query,
      options: [],
    };
  }

  if (results.length === 1) {
    return {
      status: "RESOLVED",
      query,
      ...results[0],
    };
  }

  return {
    status: "AMBIGUOUS",
    query,
    options: results.map((item, index) => ({
      option: index + 1,
      ...item,
    })),
  };
};
