export const getMemberPromoPurchasesTool = {
  toolSpec: {
    name: "get_member_promo_purchases",

    description:
      "Consulta las compras de un socio que participaron en promociones. " +
      "Permite obtener detalle de facturas, totales y agrupaciones por " +
      "promoción, campaña, mes, año, local, rubro u origen bancario.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          documentNumber: {
            type: "string",
            description:
              "Número de documento del socio previamente identificado mediante search_members.",
          },

          promotionIds: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Códigos de promociones previamente identificados mediante search_promotions.",
          },

          campaignIds: {
            type: "array",
            items: {
              type: "integer",
            },
            description:
              "Códigos de campañas previamente identificados mediante search_promotions.",
          },

          customerIds: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Códigos de locales previamente identificados mediante search_customers.",
          },

          categoryIds: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Códigos de rubros previamente identificados mediante search_categories.",
          },

          dateFrom: {
            type: "string",
            description: "Fecha inicial de compra en formato DD/MM/YYYY.",
          },

          dateTo: {
            type: "string",
            description: "Fecha final de compra en formato DD/MM/YYYY.",
          },

          origin: {
            type: "string",
            enum: ["bank", "nonBank"],
            description:
              "bank filtra transacciones originadas mediante el proceso bancario de Banco Atlas. " +
              "nonBank excluye ese origen.",
          },

          mode: {
            type: "string",
            enum: ["summary", "detail"],
            description:
              "summary devuelve métricas agregadas. detail devuelve las compras individuales.",
          },

          groupBy: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "month",
                "year",
                "promotion",
                "campaign",
                "customer",
                "category",
                "bankOrigin",
              ],
            },
            description:
              "Dimensiones por las cuales se desea agrupar el resultado cuando mode es summary.",
          },

          metrics: {
            type: "array",
            items: {
              type: "string",
              enum: ["totalAmount", "purchaseCount"],
            },
            description: "Métricas a calcular cuando mode es summary.",
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
              "Cantidad de registros por página cuando mode es detail. Por defecto 20.",
          },

          knownTotalRows: {
            type: "integer",
            minimum: 0,
            description:
              "Total ya conocido de una página anterior con exactamente los mismos filtros.",
          },
        },

        required: ["documentNumber"],

        additionalProperties: false,
      },
    },
  },
};
