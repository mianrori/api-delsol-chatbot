const keys = new Set(["customerId", "dateFrom", "dateTo", "groupBy", "localNumber", "contractType", "contractSeries", "contractNumber"]);
export const preserveContractIncidenceFollowup = ({ message, history = [], input }) => {
  const text = String(message ?? "").normalize("NFC").trim();
  const period = /^Ahora cambia el per[ií]odo a (\d{2}\/\d{2}\/\d{4}) al (\d{2}\/\d{2}\/\d{4}); conserva los dem[aá]s filtros[.!]?$/i.exec(text);
  const local = /^Ahora cambia el local a "[^"\r\n]+"; conserva los dem[aá]s filtros[.!]?$/i.test(text);
  const grouping = /^Ahora muestra (por mes|el resumen); conserva los dem[aá]s filtros[.!]?$/i.exec(text);
  if ((!period && !local && !grouping) || !input || Object.keys(input).some((k) => !keys.has(k))) return null;
  let start = -1;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "user" && history[i].content?.some((b) => typeof b.text === "string")) { start = i; break; }
  if (start < 0) return null;
  const blocks = history.slice(start + 1).flatMap((m) => m.content ?? []), calls = blocks.map((b) => b.toolUse).filter(Boolean);
  const queries = calls.filter((c) => c.name === "analyze_contract_cost_incidence");
  if (queries.length !== 1 || calls.some((c) => !["analyze_contract_cost_incidence", "search_customers"].includes(c.name))) return null;
  const previous = queries[0], block = blocks.map((b) => b.toolResult).find((b) => b?.toolUseId === previous.toolUseId);
  const result = block?.content?.find((b) => b.json)?.json;
  if (block?.status !== "success" || !result || result.error || result.success === false || !previous.input
    || Object.keys(previous.input).some((k) => !keys.has(k)) || result.dateFrom !== previous.input.dateFrom || result.dateTo !== previous.input.dateTo) return null;
  if (period) return input.dateFrom === period[1] && input.dateTo === period[2] ? { ...structuredClone(previous.input), dateFrom: period[1], dateTo: period[2] } : null;
  if (grouping) return { ...structuredClone(previous.input), groupBy: grouping[1].toLowerCase() === "por mes" ? "month" : "summary" };
  return typeof input.customerId === "string" && input.customerId.trim() ? { ...structuredClone(previous.input), customerId: input.customerId } : null;
};
