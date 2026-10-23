export const getSalesPerSqmTool = {
  toolSpec: {
    name: "get_sales_per_sqm",
    description:
      "Calcula ventas por metro cuadrado usando la superficie contractual vigente en cada fecha de venta. " +
      "Para ventas en Guaraníes también devuelve el equivalente en USD usando la cotización de venta actual de Maxicambios.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          customerIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Códigos de clientes/locales previamente resueltos.",
          },
          dateFrom: {
            type: "string",
            description: "Fecha inicial en formato DD/MM/YYYY.",
          },
          dateTo: {
            type: "string",
            description: "Fecha final en formato DD/MM/YYYY.",
          },
          groupBy: {
            type: "array",
            items: {
              type: "string",
              enum: ["day", "month", "year", "customer"],
            },
            description:
              "Dimensiones para agrupar el resultado. Para consultas globales sin customerIds debe incluir customer.",
          },
        },
        required: ["dateFrom", "dateTo"],
        additionalProperties: false,
      },
    },
  },
};
