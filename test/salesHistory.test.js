import test from "node:test";
import assert from "node:assert/strict";
import { needsSalesRefresh } from "../src/services/ai/salesHistory.service.js";
import { buildSalesSampleResponse } from "../src/services/ai/salesSamplePresentation.service.js";

const history = [
  { role: "user", content: [{ text: "Todos los rubros, manteniendo enero de 2023 y el desglose por local" }] },
  { role: "assistant", content: [{ toolUse: { name: "get_sales", toolUseId: "old", input: {} } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "old", status: "success", content: [{ json: { data: [], resultSet: { truncated: true, fullResultAvailableInExport: true } } }] } }] },
];
const table = "| Local | Ventas |\n| --- | --- |\n| Ejemplo | ₲ 100 |";
const check = (options = {}) => needsSalesRefresh({ history, message: "Ventas de enero de 2023 por local", answer: table, ...options });

test("sales answers using an old sample must refresh independently of wording", () => {
  assert.equal(check(), true);
  assert.equal(check({ message: "Ahora por rubro" }), true);
  assert.equal(check({ answer: "Las ventas fueron ₲ 100." }), true);
  assert.equal(check({ calls: [{ name: "search_categories" }] }), true);
});

test("current queries, permissions, chart requests and unrelated topics bypass the reuse guard", () => {
  assert.equal(check({ calls: [{ name: "get_sales" }] }), false);
  assert.equal(check({ calls: [{ name: "get_vehicle_registrations" }] }), false);
  assert.equal(check({ chartRequested: true }), false);
  assert.equal(check({ message: "Cuántos vehículos se registraron durante 2025" }), false);
  assert.equal(check({ message: "Saldo de soles" }), false);
  assert.equal(check({ history: [...history, { role: "assistant", content: [{ toolUse: { name: "get_vehicle_registrations", toolUseId: "new" } }] }], message: "Ahora por género" }), false);
});

test("clarifications, greetings, empty or failed history require no replay", () => {
  for (const answer of ["¿Para qué período?", "De nada.", "No se encontraron datos."]) assert.equal(check({ answer }), false);
  assert.equal(check({ history: [] }), false);
  const failed = structuredClone(history); failed[2].content[0].toolResult.status = "error";
  assert.equal(check({ history: failed }), false);
});

const calls = () => [{ name: "get_sales", input: { dateFrom: "01/01/2023", dateTo: "31/01/2023", groupBy: ["customer"], metrics: ["totalAmount", "totalInvoices"] }, result: {
  data: [{ customerId: "hidden-id", customerName: "[PII_CUSTOMER_NAME_1]", totalAmount: 1234567, totalInvoices: 0, currency: { symbol: "₲", abbreviation: "PYG" } }],
  resultSet: { totalRecords: 180, returnedRecords: 1, truncated: true, analysisPolicy: "NO_ANALYSIS" },
} }];

test("sample presentation states actual rows, full count, dates and current export availability", () => {
  const response = buildSalesSampleResponse(calls(), { exportAvailable: true });
  assert.match(response, /Se muestran 1 de 180 registros/);
  assert.match(response, /01\/01\/2023 a 31\/01\/2023/);
  assert.match(response, /₲ 1\.234\.567 \| 0/);
  assert.match(response, /\[PII_CUSTOMER_NAME_1\]/);
  assert.match(response, /completo está disponible para exportación/);
  assert.doesNotMatch(response, /hidden-id|ranking|mayores|total general/);
  assert.match(buildSalesSampleResponse(calls()), /No fue posible preparar la exportación/);
});

test("sample presentation preserves nulls, escapes names and supports rubros", () => {
  const data = calls(); data[0].input.groupBy = ["category"];
  Object.assign(data[0].result.data[0], { categoryName: "Rubro | ejemplo\nnuevo", totalInvoices: null });
  const response = buildSalesSampleResponse(data);
  assert.match(response, /\| Rubro \|/);
  assert.ok(response.includes("Rubro \\| ejemplo nuevo"));
  assert.match(response, /Sin datos/);
});

test("complete results, explicit insights, multiple queries and missing currencies stay in their existing flow", () => {
  for (const change of [
    (c) => { c[0].result.resultSet.truncated = false; },
    (c) => { c[0].result.resultSet.analysisPolicy = "EXPLICIT_INSIGHTS_ONLY"; },
    (c) => { c.push(structuredClone(c[0])); },
    (c) => { delete c[0].result.data[0].currency; },
  ]) {
    const current = calls(); change(current);
    assert.equal(buildSalesSampleResponse(current), null);
  }
});
