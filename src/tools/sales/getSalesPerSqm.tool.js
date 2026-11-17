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
          categoryIds: {
            type: "array",
            items: { type: "string" },
            description: "Rubros previamente resueltos; conservarlos al cambiar período o local salvo cambio explícito.",
          },
          dayType: { type: "string", enum: ["weekday", "weekend"], description: "Filtro de días laborales o fines de semana; conservarlo en seguimientos compatibles." },
          dateTo: {
            type: "string",
            description: "Fecha final en formato DD/MM/YYYY.",
          },
          groupBy: {
            type: "array",
            items: {
              type: "string",
              enum: ["day", "month", "year", "customer", "category"],
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
