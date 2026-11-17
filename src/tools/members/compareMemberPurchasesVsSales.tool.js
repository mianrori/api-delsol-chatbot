export const compareMemberPurchasesVsSalesTool = {
  "toolSpec": {
    "name": "compare_member_purchases_vs_sales",
    "description": "Compara el importe de canjes de facturas de socios con las ventas de los locales para un mismo período y calcula qué porcentaje representan los canjes sobre las ventas. Cuando el usuario diga 'ventas auditadas', utilizar directamente el importe de ventas disponible, sin aplicar filtros adicionales de auditoría. Cuando el usuario diga 'canje de facturas', utilizar el importe registrado de las facturas canjeadas por socios. Usar esta herramienta para preguntas de porcentaje, participación, incidencia o proporción de canjes respecto de ventas. Permite desglosar por una o dos dimensiones entre mes, año, local y rubro, además de ordenar y limitar los grupos devueltos. Los detalles técnicos de implementación son internos y nunca deben mencionarse al usuario final. Si es necesario explicar cómo se obtuvo el resultado, hacerlo únicamente en términos de negocio, indicando por ejemplo que el porcentaje se calculó comparando el importe de las facturas canjeadas con las ventas auditadas del mismo período.",
    "inputSchema": {
      "json": {
        "type": "object",
        "properties": {
          "dateFrom": {
            "type": "string",
            "description": "Fecha inicial del período en formato DD/MM/YYYY."
          },
          "dateTo": {
            "type": "string",
            "description": "Fecha final del período en formato DD/MM/YYYY."
          },
          "customerIds": {
            "type": "array",
            "description": "Códigos de locales/clientes ya resueltos previamente. No inventar IDs.",
            "items": {
              "type": "string"
            }
          },
          "categoryIds": {
            "type": "array",
            "description": "Códigos de rubros ya resueltos previamente. No inventar IDs.",
            "items": {
              "type": "string"
            }
          },
          "breakdownBy": {
            "type": "array",
            "description": "Dimensiones de desglose. Puede contener como máximo dos valores. month=mes, year=año, customer=local, category=rubro.",
            "items": {
              "type": "string",
              "enum": [
                "month",
                "year",
                "customer",
                "category"
              ]
            },
            "uniqueItems": true,
            "maxItems": 2
          },
          "orderBy": {
            "type": "string",
            "enum": [
              "percentage",
              "auditedSalesAmount",
              "exchangeAmount",
              "invoiceCount",
              "memberCount",
              "dimension"
            ],
            "description": "Criterio de ordenamiento de los grupos devueltos."
          },
          "orderDirection": {
            "type": "string",
            "enum": [
              "asc",
              "desc"
            ],
            "description": "Dirección del ordenamiento. Por defecto desc para métricas y asc para dimensión."
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Cantidad máxima de grupos a devolver después de calcular el análisis completo. Útil para top N. No usar este límite para truncar datos antes del cálculo."
          }
        },
        "required": [
          "dateFrom",
          "dateTo"
        ]
      }
    }
  }
};
