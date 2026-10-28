import test from "node:test";
import assert from "node:assert/strict";
import { resolveSalesYearComparison, buildSalesYearComparisonResponse } from "../src/services/ai/salesYearComparison.service.js";
const question = "Compara las ventas de 2023 contra 2024, mes a mes, con monto total y cantidad de facturas";
const currency = { symbol: "₲", abbreviation: "PYG", symbolPosition: "prefix" };
const row = (month, totalAmount, totalInvoices, unit = currency) => ({ month, totalAmount, totalInvoices, currency: unit });
const plan = () => resolveSalesYearComparison({ message: question });
const sourceCalls = (data = [[row("01", 58706137966, 366427), row("08", 100004, 228)], [row("08", 5000000, 1), row("10", 172500, 1), row("11", 20380000, 28)]]) => plan().inputs.map((input, index) => ({ name: "get_sales", input, result: { data: data[index] } }));
const historyOf = (calls) => [{ role: "user", content: [{ text: question }] }, { role: "assistant", content: calls.map((call, index) => ({ toolUse: { name: call.name, input: call.input, toolUseId: `year-${index}` } })) }, { role: "user", content: calls.map((call, index) => ({ toolResult: { toolUseId: `year-${index}`, status: "success", content: [{ json: call.result }] } })) }, { role: "assistant", content: [{ text: "Comparación" }] }];

test("monthly year comparison creates two explicit full-year queries with both requested metrics", () => {
  const result = plan();
  assert.deepEqual(result.inputs.map((input) => [input.dateFrom, input.dateTo]), [["01/01/2023", "31/12/2023"], ["01/01/2024", "31/12/2024"]]);
  assert.deepEqual(result.inputs[1].groupBy, ["month"]);
  assert.deepEqual(result.inputs[1].metrics, ["totalAmount", "totalInvoices"]);
  for (const message of ["Compara las ventas de Nike de 2023 contra 2024 por mes", "Compara las ventas de 2023 contra 2024 por mes solo de rubro X", "Ventas de 2023 contra 2023 por mes"]) assert.equal(resolveSalesYearComparison({ message }), null);
});

test("January-May follow-up preserves both years, filters and metrics and uses leap-year month ends", () => {
  const calls = sourceCalls();
  for (const call of calls) { call.input.customerIds = ["[PII_CUSTOMER_ID_1]"]; call.input.dayType = "weekday"; }
  const history = historyOf(calls);
  const result = resolveSalesYearComparison({ message: "Ahora compara únicamente enero a mayo de ambos años", history });
  assert.deepEqual(result.inputs.map((input) => input.dateTo), ["31/05/2023", "31/05/2024"]);
  for (const input of result.inputs) { assert.deepEqual(input.customerIds, ["[PII_CUSTOMER_ID_1]"]); assert.equal(input.dayType, "weekday"); }
  const february = resolveSalesYearComparison({ message: "Ahora compara enero a febrero de ambos años", history });
  assert.deepEqual(february.inputs.map((input) => input.dateTo), ["28/02/2023", "29/02/2024"]);
  assert.equal(calls[0].input.dateTo, "31/12/2023");
});

test("comparison follow-ups cannot cross topics or reuse failed or inconsistent queries", () => {
  const history = historyOf(sourceCalls());
  const message = "Ahora compara únicamente enero a mayo de ambos años";
  assert.equal(resolveSalesYearComparison({ message, history: [...history, { role: "user", content: [{ text: "Saldo de soles" }] }] }), null);
  const failed = structuredClone(history); failed[2].content[1].toolResult.status = "error";
  assert.equal(resolveSalesYearComparison({ message, history: failed }), null);
  const differentFilters = sourceCalls(); differentFilters[1].input.categoryIds = ["different"];
  assert.equal(resolveSalesYearComparison({ message, history: historyOf(differentFilters) }), null);
});

test("regression: August 2024 sales exceed 2023 while invoices are lower, and November is not comparable", () => {
  const result = buildSalesYearComparisonResponse(sourceCalls());
  assert.match(result, /Agosto: las ventas de 2024 fueron mayores que en 2023 \(₲ 5.000.000 frente a ₲ 100.004; diferencia: ₲ 4.899.996\)/);
  assert.match(result, /Agosto: la cantidad de facturas de 2024 fue menor que en 2023 \(1 frente a 228; diferencia: -227\)/);
  assert.doesNotMatch(result, /Noviembre:.*(?:mayor|menor)|Septiembre:.*(?:mayor|menor)|considerablemente mayores|salvo/);
  assert.match(result, /\| Noviembre \| Sin registros \| Sin registros \| ₲ 20.380.000 \| 28 \|/);
  assert.equal((result.match(/^\| (?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) /gm) ?? []).length, 12);
});

test("an empty year is absence of records, never zeros or a claim of no actual sales", () => {
  const calls = sourceCalls([[row("01", 10, 2)], []]);
  for (const call of calls) call.input.dateTo = call.input.dateTo.replace("31/12", "31/05");
  const result = buildSalesYearComparisonResponse(calls);
  assert.match(result, /2024: no se encontraron registros para el período consultado/);
  assert.match(result, /No hay valores disponibles en ambos años/);
  assert.doesNotMatch(result, /no se registraron ventas|\| ₲ 0 \||Junio/);
  assert.match(result, /no se reemplaza por cero/);
});

test("real zero and null remain different from missing rows, and metrics are compared independently", () => {
  const result = buildSalesYearComparisonResponse(sourceCalls([[row("01", 0, null)], [row("01", 0, 2)]]));
  assert.match(result, /\| Enero \| ₲ 0 \| Sin datos \| ₲ 0 \| 2 \|/);
  assert.match(result, /Enero: las ventas de 2024 fueron iguales/);
  assert.doesNotMatch(result, /Enero: la cantidad de facturas/);
});

test("currencies never cross, while truncated sources, duplicates and incompatible periods are rejected", () => {
  const result = buildSalesYearComparisonResponse(sourceCalls([[row("08", 10, 2)], [row("08", 20, 3, { abbreviation: "USD", symbol: "US$" })]]));
  assert.match(result, /Moneda: ₲/); assert.match(result, /Moneda: US\$/); assert.doesNotMatch(result, /Agosto: las ventas/);
  const limited = sourceCalls(); limited[1].result.resultSet = { truncated: true };
  assert.equal(buildSalesYearComparisonResponse(limited), null);
  const duplicate = sourceCalls(); duplicate[0].result.data.push(duplicate[0].result.data[0]);
  assert.equal(buildSalesYearComparisonResponse(duplicate), null);
  const differentWindow = sourceCalls(); differentWindow[1].input.dateTo = "31/05/2024";
  assert.equal(buildSalesYearComparisonResponse(differentWindow), null);
});
