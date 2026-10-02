export const searchCustomersTool = {
  toolSpec: {
    name: "search_customers",
    description:
      "Busca clientes o locales utilizando el nombre proporcionado por el usuario. " +
      "Debe utilizarse antes de consultar ventas de un cliente/local cuando todavía no se conoce su identificador.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Nombre o parte del nombre del cliente/local proporcionado por el usuario.",
          },
        },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
};
