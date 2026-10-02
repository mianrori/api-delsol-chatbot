export const getSalesTool = {
  toolSpec: {
    name: "get_sales",
    description:
      "Consulta ventas para un período determinado y permite agrupar por día, mes o año.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
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
              enum: ["day", "month", "year"],
            },
            description: "Dimensiones temporales para agrupar las ventas.",
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
