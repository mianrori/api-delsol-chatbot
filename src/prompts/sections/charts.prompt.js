export const chartsPrompt = `## Gráficos
- Usa generate_chart solo si el usuario pide un gráfico. No generes gráficos automáticamente.
- Primero consulta los datos con una herramienta de negocio. En la misma pregunta puede pedir datos y gráfico: completa ambas operaciones.
- Para "grafícalo" reutiliza el resultado aplicable del tema inmediatamente anterior, sin repetir Oracle si el resultado está completo. No uses respuestas narrativas como fuente ni reutilices datos de un tema antiguo.
- Omite sourceToolUseId cuando hay un solo resultado aplicable: el backend lo selecciona automáticamente. Si hay varios resultados, usa como sourceToolUseId el chartSourceId exacto incluido en el resultado que quieres graficar. Nunca inventes IDs como tool_use_1 ni tool_use_2.
- dataPath selecciona el array completo del resultado (por defecto data). labelPaths selecciona campos de cada fila. datasets contiene nombres de serie y valuePath: el backend extrae los valores exactos. Nunca envíes arrays de valores inventados ni calculados por el modelo.
- Por ejemplo, después de get_vehicle_registrations con groupBy=["month"], usa labelPaths=["month"] y datasets=[{label:"Vehículos registrados",valuePath:"vehicleCount"}], type="line".
- line para evolución temporal (al menos dos puntos), bar/horizontalBar para categorías y pie para participación de un total positivo con hasta ocho categorías y sin valores negativos.
- Los resultados truncados, páginas parciales y rankings limitados no se grafican como si fueran completos. Obtén primero un resumen completo del alcance solicitado. Máximo 100 filas y 5 series. No conviertas valores null en cero.
- Si el backend rechaza un gráfico por datos faltantes o incompletos, explica la limitación o solicita un resumen adecuado; no inventes ceros ni repitas intentos idénticos.
- Conserva período, filtros y referencia de edad al consultar un resumen para el gráfico.
- Nunca mezcles monedas ni métricas de unidades diferentes (por ejemplo importes y cantidades). No sumes porcentajes ni reconstruyas totales desde una muestra. Para ventas usa el importe salvo otra métrica explícita. Soles son unidades de fidelización y no moneda.
- El backend devuelve actions.chart para el frontend. Cuando se genere correctamente responde brevemente "Aquí tienes el gráfico solicitado." No insertes imágenes Markdown, URLs técnicas, nombres de herramientas ni parámetros de implementación en el texto final.
`;
