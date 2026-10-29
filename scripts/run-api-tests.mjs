import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const controls = {
  january: { amount: 58706137966, invoices: 366427, rows: 180 },
  february: { amount: 63255876492, invoices: 358354 },
  sports: { amount: 2994866457, invoices: 7049, rows: 5 },
  monthly: [
    { month: "01", name: "enero", amount: 58706137966, invoices: 366427 },
    { month: "02", name: "febrero", amount: 63255876492, invoices: 358354 },
    { month: "03", name: "marzo", amount: 64924535090, invoices: 360316 },
    { month: "04", name: "abril", amount: 72875754527, invoices: 361387 },
    { month: "05", name: "mayo", amount: 86767167311, invoices: 432821 },
  ],
};
const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const comparisonControls = {
  2023: [...controls.monthly.map((row) => [row.amount, row.invoices]), [28570145323, 158555], [365000, 1], [100004, 228], null, null, null, null],
  2024: [null, null, null, null, null, null, null, [5000000, 1], null, [172500, 1], [20380000, 28], null],
};
const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const clean = (value) => String(value ?? "").replace(/\*\*/g, "").replace(/[\u00a0\u202f]/g, " ").trim();
const numeric = (value) => {
  const stripped = clean(value).replace(/₲|\s/g, "");
  return /^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(stripped) ? Number(stripped.replace(/\./g, "").replace(",", ".")) : null;
};
const tableRows = (text) => String(text).split("\n").filter((line) => /^\s*\|/.test(line)).map((line) => line.split("|").slice(1, -1).map(clean))
  .filter((cells) => cells.length >= 3 && numeric(cells.at(-2)) !== null && numeric(cells.at(-1)) !== null);
class Failure extends Error { constructor(code) { super(code); this.code = code; } }

export const readConfig = (env = process.env) => {
  const baseUrl = (env.BOT_TEST_BASE_URL || "http://localhost:5400/chatbot/api/bot").replace(/\/+$/, "");
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Failure("INVALID_BASE_URL");
  const sessionId = env.BOT_TEST_SESSION_ID?.trim();
  if (!sessionId) throw new Failure("SESSION_ID_REQUIRED");
  const timeoutMs = Number(env.BOT_TEST_TIMEOUT_MS || 90000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000) throw new Failure("INVALID_TIMEOUT");
  const suite = env.BOT_TEST_SUITE || "all";
  if (!["quick", "sales", "charts", "comparisons", "all"].includes(suite)) throw new Failure("INVALID_SUITE");
  return { baseUrl, sessionId, timeoutMs, suite, reportPath: env.BOT_TEST_REPORT || join(tmpdir(), "chatbot-api-tests.json") };
};

const defaultLoadWorkbook = async (bytes) => {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook;
};

// No application internals, database credentials or login are used. Every
// request follows the same HTTP/session contract as Insomnia.
export const runApiTests = async (config, { fetchImpl = fetch, loadWorkbook = defaultLoadWorkbook, progress = console.log } = {}) => {
  const report = { version: 1, suite: config.suite, startedAt: new Date().toISOString(),
    description: "DEV regression using 2023/2024 control totals. No session IDs, export IDs, names, response bodies, SVG images or workbook rows are stored.", steps: [] };
  const exportIds = new Set();
  let step;
  const check = (condition, code) => {
    step.checks.push({ code, passed: Boolean(condition) });
    if (!condition) throw new Failure(code);
  };
  const request = async (operation, path, body, expectedStatus = 200, binary = false) => {
    const entry = { operation, startedAt: new Date().toISOString() };
    step.requests.push(entry);
    const started = Date.now(), cancellation = new AbortController();
    const timer = setTimeout(() => cancellation.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}${path}`, { method: body === undefined ? "GET" : "POST",
        ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        signal: cancellation.signal, redirect: "error" });
      entry.httpStatus = response.status;
      if (response.status !== expectedStatus) {
        if ([401, 404].includes(response.status) && operation !== "missing-export") throw new Failure("SESSION_INVALID_OR_EXPIRED");
        throw new Failure(`HTTP_EXPECTED_${expectedStatus}_GOT_${response.status}`);
      }
      if (binary) {
        check(response.headers.get("content-type")?.split(";")[0] === xlsxType, "XLSX_MIME_TYPE");
        const bytes = Buffer.from(await response.arrayBuffer());
        check(bytes.length >= 4 && bytes.length <= 25 * 1024 * 1024 && bytes.subarray(0, 2).toString() === "PK", "XLSX_ZIP_SIGNATURE");
        return bytes;
      }
      const result = await response.json();
      check(result.env === "development", "DEVELOPMENT_ENVIRONMENT");
      return result;
    } catch (error) {
      if (error instanceof Failure) throw error;
      throw new Failure(cancellation.signal.aborted ? "REQUEST_TIMEOUT" : "NETWORK_OR_RESPONSE_ERROR");
    } finally { clearTimeout(timer); entry.durationMs = Date.now() - started; }
  };
  const chat = async (message) => {
    const body = await request("chat", "/chat", { sessionId: config.sessionId, message });
    check(body.success === true && typeof body.response === "string", "CHAT_SUCCESS");
    check(!/no tiene permisos/i.test(body.response), "BUSINESS_ACCESS_ALLOWED");
    check(!/\[PII_[A-Z_]+_\d+\]/.test(body.response), "NO_INTERNAL_PII_TOKENS");
    check(!/No fue posible actualizar|no fue posible completar/i.test(body.response), "QUERY_COMPLETED");
    return body;
  };
  const excel = async (body, { from, to, group, total, rows, month }) => {
    const action = body.actions?.salesExport;
    check(action?.available === true && typeof action.exportId === "string", "EXPORT_AVAILABLE");
    check(Number.isInteger(action.totalRecords) && action.totalRecords > 20, "EXPORT_RECORD_COUNT");
    check(!exportIds.has(action.exportId), "NEW_EXPORT_ID"); exportIds.add(action.exportId);
    check(Date.parse(action.expiresAt) > Date.now(), "EXPORT_NOT_EXPIRED");
    check(action.format === "xlsx" && action.fileName?.includes(`2023${month}01_a_2023${month}${to.slice(0, 2)}`), "EXPORT_PERIOD_FILENAME");
    if (rows != null) check(action.totalRecords === rows, "EXPORT_EXPECTED_RECORD_COUNT");
    const visible = tableRows(body.response);
    check(visible.length === 12, "SAMPLE_HAS_12_ROWS");
    check(new RegExp(`12\\s+de\\s+${action.totalRecords}\\s+registros`).test(body.response), "SAMPLE_DISCLOSES_TOTAL");
    check(body.response.includes(from) && body.response.includes(to), "RESPONSE_PERIOD");
    const bytes = await request("download-excel", `/exports/sales/${encodeURIComponent(action.exportId)}/${encodeURIComponent(config.sessionId)}`, undefined, 200, true);
    let workbook;
    try { workbook = await loadWorkbook(bytes); } catch { throw new Failure("XLSX_COULD_NOT_BE_OPENED"); }
    const sales = workbook.getWorksheet("Ventas"), info = workbook.getWorksheet("Información");
    check(Boolean(sales && info), "XLSX_WORKSHEETS");
    const headers = sales.getRow(1).values;
    const nameCol = headers.indexOf(group === "customer" ? "Local" : "Rubro");
    const amountCol = headers.indexOf("Importe total"), invoiceCol = headers.indexOf("Cantidad de facturas"), currencyCol = headers.indexOf("Abreviatura moneda");
    check([nameCol, amountCol, invoiceCol, currencyCol].every((index) => index > 0), "XLSX_COLUMNS");
    let amount = 0, invoices = 0, records = 0, numericMetrics = true, pyg = true, matchingSample = true;
    sales.eachRow((row, index) => {
      if (index === 1) return;
      const a = row.getCell(amountCol).value, n = row.getCell(invoiceCol).value;
      numericMetrics &&= typeof a === "number" && Number.isFinite(a) && typeof n === "number" && Number.isFinite(n);
      pyg &&= row.getCell(currencyCol).value === "PYG";
      amount += a; invoices += n; records++;
      if (records <= visible.length) {
        matchingSample &&= clean(row.getCell(nameCol).value) === visible[records - 1][0]
          && a === numeric(visible[records - 1].at(-2)) && n === numeric(visible[records - 1].at(-1));
      }
    });
    check(numericMetrics, "XLSX_NUMERIC_METRICS");
    check(pyg, "XLSX_PYG");
    check(matchingSample, "SAMPLE_MATCHES_EXCEL");
    check(records === action.totalRecords, "XLSX_FULL_RECORD_COUNT");
    check(amount === total.amount && invoices === total.invoices, "XLSX_CONTROL_TOTALS");
    const metadata = new Map(); info.eachRow((row) => metadata.set(row.getCell(1).value, row.getCell(2).value));
    check(metadata.get("Fecha desde") === from && metadata.get("Fecha hasta") === to && metadata.get("Agrupación") === group, "XLSX_PERIOD_AND_GROUP");
    check(metadata.get("Export ID") === action.exportId && metadata.get("Registros exportados") === records, "XLSX_EXPORT_METADATA");
    // Store only validation outcomes, not cells, totals or protected identities.
  };
  const chart = (body, type, points) => {
    const action = body.actions?.chart;
    check(action?.available === true, "CHART_AVAILABLE");
    check(action.type === type && action.format === "svg" && action.mimeType === "image/svg+xml", "CHART_TYPE_AND_FORMAT");
    check(action.pointCount === points.length && action.datasetCount === 1, "CHART_POINTS_AND_SERIES");
    check(action.valuePrefix === "₲" && !action.valueSuffix, "CHART_PYG_UNIT");
    check(!body.actions?.salesExport, "NO_STALE_EXPORT_WITH_CHART");
    check(!/!\[|data:image|<svg/i.test(body.response), "NO_IMAGE_DATA_IN_RESPONSE_TEXT");
    const encoded = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/]+={0,2})$/.exec(action.url ?? "")?.[1];
    check(Boolean(encoded) && encoded.length % 4 === 0 && encoded.length < 2800000, "CHART_DATA_URL");
    const bytes = Buffer.from(encoded, "base64"), svg = bytes.toString("utf8");
    check(bytes.toString("base64") === encoded && !svg.includes("\uFFFD"), "CHART_BASE64_UTF8");
    const root = /^\s*<svg\b([^>]*)>/i.exec(svg);
    check(Boolean(root) && /<\/svg>\s*$/.test(svg), "CHART_SVG_ROOT");
    check(!/<(?:script|foreignObject)\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|\b(?:href|src)\s*=/i.test(svg), "CHART_NO_ACTIVE_OR_EXTERNAL_CONTENT");
    check(!/\[PII_[A-Z_]+_\d+\]|\b(?:NaN|Infinity|undefined)\b/.test(svg), "CHART_VALID_CONTENT");
    const attribute = (text, name) => new RegExp(`\\b${name}=["']([^"']+)["']`).exec(text)?.[1];
    check(Number.isInteger(action.width) && action.width >= 300 && action.width <= 999
      && Number.isInteger(action.height) && action.height >= 250 && action.height <= 999, "CHART_DIMENSIONS");
    check(Number(attribute(root[1], "width")) === action.width && Number(attribute(root[1], "height")) === action.height
      && attribute(root[1], "viewBox") === `0 0 ${action.width} ${action.height}`, "CHART_VIEWBOX");
    const decode = (value) => value.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) => {
      const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : "\uFFFD";
    }).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/gi)].map((match) => ({ attributes: match[1], value: clean(decode(match[2])) }));
    const values = texts.filter((item) => attribute(item.attributes, "data-value-label") === "true");
    check(values.length === points.length, "CHART_VISIBLE_VALUE_COUNT");
    check(values.every((item, index) => item.value === `₲ ${new Intl.NumberFormat("es-PY").format(points[index].amount)}`), "CHART_EXACT_MONTHLY_AMOUNTS");
    check(values.every((item) => {
      const x = Number(attribute(item.attributes, "x")), y = Number(attribute(item.attributes, "y"));
      return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= action.width && y >= 0 && y <= action.height;
    }), "CHART_VALUE_ANCHORS_IN_VIEWBOX");
    check(points.every((point) => texts.some((item) => [point.month, `2023-${point.month}`, point.name].includes(item.value.toLowerCase()))), "CHART_MONTH_LABELS");
  };
  const comparison = (body, from, to) => {
    check(!body.actions?.chart && !body.actions?.salesExport, "COMPARISON_NO_STALE_ACTIONS");
    for (const year of [2023, 2024]) {
      const first = `01/${String(from).padStart(2, "0")}/${year}`;
      const last = `${new Date(Date.UTC(year, to, 0)).getUTCDate()}/${String(to).padStart(2, "0")}/${year}`;
      check(clean(body.response).includes(`${year}: ${first} a ${last}.`), "COMPARISON_PERIODS");
    }
    const table = body.response.split("\n").filter((line) => /^\s*\|/.test(line)).map((line) => line.split("|").slice(1, -1).map(clean));
    check(JSON.stringify(table[0]) === JSON.stringify(["Mes", "Ventas 2023", "Facturas 2023", "Ventas 2024", "Facturas 2024"]), "COMPARISON_COLUMNS");
    const rows = table.slice(1).filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell)));
    check(rows.length === to - from + 1 && rows.every((row, index) => row.length === 5 && row[0].toLowerCase() === monthNames[from + index - 1]), "COMPARISON_MONTH_ORDER");
    let missing = true, numbers = true, currency = true;
    const comparable = [];
    rows.forEach((row, index) => {
      const month = from + index;
      if (comparisonControls[2023][month - 1] && comparisonControls[2024][month - 1]) comparable.push(month);
      [2023, 2024].forEach((year, column) => {
        const values = comparisonControls[year][month - 1], offset = 1 + column * 2;
        if (!values) missing &&= row[offset].toLowerCase() === "sin registros" && row[offset + 1].toLowerCase() === "sin registros";
        else {
          numbers &&= numeric(row[offset]) === values[0] && numeric(row[offset + 1]) === values[1];
          currency &&= row[offset].startsWith("₲ ") && !row[offset + 1].includes("₲");
        }
      });
    });
    check(missing, "COMPARISON_MISSING_IS_NOT_ZERO");
    check(numbers, "COMPARISON_CONTROL_VALUES");
    check(currency, "COMPARISON_PYG_AND_COUNTS");
    const notes = body.response.split("\n").map(clean).filter((line) => /^-\s/.test(line));
    check(notes.length === comparable.length * 2 && notes.every((line) => comparable.some((month) => line.toLowerCase().startsWith(`- ${monthNames[month - 1]}:`))), "COMPARISON_COMPARABLE_NOTES");
    for (const month of comparable) for (const metric of [0, 1]) {
      const delta = comparisonControls[2024][month - 1][metric] - comparisonControls[2023][month - 1][metric];
      const subject = metric === 0 ? "las ventas" : "la cantidad de facturas";
      const direction = metric === 0 ? (delta > 0 ? "fueron mayores" : delta < 0 ? "fueron menores" : "fueron iguales") : (delta > 0 ? "fue mayor" : delta < 0 ? "fue menor" : "fue igual");
      const note = notes.find((line) => line.toLowerCase().startsWith(`- ${monthNames[month - 1]}: ${subject}`));
      check(Boolean(note) && note.includes(`${subject} de 2024 ${direction} que en 2023`), "COMPARISON_NOTE_DIRECTIONS");
      const difference = `${metric === 0 ? "₲ " : ""}${new Intl.NumberFormat("es-PY").format(delta)}`;
      check(note.includes(`diferencia: ${difference})`), "COMPARISON_NOTE_DIFFERENCES");
    }
    if (!comparable.length) check(/No hay valores disponibles en ambos años para comparar/.test(body.response), "COMPARISON_NO_PAIRED_VALUES");
    check(/ausencia de filas/.test(body.response) && /no se reemplaza por cero/.test(body.response), "COMPARISON_MISSING_EXPLANATION");
    check(!/no (?:se registraron|hubo) ventas/i.test(body.response), "COMPARISON_NO_FALSE_ZERO_CLAIM");
  };
  const january = { from: "01/01/2023", to: "31/01/2023", month: "01", group: "customer", total: controls.january, rows: controls.january.rows };
  const cases = [
    ["reset-conversation", async () => {
      const result = await request("reset", "/chat/reset", { sessionId: config.sessionId }); check(result.success === true, "RESET_SUCCESS");
    }],
    ["missing-session", async () => {
      const result = await request("missing-session", "/chat", { message: "Ventas de enero de 2023" }, 400); check(result.success === false, "MISSING_SESSION_REJECTED");
    }],
    ["missing-export", async () => {
      const result = await request("missing-export", `/exports/sales/${randomUUID()}/${encodeURIComponent(config.sessionId)}`, undefined, 404); check(result.success === false, "MISSING_EXPORT_REJECTED");
    }],
    ["january-sales", async () => excel(await chat("Ventas de enero de 2023 por local, con monto total y cantidad de facturas"), january)],
    ["equivalent-january-sales", async () => excel(await chat("Muéstrame las ventas por local de enero de 2023, incluyendo importes y número de facturas"), january)],
    ["change-to-february", async () => excel(await chat("Muéstrame las ventas por local de febrero de 2023, incluyendo importes y número de facturas"), { ...january, from: "01/02/2023", to: "28/02/2023", month: "02", rows: undefined, total: controls.february })],
  ];
  if (["charts", "comparisons"].includes(config.suite)) cases.splice(1);
  if (["sales", "all"].includes(config.suite)) cases.push(
    ["january-by-category", async () => excel(await chat("Ventas de enero de 2023 por rubro, con monto total y cantidad de facturas"), { ...january, group: "category", rows: 34 })],
    ["filter-sports", async () => {
      const body = await chat("Ahora solo del rubro deportes");
      check(/deportes/i.test(body.response), "SPORTS_FILTER_LABEL");
      check(body.response.includes("2.994.866.457") && body.response.includes("7.049"), "SPORTS_SUMMARY_TOTALS");
      check(!body.actions?.salesExport, "NO_EXPORT_FOR_SINGLE_SUMMARY");
    }],
    ["sports-by-local", async () => {
      const body = await chat("Ahora por local"), rows = tableRows(body.response);
      check(rows.length === 5, "SPORTS_FIVE_LOCALS");
      check(rows.reduce((sum, row) => sum + numeric(row.at(-2)), 0) === controls.sports.amount
        && rows.reduce((sum, row) => sum + numeric(row.at(-1)), 0) === controls.sports.invoices, "SPORTS_DETAIL_TOTALS");
      check(!body.actions?.salesExport, "NO_EXPORT_FOR_FIVE_ROWS");
    }],
    ["remove-category-filter", async () => excel(await chat("Ahora todos los rubros, manteniendo enero de 2023 y el desglose por local"), january)],
  );
  if (config.suite === "all") cases.push(
    ["switch-to-vehicles", async () => {
      const body = await chat("Cuántos vehículos se registraron durante 2025");
      check(body.response.includes("01/01/2025") && body.response.includes("31/12/2025"), "VEHICLE_PERIOD");
      check(/Registros:\s*\*{0,2}23\b/.test(body.response) && /Matrículas únicas:\s*\*{0,2}23\b/.test(body.response) && /Socios identificados:\s*\*{0,2}7\b/.test(body.response), "VEHICLE_CONTROL_TOTALS");
      check(!body.actions?.salesExport, "NO_STALE_SALES_EXPORT");
    }],
    ["vehicles-by-gender", async () => {
      const body = await chat("Ahora por género"), rows = tableRows(body.response);
      check(body.response.includes("01/01/2025") && body.response.includes("31/12/2025"), "VEHICLE_PERIOD_PRESERVED");
      check(rows.some((row) => row[0] === "F" && numeric(row[1]) === 2) && rows.some((row) => row[0] === "M" && numeric(row[1]) === 21), "VEHICLE_GENDER_COUNTS");
      check(!body.actions?.salesExport, "NO_STALE_SALES_EXPORT");
    }],
  );
  if (["charts", "all"].includes(config.suite)) cases.push(
    ["chart-monthly-sales-source", async () => {
      const body = await chat("Ventas de enero a mayo de 2023 por mes, con monto total y cantidad de facturas");
      const rows = tableRows(body.response);
      check(rows.length === controls.monthly.length, "CHART_SOURCE_COMPLETE_MONTHS");
      check(body.response.includes("01/01/2023") && body.response.includes("31/05/2023"), "CHART_SOURCE_PERIOD");
      check(rows.every((row, index) => [controls.monthly[index].month, controls.monthly[index].name].includes(row[0].toLowerCase())
        && numeric(row.at(-2)) === controls.monthly[index].amount && numeric(row.at(-1)) === controls.monthly[index].invoices), "CHART_SOURCE_CONTROL_TOTALS");
      check(!body.actions?.chart && !body.actions?.salesExport, "NO_UNREQUESTED_CHART_OR_EXPORT");
    }],
    ["chart-sales-bars", async () => chart(await chat("Grafícalo en barras, usando únicamente el monto total de ventas"), "bar", controls.monthly)],
    ["chart-sales-lines", async () => chart(await chat("Ahora el mismo gráfico en líneas, conserva el período y el monto total de ventas"), "line", controls.monthly)],
    ["chart-sales-new-period", async () => chart(await chat("Ventas de enero a febrero de 2023 por mes en un gráfico de barras, solo el monto total"), "bar", controls.monthly.slice(0, 2))],
  );
  if (["comparisons", "all"].includes(config.suite)) cases.push(
    ["compare-full-years", async () => comparison(await chat("Compara las ventas de 2023 contra 2024, mes a mes, con monto total y cantidad de facturas"), 1, 12)],
    ["compare-january-may", async () => comparison(await chat("Ahora compara únicamente enero a mayo de ambos años"), 1, 5)],
    ["compare-august", async () => comparison(await chat("Ahora compara únicamente agosto a agosto de ambos años"), 8, 8)],
  );
  let stopped = false;
  for (const [id, execute] of cases) {
    step = { id, status: "skipped", requests: [], checks: [] }; report.steps.push(step);
    if (stopped) continue;
    progress(`Ejecutando ${id}...`);
    step.startedAt = new Date().toISOString(); const started = Date.now();
    try { await execute(); step.status = "passed"; }
    catch (error) { step.status = "failed"; step.error = error instanceof Failure ? error.code : "UNEXPECTED_ERROR"; stopped = true; }
    step.durationMs = Date.now() - started;
    progress(`${step.status === "passed" ? "OK" : "FALLO"}: ${id}${step.error ? ` (${step.error})` : ""}`);
  }
  report.finishedAt = new Date().toISOString();
  report.summary = Object.fromEntries(["passed", "failed", "skipped"].map((status) => [status, report.steps.filter((item) => item.status === status).length]));
  report.success = report.summary.failed === 0 && report.summary.skipped === 0;
  return report;
};

const main = async () => {
  if (process.argv.includes("--help")) {
    console.log("Variables: BOT_TEST_SESSION_ID (obligatorio), BOT_TEST_BASE_URL, BOT_TEST_SUITE=quick|sales|charts|comparisons|all, BOT_TEST_TIMEOUT_MS=90000, BOT_TEST_REPORT. Reinicia solo la conversación de esta sesión. Ejecutar en DEV. Reporte predeterminado: directorio temporal/chatbot-api-tests.json. No inicia sesión ni cambia su expiración.");
    return;
  }
  let config;
  try { config = readConfig(); } catch (error) { console.error(error instanceof Failure ? error.code : "INVALID_CONFIGURATION"); process.exitCode = 2; return; }
  const report = await runApiTests(config);
  try { await writeFile(config.reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 }); }
  catch { console.error("REPORT_WRITE_FAILED"); process.exitCode = 2; return; }
  console.log(`Reporte: ${config.reportPath}`);
  console.log(`Aprobadas: ${report.summary.passed}; fallidas: ${report.summary.failed}; omitidas: ${report.summary.skipped}.`);
  process.exitCode = report.success ? 0 : 1;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
