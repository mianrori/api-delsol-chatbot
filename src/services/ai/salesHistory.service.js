// Resolved identifiers and filters remain reusable; an old exported sample is
// not a current sales result or proof that a download is still available.
export const SALES_REFRESH_INSTRUCTION = "La respuesta anterior intentó reutilizar una muestra histórica de ventas sin una consulta actual. No la repitas. Ejecuta get_sales para responder la solicitud actual, reutilizando únicamente identificadores resueltos y los filtros aplicables del historial. Respeta todos los cambios solicitados; no copies filtros de otro tema. Si faltan datos para consultar, pide aclaración. No entregues cifras ni ofrezcas exportación sin un resultado actual.";

export const needsSalesRefresh = ({ message, answer, history = [], calls = [], chartRequested = false }) => {
  if (chartRequested || calls.some((call) => !call.name.startsWith("search_"))) return false;
  const uses = new Map();
  let hasSample = false, latestBusiness = null;
  for (const item of history) for (const block of item.content ?? []) {
    if (block.toolUse) {
      uses.set(block.toolUse.toolUseId, block.toolUse.name);
      if (!block.toolUse.name.startsWith("search_") && block.toolUse.name !== "generate_chart") latestBusiness = block.toolUse.name;
    }
    const response = block.toolResult;
    if (response?.status !== "success" || uses.get(response.toolUseId) !== "get_sales") continue;
    const result = response.content?.find((content) => content.json)?.json;
    if (result?.resultSet?.truncated && result.resultSet.fullResultAvailableInExport) hasSample = true;
  }
  if (!hasSample) return false;
  const explicitSales = /\bventas?\b/i.test(String(message));
  const request = String(message).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const anotherTopic = /\b(vehiculos?|matriculas?|chapas?|soles|contratos?|compras?|socios?|campanas?|promociones?)\b/i.test(request);
  if (!explicitSales && (latestBusiness !== "get_sales" || anotherTopic)) return false;
  // Clarifications, greetings and conceptual answers need no data refresh.
  return /\|[^\n]+\|/.test(String(answer)) || /(?:₲|\bventas?\b)[^\n]*\d/i.test(String(answer));
};
