export const searchMembersTool = {
  toolSpec: {
    name: "search_members",
    description:
      "Busca socios por nombre, apellido, nombre completo, número de documento, email o teléfono. " +
      "Debe utilizarse cuando el usuario menciona un socio pero todavía no se conoce " +
      "con certeza su número de documento. Admite errores ortográficos en nombres.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Nombre, apellido, nombre completo, número de documento, email o teléfono proporcionado por el usuario.",
          },
        },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
};
