export const getSalesTool = {
  toolSpec: {
    name: "get_sales",
    description:
      "Consulta ventas para un período determinado. Permite filtrar por IDs de clientes/locales " +
      "y rubros previamente resueltos, y agrupar por día, mes, año, cliente o rubro.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          customerIds: {
            type: "array",
            items: {
              type: "string",
            },
            minItems: 1,
            description:
              "Códigos de clientes/locales obtenidos mediante search_customers.",
          },
          categoryIds: {
            type: "array",
            items: {
              type: "string",
            },
            minItems: 1,
            description:
              "Códigos de rubros obtenidos mediante search_categories.",
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
              enum: ["day", "month", "year", "customer", "category"],
            },
            description:
              "Dimensiones por las cuales agrupar los resultados.",
          },
          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["totalAmount", "totalInvoices"],
            },
            description: "Métricas a calcular.",
          },
          dayType: {
            type: "string",
            enum: ["weekend", "weekday"],
            description:
              "Permite limitar la consulta a fines de semana o días hábiles.",
          },
        },
        required: ["dateFrom", "dateTo", "metrics"],
        additionalProperties: false,
      },
    },
  },
};
