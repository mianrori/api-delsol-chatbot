import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readConfig, runApiTests, controls } from "../scripts/run-api-tests.mjs";
import { generateChart } from "../src/services/charts/chart.service.js";

const session = "test-session-secret";
const num = (value) => new Intl.NumberFormat("es-PY").format(value);
const fakeWorkbook = (buffer) => {
  const { rows, info } = JSON.parse(buffer.subarray(2));
  const wrap = (values) => ({ values: [undefined, ...values], getCell: (index) => ({ value: values[index - 1] }) });
  const sheet = (data) => ({ getRow: (index) => wrap(data[index - 1]), eachRow: (fn) => data.forEach((row, index) => fn(wrap(row), index + 1)) });
  return { getWorksheet: (name) => name === "Ventas" ? sheet(rows) : name === "Información" ? sheet(info) : undefined };
};
const mockApi = async (options = {}) => {
  const exports = new Map(); let chats = 0, downloads = 0;
  const server = createServer(async (req, res) => {
    let body = ""; for await (const part of req) body += part;
    const data = body ? JSON.parse(body) : null;
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ env: options.env ?? "development", ...value })); };
    if (req.url.endsWith("/chat/reset")) return json(200, { success: true });
    if (req.url.endsWith("/chat") && !data.sessionId) return json(400, { success: false });
    if (req.url.includes("/exports/sales/")) {
      const id = req.url.split("/").at(-2), record = exports.get(id);
      if (!record) return json(404, { success: false });
      downloads++;
      res.writeHead(200, { "Content-Type": options.badMime ? "text/plain" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      res.end(Buffer.from("PK" + JSON.stringify(record.workbook))); return;
    }
    chats++;
    if (options.timeout) return;
    const question = data.message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/\bgrafic/.test(question)) {
      const newPeriod = question.includes("enero a febrero");
      const points = newPeriod && !options.staleChartPeriod ? controls.monthly.slice(0, 2) : controls.monthly;
      const rows = points.map((point) => ({ month: point.month, totalAmount: point.amount, currency: { abbreviation: "PYG" } }));
      if (options.wrongChartAmount) rows[0].totalAmount = 1;
      const generated = await generateChart({ type: question.includes("lineas") ? "line" : "bar", title: "Ventas 2023", labelPaths: ["month"], datasets: [{ label: "Ventas", valuePath: "totalAmount" }] }, { sources: { example: { name: "get_sales", result: { data: rows } } } });
      const chart = generated.chart;
      if (options.wrongChartUnit) chart.valuePrefix = "US$";
      let svg = Buffer.from(chart.url.split(",")[1], "base64").toString();
      if (options.missingChartValues) svg = svg.replaceAll('data-value-label="true"', 'data-hidden-value="true"');
      if (options.activeSvg) svg = svg.replace("</svg>", "<script>alert(1)</script></svg>");
      chart.url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      if (options.invalidChartData) chart.url = "data:image/svg+xml;base64,%%%";
      return json(200, { success: true, response: "Aquí tienes el gráfico solicitado.", actions: { chart } });
    }
    if (question.includes("enero a mayo")) {
      const response = "Período: 01/01/2023 a 31/05/2023.\n| Mes | Ventas | Facturas |\n| --- | --- | --- |\n" + controls.monthly.map((row) => `| ${row.name} | ₲ ${num(row.amount)} | ${num(row.invoices)} |`).join("\n");
      return json(200, { success: true, response, actions: {} });
    }
    if (data.message.includes("vehículos")) return json(200, { success: true, response: "Fecha de registro: 01/01/2025 a 31/12/2025.\nRegistros: **23**. Matrículas únicas: **23**. Socios identificados: **7**.", actions: {} });
    if (data.message === "Ahora por género") return json(200, { success: true, response: "Fecha de registro: 01/01/2025 a 31/12/2025.\n| Género | Registros | Matrículas únicas | Socios identificados |\n| --- | --- | --- | --- |\n| F | 2 | 2 | 1 |\n| M | 21 | 21 | 6 |", actions: {} });
    if (data.message === "Ahora solo del rubro deportes") return json(200, { success: true, response: "DEPORTES: ₲ 2.994.866.457 y 7.049 facturas.", actions: {} });
    const sports = data.message === "Ahora por local", category = data.message.includes("por rubro");
    const february = data.message.includes("febrero"), month = february ? "02" : "01", end = february ? "28" : "31";
    const total = sports ? controls.sports : february ? controls.february : controls.january, count = sports ? 5 : category ? 34 : february ? 181 : 180;
    const id = options.sameExport ? "secret-export-1" : `secret-export-${chats}`;
    const fileName = `ventas_por_${category ? "rubro" : "local"}_2023${month}01_a_2023${month}${end}_2026_10_29.xlsx`;
    const rows = Array.from({ length: count }, (_, index) => [`Private Shop ${index}`, index ? 0 : total.amount, index ? 0 : total.invoices, "GUARANIES", "PYG"]);
    const response = `Período: 01/${month}/2023 a ${end}/${month}/2023.\n| Local | Ventas | Facturas |\n| --- | --- | --- |\n`
      + rows.slice(0, 12).map((row) => `| ${row[0]} | ₲ ${num(row[1])} | ${num(row[2])} |`).join("\n") + `\nSe muestran 12 de ${count} registros.`;
    if (sports) return json(200, { success: true, response, actions: {} });
    const info = [["Campo", "Valor"], ["Fecha desde", `01/${month}/2023`], ["Fecha hasta", `${end}/${month}/2023`], ["Agrupación", category ? "category" : "customer"], ["Export ID", id], ["Registros exportados", count], ["Usuario", "PRIVATE_OWNER"]];
    if (options.wrongAmount) rows.at(-1)[1] = 1;
    exports.set(id, { workbook: { rows: [[category ? "Rubro" : "Local", "Importe total", "Cantidad de facturas", "Moneda", "Abreviatura moneda"], ...rows], info } });
    json(200, { success: true, response, actions: { salesExport: { available: true, exportId: id, totalRecords: count, format: "xlsx", fileName, expiresAt: new Date(Date.now() + 600000).toISOString() } } });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { baseUrl: `http://127.0.0.1:${server.address().port}/chatbot/api/bot`,
    counts: () => ({ chats, downloads }), close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
};
const execute = async (options = {}) => {
  const api = await mockApi(options);
  try {
    const report = await runApiTests({ ...readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_SUITE: options.suite ?? "quick", BOT_TEST_BASE_URL: api.baseUrl }), timeoutMs: options.timeout ? 100 : 3000 }, { loadWorkbook: fakeWorkbook, progress: () => {} });
    return { report, counts: api.counts() };
  } finally { await api.close(); }
};

test("local API runner validates HTTP, fresh exports, Excel totals and changed month in sequence", async () => {
  const { report, counts } = await execute();
  assert.equal(report.success, true);
  assert.equal(report.summary.passed, 6);
  assert.deepEqual(counts, { chats: 3, downloads: 3 });
  assert.ok(report.steps.at(-1).checks.some((check) => check.code === "XLSX_PERIOD_AND_GROUP" && check.passed));
  for (const secret of [session, "secret-export", "Private Shop", "PRIVATE_OWNER", String(controls.january.amount)]) assert.ok(!JSON.stringify(report).includes(secret));
});

test("runner detects a full Excel total mismatch and stops dependent steps", async () => {
  const { report, counts } = await execute({ wrongAmount: true });
  assert.equal(report.steps[3].error, "XLSX_CONTROL_TOTALS");
  assert.equal(report.summary.skipped, 2);
  assert.equal(counts.chats, 1);
});

test("full runner preserves the sports/category and vehicle sequence without stale exports", async () => {
  const { report, counts } = await execute({ suite: "all" });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.summary.passed, 16);
  assert.deepEqual(counts, { chats: 13, downloads: 5 });
});

test("chart suite validates real SVG bars, lines and a new period without storing images", async () => {
  const { report, counts } = await execute({ suite: "charts" });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.summary.passed, 5);
  assert.deepEqual(counts, { chats: 4, downloads: 0 });
  for (const code of ["CHART_EXACT_MONTHLY_AMOUNTS", "CHART_MONTH_LABELS", "CHART_VALUE_ANCHORS_IN_VIEWBOX"]) {
    assert.ok(report.steps.at(-1).checks.some((check) => check.code === code && check.passed));
  }
  assert.doesNotMatch(JSON.stringify(report), /data:image|<svg|58\.706\.137\.966/);
});

test("chart suite detects incorrect units, hidden values, wrong amounts and active SVG content", async () => {
  for (const [flag, code] of [
    ["wrongChartUnit", "CHART_PYG_UNIT"], ["missingChartValues", "CHART_VISIBLE_VALUE_COUNT"],
    ["wrongChartAmount", "CHART_EXACT_MONTHLY_AMOUNTS"], ["activeSvg", "CHART_NO_ACTIVE_OR_EXTERNAL_CONTENT"],
    ["invalidChartData", "CHART_DATA_URL"],
  ]) {
    const { report } = await execute({ suite: "charts", [flag]: true });
    assert.equal(report.steps[2].error, code);
    assert.equal(report.summary.skipped, 2);
  }
});

test("chart suite detects when a changed period retains points from the old chart", async () => {
  const { report } = await execute({ suite: "charts", staleChartPeriod: true });
  assert.equal(report.steps[4].error, "CHART_POINTS_AND_SERIES");
});

test("runner rejects reused export IDs and invalid download MIME types", async () => {
  const repeated = await execute({ sameExport: true });
  assert.equal(repeated.report.steps[4].error, "NEW_EXPORT_ID");
  const mime = await execute({ badMime: true });
  assert.equal(mime.report.steps[3].error, "XLSX_MIME_TYPE");
});

test("runner bounds hung requests, redacts errors and refuses non-development responses", async () => {
  const timeout = await execute({ timeout: true });
  assert.equal(timeout.report.steps[3].error, "REQUEST_TIMEOUT");
  const production = await execute({ env: "production" });
  assert.equal(production.report.steps[0].error, "DEVELOPMENT_ENVIRONMENT");
  assert.equal(production.counts.chats, 0);
});

test("runner configuration requires a session and rejects credentials in URLs", () => {
  assert.throws(() => readConfig({}), /SESSION_ID_REQUIRED/);
  assert.throws(() => readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_BASE_URL: "http://user:password@localhost:5400" }), /INVALID_BASE_URL/);
  assert.throws(() => readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_TIMEOUT_MS: "0" }), /INVALID_TIMEOUT/);
  assert.throws(() => readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_SUITE: "unknown" }), /INVALID_SUITE/);
});
