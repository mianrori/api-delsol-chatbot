import test from "node:test";
import assert from "node:assert/strict";
import { getSalesPerSqm } from "../src/services/sales/salesPerSqm.service.js";
import { getSalesPerSqmRepository } from "../src/repositories/sales/salesPerSqm.repository.js";
import { preserveSalesPerSqmFollowup } from "../src/services/ai/salesPerSqmFollowup.service.js";
import { buildSalesPerSqmResponse } from "../src/services/ai/salesPerSqmPresentation.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";
import { getCurrentUsdSellRateFromMaxicambios } from "../src/services/exchange/maxicambios.service.js";

const args = { customerIds: ["SYNTHETIC'CUSTOMER"], categoryIds: ["SYNTHETIC-CATEGORY"], dateFrom: "01/01/2023", dateTo: "31/05/2023", dayType: "weekend", groupBy: [] };
const metric = (extra = {}) => ({ TOTAL_AMOUNT: 1000, TOTAL_INVOICES: 5, SALES_ROW_COUNT: 5, SALES_PER_SQM_SOURCE: 10,
  MIN_AREA: 100, MAX_AREA: 100, AREA_VALUE_COUNT: 1, MISSING_AREA_ROWS: 0, AMBIGUOUS_AREA_ROWS: 0, INVALID_AREA_ROWS: 0,
  CURRENCY_ABBREVIATION: "PYG", CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_COUNT: 1, ...extra });
const connectionFor = (...rows) => ({ queries: [], async execute(sql, binds) { this.queries.push({ sql, binds }); return { rows }; } });
const rate = { getUsdSellRate: async () => ({ source: "Synthetic rate", sellRate: 2 }) };

test("historical area query binds filters and does not pick a contract or fall back around zero area", async () => {
  const connection = connectionFor(metric());
  const result = await getSalesPerSqm(args, connection, rate);
  const { sql, binds } = connection.queries[0];
  assert.equal(binds.customerId0, args.customerIds[0]);
  assert.equal(binds.categoryId0, args.categoryIds[0]);
  assert.equal(binds.dateFrom, args.dateFrom);
  assert.equal(binds.dateTo, args.dateTo);
  assert.ok(!sql.includes(args.customerIds[0]));
  assert.match(sql, /C.FEC_CONTRATO <= V.FECHA/);
  assert.match(sql, /C.FEC_VENCIMIENTO >= V.FECHA/);
  assert.match(sql, /CONTRACT_COUNT = 1 AND CONTRACT_AREA > 0/);
  assert.match(sql, /NULLIF\(TOTAL_SUP_LOCAL, 0\)/);
  assert.match(sql, /TRUNC\(V.FECHA, 'IW'\)/);
  assert.doesNotMatch(sql, /KEEP|C\.TOTAL_SUP_LOCAL > 0|ESTADO\s*=/);
  assert.equal(result.sales.pyg, 1000);
  assert.equal(result.sales.usd, 500);
  assert.equal(result.salesPerSqm.pyg, 10);
  assert.equal(result.salesPerSqm.usd, 5);
  assert.equal(result.exchange.currentRate, true);
});

test("missing, zero, partial and ambiguous areas never produce a per-square-meter value", async () => {
  for (const [fields, status] of [
    [{ MIN_AREA: null, MAX_AREA: null, MISSING_AREA_ROWS: 5 }, "AREA_NOT_AVAILABLE"],
    [{ MIN_AREA: null, MAX_AREA: null, MISSING_AREA_ROWS: 5, INVALID_AREA_ROWS: 5 }, "AREA_NOT_AVAILABLE"],
    [{ MIN_AREA: 100, MISSING_AREA_ROWS: 1 }, "AREA_PARTIALLY_AVAILABLE"],
    [{ MIN_AREA: 100, MISSING_AREA_ROWS: 1, AMBIGUOUS_AREA_ROWS: 1 }, "AREA_AMBIGUOUS"],
  ]) {
    const result = await getSalesPerSqm(args, connectionFor(metric({ ...fields, SALES_PER_SQM_SOURCE: null })), rate);
    assert.equal(result.status, status);
    assert.equal(result.sales.pyg, 1000);
    assert.equal(result.salesPerSqm.pyg, null);
    assert.equal(result.salesPerSqm.usd, null);
  }
  const zero = await getSalesPerSqm(args, connectionFor(metric({ MIN_AREA: 0, MAX_AREA: 0, SALES_PER_SQM_SOURCE: null })), rate);
  assert.equal(zero.area.complete, false);
  assert.equal(zero.salesPerSqm.pyg, null);
});

test("changing historical areas retains the sum of per-sale ratios rather than dividing by the last area", async () => {
  // Two historical sales: 1000/100 + 1000/200 = 15, not 2000/200 = 10.
  const result = await getSalesPerSqm(args, connectionFor(metric({ TOTAL_AMOUNT: 2000, SALES_PER_SQM_SOURCE: 15, MIN_AREA: 100, MAX_AREA: 200, AREA_VALUE_COUNT: 2 })), rate);
  assert.equal(result.salesPerSqm.pyg, 15);
  assert.equal(result.area.changedWithinPeriod, true);
  assert.equal(result.salesPerSqm.usd, 7.5);
});

test("USD is native, mixed currencies have no summed amount and unknown/conflicting currency is not guessed", async () => {
  const noRate = { getUsdSellRate: async () => assert.fail("No PYG conversion expected") };
  const usd = await getSalesPerSqm(args, connectionFor(metric({ CURRENCY_ABBREVIATION: "USD", CURRENCY_DESCRIPTION: "DOLARES" })), noRate);
  assert.equal(usd.sales.usd, 1000);
  assert.equal(usd.sales.pyg, null);
  assert.equal(usd.salesPerSqm.usd, 10);
  const mixed = await getSalesPerSqm(args, connectionFor(metric({ CURRENCY_COUNT: 2, SALES_PER_SQM_SOURCE: null })), noRate);
  assert.equal(mixed.status, "MIXED_CURRENCY");
  assert.equal(mixed.totalSales, null);
  assert.equal(mixed.sales.pyg, null);
  for (const fields of [{ CURRENCY_ABBREVIATION: "EUR" }, { CURRENCY_ABBREVIATION: "USD", CURRENCY_DESCRIPTION: "GUARANIES" }]) {
    const result = await getSalesPerSqm(args, connectionFor(metric(fields)), noRate);
    assert.equal(result.status, "CURRENCY_NOT_SUPPORTED");
    assert.equal(result.sales.usd, null);
  }
});

test("failed, zero, negative or nonfinite FX leaves PYG exact and USD unavailable", async () => {
  for (const getUsdSellRate of [async () => { throw Error("Offline"); }, ...[0, -1, NaN, Infinity].map(sellRate => async () => ({ sellRate }))]) {
    const result = await getSalesPerSqm(args, connectionFor(metric()), { getUsdSellRate });
    assert.equal(result.sales.pyg, 1000);
    assert.equal(result.salesPerSqm.pyg, 10);
    assert.equal(result.sales.usd, null);
    assert.equal(result.exchange.available, false);
  }
});

test("exchange parsing selects Venta rather than Compra and rejects a zero quote", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("<span>Dólar</span> Compra 6.900 Venta 7.100");
    const result = await getCurrentUsdSellRateFromMaxicambios();
    assert.equal(result.sellRate, 7100);
    globalThis.fetch = async () => new Response("Dólar Compra 6.900 Venta 0");
    await assert.rejects(getCurrentUsdSellRateFromMaxicambios());
  } finally { globalThis.fetch = original; }
});

test("missing monthly observations are separate from real zero-valued sales", async () => {
  const result = await getSalesPerSqm({ ...args, dateTo: "28/02/2023", groupBy: ["month"] }, connectionFor(metric({ MONTH: "01/2023", TOTAL_AMOUNT: 0, TOTAL_INVOICES: 0, SALES_PER_SQM_SOURCE: 0 })), rate);
  assert.equal(result.data[0].status, "OK");
  assert.equal(result.data[0].salesPerSqm.pyg, 0);
  assert.equal(result.data[1].month, "02/2023");
  assert.equal(result.data[1].status, "NO_SALES");
  assert.equal(result.data[1].salesPerSqm.pyg, null);
});

test("invalid dates, filters, grouping or mixed-local aggregates fail before querying", async () => {
  for (const fields of [{ dateFrom: "31/02/2023" }, { dateTo: "01/01/2022" }, { customerIds: [{}] }, { categoryIds: [""] },
    { dayType: "typo" }, { groupBy: ["typo"] }, { groupBy: ["month", "month"] }, { customerIds: ["A", "B"], groupBy: ["month"] }]) {
    const connection = connectionFor();
    await assert.rejects(getSalesPerSqm({ ...args, ...fields }, connection, rate));
    assert.equal(connection.queries.length, 0);
  }
});

test("cancellation during the exchange lookup is propagated without returning data", async () => {
  const cancellation = new AbortController();
  await assert.rejects(runWithRequestSignal(cancellation.signal, () => getSalesPerSqm(args, connectionFor(metric()), {
    getUsdSellRate: async () => { cancellation.abort(); return { sellRate: 2 }; },
  })), { code: "REQUEST_ABORTED" });
});

const history = () => [
  { role: "user", content: [{ text: "Ventas por m²" }] },
  { role: "assistant", content: [{ toolUse: { name: "get_sales_per_sqm", toolUseId: "sqm", input: structuredClone(args) } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "sqm", status: "success", content: [{ json: { dateFrom: args.dateFrom, dateTo: args.dateTo } }] } }] },
];
test("single-field followups retain every other filter and never resolve names as IDs", () => {
  const h = history();
  const period = preserveSalesPerSqmFollowup({ message: "Ahora cambia el período a 01/02/2023 al 28/02/2023; conserva los demás filtros", history: h,
    input: { dateFrom: "01/02/2023", dateTo: "28/02/2023", categoryIds: [] } });
  assert.deepEqual(period, { ...args, dateFrom: "01/02/2023", dateTo: "28/02/2023" });
  for (const [label, key] of [["local", "customerIds"], ["rubro", "categoryIds"]]) {
    const result = preserveSalesPerSqmFollowup({ message: `Ahora cambia el ${label} a "Otro nombre"; conserva los demás filtros`, history: h, input: { [key]: ["RESOLVED-ID"] } });
    assert.deepEqual(result, { ...args, [key]: ["RESOLVED-ID"] });
  }
  const failed = history(); failed[2].content[0].toolResult.status = "error";
  assert.equal(preserveSalesPerSqmFollowup({ message: 'Ahora cambia el local a "Otro"; conserva los demás filtros', history: failed, input: { customerIds: ["B"] } }), null);
  assert.equal(preserveSalesPerSqmFollowup({ message: 'Ahora cambia el local a "Otro" y elimina el rubro; conserva los demás filtros', history: h, input: { customerIds: ["B"] } }), null);
  h.push({ role: "user", content: [{ text: "Compras" }] });
  assert.equal(preserveSalesPerSqmFollowup({ message: 'Ahora cambia el local a "Otro"; conserva los demás filtros', history: h, input: { customerIds: ["B"] } }), null);
});

test("presentation uses returned values, distinguishes ambiguity and never turns a missing metric into zero", async () => {
  const result = await getSalesPerSqm(args, connectionFor(metric({ AMBIGUOUS_AREA_ROWS: 1, MISSING_AREA_ROWS: 1, SALES_PER_SQM_SOURCE: null })), rate);
  const text = buildSalesPerSqmResponse([{ name: "get_sales_per_sqm", input: args, result }]);
  assert.match(text, /Ambigua/);
  assert.match(text, /sin cálculo de ventas por m²/);
  assert.match(text, /1\.000 \| — \| 500 \| —/);
  assert.match(text, /cotización de venta actual/);
  assert.ok(!text.includes("AREA_AMBIGUOUS"));
  assert.equal(buildSalesPerSqmResponse([{ name: "get_sales" }]), null);
});
