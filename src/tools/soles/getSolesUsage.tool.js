export const getSolesUsageTool = {
  "toolSpec": {
    "name": "get_soles_usage",
    "description": "Consulta Soles utilizados por socios. Permite detalle, totales, agrupaciones, rankings y métricas por socio, período, tipo de movimiento, destino, tipo de destino y tipo de Sol.",
    "inputSchema": {
      "json": {
        "type": "object",
        "properties": {
          "documentNumber": {
            "type": [
              "string",
              "null"
            ],
            "description": "Número de documento del socio. Debe provenir de search_members o de un dato explícito del usuario. Null para consultas globales."
          },
          "dateFrom": {
            "type": [
              "string",
              "null"
            ],
            "description": "Fecha inicial inclusive en formato DD/MM/YYYY."
          },
          "dateTo": {
            "type": [
              "string",
              "null"
            ],
            "description": "Fecha final inclusive en formato DD/MM/YYYY."
          },
          "movementTypes": {
            "type": "array",
            "description": "Tipos exactos de movimiento previamente resueltos desde los datos. No inventar valores.",
            "items": {
              "type": "string"
            }
          },
          "destinationTypes": {
            "type": "array",
            "description": "Tipos exactos de destino previamente disponibles en los datos. No inventar valores.",
            "items": {
              "type": "string"
            }
          },
          "destinations": {
            "type": "array",
            "description": "Destinos exactos previamente resueltos mediante search_soles_usage_destinations.",
            "items": {
              "type": "object",
              "properties": {
                "destinationType": {
                  "type": "string"
                },
                "destinationCode": {
                  "type": "string"
                }
              },
              "required": [
                "destinationType",
                "destinationCode"
              ],
              "additionalProperties": false
            }
          },
          "solesTypeIds": {
            "type": "array",
            "description": "Identificadores de tipos de Sol previamente resueltos. No inventar IDs.",
            "items": {
              "type": [
                "integer",
                "string"
              ]
            }
          },
          "categoryIds": {
            "type": "array",
            "description": "Códigos de rubros previamente resueltos mediante search_categories. Vacío para no filtrar por rubro.",
            "items": {
              "type": "string"
            }
          },
          "transactionNumber": {
            "type": [
              "integer",
              "string",
              "null"
            ],
            "description": "Número de transacción exacto cuando el usuario solicita una operación específica."
          },
          "solesMin": {
            "type": [
              "number",
              "null"
            ],
            "description": "Cantidad mínima de Soles utilizados por movimiento."
          },
          "solesMax": {
            "type": [
              "number",
              "null"
            ],
            "description": "Cantidad máxima de Soles utilizados por movimiento."
          },
          "mode": {
            "type": "string",
            "enum": [
              "detail",
              "summary"
            ],
            "description": "detail para movimientos individuales; summary para totales, agrupaciones o rankings."
          },
          "groupBy": {
            "type": "array",
            "description": "Dimensiones de agrupación para mode=summary.",
            "items": {
              "type": "string",
              "enum": [
                "member",
                "movementType",
                "destinationType",
                "destination",
                "solesType",
                "category",
                "day",
                "month",
                "year"
              ]
            }
          },
          "metrics": {
            "type": "array",
            "description": "Métricas requeridas para mode=summary.",
            "items": {
              "type": "string",
              "enum": [
                "totalSolesUsed",
                "movementCount",
                "transactionCount",
                "averageSolesUsed",
                "minSolesUsed",
                "maxSolesUsed",
                "distinctDestinations",
                "distinctMembers",
                "lastUsageDate"
              ]
            }
          },
          "orderBy": {
            "type": [
              "string",
              "null"
            ],
            "enum": [
              "totalSolesUsed",
              "movementCount",
              "transactionCount",
              "averageSolesUsed",
              "minSolesUsed",
              "maxSolesUsed",
              "distinctDestinations",
              "distinctMembers",
              "movementDate",
              "solesUsed",
              "transactionNumber",
              null,
              "lastUsageDate"
            ],
            "description": "Métrica para rankings o campo de orden para mode=detail."
          },
          "orderDirection": {
            "type": "string",
            "enum": [
              "asc",
              "desc"
            ]
          },
          "limit": {
            "type": [
              "number",
              "null"
            ],
            "description": "Cantidad máxima de filas de un resumen/ranking."
          },
          "page": {
            "type": [
              "number",
              "null"
            ],
            "description": "Página para mode=detail."
          },
          "pageSize": {
            "type": [
              "number",
              "null"
            ],
            "description": "Cantidad de movimientos por página. Máximo 200."
          }
        },
        "required": [],
        "additionalProperties": false
      }
    }
  }
};
