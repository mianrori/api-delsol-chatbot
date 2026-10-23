export const getMemberPurchasesTool = {
  toolSpec: {
    name: "get_member_purchases",
    description:
      "Obtiene compras de un socio específico. Cuando se utiliza como continuación de una consulta anterior, deben conservarse los filtros temporales y comerciales aplicables salvo que el usuario solicite modificarlos.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          documentNumber: {
            type: "string",
            description:
              "Número de documento del socio. Debe provenir de search_members o haber sido proporcionado explícitamente por el usuario.",
          },
          customerIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Códigos de locales previamente identificados mediante search_customers.",
          },
          categoryIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Códigos de rubros previamente identificados mediante search_categories.",
          },
          dateFrom: {
            type: "string",
            description:
              "Fecha inicial DD/MM/YYYY. En consultas de seguimiento debe reutilizarse la fecha inicial anterior cuando siga siendo aplicable.",
          },
          dateTo: {
            type: "string",
            description:
              "Fecha final DD/MM/YYYY. En consultas de seguimiento debe reutilizarse la fecha final anterior cuando siga siendo aplicable.",
          },
          mode: {
            type: "string",
            enum: ["summary", "detail"],
            description:
              "summary para totales o agrupaciones; detail para compras individuales.",
          },
          groupBy: {
            type: "array",
            items: {
              type: "string",
              enum: ["month", "year", "customer", "category"],
            },
            description:
              "Dimensiones por las cuales agrupar el resultado.",
          },
          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["totalAmount", "purchaseCount"],
            },
            description:
              "Métricas a calcular cuando mode es summary.",
          },
          page: {
            type: "integer",
            minimum: 1,
            description:
              "Página a devolver cuando mode es detail. Por defecto 1.",
          },
          rows: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description:
              "Cantidad de registros por página cuando mode es detail. Por defecto 50.",
          },
        },
        required: ["documentNumber"],
        additionalProperties: false,
      },
    },
  },
};
