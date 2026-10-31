export const getMemberVehiclesTool = {
  toolSpec: {
    name: "get_member_vehicles",

    description:
      "Obtiene vehículos registrados por un socio o consulta directamente un vehículo por matrícula/chapa. " +
      "Si se proporciona documentNumber, devuelve los vehículos asociados al socio. " +
      "Si se proporciona plate, consulta directamente esa matrícula sin necesidad de ejecutar search_members. " +
      "Cuando la consulta es por matrícula, el resultado puede incluir datos del propietario además de los datos del vehículo. " +
      "Devuelve exclusivamente vehículos con ACTIVO=S; los inactivos son borrados lógicos. " +
      "Permite consultar únicamente vehículos activos y filtrar por débito automático.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          documentNumber: {
            type: "string",

            description:
              "Número de documento del socio. " +
              "Utilizar cuando la consulta parte de un socio previamente identificado. " +
              "No es obligatorio si se proporciona plate.",
          },

          activeOnly: {
            type: "boolean",
            enum: [true],

            description:
              "Siempre true: solo se consultan vehículos activos. " +
              "Si se omite, se aplica igualmente ACTIVO=S; los inactivos son borrados lógicos.",
          },

          plate: {
            type: "string",

            description:
              "Matrícula o chapa específica del vehículo. " +
              "Cuando el usuario proporciona una matrícula, utilizar este campo directamente sin ejecutar search_members. " +
              "Puede utilizarse sin documentNumber.",
          },

          automaticDebit: {
            type: "boolean",

            description:
              "true para vehículos con débito automático y false para vehículos sin débito automático.",
          },
        },

        anyOf: [
          {
            required: ["documentNumber"],
          },
          {
            required: ["plate"],
          },
        ],

        additionalProperties: false,
      },
    },
  },
};
