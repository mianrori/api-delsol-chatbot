const LABELS = { before: "Antes", during: "Durante", after: "Después" };

export const buildCampaignSalesPerformanceResponse = (calls = []) => {
  const analyses = calls.filter((call) => call.name === "analyze_campaign_sales_performance");
  if (analyses.length !== 1 || calls.some((call) => !["analyze_campaign_sales_performance", "search_promotions", "search_customers", "search_categories"].includes(call.name))) return null;
  const result = analyses[0].result;
  if (result?.analysisType !== "campaignSalesPerformance" || !result.periods || !result.comparisons) return null;
  const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const number = (value) => value == null ? "No calculable" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 4 }).format(value);
  const money = (value, currency) => {
    const unit = currency?.symbol || currency?.abbreviation || currency?.description || "";
    return value == null ? "No calculable" : `${cell(unit)} ${number(value)}`.trim();
  };
  const lines = ["**Ventas antes, durante y después de la campaña**", "",
    `Promoción: ${cell(result.campaign.promotionName)}. Campaña: ${cell(result.campaign.campaignName)}.`,
    `Se comparan períodos de ${number(result.campaign.durationDays)} días calendario.`, "",
    "| Período | Desde | Hasta | Ventas | Cantidad de facturas | Venta diaria promedio |",
    "| --- | --- | --- | --- | --- | --- |"];
  for (const key of ["before", "during", "after"]) {
    const period = result.periods[key];
    lines.push(`| ${LABELS[key]} | ${cell(period.dateFrom)} | ${cell(period.dateTo)} | ${money(period.totalAmount, period.currency)} | ${number(period.totalInvoices)} | ${money(period.averageDailyAmount, period.currency)} |`);
  }
  lines.push("", "| Comparación | Variación de ventas | Variación de ventas (%) | Variación de facturas | Variación de facturas (%) |", "| --- | --- | --- | --- | --- |");
  const pct = (value) => value == null ? "No calculable" : `${number(value)} %`;
  for (const comparison of Object.values(result.comparisons)) {
    lines.push(`| ${LABELS[comparison.currentPeriod]} frente a ${LABELS[comparison.previousPeriod]} | ${money(comparison.totalAmount?.absoluteChange, result.periods[comparison.currentPeriod].currency)} | ${pct(comparison.totalAmount?.percentageChange)} | ${number(comparison.totalInvoices.absoluteChange)} | ${pct(comparison.totalInvoices.percentageChange)} |`);
  }
  if (!result.currency.consistent) lines.push("", "Las monedas difieren entre períodos o dentro de ellos; no se comparan sus importes.");
  for(const [key,period]of Object.entries(result.periods))if(period.currencyGroups?.length>1){
    lines.push('',`**${LABELS[key]}: ${period.calculationReason}**`,'| Moneda | Ventas | Cantidad de facturas |','| --- | --- | --- |');
    for(const group of period.currencyGroups)lines.push(`| ${cell(group.currency.description??group.currency.abbreviation)} | ${money(group.totalAmount,group.currency)} | ${number(group.totalInvoices)} |`);
  }
  if (Object.values(result.comparisons).some((item) => item.totalAmount?.percentageChange == null || item.totalInvoices.percentageChange == null)) {
    lines.push("", "La variación porcentual no se calcula cuando el valor del período de referencia es cero o los importes no son comparables.");
  }
  if (Object.values(result.periods).some((period) => period.sourceRows === 0)) {
    lines.push("", "Los períodos con conteo de registros cero no tienen registros de ventas en los datos consultados.");
  }
  lines.push("", "Estas variaciones describen las ventas observadas; no demuestran que la campaña haya causado los cambios.");
  return lines.join("\n");
};
