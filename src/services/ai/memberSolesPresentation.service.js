const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 20 }).format(value ?? 0);
const allowed = new Set(["get_member_soles", "search_members", "get_member", "search_soles_types"]);

export const buildMemberSolesResponse = (calls = []) => {
  const queries = calls.filter((call) => call.name === "get_member_soles");
  if (queries.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const result = queries[0].result;
  const context = result?.queryContext;
  if (!context || !["balance", "summary", "detail"].includes(context.mode)) return null;
  const names = { current: "vigentes", expired: "vencidos", all: "de todos los estados" };
  const lines = [`**Soles ${names[context.status]} del programa de fidelización**`, "",
    `Fecha de referencia para la vigencia: ${cell(context.referenceDate)}.`];
  const memberName = result.summary?.memberName ?? result.memberName ?? result.data?.find((row) => row.memberName)?.memberName;
  if (memberName) lines.push(`Socio: ${cell(memberName)}.`);
  const generation = context.generationPeriod;
  if (generation?.dateFrom || generation?.dateTo) lines.push(`Generación: ${cell(generation.dateFrom)} a ${cell(generation.dateTo)}.`);
  const expiration = context.expirationPeriod;
  if (expiration?.dateFrom || expiration?.dateTo) lines.push(`Vencimientos: ${cell(expiration.dateFrom)} a ${cell(expiration.dateTo)}.`);
  lines.push("");
  if (context.mode === "balance") {
    if (!result.recordCount) lines.push("No se encontraron registros de soles para los filtros solicitados.");
    else lines.push(`Saldo registrado: **${number(result.balance)} soles** (${number(result.recordCount)} registros).`);
  } else if (context.mode === "detail") {
    lines.push(`Página ${result.page} de ${result.totalPages}; ${result.totalRows} registros en total.`);
    if (!(result.data ?? []).length) lines.push("No hay registros en esta página.");
    else {
      lines.push("", "| Tipo | Generados | Saldo | Generación | Vencimiento |", "| --- | --- | --- | --- | --- |");
      for (const row of result.data) lines.push(`| ${cell(row.type?.description)} | ${number(row.generatedAmount)} | ${number(row.balance)} | ${cell(row.createdAt)} | ${cell(row.expirationDate ?? "Sin vencimiento")} |`);
    }
    if (result.hasMore) lines.push("", "Puedes pedir «siguiente página» para ver más registros.");
  } else {
    const rows = Array.isArray(result.data) ? result.data : [result];
    const populated = rows.filter((row) => row.recordCount > 0);
    if (!populated.length) lines.push("No se encontraron registros de soles para los filtros solicitados.");
    else {
      const dimensionFields = { type: ["Tipo", "typeDescription"], month: ["Mes de generación", "month"], year: ["Año de generación", "year"], expirationMonth: ["Mes de vencimiento", "expirationMonth"], expirationDate: ["Vencimiento", "expirationDate"] };
      const fields = (context.groupBy ?? []).map((dimension) => dimensionFields[dimension]);
      const metrics = context.balanceOnly ? [["Saldo de soles", "balance"]] : [["Generados", "generatedAmount"], ["Saldo de soles", "balance"], ["Registros", "recordCount"]];
      lines.push(`| ${[...fields.map(([label]) => label), ...metrics.map(([label]) => label)].join(" | ")} |`);
      lines.push(`| ${Array(fields.length + metrics.length).fill("---").join(" | ")} |`);
      for (const row of populated) lines.push(`| ${[...fields.map(([, key]) => cell(row[key] ?? (key.startsWith("expiration") ? "Sin vencimiento" : "—"))), ...metrics.map(([, key]) => number(row[key]))].join(" | ")} |`);
      if (!(context.groupBy ?? []).includes("expirationDate")) lines.push("", "Puedes pedir «Detallar por vencimiento» para ver el saldo de cada tipo separado por fecha de vencimiento.");
    }
  }
  return lines.join("\n");
};

export const resolveMemberSolesPage = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[¿?¡!.,;:]/g, "").trim();
  if (!/^(siguiente|siguiente pagina|ver mas|mostrar mas)$/.test(text)) return null;
  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.role === "user" && history[index].content?.some((block) => typeof block.text === "string")) { start = index; break; }
  }
  if (start < 0) return null;
  const turn = history.slice(start);
  const calls = turn.filter((item) => item.role === "assistant").flatMap((item) => item.content ?? []).map((block) => block.toolUse).filter(Boolean);
  const queries = calls.filter((call) => call.name === "get_member_soles");
  if (queries.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const response = turn.flatMap((item) => item.content ?? []).map((block) => block.toolResult).find((item) => item?.toolUseId === queries[0].toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || result?.queryContext?.mode !== "detail") return null;
  if (!result.hasMore) return { answer: "No hay más páginas de soles para los filtros consultados." };
  return { input: { ...structuredClone(queries[0].input), referenceDate: result.queryContext.referenceDate, page: result.nextPage, rows: result.rows } };
};


export const resolveMemberSolesBreakdown = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();
  if (!/^(?:si )?(?:ahora )?(?:(?:detallar|detalla|desglosa|mostrar|muestra)(?:lo)? )?(?:el detalle )?por (?:fecha de )?vencimiento(?:s)?$/.test(text)) return null;
  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]?.role === "user" && history[index].content?.some((block) => typeof block.text === "string")) { start = index; break; }
  }
  if (start < 0) return null;
  const turn = history.slice(start);
  const calls = turn.filter((item) => item.role === "assistant").flatMap((item) => item.content ?? []).map((block) => block.toolUse).filter(Boolean);
  const queries = calls.filter((call) => call.name === "get_member_soles");
  if (queries.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const response = turn.flatMap((item) => item.content ?? []).map((block) => block.toolResult).find((item) => item?.toolUseId === queries[0].toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || !result?.queryContext?.referenceDate) return null;
  return { input: { ...structuredClone(queries[0].input), mode: "balance", groupBy: ["type", "expirationDate"], referenceDate: result.queryContext.referenceDate } };
};


// Only fully recognized requests with an explicit protected document bypass the
// model. Requery through the normal executor so permissions and balances are fresh.
export const resolveMemberSolesBalance = ({ message }) => {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
  const match = /^(?:(?:volvamos al|volver al|vuelve al|muestra el|mostrar el) )?saldo de soles de (\[PII_DOCUMENT_\d+\])(?: con fecha de referencia (\d{2}\/\d{2}\/\d{4}))?(?:\s*,?\s+por tipo de soles)?[.!?]?$/i.exec(text);
  if (!match) return null;
  return { input: { documentNumber: match[1], status: "current", mode: "balance", groupBy: ["type"],
    ...(match[2] ? { referenceDate: match[2] } : {}) } };
};
