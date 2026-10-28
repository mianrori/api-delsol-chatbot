const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const text = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[¿?¡!,;:]/g, " ").replace(/\s+/g, " ").trim();
const cell = (value) => String(value ?? "Sin datos").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const number = (value) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(value);
const titleMonth = (index) => months[index - 1][0].toUpperCase() + months[index - 1].slice(1);
const date = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  if (!match) return null;
  const [, d, m, y] = match, parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (parsed.getUTCFullYear() !== Number(y) || parsed.getUTCMonth() !== Number(m) - 1 || parsed.getUTCDate() !== Number(d)) return null;
  return { day: Number(d), month: Number(m), year: Number(y) };
};
const fullMonthRange = (input) => {
  const from = date(input?.dateFrom), to = date(input?.dateTo);
  if (!from || !to || from.year !== to.year || from.day !== 1 || from.month > to.month || to.day !== new Date(Date.UTC(to.year, to.month, 0)).getUTCDate()) return null;
  return { year: from.year, from: from.month, to: to.month };
};
const signature = ({ dateFrom, dateTo, ...input }) => JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))));
const compatible = (calls) => {
  if (calls.length !== 2 || calls.some((call) => call.name !== "get_sales")) return null;
  const ranges = calls.map((call) => fullMonthRange(call.input));
  if (ranges.some((range) => !range) || ranges[0].year === ranges[1].year || ranges[0].from !== ranges[1].from || ranges[0].to !== ranges[1].to) return null;
  if (calls.some((call) => JSON.stringify(call.input.groupBy) !== '["month"]' || !Array.isArray(call.input.metrics) || !call.input.metrics.length || call.input.metrics.some((metric) => !["totalAmount", "totalInvoices"].includes(metric)))) return null;
  if (signature(calls[0].input) !== signature(calls[1].input)) return null;
  return ranges;
};
const rangeDates = (year, from, to) => ({ dateFrom: `01/${String(from).padStart(2, "0")}/${year}`, dateTo: `${new Date(Date.UTC(year, to, 0)).getUTCDate()}/${String(to).padStart(2, "0")}/${year}` });

export const resolveSalesYearComparison = ({ message, history = [] }) => {
  const request = text(message);
  // Anchor the complete request so unsupported local/category filters are not discarded.
  const initial = /^(?:compara(?: las)? |comparar(?: las)? )?ventas (?:de|del) ((?:19|20)\d{2}) (?:contra|vs\.?|versus|frente a) ((?:19|20)\d{2}) (?:mes a mes|por mes)(?: con (?:monto total|importe total)(?: y (?:cantidad de )?facturas)?)?\.?$/.exec(request);
  if (initial && initial[1] !== initial[2]) return { inputs: [initial[1], initial[2]].map((year) => ({ ...rangeDates(Number(year), 1, 12), groupBy: ["month"], metrics: /facturas/.test(request) ? ["totalAmount", "totalInvoices"] : ["totalAmount"] })) };
  const followup = /^(?:ahora )?compara (?:unicamente |solo )?([a-z]+) a ([a-z]+) (?:de )?(?:ambos|los dos) anos\.?$/.exec(request);
  if (!followup) return null;
  const from = months.indexOf(followup[1]) + 1, to = months.indexOf(followup[2]) + 1;
  if (!from || !to || from > to) return null;
  let start = -1;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].role === "user" && history[i].content?.some((block) => typeof block.text === "string")) { start = i; break; }
  if (start < 0) return null;
  const blocks = history.slice(start).flatMap((item) => item.content ?? []);
  const calls = blocks.map((block) => block.toolUse).filter(Boolean);
  const ranges = compatible(calls);
  if (!ranges || calls.some((call) => !blocks.some((block) => block.toolResult?.toolUseId === call.toolUseId && block.toolResult.status === "success"))) return null;
  return { inputs: calls.map((call, index) => ({ ...structuredClone(call.input), ...rangeDates(ranges[index].year, from, to) })) };
};

export const buildSalesYearComparisonResponse = (calls = []) => {
  const ranges = compatible(calls);
  if (!ranges || calls.some((call) => !Array.isArray(call.result?.data) || call.result.resultSet?.truncated || call.result.resultSet?.analysisPolicy === "NO_ANALYSIS" || call.result.hasMore)) return null;
  const metrics = calls[0].input.metrics, years = ranges.map((range) => range.year);
  const currencies = new Map();
  for (let index = 0; index < calls.length; index++) {
    for (const row of calls[index].result.data) {
      const match = /^(?:(\d{4})-)?(0[1-9]|1[0-2])$/.exec(String(row.month));
      if (!match || match[1] && Number(match[1]) !== years[index]) return null;
      const month = Number(match[2]);
      if (month < ranges[index].from || month > ranges[index].to) return null;
      const currency = row.currency ?? calls[index].result.currency;
      if (metrics.includes("totalAmount") && !currency?.symbol) return null;
      const id = currency?.abbreviation ?? currency?.symbol ?? "count";
      if (!currencies.has(id)) currencies.set(id, { currency, rows: [new Map(), new Map()] });
      const group = currencies.get(id);
      if (group.rows[index].has(month)) return null;
      group.rows[index].set(month, row);
    }
  }
  const lines = [`**Comparación mensual de ventas: ${years[0]} vs. ${years[1]}**`, "",
    ...calls.map((call, index) => `${years[index]}: ${cell(call.input.dateFrom)} a ${cell(call.input.dateTo)}.`), ""];
  if (!currencies.size) return [...lines, "No se encontraron registros para ninguno de los dos períodos consultados. No hay valores disponibles para comparar."].join("\n");
  for (const { currency, rows } of currencies.values()) {
    const amount = (value) => currency?.symbolPosition === "suffix" ? `${number(value)} ${cell(currency.symbol)}` : `${cell(currency.symbol)} ${number(value)}`;
    const value = (row, metric) => row == null ? "Sin registros" : !finite(row[metric]) ? "Sin datos" : metric === "totalAmount" ? amount(row[metric]) : number(row[metric]);
    if (currencies.size > 1) lines.push(`**Moneda: ${cell(currency?.symbol ?? "Sin datos")}**`, "");
    const columns = years.flatMap((year) => metrics.map((metric) => `${metric === "totalAmount" ? "Ventas" : "Facturas"} ${year}`));
    lines.push(`| Mes | ${columns.join(" | ")} |`, `| --- | ${columns.map(() => "---").join(" | ")} |`);
    const notes = [];
    for (let month = ranges[0].from; month <= ranges[0].to; month++) {
      const left = rows[0].get(month), right = rows[1].get(month);
      lines.push(`| ${titleMonth(month)} | ${rows.flatMap((byMonth) => metrics.map((metric) => value(byMonth.get(month), metric))).join(" | ")} |`);
      for (const metric of metrics) {
        if (!finite(left?.[metric]) || !finite(right?.[metric])) continue;
        const difference = right[metric] - left[metric];
        if (!finite(difference)) continue;
        const subject = metric === "totalAmount" ? "las ventas" : "la cantidad de facturas";
        const verb = metric === "totalAmount" ? "fueron" : "fue";
        const comparison = difference > 0 ? metric === "totalAmount" ? "mayores" : "mayor" : difference < 0 ? metric === "totalAmount" ? "menores" : "menor" : metric === "totalAmount" ? "iguales" : "igual";
        notes.push(`${titleMonth(month)}: ${subject} de ${years[1]} ${verb} ${comparison} que en ${years[0]} (${value(right, metric)} frente a ${value(left, metric)}; diferencia: ${metric === "totalAmount" ? amount(difference) : number(difference)}).`);
      }
    }
    lines.push("");
    for (let i = 0; i < years.length; i++) lines.push(rows[i].size
      ? `${years[i]}: se encontraron registros en ${[...rows[i].keys()].sort((a, b) => a - b).map(titleMonth).join(", ")}.`
      : `${years[i]}: no se encontraron registros para el período consultado${currencies.size > 1 ? " en esta moneda" : ""}.`);
    lines.push("", ...(notes.length ? notes.map((note) => `- ${note}`) : ["No hay valores disponibles en ambos años para comparar los mismos meses y métricas."]), "");
  }
  lines.push("«Sin registros» indica ausencia de filas en la consulta; no se reemplaza por cero. Solo se comparan meses con valores disponibles en ambos años, sin extrapolar totales anuales.");
  return lines.join("\n");
};
