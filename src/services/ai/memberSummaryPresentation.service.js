const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => value == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 20 }).format(value);
const money = (row) => `${cell(row.currency?.symbol || row.currency?.description || "")} ${number(row.totalAmount)}`.trim();
const LABELS = { category: ["Rubro", "categoryName"], customer: ["Local", "customerName"], month: ["Mes", "month"], year: ["Año", "year"] };

// Present each period independently; never let the model rewrite amounts or
// derive values for a missing period. No sums are made across currencies.
export const buildMemberSummaryResponse = (calls = []) => {
  if (!calls.length) return null;
  for (const call of calls) {
    const dimensions = call.input?.breakdownBy ?? [];
    if (call.name !== "analyze_members" || call.input?.resultMode !== "summary" ||
      !["FOUND", "NOT_FOUND"].includes(call.result?.status) ||
      call.result?.analysis?.periodDefinition?.length !== 1 ||
      !Array.isArray(call.result?.summary?.totalsByCurrency) ||
      !Array.isArray(dimensions) || dimensions.length > 1 ||
      (dimensions.length === 1 && (!LABELS[dimensions[0]] ||
        !Array.isArray(call.result?.breakdown?.[dimensions[0]])))) return null;
  }
  const lines = ["**Compras de socios por período**"];
  for (const { input, result } of calls) {
    const period = result.analysis.periodDefinition[0];
    lines.push("", `**Del ${cell(period.dateFrom)} al ${cell(period.dateTo)}**`, "");
    if (result.status === "NOT_FOUND") {
      lines.push("No se registraron compras que cumplan los filtros.");
      continue;
    }
    lines.push("| Monto total de compras | Cantidad de compras |", "| --- | --- |");
    for (const row of result.summary.totalsByCurrency) {
      lines.push(`| ${money(row)} | ${number(row.purchaseCount)} |`);
    }
    const dimension = input.breakdownBy?.[0];
    if (dimension) {
      const [label, key] = LABELS[dimension];
      lines.push("", `| ${label} | Monto total de compras | Cantidad de compras |`, "| --- | --- | --- |");
      for (const row of result.breakdown[dimension]) {
        lines.push(`| ${cell(row[key])} | ${money(row)} | ${number(row.purchaseCount)} |`);
      }
    }
  }
  return lines.join("\n");
};
