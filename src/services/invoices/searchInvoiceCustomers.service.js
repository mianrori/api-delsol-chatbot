import { searchInvoiceCustomersRepository } from "../../repositories/invoices/invoiceCustomers.repository.js";

export const searchInvoiceCustomers = async ({ query }, connection) => {
  const results = await searchInvoiceCustomersRepository({
    connection,
    query,
    limit: 10,
  });

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
