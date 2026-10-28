const finite = (value) => typeof value === "number" && Number.isFinite(value);
const cell = (value) => String(value ?? "Sin datos").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => finite(value) ? new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(value) : "Sin datos";
const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const period = (row, dimension) => {
  const raw = String(row[dimension === "day" ? "date" : dimension] ?? "");
  if (dimension === "month") {
    const short = /^(0[1-9]|1[0-2])$/.exec(raw);
    if (short) return { key: Number(raw), label: monthNames[Number(raw) - 1], short: true };
    const full = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
    if (full) return { key: Number(full[1]) * 100 + Number(full[2]), label: `${monthNames[Number(full[2]) - 1]} ${full[1]}` };
  }
  if (dimension === "year" && /^\d{4}$/.test(raw)) return { key: Number(raw), label: raw };
  if (dimension === "day") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
    const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (iso) return { key: Number(`${iso[1]}${iso[2]}${iso[3]}`), label: `${iso[3]}/${iso[2]}/${iso[1]}` };
    if (local) return { key: Number(`${local[3]}${local[2]}${local[1]}`), label: raw };
  }
  return null;
};
const metricNames = { totalAmount: ["Ventas totales", "Las ventas"], totalInvoices: ["Cantidad de facturas", "La cantidad de facturas"] };
const observation = (rows, metric, value) => {
  const subject = metricNames[metric][1];
  if (rows.length < 2) return null;
  if (rows.some((row) => !finite(row[metric]))) return `${subject}: no se interpreta la evolución porque hay datos faltantes.`;
  const changes = rows.slice(1).map((row, index) => ({ from: rows[index], to: row, difference: row[metric] - rows[index][metric] }));
  if (changes.some((change) => !finite(change.difference))) return null;
  const increases = changes.filter((change) => change.difference > 0), decreases = changes.filter((change) => change.difference < 0);
  if (!increases.length && !decreases.length) return `${subject} se mantuvieron sin variación entre los períodos mostrados.`.replace("La cantidad de facturas se mantuvieron", "La cantidad de facturas se mantuvo");
  if (!decreases.length) return `${subject} ${metric === "totalAmount" ? "aumentaron" : "aumentó"}${increases.length === changes.length ? " en cada período mostrado" : " sin caídas; hubo períodos sin variación"}.`;
  if (!increases.length) return `${subject} ${metric === "totalAmount" ? "disminuyeron" : "disminuyó"}${decreases.length === changes.length ? " en cada período mostrado" : " sin aumentos; hubo períodos sin variación"}.`;
  const drop = decreases.reduce((largest, change) => change.difference < largest.difference ? change : largest);
  const percentage = drop.from[metric] > 0 ? drop.difference / drop.from[metric] * 100 : null;
  const percentText = finite(percentage) ? `; ${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(percentage)} %` : "";
  return `${subject} ${metric === "totalAmount" ? "presentaron" : "presentó"} subidas y bajadas. La mayor caída absoluta fue de ${value(drop.from[metric])} a ${value(drop.to[metric])}, entre ${drop.from.period.label} y ${drop.to.period.label} (${value(drop.difference)}${percentText}).`;
};

export const buildSalesSeriesResponse = (calls = [], { message = "" } = {}) => {
  // Leave explicitly requested statistical/comparative analyses to their existing flow.
  const request = String(message).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(anomal\w*|desviacion|mediana|promedio|ticket|estadistic\w*|compara\w*)\b/.test(request)) return null;
  const sales = calls.filter((call) => call.name === "get_sales");
  if (sales.length !== 1 || calls.some((call) => !["get_sales", "search_customers", "search_categories"].includes(call.name))) return null;
  const { input = {}, result } = sales[0];
  const groupBy = Array.isArray(input.groupBy) ? input.groupBy : [input.groupBy];
  if (groupBy.length !== 1 || !["day", "month", "year"].includes(groupBy[0])) return null;
  if (!Array.isArray(result?.data) || result.resultSet?.truncated || result.resultSet?.analysisPolicy === "NO_ANALYSIS" || result.hasMore) return null;
  const metrics = input.metrics ?? ["totalAmount", "totalInvoices"].filter((metric) => result.data.some((row) => Object.hasOwn(row, metric)));
  if (!Array.isArray(metrics) || !metrics.length || metrics.some((metric) => !Object.hasOwn(metricNames, metric))) return null;
  const lines = ["**Ventas por período**", ""];
  if (input.dateFrom || input.dateTo) lines.push(`Período: ${cell(input.dateFrom)} a ${cell(input.dateTo)}.`, "");
  if (!result.data.length) return [...lines, "No se encontraron ventas para los filtros consultados."].join("\n");
  const currencies = new Map();
  for (const raw of result.data) {
    const p = period(raw, groupBy[0]);
    if (!p || p.short && String(input.dateFrom ?? "").slice(-4) !== String(input.dateTo ?? "").slice(-4)) return null;
    const currency = raw.currency ?? result.currency;
    if (metrics.includes("totalAmount") && !currency?.symbol) return null;
    const id = currency?.abbreviation ?? currency?.symbol ?? "count";
    if (!currencies.has(id)) currencies.set(id, { currency, rows: [] });
    currencies.get(id).rows.push({ ...raw, period: p });
  }
  for (const { currency, rows } of currencies.values()) {
    rows.sort((a, b) => a.period.key - b.period.key);
    if (new Set(rows.map((row) => row.period.key)).size !== rows.length) return null;
    const amount = (v) => !finite(v) ? "Sin datos" : currency?.symbolPosition === "suffix" ? `${number(v)} ${cell(currency.symbol)}` : `${cell(currency.symbol)} ${number(v)}`;
    if (currencies.size > 1) lines.push(`**Moneda: ${cell(currency?.symbol ?? "Sin datos")}**`, "");
    lines.push(`| Período | ${metrics.map((metric) => metricNames[metric][0]).join(" | ")} |`, `| --- | ${metrics.map(() => "---").join(" | ")} |`);
    for (const row of rows) lines.push(`| ${cell(row.period.label)} | ${metrics.map((metric) => metric === "totalAmount" ? amount(row[metric]) : number(row[metric])).join(" | ")} |`);
    const onlyTable = /\b(solo (?:la )?tabla|sin (?:analisis|observaciones))\b/.test(request);
    const notes = onlyTable ? [] : metrics.map((metric) => observation(rows, metric, metric === "totalAmount" ? amount : number)).filter(Boolean);
    if (notes.length) lines.push("", ...notes.map((note) => `- ${note}`));
    lines.push("");
  }
  return lines.join("\n").trim();
};
