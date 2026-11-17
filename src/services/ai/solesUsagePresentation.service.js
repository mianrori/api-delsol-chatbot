const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const quantity = (value) => value == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 20 }).format(value);
const allowed = new Set(["get_soles_usage", "search_members", "search_soles_types", "search_soles_usage_destinations", "search_soles_usage_movement_types", "search_categories"]);
const metricFields = {
  totalSolesUsed: "Soles utilizados", movementCount: "Movimientos", transactionCount: "Transacciones",
  averageSolesUsed: "Promedio de soles", minSolesUsed: "Mínimo de soles", maxSolesUsed: "Máximo de soles",
  distinctDestinations: "Destinos distintos", distinctMembers: "Socios distintos", lastUsageDate: "Último uso registrado",
};
const dimensionFields = {
  member: [["Socio", "memberName"]], solesType: [["Tipo de soles", "solesTypeDescription"]],
  destination: [["Tipo de destino", "destinationType"], ["Destino", "destinationName"]],
  destinationType: [["Tipo de destino", "destinationType"]], movementType: [["Movimiento", "movementType"]],
  category: [["Rubro", "categoryDescription"]], day: [["Día", "day"]], month: [["Mes", "month"]], year: [["Año", "year"]],
};

export const buildSolesUsageResponse = (calls = []) => {
  const usages = calls.filter((call) => call.name === "get_soles_usage");
  if (!usages.length) return buildSolesUsageLookupResponse(calls);
  if (usages.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const result = usages[0].result;
  if (!result || !["summary", "detail"].includes(result.mode) || !Array.isArray(result.data)) return null;
  const filters = result.queryContext ?? {};
  const lines = ["**Uso registrado de soles**", ""];
  if (filters.dateFrom || filters.dateTo) lines.push(`Período: ${cell(filters.dateFrom ?? "inicio del historial")} a ${cell(filters.dateTo ?? "fin del historial")}.`, "");
  if (result.mode === "detail") {
    const page = result.pagination;
    lines.push(`Página ${page.page} de ${page.totalPages}; ${page.totalRows} movimientos en total.`, "");
    if (!result.data.length) lines.push("No hay movimientos en esta página.");
    else {
      lines.push("| Socio | Fecha | Tipo de soles | Movimiento | Tipo de destino | Destino | Soles utilizados |", "| --- | --- | --- | --- | --- | --- | --- |");
      for (const row of result.data) lines.push(`| ${[cell(row.memberName), cell(row.movementDate), cell(row.solesTypeDescription), cell(row.movementType), cell(row.destinationType), cell(row.destinationName), quantity(row.solesUsed)].join(" | ")} |`);
    }
    if (page.hasMore) lines.push("", "Puedes pedir «siguiente página» para ver más movimientos.");
  } else {
    const ranking = result.rankingBy === "member";
    const rows = ranking ? result.data.flatMap((member) => member.solesTypes.map((row) => ({ ...row, memberName: member.memberName }))) : result.data;
    if (!rows.length) lines.push("No se encontraron usos de soles para los filtros solicitados.");
    else {
      const dimensions = ranking ? ["member", "solesType"] : result.groupBy;
      const fields = (dimensions ?? []).flatMap((key) => dimensionFields[key] ?? []);
      const uniqueFields = fields.filter((field, index) => fields.findIndex((candidate) => candidate[1] === field[1]) === index);
      const metrics = result.metrics ?? ["totalSolesUsed", "movementCount"];
      lines.push(`| ${[...uniqueFields.map(([label]) => label), ...metrics.map((metric) => metricFields[metric])].join(" | ")} |`);
      lines.push(`| ${Array(uniqueFields.length + metrics.length).fill("---").join(" | ")} |`);
      for (const row of rows) lines.push(`| ${[...uniqueFields.map(([, key]) => cell(row[key])), ...metrics.map((metric) => metric === "lastUsageDate" ? cell(row[metric]) : quantity(row[metric]))].join(" | ")} |`);
    }
    if (result.summary?.hasMore) lines.push("", ranking
      ? `Se muestran ${result.summary.returnedMembers} de ${result.summary.totalMembers} socios, con sus tipos de soles.`
      : `Se muestran ${result.summary.returnedGroups} de ${result.summary.totalGroups} grupos según el orden solicitado.`);
  }
  lines.push("", "Las cantidades corresponden a usos registrados; no representan el saldo vigente de soles.");
  return lines.join("\n");
};

export const resolveSolesUsagePage = ({ message, history = [] }) => {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[¿?¡!.,;:]/g, "").trim();
  if (!/^(siguiente|siguiente pagina|ver mas|mostrar mas)$/.test(text)) return null;
  let start = -1;
  for (let index = history.length - 1; index >= 0; index--) if (history[index]?.role === "user" && history[index].content?.some((block) => typeof block.text === "string")) { start = index; break; }
  if (start < 0) return null;
  const turn = history.slice(start);
  const calls = turn.filter((item) => item.role === "assistant").flatMap((item) => item.content ?? []).map((block) => block.toolUse).filter(Boolean);
  const usages = calls.filter((call) => call.name === "get_soles_usage");
  if (usages.length !== 1 || calls.some((call) => !allowed.has(call.name))) return null;
  const response = turn.flatMap((item) => item.content ?? []).map((block) => block.toolResult).find((item) => item?.toolUseId === usages[0].toolUseId);
  const result = response?.content?.find((block) => block.json)?.json;
  if (response?.status !== "success" || result?.mode !== "detail" || !result.pagination) return null;
  if (!result.pagination.hasMore) return { answer: "No hay más páginas de movimientos para los filtros consultados." };
  return { toolName: "get_soles_usage", input: { ...structuredClone(usages[0].input), page: result.pagination.nextPage, pageSize: result.pagination.pageSize } };
};

// Render lookup-only turns without exposing internal destination identifiers.
const buildSolesUsageLookupResponse = (calls) => {
  const names = ["search_soles_usage_destinations", "search_soles_usage_movement_types"];
  if (calls.length !== 1 || !names.includes(calls[0].name)) return null;
  const { name, result } = calls[0];
  if (!result || !["RESOLVED", "AMBIGUOUS", "LISTED", "NOT_FOUND"].includes(result.status)) return null;
  const destination = name === names[0];
  const label = destination ? "destinos" : "tipos de movimiento";
  if (result.status === "NOT_FOUND") return `No se encontraron ${label} para la búsqueda indicada.`;
  const rows = result.status === "RESOLVED" ? [result] : result.options;
  if (!Array.isArray(rows)) return null;
  const lines = [`**${destination ? "Destinos de uso de soles" : "Tipos de movimiento de uso de soles"}**`, "",
    destination ? "| Opción | Tipo de destino | Destino |" : "| Opción | Tipo de movimiento |",
    destination ? "| --- | --- | --- |" : "| --- | --- |"];
  rows.forEach((row, index) => lines.push(destination
    ? `| ${index + 1} | ${cell(row.destinationType)} | ${cell(row.name)} |`
    : `| ${index + 1} | ${cell(row.movementType)} |`));
  if (result.hasMore) lines.push("", `Se muestran ${result.returnedMatches} de ${result.totalMatches} ${label}. Precisa el texto de búsqueda para ver otras coincidencias.`);
  if (result.status === "AMBIGUOUS") lines.push("", "Indica cuál de las opciones deseas consultar.");
  return lines.join("\n");
};
