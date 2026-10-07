// src/tools/invoices/getInvoices.tool.js

export const getInvoicesTool = {
  toolSpec: {
    name: "get_invoices",

    description:
      "Consulta facturas emitidas por delSol. " +
      "Debe utilizar customerIds y conceptIds previamente resueltos cuando la consulta incluya clientes o conceptos ambiguos. " +
      "Permite consultar detalle o resúmenes.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          customerIds: {
            type: "array",
            items: {
              type: "string",
            },
          },

          conceptIds: {
            type: "array",
            items: {
              type: "string",
            },
          },

          dateFrom: {
            type: "string",
            description: "Fecha inicial DD/MM/YYYY.",
          },

          dateTo: {
            type: "string",
            description: "Fecha final DD/MM/YYYY.",
          },

          invoiceNumber: {
            type: "string",
          },

          period: {
            type: "string",
          },

          plate: {
            type: "string",
          },

          cancelled: {
            type: "boolean",
          },

          mode: {
            type: "string",
            enum: ["detail", "summary"],
            default: "detail",
          },

          groupBy: {
            type: "array",
            items: {
              type: "string",
              enum: ["invoice", "customer", "concept", "month", "year"],
            },
          },

          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["totalAmount", "invoiceCount"],
            },
          },

          page: {
            type: "integer",
            minimum: 1,
            default: 1,
          },

          rows: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },

        additionalProperties: false,
      },
    },
  },
};
