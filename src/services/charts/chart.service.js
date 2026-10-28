import { throwIfRequestAborted } from "../requestContext.service.js";
const types = ["bar", "horizontalBar", "line", "pie"];
const ownPath = (value, path) => {
  if (typeof path !== "string" || path.length > 150) throw new Error("Ruta de datos inválida.");
  const keys = path.split(".");
  if (keys.length > 8 || keys.some((key) => !/^(?:[a-zA-Z][a-zA-Z0-9_]*|0|[1-9][0-9]*)$/.test(key) || ["__proto__", "prototype", "constructor"].includes(key))) throw new Error("Ruta de datos inválida.");
  for (const key of keys) { if (/^\d+$/.test(key) && !Array.isArray(value)) throw new Error("El índice debe referirse a un array."); if (!value || !Object.hasOwn(value, key)) return undefined; value = value[key]; }
  return value;
};
const text = (value, max = 150) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Texto del gráfico inválido.");
  return value.replace(/[\r\n\t]+/g, " ").trim();
};
const escape = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
const colors = ["#2563eb", "#e87924", "#16a34a", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#db2777"];
const metricUnit = (path) => {
  const key = path.split(".").at(-1);
  if (/percentage|percent|participation|incidence|ratio/i.test(key)) return "percent";
  if (/soles|balance/i.test(key)) return "soles";
  if (/amount|sales|cost|price|importe|pyg|usd|revenue/i.test(key)) return "money";
  if (/count|totalRecords|totalRows|recurrenceMonths/i.test(key)) return `count:${key}`;
  if (/age|edad/i.test(key)) return "age";
  throw new Error("La unidad de esta métrica no está identificada; elige una métrica de importe, porcentaje, soles o cantidad.");
};
const number = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Cada punto debe contener un número explícito y finito; no se sustituyen datos faltantes por cero.");
  return value;
};
const currencyOf = (row, result, valuePath) => {
  const parentPath = valuePath.split(".").slice(0, -1).join(".");
  const parent = parentPath ? ownPath(row, parentPath) : row;
  const currency = parent?.currency ?? row.currency ?? result.currency;
  return currency?.abbreviation ?? currency?.symbol ?? null;
};
const format = (value) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 }).format(value);
const draw = ({ type, title, labels, datasets, width, height, valuePrefix, valueSuffix, subtitle = "" }) => {
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">`, `<rect width="100%" height="100%" fill="white"/>`, `<g font-family="Arial,sans-serif" font-size="12" fill="#172033">`, `<text x="24" y="30" font-size="18" font-weight="bold">${escape(title)}</text>`];
  const label = (x, y, value, extra = "") => svg.push(`<text x="${x}" y="${y}" ${extra}>${escape(value)}</text>`);
  if (subtitle) label(24, 53, subtitle);
  const amount = (value) => `${valuePrefix ? `${valuePrefix} ` : ""}${format(value)}${valueSuffix}`;
  const x0 = type === "horizontalBar" ? 190 : 100, y0 = 75, w = width - x0 - 45, h = height - y0 - 115;
  if (type === "pie") {
    const values = datasets[0].values, total = values.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total <= 0 || values.some((v) => v < 0)) throw new Error("El gráfico circular requiere valores no negativos y un total positivo.");
    const cx = width * .32, cy = height * .52, r = Math.min(width * .24, height * .30);
    let angle = -Math.PI / 2;
    values.forEach((value, i) => {
      const delta = value / total * Math.PI * 2;
      if (delta >= Math.PI * 2 - 1e-10) svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors[i % colors.length]}"/>`);
      else if (value > 0) {
        const next = angle + delta;
        svg.push(`<path d="M ${cx} ${cy} L ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} A ${r} ${r} 0 ${delta > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(next)} ${cy + r * Math.sin(next)} Z" fill="${colors[i % colors.length]}"/>`);
      }
      angle += delta;
      const y = 90 + i * 30;
      svg.push(`<rect x="${width * .61}" y="${y - 11}" width="12" height="12" fill="${colors[i % colors.length]}"/>`);
      label(width * .61 + 20, y, `${labels[i].slice(0, 22)}: ${amount(value)}`);
    });
  } else {
    const values = datasets.flatMap((series) => series.values);
    let min = Math.min(0, ...values), max = Math.max(0, ...values);
    if (min === max) max = min + 1;
    const span = max - min;
    if (!Number.isFinite(span)) throw new Error("La escala de los valores es demasiado grande.");
    const vertical = (value) => y0 + h - (value - min) / span * h;
    const horizontal = (value) => x0 + (value - min) / span * w;
    for (let i = 0; i <= 4; i++) {
      const value = min + span * i / 4;
      if (type === "horizontalBar") {
        const x = horizontal(value); svg.push(`<path d="M ${x} ${y0} V ${y0 + h}" stroke="#e2e8f0"/>`); label(x, y0 + h + 22, amount(value), 'text-anchor="middle"');
      } else {
        const y = vertical(value); svg.push(`<path d="M ${x0} ${y} H ${x0 + w}" stroke="#e2e8f0"/>`); label(x0 - 8, y + 4, amount(value), 'text-anchor="end"');
      }
    }
    if (type === "horizontalBar") svg.push(`<path d="M ${horizontal(0)} ${y0} V ${y0 + h}" stroke="#64748b"/>`);
    else svg.push(`<path d="M ${x0} ${vertical(0)} H ${x0 + w}" stroke="#64748b"/>`);
    const step = (type === "horizontalBar" ? h : w) / labels.length;
    labels.forEach((value, i) => {
      if (type === "horizontalBar") label(x0 - 10, y0 + (i + .5) * step + 4, value.slice(0, 25), 'text-anchor="end"');
      else if (i % Math.max(1, Math.ceil(labels.length / 15)) === 0) label(x0 + (i + .5) * step, y0 + h + 22, value.slice(0, 14), 'text-anchor="middle"');
    });
    datasets.forEach((series, j) => {
      if (type === "line") {
        svg.push(`<polyline points="${series.values.map((v, i) => `${x0 + (i + .5) * step},${vertical(v)}`).join(" ")}" fill="none" stroke="${colors[j]}" stroke-width="2"/>`);
        series.values.forEach((v, i) => svg.push(`<circle cx="${x0 + (i + .5) * step}" cy="${vertical(v)}" r="3" fill="${colors[j]}"><title>${escape(`${labels[i]}: ${amount(v)}`)}</title></circle>`));
      } else series.values.forEach((v, i) => {
        const size = step * .75 / datasets.length;
        const offset = i * step + step * .125 + j * size;
        const geometry = type === "horizontalBar"
          ? `x="${Math.min(horizontal(0), horizontal(v))}" y="${y0 + offset}" width="${Math.abs(horizontal(v) - horizontal(0))}" height="${size}"`
          : `x="${x0 + offset}" y="${Math.min(vertical(0), vertical(v))}" width="${size}" height="${Math.abs(vertical(v) - vertical(0))}"`;
        svg.push(`<rect ${geometry} fill="${colors[j]}"><title>${escape(`${labels[i]}: ${amount(v)}`)}</title></rect>`);
      });
      const legendX = 25 + j * Math.floor((width - 30) / datasets.length);
      svg.push(`<rect x="${legendX}" y="${height - 31}" width="12" height="12" fill="${colors[j]}"/>`); label(legendX + 18, height - 20, series.label.slice(0, 25));
    });
  }
  svg.push("</g></svg>");
  return svg.join("");
};
export const generateChart = async (args = {}, { sources = {}, restoreText = (value) => value } = {}) => {
  throwIfRequestAborted();
  const { sourceToolUseId, type, dataPath = "data", labelPaths, datasets, title = "Gráfico de resultados", width = 900, height = 500 } = args;
  if (!types.includes(type)) throw new Error("Tipo de gráfico no soportado.");
  const source = Object.hasOwn(sources, sourceToolUseId) ? sources[sourceToolUseId] : null;
  if (!source?.result) throw new Error("No hay un resultado de consulta aplicable para ese gráfico. Consulta primero los datos.");
  const result = source.result;
  if (result.resultSet?.analysisPolicy === "NO_ANALYSIS" || result.resultSet?.truncated || result.pagination?.hasMore || Number(result.pagination?.page ?? result.page ?? 1) > 1 || result.hasMore || result.summary?.hasMore) throw new Error("El resultado está limitado o paginado. Obtén un resumen completo del alcance solicitado antes de graficar.");
  const rows = ownPath(result, dataPath);
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error("El gráfico necesita entre 1 y 100 filas explícitas; solicita un resumen de hasta 100 grupos.");
  if (!Array.isArray(labelPaths) || labelPaths.length < 1 || labelPaths.length > 3 || labelPaths.some((key) => /(?:^|\.)(?:.*Id|documentNumber|destinationCode)$/i.test(key))) throw new Error("Usa entre una y tres etiquetas comerciales, sin identificadores internos.");
  if (!Array.isArray(datasets) || datasets.length < 1 || datasets.length > 5) throw new Error("Usa entre una y cinco series.");
  if (type === "pie" && (datasets.length !== 1 || rows.length > 8)) throw new Error("El gráfico circular admite una serie y hasta ocho categorías.");
  if (type === "line" && rows.length < 2) throw new Error("Una línea necesita al menos dos puntos.");
  for (const [value, min] of [[width, 300], [height, 250]]) if (!Number.isInteger(value) || value < min || value > 999) throw new Error("Dimensiones del gráfico inválidas.");
  const units = datasets.map((series) => metricUnit(series.valuePath));
  if (new Set(units).size !== 1) throw new Error("No se mezclan métricas con unidades diferentes en el mismo gráfico.");
  let valuePrefix = "", valueSuffix = units[0] === "percent" ? "%" : units[0] === "soles" ? " soles" : "";
  if (units[0] === "money") {
    const currencies = new Set(rows.flatMap((row) => datasets.map((series) => currencyOf(row, result, series.valuePath))));
    if (currencies.size !== 1 || currencies.has(null)) throw new Error("Los importes requieren una moneda explícita y única.");
    const currency = [...currencies][0];
    if (datasets.some((series) => /usd$/i.test(series.valuePath) && !["USD", "US$"].includes(currency) || /pyg$/i.test(series.valuePath) && !["PYG", "₲", "GUARANIES"].includes(currency))) throw new Error("La moneda de la métrica no coincide con la moneda explícita.");
    valuePrefix = ({ PYG: "₲", GUARANIES: "₲", USD: "US$" }[currency] ?? currency);
  }
  const labels = rows.map((row) => labelPaths.map((path) => {
    const value = ownPath(row, path);
    if (value == null || typeof value === "object") throw new Error("Cada etiqueta debe existir explícitamente en la consulta.");
    return text(String(value), 150);
  }).join(" / "));
  const chartDatasets = datasets.map((series) => ({ label: text(series.label, 80), values: rows.map((row) => number(ownPath(row, series.valuePath))) }));
  const normalizedTitle = text(title);
  const q = result.queryContext ?? {};
  const subtitle = [q.dateFrom || q.dateTo ? `Período: ${q.dateFrom ?? "inicio"} a ${q.dateTo ?? "fin"}` : "",
    (Array.isArray(q.groupBy) && q.groupBy.some((key) => ["age", "ageRange"].includes(key)) || q.ageMin != null || q.ageMax != null)
      ? q.ageReference === "registration" ? "Edad al registrar el vehículo" : `Edad al ${q.referenceDate}` : ""].filter(Boolean).join(" · ");
  const displayTitle = restoreText(normalizedTitle);
  const svg = draw({ type, title: displayTitle, labels: labels.map(restoreText), datasets: chartDatasets.map((series) => ({ ...series, label: restoreText(series.label) })), width, height, valuePrefix, valueSuffix, subtitle: restoreText(subtitle) });
  throwIfRequestAborted();
  return { chart: { available: true, format: "svg", mimeType: "image/svg+xml", url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, type, title: displayTitle, subtitle: restoreText(subtitle) || null, width, height, valuePrefix: valuePrefix || null, valueSuffix: valueSuffix || null, pointCount: labels.length, datasetCount: chartDatasets.length },
    result: { generated: true, sourceToolUseId, type, title: normalizedTitle, pointCount: labels.length, datasetCount: chartDatasets.length } };
};
