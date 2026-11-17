export const searchSolesUsageDestinationsTool = {
  "toolSpec": {
    "name": "search_soles_usage_destinations",
    "description": "Busca destinos existentes en los movimientos de Soles utilizados. Debe utilizarse cuando el usuario menciona un destino por nombre y todavía no se conoce de forma inequívoca su tipo y código.",
    "inputSchema": {
      "json": {
        "type": "object",
        "properties": {
          "search": {
            "type": "string",
            "description": "Nombre o parte del nombre del destino."
          },
          "limit": {
            "type": "number",
            "description": "Cantidad máxima de coincidencias."
          }
        },
        "required": [],
        "additionalProperties": false
      }
    }
  }
};
