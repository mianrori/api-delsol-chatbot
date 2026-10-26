export const searchPromotionsTool = {
  toolSpec: {
    name: "search_promotions",

    description:
      "Busca promociones y campañas por nombre o identificador. " +
      "Debe utilizarse cuando el usuario menciona una promoción o campaña " +
      "pero todavía no se conocen con certeza sus identificadores.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          search: {
            type: "string",

            description:
              "Nombre completo o parcial de la promoción o campaña, " +
              "o bien un código de promoción/campaña proporcionado por el usuario.",
          },
        },

        required: ["search"],

        additionalProperties: false,
      },
    },
  },
};
