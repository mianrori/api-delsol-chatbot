export const searchCategoriesTool = {
  toolSpec: {
    name: "search_categories",
    description:
      "Busca rubros o categorías comerciales por nombre, por ejemplo librería, gastronomía, indumentaria o electrónica. " +
      "Debe utilizarse cuando el usuario habla explícitamente de un rubro, categoría o tipo de comercio. " +
      "No debe utilizarse para resolver nombres propios de marcas o locales como Nike, Adidas, Zara o Cines.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Nombre completo o parcial del rubro o categoría mencionado por el usuario.",
          },
        },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
};
