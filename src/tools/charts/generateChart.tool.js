export const generateChartTool = { toolSpec: {
  name: "generate_chart",
  description: "Genera un gráfico con los datos exactos de un resultado de consulta aplicable. No recibe valores numéricos del modelo: selecciona filas y campos del resultado mediante rutas. No consulta Oracle. Usar solo cuando el usuario pida el gráfico. No graficar muestras limitadas ni detalles paginados; obtener primero un resumen completo. No mezclar unidades ni monedas.",
  inputSchema: { json: { type: "object", properties: {
    sourceToolUseId: { type: "string", description: "toolUseId de la consulta de negocio exitosa del turno actual o tema inmediatamente anterior. No usar un ID de búsqueda/resolución ni inventarlo." },
    type: { type: "string", enum: ["bar", "horizontalBar", "line", "pie"] },
    title: { type: "string", maxLength: 150 },
    dataPath: { type: "string", description: "Ruta al array completo del resultado, por defecto data. Ejemplo: data o periods. Campos separados por punto; se admiten índices numéricos de arrays existentes." },
    labelPaths: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" }, description: "Campos de etiqueta de cada fila, en orden. Ejemplos month, customer.name, dimensions.0.name, solesTypeDescription. Usar nombres comerciales, no IDs." },
    datasets: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", properties: {
      label: { type: "string", maxLength: 80 }, valuePath: { type: "string", description: "Ruta a la métrica numérica explícita de cada fila, por ejemplo vehicleCount, totalAmount, percentage o totalSolesUsed. No enviar valores ni calcularlos." },
    }, required: ["label", "valuePath"], additionalProperties: false } },
    width: { type: "integer", minimum: 300, maximum: 999 }, height: { type: "integer", minimum: 250, maximum: 999 },
  }, required: ["sourceToolUseId", "type", "labelPaths", "datasets"], additionalProperties: false } },
} };
