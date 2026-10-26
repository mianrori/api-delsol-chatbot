export const analyzeMembersTool = {
  toolSpec: {
    name: "analyze_members",

    description:
      "Analiza, segmenta y rankea conjuntos de socios de delSol Shopping " +
      "utilizando datos demográficos y comportamiento de compras. Permite " +
      "consultar actividad comercial, recurrencia, montos, períodos de compra, " +
      "género, edad, cumpleaños, rankings y desgloses por rubro, local, género, " +
      "mes o año. También puede reutilizarse en consultas de seguimiento para " +
      "cambiar el desglose conservando los filtros y períodos anteriores. Para " +
      "comparaciones entre períodos como 2022 vs 2023, si se necesita mantener " +
      "los resultados separados por período, ejecuta analyze_members una vez por " +
      "cada período con los mismos filtros, métricas y breakdownBy. No reutilices " +
      "los valores de un período para representar otro. Para socios activos no es " +
      "necesario indicar purchasePeriods: si no se especifica un período, el " +
      "backend utiliza activityMonths, con 12 meses por defecto.",

    inputSchema: {
      json: {
        type: "object",

        properties: {
          birthMonth: {
            type: "integer",
            minimum: 1,
            maximum: 12,
            description:
              "Mes de nacimiento del socio. Enero=1, febrero=2, marzo=3, " +
              "abril=4, mayo=5, junio=6, julio=7, agosto=8, septiembre=9, " +
              "octubre=10, noviembre=11 y diciembre=12.",
          },

          gender: {
            type: "string",
            enum: ["male", "female"],
            description:
              "Filtro opcional por género. Utiliza male para hombres y female " +
              "para mujeres. Si el usuario quiere comparar o separar ambos " +
              "géneros, no uses este filtro; utiliza breakdownBy=['gender'].",
          },

          ageMin: {
            type: "integer",
            minimum: 0,
            description:
              "Edad actual mínima opcional. No es la edad durante el período de compras. No es obligatoria para consultar socios.",
          },

          ageMax: {
            type: "integer",
            minimum: 0,
            description:
              "Edad actual máxima opcional. No es la edad durante el período de compras. No es obligatoria para consultar socios.",
          },

          activityStatus: {
            type: "string",
            enum: ["active", "inactive"],
            description:
              "Actividad comercial del socio. active significa que realizó al " +
              "menos una compra dentro de la ventana definida por activityMonths. " +
              "inactive significa que no realizó compras dentro de esa ventana. " +
              "No corresponde al campo ACTIVO de VW_BOT_SOCIOS.",
          },

          activityMonths: {
            type: "integer",
            minimum: 1,
            maximum: 120,
            description:
              "Cantidad de meses calendario utilizada para determinar actividad " +
              "comercial y recurrencia. Es opcional. Si el usuario no especifica " +
              "un valor, el backend utiliza 12 meses por defecto.",
          },

          referenceDate: {
            type: "string",
            description:
              "Fecha de referencia opcional en formato DD/MM/YYYY. Si no se " +
              "especifica, el backend utiliza la fecha actual del servidor.",
          },

          purchasePeriods: {
            type: "array",
            maxItems: 24,

            description:
              "Períodos específicos de compra. Es opcional. Utilízalo cuando el " +
              "usuario indique explícitamente uno o más períodos, por ejemplo " +
              "agosto 2022 o todo 2023. Si el usuario pide una comparación como " +
              "'2022 vs 2023' y los resultados deben permanecer separados por año, " +
              "prefiere ejecutar analyze_members una vez para 2022 y otra para 2023 " +
              "con los mismos filtros, métricas y breakdownBy. Usa varios períodos " +
              "en una misma llamada solamente cuando la intención sea evaluar si un " +
              "socio compró en todos o en cualquiera de esos períodos. Para socios " +
              "activos no es necesario enviarlo si el usuario no indicó fechas.",

            items: {
              type: "object",

              properties: {
                label: {
                  type: "string",
                  description: "Etiqueta descriptiva opcional del período.",
                },

                dateFrom: {
                  type: "string",
                  description:
                    "Fecha inicial del período en formato DD/MM/YYYY.",
                },

                dateTo: {
                  type: "string",
                  description: "Fecha final del período en formato DD/MM/YYYY.",
                },
              },

              required: ["dateFrom", "dateTo"],

              additionalProperties: false,
            },
          },

          purchasePeriodMatch: {
            type: "string",
            enum: ["all", "any"],
            description:
              "Define cómo interpretar varios purchasePeriods dentro de una misma " +
              "llamada. all exige que el socio tenga compras en todos los períodos; " +
              "any exige compras en al menos uno. Úsalo para condiciones de inclusión, " +
              "por ejemplo 'socios que compraron tanto en 2022 como en 2023' => all. " +
              "No lo uses para resolver una comparación '2022 vs 2023' cuando se " +
              "necesitan métricas separadas por período; en ese caso ejecuta una " +
              "llamada independiente por cada período.",
          },

          customerIds: {
            type: "array",

            items: {
              type: "string",
            },

            description:
              "Códigos de locales previamente resueltos mediante search_customers. " +
              "Nunca inventes estos valores.",
          },

          categoryIds: {
            type: "array",

            items: {
              type: "string",
            },

            description:
              "Códigos de rubros previamente resueltos mediante search_categories. " +
              "Nunca inventes estos valores.",
          },

          amountMin: {
            type: "number",
            minimum: 0,
            description:
              "Monto total mínimo opcional para filtrar socios. Utilízalo solo " +
              "cuando el usuario indique explícitamente el límite.",
          },

          amountMax: {
            type: "number",
            minimum: 0,
            description:
              "Monto total máximo opcional para filtrar socios. Utilízalo solo " +
              "cuando el usuario indique explícitamente el límite.",
          },

          recurrenceMin: {
            type: "integer",
            minimum: 0,
            description:
              "Cantidad mínima opcional de meses distintos con compras dentro " +
              "de la ventana analizada.",
          },

          recurrenceMax: {
            type: "integer",
            minimum: 0,
            description:
              "Cantidad máxima opcional de meses distintos con compras dentro " +
              "de la ventana analizada.",
          },

          amountSegments: {
            type: "array",

            description:
              "Rangos monetarios proporcionados explícitamente por el usuario " +
              "para segmentar socios. Nunca deben inventarse, sugerirse ni " +
              "inferirse automáticamente.",

            items: {
              type: "object",

              properties: {
                label: {
                  type: "string",
                },

                min: {
                  type: "number",
                  minimum: 0,
                },

                max: {
                  type: "number",
                  minimum: 0,
                },
              },

              required: ["label", "min", "max"],

              additionalProperties: false,
            },
          },

          recurrenceSegments: {
            type: "array",

            description:
              "Rangos de meses de recurrencia proporcionados explícitamente " +
              "por el usuario. Nunca deben inventarse, sugerirse ni inferirse " +
              "automáticamente.",

            items: {
              type: "object",

              properties: {
                label: {
                  type: "string",
                },

                min: {
                  type: "integer",
                  minimum: 0,
                },

                max: {
                  type: "integer",
                  minimum: 0,
                },
              },

              required: ["label", "min", "max"],

              additionalProperties: false,
            },
          },

          breakdownBy: {
            type: "array",

            description:
              "Desgloses opcionales del resultado. Usa category cuando el usuario " +
              "pida rubro, categoría o tipo de comercio; customer cuando pida local " +
              "o comercio; gender para género; month para mes; year para año; " +
              "amountSegment para rangos monetarios proporcionados por el usuario y " +
              "recurrenceSegment para rangos de recurrencia proporcionados por el " +
              "usuario. En consultas de seguimiento como 'detalla por rubro', " +
              "'ahora por local' o 'sepáralo por género', conserva los filtros, " +
              "períodos y demás condiciones aplicables de la consulta anterior y " +
              "vuelve a ejecutar analyze_members con el breakdownBy solicitado. " +
              "No afirmes que un desglose por rubro, local, género, mes o año no está " +
              "disponible si aparece en este enum. Si una comparación entre períodos " +
              "requiere el mismo desglose para cada período, ejecuta una llamada por " +
              "período cuando sea necesario para preservar la separación temporal.",

            items: {
              type: "string",

              enum: [
                "category",
                "customer",
                "gender",
                "month",
                "year",
                "amountSegment",
                "recurrenceSegment",
              ],
            },
          },

          metrics: {
            type: "array",

            description:
              "Métricas opcionales a devolver. totalAmount=importe total de compras, " +
              "sin información sobre IVA: nunca lo describas como facturado, neto, bruto, con IVA o sin IVA. " +
              "purchaseCount=cantidad de compras y recurrenceMonths=cantidad de " +
              "meses distintos con al menos una compra. En comparaciones entre " +
              "períodos utiliza exactamente las mismas métricas en cada llamada. " +
              "Nunca reutilices métricas de un período para completar otro.",

            items: {
              type: "string",

              enum: ["totalAmount", "purchaseCount", "recurrenceMonths"],
            },
          },

          orderBy: {
            type: "string",

            enum: [
              "totalAmount",
              "purchaseCount",
              "recurrenceMonths",
              "fullName",
            ],

            description:
              "Criterio de orden. Para 'mejores socios' o 'top socios' sin otro " +
              "criterio explícito utiliza totalAmount.",
          },

          orderDirection: {
            type: "string",
            enum: ["asc", "desc"],
            description:
              "Dirección del orden. Para rankings de mejores socios normalmente desc.",
          },

          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description:
              "Cantidad máxima de socios a devolver. Si el usuario solicita " +
              "'los 10 mejores', utiliza 10. Si no especifica cantidad, el backend " +
              "puede aplicar su límite por defecto. En consultas de seguimiento que " +
              "solo cambian el desglose, conserva el límite/ranking anterior cuando " +
              "siga siendo aplicable.",
          },

          resultMode: {
            type: "string",
            enum: ["members", "summary"],
            description:
              "members devuelve socios individuales. summary devuelve principalmente " +
              "resúmenes, distribuciones o segmentaciones. Para comparaciones o " +
              "desgloses agregados donde no se necesitan nombres individuales, usa " +
              "summary; para rankings/listados conserva members.",
          },
        },

        additionalProperties: false,
      },
    },
  },
};
