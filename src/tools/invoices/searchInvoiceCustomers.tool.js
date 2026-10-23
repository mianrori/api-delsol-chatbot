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

          dateFrom: {
            type: "string",
            description:
              "Fecha inicial opcional en formato DD/MM/YYYY. Si la consulta del usuario incluye un período, debe utilizarse para resolver únicamente clientes con facturas en ese período.",
          },

          dateTo: {
            type: "string",
            description:
              "Fecha final opcional en formato DD/MM/YYYY. Si la consulta del usuario incluye un período, debe utilizarse para resolver únicamente clientes con facturas en ese período.",
          },
        },

        required: ["query"],
        additionalProperties: false,
      },
    },
  },
};
