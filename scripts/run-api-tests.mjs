import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const controls = {
  january: { amount: 58706137966, invoices: 366427, rows: 180 },
  february: { amount: 63255876492, invoices: 358354 },
  sports: { amount: 2994866457, invoices: 7049, rows: 5 },
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
  if (!["quick", "sales", "all"].includes(suite)) throw new Failure("INVALID_SUITE");
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
    description: "DEV regression using January/February 2023 control totals. No session IDs, export IDs, names, response bodies or workbook rows are stored.", steps: [] };
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
  if (config.suite !== "quick") cases.push(
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
    console.log("Variables: BOT_TEST_SESSION_ID (obligatorio), BOT_TEST_BASE_URL, BOT_TEST_SUITE=quick|sales|all, BOT_TEST_TIMEOUT_MS=90000, BOT_TEST_REPORT. Reinicia solo la conversación de esta sesión. Ejecutar en DEV. Reporte predeterminado: directorio temporal/chatbot-api-tests.json. No inicia sesión ni cambia su expiración.");
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
