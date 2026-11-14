export const getContractCostPerSqmTool = {
  toolSpec: {
    name: "get_contract_cost_per_sqm",
    description:
      "Calcula el costo de un concepto contractual previamente resuelto por metro cuadrado. Puede devolver el resultado en PYG o USD.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          customerId: { type: "string", minLength: 1 },
          conceptCode: { type: "string", minLength: 1 },
          localNumber: { type: "string" },
          contractType: { type: "string" },
          contractSeries: { type: "string" },
          contractNumber: { type: "string" },
          targetCurrency: {
            type: "string",
            enum: ["PYG", "USD"],
            default: "PYG"
          }
        },
        required: ["customerId", "conceptCode"],
        additionalProperties: false
      }
    }
  }
};
