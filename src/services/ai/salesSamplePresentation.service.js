const dimensions = {
  customer: ["Local", "customerName"], category: ["Rubro", "categoryName"],
  month: ["Mes", "month"], year: ["Año", "year"],
};
const metrics = { totalAmount: "Ventas totales", totalInvoices: "Cantidad de facturas" };
const cell = (value) => String(value ?? "Sin datos").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => typeof value === "number" && Number.isFinite(value)
  ? new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(value) : "Sin datos";

export const buildSalesSampleResponse = (calls = [], { exportAvailable = false } = {}) => {
  const sales = calls.filter((call) => call.name === "get_sales");
  if (sales.length !== 1 || calls.some((call) => !["get_sales", "search_customers", "search_categories"].includes(call.name))) return null;
  const { input, result } = sales[0];
  const metadata = result?.resultSet;
  if (!metadata?.truncated || metadata.analysisPolicy !== "NO_ANALYSIS" || !Array.isArray(result.data) || !result.data.length) return null;
  const groups = input?.groupBy, requested = input?.metrics ?? ["totalAmount", "totalInvoices"];
  if (!Array.isArray(groups) || !groups.length || groups.some((key) => !dimensions[key]) || !Array.isArray(requested) || !requested.length || requested.some((key) => !metrics[key])) return null;
  if (!Number.isInteger(metadata.totalRecords) || metadata.totalRecords <= result.data.length) return null;
  const amount = (row) => {
    const value = number(row.totalAmount), currency = row.currency ?? result.currency;
    if (value === "Sin datos") return value;
    if (!currency?.symbol) return null;
    return currency.symbolPosition === "suffix" ? `${value} ${cell(currency.symbol)}` : `${cell(currency.symbol)} ${value}`;
  };
  const rows = [];
  for (const row of result.data) {
    const values = requested.map((key) => key === "totalAmount" ? amount(row) : number(row[key]));
    if (values.includes(null)) return null;
    rows.push(`| ${[...groups.map((key) => cell(row[dimensions[key][1]])), ...values].join(" | ")} |`);
  }
  const columns = [...groups.map((key) => dimensions[key][0]), ...requested.map((key) => metrics[key])];
  return ["**Ventas por período**", "", `Período: ${cell(input.dateFrom)} a ${cell(input.dateTo)}.`, "",
    `| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows, "",
    `Se muestran ${result.data.length} de ${metadata.totalRecords} registros, en el orden de la consulta.`,
    exportAvailable ? "El detalle completo está disponible para exportación." : "No fue posible preparar la exportación. Vuelve a ejecutar la consulta.",
  ].join("\n");
};
