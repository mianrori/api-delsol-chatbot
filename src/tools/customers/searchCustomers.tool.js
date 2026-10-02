export const searchCustomersTool = {
  toolSpec: {
    name: "search_customers",
    description:
      "Busca clientes, marcas o locales comerciales por nombre. " +
      "Debe utilizarse cuando el usuario menciona un nombre propio comercial como Nike, Adidas, Zara, Cines, " +
      "un local o una marca, y todavía no se conoce su identificador. " +
      "No debe reemplazarse por search_categories salvo que el usuario esté hablando explícitamente de un rubro o categoría.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Nombre o parte del nombre del cliente, marca o local proporcionado por el usuario.",
          },
        },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
};
