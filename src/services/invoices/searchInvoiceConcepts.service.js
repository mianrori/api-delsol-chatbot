import { searchInvoiceConceptsRepository } from "../../repositories/invoices/invoiceConcepts.repository.js";

export const searchInvoiceConcepts = async ({ query }, connection) => {
  const results = await searchInvoiceConceptsRepository({
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
      conceptId: results[0].conceptId,
      description: results[0].description,
    };
  }

  return {
    status: "AMBIGUOUS",
    query,
    options: results.map((item, index) => ({
      option: index + 1,
      conceptId: item.conceptId,
      description: item.description,
    })),
  };
};
