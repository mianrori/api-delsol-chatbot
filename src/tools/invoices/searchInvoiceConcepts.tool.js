// src/tools/invoices/searchInvoiceConcepts.tool.js

export const searchInvoiceConceptsTool = {
  toolSpec: {
    name: "search_invoice_concepts",

    description:
      "Busca y resuelve conceptos utilizados en facturas emitidas por delSol. " +
      "Debe utilizarse cuando el usuario menciona un concepto por texto y todavía no se conoce su identificador exacto. " +
      "Puede devolver RESOLVED, AMBIGUOUS o NOT_FOUND.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          query: {
            type: "string",
            minLength: 1,
            description:
              "Texto del concepto mencionado por el usuario, por ejemplo arrendamiento, gastos comunes, parking o soles obsequios.",
          },
        },

        required: ["query"],
        additionalProperties: false,
      },
    },
  },
};
