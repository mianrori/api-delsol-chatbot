const numeric = (v) => typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(v) : "—";
const money = (v) => v?.amount == null ? "—" : `${v.currency?.symbol ?? v.currency?.code ?? "Moneda desconocida"} ${numeric(v.amount)}`;

export const buildContractIncidenceResponse = (calls = [], { restoreValue = (v) => v } = {}) => {
  const queries = calls.filter((c) => c.name === "analyze_contract_cost_incidence");
  if (queries.length !== 1 || calls.some((c) => !["analyze_contract_cost_incidence", "search_customers"].includes(c.name))) return null;
  const r = queries[0].result;
  if (!r?.exchange || !["summary", "month"].includes(r.groupBy)) return null;
  const rows = r.groupBy === "month" ? r.data : [r];
  if (!Array.isArray(rows) || rows.some((p) => !p.sales || !p.shoppingCost)) return null;
  const cell = (v) => String(restoreValue(v) ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const lines = ["**Incidencia del costo contractual sobre ventas**", "", `Período: ${cell(r.dateFrom)} al ${cell(r.dateTo)}.`, "",
    "| Período | Costo sin IVA | Ventas auditadas | Incidencia | Costo USD | Ventas USD |",
    "| --- | --- | --- | --- | --- | --- |"];
  for (const p of rows) lines.push(`| ${[cell(p.month ?? "Resumen"), money(p.shoppingCost), money(p.sales),
    p.incidencePercentage == null ? "—" : numeric(p.incidencePercentage) + " %", numeric(p.shoppingCost.usd), numeric(p.sales.usd)].join(" | ")} |`);
  for (const p of rows) {
    if (p.reason) lines.push("", `${cell(p.month ?? "Resumen")}: ${cell(p.reason)}`);
    const breakdown = p.shoppingCost.conceptBreakdownByPeriod ?? [{ month: p.month, concepts: p.shoppingCost.concepts ?? [], missingConcepts: p.shoppingCost.missingConcepts ?? [] }];
    for (const b of breakdown) for (const c of b.concepts ?? []) lines.push("", `${cell(b.month ?? "Período")} · ${cell(c.description ?? "Concepto oficial")}: ${c.status === "BILLING_AMBIGUOUS" ? `sin calcular (${cell(c.reason)})` : money({ amount: c.amountExcludingTax, currency: c.currency })}.`);
    for (const b of breakdown) for (const c of b.missingConcepts ?? []) lines.push("", `${cell(b.month ?? "Período")} · ${cell(c.description ?? "Concepto oficial")}: sin importe válido.`);
  }
  lines.push("", "Importes según la última factura válida por mes y concepto, no la suma de todas las facturas. Sin IVA; meses extremos limitados a las fechas solicitadas.");
  if (r.exchange.available) lines.push("", `Equivalentes USD con cotización de venta actual: 1 USD = ₲ ${numeric(r.exchange.sellRate)}. No es una cotización histórica y no se utiliza para calcular incidencia entre monedas distintas.`);
  else if (r.exchange.reason === "EXCHANGE_RATE_UNAVAILABLE") lines.push("", "Cotización actual no disponible: equivalentes USD sin calcular; se conserva la moneda original.");
  return lines.join("\n");
};
