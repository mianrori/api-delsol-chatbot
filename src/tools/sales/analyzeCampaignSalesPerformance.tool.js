// src/tools/sales/analyzeCampaignSalesPerformance.tool.js

export const analyzeCampaignSalesPerformanceTool = {
  toolSpec: {
    name: "analyze_campaign_sales_performance",

    description:
      "Compara el desempeño de ventas antes, durante y después de una campaña o promoción. " +
      "Utiliza períodos equivalentes de igual duración que la campaña. " +
      "Las fechas e identificadores de la campaña deben provenir de una resolución previa mediante search_promotions. " +
      "Permite aplicar los mismos filtros de locales y rubros a los tres períodos.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          promotionId: {
            type: "string",

            description:
              "Identificador de la promoción previamente obtenido mediante search_promotions.",
          },

          campaignId: {
            type: "string",

            description:
              "Identificador de la campaña previamente obtenido mediante search_promotions.",
          },

          promotionName: {
            type: "string",

            description:
              "Nombre de la promoción exactamente como fue retornado por search_promotions.",
          },

          campaignName: {
            type: "string",

            description:
              "Nombre de la campaña exactamente como fue retornado por search_promotions.",
          },

          campaignDateFrom: {
            type: "string",

            description:
              "Fecha inicial de vigencia de la campaña en formato DD/MM/YYYY. Debe reutilizarse exactamente desde el resultado de search_promotions.",
          },

          campaignDateTo: {
            type: "string",

            description:
              "Fecha final de vigencia de la campaña en formato DD/MM/YYYY. Debe reutilizarse exactamente desde el resultado de search_promotions.",
          },

          customerIds: {
            type: "array",

            items: {
              type: "string",
            },

            minItems: 1,

            description:
              "Códigos de locales previamente resueltos. Aplicar únicamente cuando el usuario haya restringido el análisis a locales específicos o cuando esos identificadores estén disponibles explícitamente en el contexto de la campaña.",
          },

          categoryIds: {
            type: "array",

            items: {
              type: "string",
            },

            minItems: 1,

            description:
              "Códigos de rubros previamente resueltos. Aplicar únicamente cuando el usuario haya restringido el análisis a rubros específicos o cuando esos identificadores estén disponibles explícitamente en el contexto de la campaña.",
          },
        },

        required: ["promotionId", "campaignId", "campaignDateFrom", "campaignDateTo"],

        additionalProperties: false,
      },
    },
  },
};
