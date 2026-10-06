// src/tools/contracts/getContractConditions.tool.js

export const getContractConditionsTool = {
  toolSpec: {
    name: "get_contract_conditions",

    description:
      "Consulta condiciones contractuales de un cliente/local de delSol Shopping. " +
      "Puede devolver cabecera, superficies, conceptos configurados y el último " +
      "importe facturado sin IVA de cada concepto.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          customerId: {
            type: "string",
            minLength: 1,
            description: "Código del cliente/local previamente resuelto.",
          },

          localNumber: {
            type: "string",
            description:
              "Número de local cuando sea necesario desambiguar contratos activos.",
          },

          contractType: {
            type: "string",
            description: "Tipo exacto de contrato previamente resuelto.",
          },

          contractSeries: {
            type: "string",
            description: "Serie exacta del contrato previamente resuelto.",
          },

          contractNumber: {
            type: "integer",
            description: "Número exacto del contrato previamente resuelto.",
          },

          includeConcepts: {
            type: "boolean",
            default: true,
            description:
              "Usar false para consultas únicamente de cabecera, como superficie o vencimiento.",
          },

          includeLastBilledAmounts: {
            type: "boolean",
            default: true,
            description:
              "Completa los conceptos con el último importe facturado sin IVA.",
          },
        },

        required: ["customerId"],
        additionalProperties: false,
      },
    },
  },
};
