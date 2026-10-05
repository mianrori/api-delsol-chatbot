// src/tools/invoices/searchInvoiceCustomers.tool.js

export const searchInvoiceCustomersTool = {
  toolSpec: {
    name: "search_invoice_customers",

    description:
      "Busca clientes presentes en las facturas emitidas por delSol. " +
      "Permite buscar por nombre, razón social, RUC, matrícula o identificador ya conocido. " +
      "Debe utilizarse cuando el usuario menciona un cliente de facturación y todavía no está resuelto. " +
      "Puede devolver RESOLVED, AMBIGUOUS o NOT_FOUND.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          query: {
            type: "string",
            minLength: 1,
            description:
              "Nombre, razón social, RUC, matrícula o texto identificador proporcionado por el usuario.",
          },
        },

        required: ["query"],
        additionalProperties: false,
      },
    },
  },
};
