// src/tools/soles/searchSolesTypes.tool.js

export const searchSolesTypesTool = {
  toolSpec: {
    name: "search_soles_types",
    description:
      "Busca y resuelve tipos de Soles del programa de fidelización de delSol Shopping. " +
      "Debe utilizarse cuando el usuario menciona un tipo de Sol por descripción y todavía no se conoce su identificador exacto.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            description:
              "Descripción del tipo de Sol mencionada por el usuario.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
};
