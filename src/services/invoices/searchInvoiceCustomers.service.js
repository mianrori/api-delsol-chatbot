import { searchInvoiceCustomersRepository } from "../../repositories/invoices/invoiceCustomers.repository.js";

const normalizeCustomerId = (value) =>
  String(value ?? "").trim();

const toCustomerResult = (item) => ({
  customerId: item.customerId,
  customerName: item.customerName ?? null,
  businessName: item.businessName ?? null,
  taxId: item.taxId ?? null,
});

const deduplicateCustomers = (results = []) => {
  const byCustomerId = new Map();

  for (const item of results) {
    const customerId = normalizeCustomerId(item?.customerId);

    if (!customerId || byCustomerId.has(customerId)) {
      continue;
    }

    /*
     * El repository devuelve primero las coincidencias exactas y luego
     * las aproximadas ordenadas por similitud. Conservamos la primera
     * aparición de cada COD_CLIENTE.
     */
    byCustomerId.set(customerId, item);
  }

  return [...byCustomerId.values()];
};

export const searchInvoiceCustomers = async ({ query }, connection) => {
  /*
   * Pedimos más filas que las que mostraremos porque una misma identidad
   * puede aparecer varias veces en VW_BOT_FACTURAS. Luego deduplicamos
   * por customerId.
   */
  const rawResults = await searchInvoiceCustomersRepository({
    connection,
    query,
    limit: 50,
  });

  const uniqueResults = deduplicateCustomers(rawResults);

  if (uniqueResults.length === 0) {
    return {
      status: "NOT_FOUND",
      query,
      options: [],
    };
  }

  /*
   * Si existe al menos una coincidencia exacta por código, RUC, matrícula,
   * nombre o razón social, descartamos las coincidencias aproximadas.
   *
   * Esto evita presentar como ambiguos clientes débilmente relacionados
   * cuando ya existe una identidad exacta para el valor buscado.
   */
  const exactMatches = uniqueResults.filter(
    (item) => item?.exactMatch === true,
  );

  const relevantResults =
    exactMatches.length > 0 ? exactMatches : uniqueResults;

  const results = relevantResults.slice(0, 10);

  if (results.length === 1) {
    return {
      status: "RESOLVED",
      query,
      ...toCustomerResult(results[0]),
    };
  }

  return {
    status: "AMBIGUOUS",
    query,
    options: results.map((item, index) => ({
      option: index + 1,
      ...toCustomerResult(item),
    })),
  };
};
