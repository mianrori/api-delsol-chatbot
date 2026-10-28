import test from "node:test";
import assert from "node:assert/strict";
import { generateChart } from "../src/services/charts/chart.service.js";
import { getChartSources, isChartRequest } from "../src/services/charts/chartSource.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";
const rows = [{ month: "2025-04", vehicleCount: 2 }, { month: "2025-06", vehicleCount: 1 }, { month: "2025-07", vehicleCount: 7 }];
const sources = { source: { name: "get_vehicle_registrations", result: { data: rows } } };
const args = { sourceToolUseId: "source", type: "line", labelPaths: ["month"], datasets: [{ label: "Vehículos registrados", valuePath: "vehicleCount" }] };
const svg = (chart) => Buffer.from(chart.url.split(",")[1], "base64").toString();
const turn = (name, id, result) => [
  { role: "user", content: [{ text: "Consulta" }] },
  { role: "assistant", content: [{ toolUse: { name, toolUseId: id } }] },
  { role: "user", content: [{ toolResult: { toolUseId: id, status: "success", content: [{ json: result }] } }] },
];

test("charts use exact server result paths and return local image URLs with the frontend contract", async () => {
  for (const type of ["bar", "horizontalBar", "line", "pie"]) {
    const result = await generateChart({ ...args, type }, { sources });
    assert.equal(result.chart.available, true);
    assert.match(result.chart.url, /^data:image\/svg\+xml;base64,/);
    assert.equal(result.result.sourceToolUseId, "source");
    assert.equal(result.chart.pointCount, 3);
    assert.match(svg(result.chart), /2025-04/);
    assert.doesNotMatch(svg(result.chart), /image-charts|https?:\/\/(?!www.w3.org)/);
  }
  assert.deepEqual(sources.source.result.data, rows);
});

test("numeric values cannot be supplied or fabricated by the model", async () => {
  const result = await generateChart({ ...args, datasets: [{ label: "Registros", valuePath: "vehicleCount", values: [999, 999, 999] }] }, { sources });
  assert.doesNotMatch(svg(result.chart), /999/);
  for (const bad of [null, undefined, "2", NaN, Infinity]) {
    const invalid = { source: { result: { data: [{ month: "2025-04", vehicleCount: bad }, rows[1]] } } };
    await assert.rejects(generateChart(args, { sources: invalid }), /número explícito/);
  }
  await assert.rejects(generateChart({ ...args, sourceToolUseId: "invented" }, { sources }), /resultado de consulta/);
});

test("limited result sets and paginated details cannot become complete charts", async () => {
  for (const limit of [
    { resultSet: { truncated: true } }, { resultSet: { analysisPolicy: "NO_ANALYSIS" } },
    { pagination: { hasMore: true } }, { pagination: { page: 2 } }, { page: 2 }, { summary: { hasMore: true } }, { hasMore: true },
  ]) await assert.rejects(generateChart(args, { sources: { source: { result: { data: rows, ...limit } } } }), /limitado o paginado/);
});

test("currency must be explicit and consistent, and incompatible metrics cannot be mixed", async () => {
  const data = rows.map((r) => ({ ...r, totalAmount: r.vehicleCount * 1000, currency: { abbreviation: "PYG" } }));
  const context = { sources: { source: { result: { data } } } };
  const money = { ...args, datasets: [{ label: "Ventas", valuePath: "totalAmount" }] };
  const result = await generateChart(money, context);
  assert.equal(result.chart.valuePrefix, "₲");
  await assert.rejects(generateChart({ ...money, datasets: [...money.datasets, args.datasets[0]] }, context), /unidades diferentes/);
  context.sources.source.result.data[1].currency.abbreviation = "USD";
  await assert.rejects(generateChart(money, context), /moneda explícita y única/);
  for (const r of data) delete r.currency;
  await assert.rejects(generateChart(money, context), /moneda explícita y única/);
});

test("soles and percentages keep their units and signs without inventing money or null values", async () => {
  const context = { sources: { source: { result: { data: [{ type: "Normal", totalSolesUsed: 3.5, percentage: 10 }, { type: "Obsequio", totalSolesUsed: -1, percentage: null }] } } } };
  const soles = { ...args, labelPaths: ["type"], datasets: [{ label: "Soles", valuePath: "totalSolesUsed" }] };
  const result = await generateChart(soles, context);
  assert.equal(result.chart.valuePrefix, null); assert.equal(result.chart.valueSuffix, " soles");
  assert.match(svg(result.chart), /-1 soles/);
  await assert.rejects(generateChart({ ...soles, type: "pie" }, context), /no negativos/);
  await assert.rejects(generateChart({ ...soles, datasets: [{ label: "Porcentaje", valuePath: "percentage" }] }, context), /número explícito/);
});

test("SVG escapes all labels and restored titles and never includes executable markup", async () => {
  const value = '<script>alert("x")</script>';
  const result = await generateChart({ ...args, title: value }, { sources, restoreText: (text) => text === "2025-04" ? '<img onerror="x">' : text });
  assert.doesNotMatch(svg(result.chart), /<script|<img/);
  assert.match(svg(result.chart), /&lt;script&gt;/);
  assert.match(svg(result.chart), /&lt;img/);
});

test("missing labels, prototype paths, arbitrary metrics and oversized charts are rejected", async () => {
  for (const invalid of [
    { dataPath: "constructor.prototype" }, { labelPaths: ["__proto__"] }, { labelPaths: ["customerId"] }, { labelPaths: [] },
    { labelPaths: ["missing"] }, { type: "scatter" }, { width: 1000 }, { height: 0 },
    { datasets: [{ label: "X", valuePath: "month" }] }, { datasets: [] },
  ]) await assert.rejects(generateChart({ ...args, ...invalid }, { sources }));
  await assert.rejects(generateChart(args, { sources: { source: { result: { data: Array(101).fill(rows[0]) } } } }), /100 filas/);
  await assert.rejects(generateChart({ ...args, type: "pie" }, { sources: { source: { result: { data: Array(9).fill(rows[0]) } } } }), /ocho categorías/);
});

test("chart sources come only from successful business results in the applicable topic", () => {
  const history = [...turn("get_vehicle_registrations", "v", { data: rows }), { role: "user", content: [{ text: "Grafícalo" }] }];
  assert.deepEqual(Object.keys(getChartSources(history)), ["v"]);
  const unrelated = [...turn("get_vehicle_registrations", "v", { data: rows }), ...turn("search_members", "m", { status: "NOT_FOUND" }), { role: "user", content: [{ text: "Grafícalo" }] }];
  assert.deepEqual(getChartSources(unrelated), {});
  const chartFollowup = [...turn("get_vehicle_registrations", "v", { data: rows }), ...turn("generate_chart", "c", { generated: true, sourceToolUseId: "v" }), { role: "user", content: [{ text: "Grafícalo en barras" }] }];
  assert.deepEqual(Object.keys(getChartSources(chartFollowup)), ["v"]);
  history[2].content[0].toolResult.status = "error";
  assert.deepEqual(getChartSources(history), {});
});

test("chart requests are recognized in Spanish and cancelled requests do not render", async () => {
  for (const message of ["Grafícalo", "Gráficame las ventas por mes", "Visualiza esos resultados", "Vehículos por mes en un gráfico"]) assert.equal(isChartRequest(message), true);
  assert.equal(isChartRequest("Vehículos por mes"), false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runWithRequestSignal(controller.signal, () => generateChart(args, { sources })));
});


test("nested dimension labels and explicit nested monetary units remain tied to their source", async () => {
  const result = await generateChart({ ...args, labelPaths: ["dimensions.0.name"], datasets: [{ label: "Ventas", valuePath: "sales.amount" }] }, { sources: { source: { result: { data: [
    { dimensions: [{ name: "Local A" }], sales: { amount: 2000, currency: { abbreviation: "PYG" } } },
    { dimensions: [{ name: "Local B" }], sales: { amount: 1000, currency: { abbreviation: "PYG" } } },
  ] } } } });
  assert.equal(result.chart.valuePrefix, "₲");
  assert.match(svg(result.chart), /Local A/);
  assert.match(svg(result.chart), /2.000/);
});

test("a failed query in the current turn cannot reuse a previous topic as chart data", () => {
  const history = [...turn("get_vehicle_registrations", "old", { data: rows }), ...turn("get_sales", "failed", {})];
  history.at(-1).content[0].toolResult.status = "error";
  assert.deepEqual(getChartSources(history), {});
});
