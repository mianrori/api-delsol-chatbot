import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesSeriesResponse } from "../src/services/ai/salesSeriesPresentation.service.js";
const currency = { abbreviation: "PYG", symbol: "₲", symbolPosition: "prefix" };
const amounts = [58706137966, 63255876492, 64924535090, 72875754527, 86767167311];
const invoices = [366427, 358354, 360316, 361387, 432821];
const data = amounts.map((totalAmount, i) => ({ month: String(i + 1).padStart(2, "0"), totalAmount, totalInvoices: invoices[i], currency }));
const calls = (rows = data, input = {}, extra = {}) => [{ name: "get_sales", input: { dateFrom: "01/01/2023", dateTo: "31/05/2023", groupBy: ["month"], metrics: ["totalAmount", "totalInvoices"], ...input }, result: { data: rows, ...extra } }];

test("regression: increasing sales cannot turn an intervening invoice drop into sustained growth", () => {
  const result = buildSalesSeriesResponse(calls(data, {}, { insights: { metrics: { totalInvoices: { trend: { direction: "increasing" } } } } }));
  assert.match(result, /Las ventas aumentaron en cada período mostrado/);
  assert.match(result, /La cantidad de facturas presentó subidas y bajadas/);
  assert.match(result, /366.427 a 358.354, entre Enero y Febrero \(-8.073; -2,20 %\)/);
  assert.doesNotMatch(result, /facturas.*(?:sostenid|en cada período)/);
  assert.match(result, /₲ 86.767.167.311/);
  assert.equal((result.match(/^\| (?:Enero|Febrero|Marzo|Abril|Mayo) /gm) ?? []).length, 5);
});

test("all transitions matter even when the first and last values increase", () => {
  const result = buildSalesSeriesResponse(calls(data.map((row, i) => ({ ...row, totalAmount: [100, 200, 50, 80, 300][i] }))));
  assert.match(result, /Las ventas presentaron subidas y bajadas/);
  assert.match(result, /₲ 200 a ₲ 50, entre Febrero y Marzo/);
  assert.doesNotMatch(result, /Las ventas aumentaron en cada período/);
});

test("falling, flat and nondecreasing series get distinct truthful descriptions", () => {
  for (const [values, expected] of [
    [[5, 4, 3, 2, 1], /disminuyeron en cada período/],
    [[3, 3, 3, 3, 3], /se mantuvieron sin variación/],
    [[1, 1, 2, 3, 3], /aumentaron sin caídas; hubo períodos sin variación/],
  ]) assert.match(buildSalesSeriesResponse(calls(data.map((row, i) => ({ ...row, totalAmount: values[i] })), { metrics: ["totalAmount"] })), expected);
});

test("missing observations never become zero or a claim of continuous growth", () => {
  const result = buildSalesSeriesResponse(calls(data.map((row, i) => ({ ...row, totalInvoices: i === 1 ? null : row.totalInvoices }))));
  assert.match(result, /Sin datos/);
  assert.match(result, /no se interpreta la evolución porque hay datos faltantes/);
  assert.doesNotMatch(result, /facturas.*aumentó/);
});

test("periods are ordered chronologically and source gaps do not create invented months", () => {
  const result = buildSalesSeriesResponse(calls([data[4], data[0], data[2]]));
  assert.ok(result.indexOf("| Enero") < result.indexOf("| Marzo"));
  assert.ok(result.indexOf("| Marzo") < result.indexOf("| Mayo"));
  assert.doesNotMatch(result, /\| Febrero|\| Abril/);
});

test("currencies are rendered and interpreted independently", () => {
  const rows = data.slice(0, 2).concat(data.slice(0, 2).map((row, i) => ({ ...row, totalAmount: 2 - i, currency: { symbol: "US$", abbreviation: "USD", symbolPosition: "prefix" } })));
  const result = buildSalesSeriesResponse(calls(rows, { metrics: ["totalAmount"] }));
  assert.match(result, /Moneda: ₲/); assert.match(result, /Moneda: US\$/);
  assert.match(result, /aumentaron en cada período/); assert.match(result, /disminuyeron en cada período/);
});

test("sampled results, duplicate periods, mixed dimensions and unrelated tool chains keep their existing paths", () => {
  assert.equal(buildSalesSeriesResponse(calls(data, {}, { resultSet: { truncated: true } })), null);
  assert.equal(buildSalesSeriesResponse(calls([data[0], data[0]])), null);
  assert.equal(buildSalesSeriesResponse(calls(data, { groupBy: ["month", "customer"] })), null);
  assert.equal(buildSalesSeriesResponse([...calls(), { name: "generate_chart" }]), null);
  assert.equal(buildSalesSeriesResponse(calls(data, { dateTo: "31/05/2024" })), null);
});

test("explicit statistical analysis and table-only requests are preserved", () => {
  assert.equal(buildSalesSeriesResponse(calls(), { message: "Analiza las anomalías y el ticket promedio" }), null);
  const result = buildSalesSeriesResponse(calls(), { message: "Ventas por mes, solo tabla" });
  assert.match(result, /86.767.167.311/); assert.doesNotMatch(result, /subidas y bajadas|cada período/);
});
