export const buildPromotionSearchResponse = (calls = []) => {
  if (calls.length !== 1 || calls[0].name !== "search_promotions") return null;
  const result = calls[0].result;
  if (!["AMBIGUOUS", "NOT_FOUND"].includes(result?.status) || !Array.isArray(result.options)) return null;
  const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  if (result.totalRows === 0) return "No se encontraron promociones ni campañas que coincidan con la búsqueda.";
  const lines = [`Se encontraron ${result.totalRows} coincidencias. Página ${result.page} de ${result.totalPages}.`, ""];
  if (result.options.length) {
    lines.push("| Opción | Promoción | Campaña | Desde | Hasta |", "| --- | --- | --- | --- | --- |");
    for (const option of result.options) {
      lines.push(`| ${cell(option.optionId)} | ${cell(option.promotionName)} | ${cell(option.campaignName)} | ${cell(option.dateFrom)} | ${cell(option.dateTo)} |`);
    }
    lines.push("", "Indica el número de la opción que deseas consultar.");
  } else lines.push("Esta página no contiene resultados. Puedes volver a la primera página.");
  if (result.hasMore) lines.push("", "Puedes pedir «siguiente página» para ver más coincidencias.");
  return lines.join("\n");
};

export const resolvePromotionSearchPage = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();
  if (!/^(?:ver mas|mostrar mas|siguiente pagina|mas campanas|mas promociones|primera pagina|volver a la primera pagina)$/.test(text)) return null;
  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.role === "user" && history[index].content?.some((block) => typeof block.text === "string")) { start = index; break; }
  }
  if (start < 0) return null;
  const turn = history.slice(start);
  const calls = turn.filter((item) => item.role === "assistant").flatMap((item) => item.content ?? [])
    .map((block) => block.toolUse).filter(Boolean);
  if (calls.length !== 1 || calls[0].name !== "search_promotions") return null;
  const response = turn.flatMap((item) => item.content ?? []).map((block) => block.toolResult)
    .find((result) => result?.toolUseId === calls[0].toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || result?.status !== "AMBIGUOUS" || !Number.isInteger(result.rows)) return null;
  const firstPage = /primera pagina/.test(text);
  if (!firstPage && !result.hasMore) return { answer: "No hay más páginas de coincidencias para esta búsqueda. Puedes elegir una opción o precisar el nombre o año de la campaña." };
  return { input: { ...structuredClone(calls[0].input), page: firstPage ? 1 : result.nextPage, rows: result.rows } };
};
