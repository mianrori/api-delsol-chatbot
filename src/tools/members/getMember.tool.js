export const getMemberTool = {
  toolSpec: {
    name: "get_member",
    description:
      "Obtiene los datos de un socio previamente identificado mediante su número de documento.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          documentNumber: {
            type: "string",
            description:
              "Número de documento del socio obtenido previamente mediante search_members o proporcionado explícitamente por el usuario.",
          },
        },
        required: ["documentNumber"],
        additionalProperties: false,
      },
    },
  },
};
