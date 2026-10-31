const ALLOWED_TOOLS = new Set(["compare_member_purchases_vs_sales", "search_customers", "search_categories"]);

export const buildMemberPurchasesVsSalesResponse = (calls = []) => {
  const comparisons = calls.filter((call) => call.name === "compare_member_purchases_vs_sales");
  if (comparisons.length !== 1 || calls.some((call) => !ALLOWED_TOOLS.has(call.name))) return null;
  const { result } = comparisons[0];
  if (!["FOUND", "NOT_FOUND"].includes(result?.status) || !Array.isArray(result.results)) return null;
  const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const number = (value) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(value);
  const labels = { month: "Mes", year: "Año", customer: "Local", category: "Rubro" };
  const dimensions = result.breakdownBy ?? [];
  const lines = ["**Canjes de facturas de socios frente a ventas**", "",
    `Del ${cell(result.period.dateFrom)} al ${cell(result.period.dateTo)}.`, ""];
  if (!result.results.length) {
    lines.push("No se encontraron ventas ni canjes registrados para este período y los filtros solicitados.");
    return lines.join("\n");
  }
  lines.push(`| ${[...dimensions.map((type) => labels[type]), "Moneda", "Ventas", "Importe de canjes", "Cantidad de canjes", "Socios", "Canjes sobre ventas"].join(" | ")} |`);
  lines.push(`| ${Array(dimensions.length + 6).fill("---").join(" | ")} |`);
  for (const row of result.results) {
    lines.push(`| ${[...row.dimensions.map((dimension) => cell(dimension.name)),
      cell(row.currency.symbol || row.currency.description), number(row.auditedSalesAmount), number(row.exchangeAmount),
      number(row.invoiceCount), number(row.memberCount), row.percentage == null ? "No calculable" : `${number(row.percentage)} %`].join(" | ")} |`);
  }
  if (result.results.some((row) => row.percentage == null)) lines.push("", "No se calcula el porcentaje cuando el importe de ventas no es positivo.");
  if (result.summary.hasMore) lines.push("", `Se muestran ${result.summary.returnedGroups} de ${result.summary.totalGroups} grupos, según el orden solicitado.`);
  return lines.join("\n");
};
