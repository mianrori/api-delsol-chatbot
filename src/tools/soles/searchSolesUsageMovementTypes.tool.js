export const searchSolesUsageMovementTypesTool = {
  "toolSpec": {
    "name": "search_soles_usage_movement_types",
    "description": "Busca los valores reales de tipo de movimiento disponibles en Soles utilizados. Debe utilizarse antes de filtrar por una descripción de movimiento cuando todavía no se conoce el valor exacto almacenado.",
    "inputSchema": {
      "json": {
        "type": "object",
        "properties": {
          "search": {
            "type": "string",
            "description": "Texto del tipo de movimiento indicado por el usuario. Omitir o enviar vacío para listar los tipos existentes; no inventar términos de búsqueda."
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
