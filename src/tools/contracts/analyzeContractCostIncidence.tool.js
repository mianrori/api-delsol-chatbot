export const analyzeContractCostIncidenceTool = {
  toolSpec: {
    name: "analyze_contract_cost_incidence",
    description:
      "Analiza la incidencia del costo total shopping sobre las ventas auditadas " +
      "de un cliente/local para un período. Úsala también cuando el usuario se refiera " +
      "a esta métrica como incidencia de ventas, incidencia sobre ventas, incidencia " +
      "del costo, costo shopping sobre ventas, costo sobre ventas, porcentaje del costo " +
      "sobre ventas, relación costo/ventas, peso del costo sobre ventas, participación " +
      "del costo en ventas, proporción costo/ventas, ratio costo/ventas o expresiones " +
      "semánticamente equivalentes cuyo objetivo sea saber cuánto representan los costos " +
      "oficiales del shopping respecto de las ventas. No usar para ventas por m², costo " +
      "por m² ni otras incidencias ajenas al costo shopping. Utiliza exclusivamente los " +
      "conceptos oficiales configurados, importes facturados sin IVA y ventas del mismo período.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            minLength: 1,
            description:
              "Código del cliente/local previamente resuelto mediante search_customers.",
          },
          dateFrom: {
            type: "string",
            description: "Fecha inicial en formato DD/MM/YYYY.",
          },
          dateTo: {
            type: "string",
            description: "Fecha final en formato DD/MM/YYYY.",
          },
          groupBy: {
            type: "string",
            enum: ["summary", "month"],
            default: "summary",
            description:
              "Usar summary para el período completo o month para desglose mensual.",
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
            type: "string",
            description:
              "Número exacto del contrato previamente resuelto.",
          },
        },
        required: ["customerId", "dateFrom", "dateTo"],
        additionalProperties: false,
      },
    },
  },
};
