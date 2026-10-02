export const searchCategoriesTool = {
  toolSpec: {
    name: "search_categories",
    description:
      "Busca rubros comerciales por nombre. Debe utilizarse cuando el usuario menciona un rubro " +
      "pero todavía no se conoce su código. Admite nombres incompletos y errores ortográficos.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Nombre completo o parcial del rubro mencionado por el usuario.",
          },
        },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
};
