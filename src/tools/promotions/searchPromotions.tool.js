export const searchPromotionsTool = {
  toolSpec: {
    name: "search_promotions",

    description:
      "Busca promociones y campañas por nombre o identificador. " +
      "Debe utilizarse cuando el usuario menciona una promoción o campaña " +
      "pero todavía no se conocen con certeza sus identificadores. Incluye coincidencias parciales, total de resultados y paginación; no asumas que una página es la lista completa.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          page: { type: "integer", minimum: 1, description: "Página solicitada; usar nextPage para ver más coincidencias con el mismo search y rows." },
          rows: { type: "integer", minimum: 1, maximum: 50, description: "Tamaño de página; conservarlo al avanzar." },
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
