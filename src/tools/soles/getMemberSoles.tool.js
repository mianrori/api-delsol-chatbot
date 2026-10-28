// src/tools/soles/getMemberSoles.tool.js

export const getMemberSolesTool = {
  toolSpec: {
    name: "get_member_soles",

    description:
      "Consulta Soles del programa de fidelización de un socio. Para Saldo de soles de X o Cuántos soles dispone X, usar status=current y mode=balance, sin fechas ni tipos adicionales salvo petición del usuario. " +
      "Permite obtener saldo vigente, detalle de Soles vigentes o vencidos, históricos, próximos vencimientos y resúmenes.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          documentNumber: {
            type: "string",
            minLength: 1,
            description: "Número de documento del socio previamente resuelto.",
          },

          typeIds: {
            type: "array",
            items: {
              type: ["integer", "string"],
            },
            description: "Tipos previamente resueltos por search_soles_types; conservar exactamente los identificadores o tokens recibidos.",
          },

          status: {
            type: "string",
            enum: ["current", "expired", "all"],
            default: "current",
          },

          mode: {
            type: "string",
            enum: ["balance", "detail", "summary"],
            description: "balance y summary conservan siempre el tipo de soles. balance muestra el saldo por tipo; para detalle por vencimiento añadir groupBy=[type,expirationDate].",
          },

          groupBy: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "type",
                "month",
                "year",
                "expirationMonth",
                "expirationDate",
              ],
            },
            description:
              "Dimensiones para agrupar los resultados. " +
              "expirationDate permite separar los saldos por fecha exacta de vencimiento.",
          },

          referenceDate: {
            type: "string",
            description:
              "Fecha de referencia DD/MM/YYYY. Si se omite, se usa la fecha actual.",
          },

          useCurrentGenerationPeriod: {
            type: "boolean",
            default: true,
            description:
              "Para vencidos, limita por defecto al período actual iniciado el 1 de noviembre. " +
              "Usar false solo para histórico completo.",
          },

          generationDateFrom: {
            type: "string",
            description: "Fecha inicial explícita de generación DD/MM/YYYY.",
          },

          generationDateTo: {
            type: "string",
            description: "Fecha final explícita de generación DD/MM/YYYY.",
          },

          expirationDateFrom: {
            type: "string",
            description: "Fecha inicial de vencimiento DD/MM/YYYY.",
          },

          expirationDateTo: {
            type: "string",
            description: "Fecha final de vencimiento DD/MM/YYYY.",
          },

          page: {
            type: "integer",
            minimum: 1,
            default: 1,
          },

          rows: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
          },
        },

        required: ["documentNumber"],

        additionalProperties: false,
      },
    },
  },
};
