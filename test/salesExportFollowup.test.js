import test from "node:test";
import assert from "node:assert/strict";
import { resolveRepeatedSalesExport, resolveSalesCategoryRemoval } from "../src/services/ai/salesExportFollowup.service.js";

const question = "Ventas de enero a mayo de 2023 por local, con monto total y cantidad de facturas";
const input = { dateFrom: "01/01/2023", dateTo: "31/05/2023", groupBy: ["customer"], metrics: ["totalAmount", "totalInvoices"], customerIds: ["[PII_CUSTOMER_ID_1]"], categoryIds: ["[PII_CATEGORY_ID_1]"], dayType: "weekend" };
const turn = () => [
  { role: "user", content: [{ text: question }] },
  { role: "assistant", content: [{ toolUse: { name: "get_sales", toolUseId: "sales", input: structuredClone(input) } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "sales", status: "success", content: [{ json: { data: [], resultSet: { fullResultAvailableInExport: true, truncated: true, totalRecords: 187 } } }] } }] },
  { role: "assistant", content: [{ text: "Se muestran 12 de 187 registros." }] },
];

test("repeated sales export copies every resolved filter and never a stale export ID", () => {
  const history = turn();
  const repeated = resolveRepeatedSalesExport({ message: question + ".", history });
  assert.deepEqual(repeated, input);
  repeated.customerIds.push("other");
  assert.equal(history[1].content[0].toolUse.input.customerIds.length, 1);
});

test("repeated questions answered without tools can still refresh the original export", () => {
  const history = [...turn(), { role: "user", content: [{ text: question }] }, { role: "assistant", content: [{ text: "El detalle está disponible para exportación." }] }];
  assert.deepEqual(resolveRepeatedSalesExport({ message: question, history }), input);
});

test("new filters, another topic and resets cannot replay an old export", () => {
  for (const history of [[], [...turn(), { role: "user", content: [{ text: "Saldo de soles" }] }]]) {
    assert.equal(resolveRepeatedSalesExport({ message: question, history }), null);
  }
  assert.equal(resolveRepeatedSalesExport({ message: question.replace("2023", "2024"), history: turn() }), null);
});

test("failed, incomplete or multi-query turns cannot refresh an export", () => {
  for (const change of [
    (h) => { h[2].content[0].toolResult.status = "error"; },
    (h) => { delete h[2].content[0].toolResult.content[0].json.resultSet; },
    (h) => { h[1].content.push({ toolUse: { name: "get_sales", toolUseId: "another", input } }); },
  ]) {
    const history = turn(); change(history);
    assert.equal(resolveRepeatedSalesExport({ message: question, history }), null);
  }
});

test("relative periods are resolved again instead of freezing old dates", () => {
  const history = turn();
  history[0].content[0].text = "Ventas de este mes por local";
  assert.equal(resolveRepeatedSalesExport({ message: history[0].content[0].text, history }), null);
});

const filteredTurn = () => {
  const history = turn();
  history[0].content[0].text = "Ahora por local";
  history[1].content[0].toolUse.input.dateTo = "31/01/2023";
  history[2].content[0].toolResult.content[0].json = { data: [{ totalAmount: 2994866457, totalInvoices: 7049 }] };
  return history;
};
const removal = "Ahora todos los rubros, manteniendo enero de 2023 y el desglose por local";

test("removing a category uses the latest query, preserves other filters and does not need an existing export", () => {
  const history = filteredTurn();
  const current = history[1].content[0].toolUse.input;
  const result = resolveSalesCategoryRemoval({ message: removal, history });
  const { categoryIds, ...expected } = current;
  assert.deepEqual(result, expected);
  assert.deepEqual(current.categoryIds, input.categoryIds);
  assert.equal(result.dayType, "weekend");
  assert.deepEqual(result.customerIds, input.customerIds);
});

test("category removal can inherit dates and explicitly retain or change the grouping", () => {
  const history = filteredTurn();
  for (const message of ["Ahora todos los rubros", "Quita el filtro de rubro", "Todos los rubros, manteniendo el mismo período y el desglose por local"]) {
    const result = resolveSalesCategoryRemoval({ message, history });
    assert.equal(result.dateTo, "31/01/2023");
    assert.deepEqual(result.groupBy, ["customer"]);
    assert.ok(!Object.hasOwn(result, "categoryIds"));
  }
  assert.deepEqual(resolveSalesCategoryRemoval({ message: "Todos los rubros, manteniendo enero de 2023 y el desglose por rubro", history }).groupBy, ["category"]);
});

test("category removal does not drop extra requested restrictions or override a different current period", () => {
  for (const message of [removal + " solo fines de semana", removal.replace("enero", "febrero"), removal.replace("2023", "2024"), "Todos los rubros excepto deportes"]) {
    assert.equal(resolveSalesCategoryRemoval({ message, history: filteredTurn() }), null);
  }
});

test("category removal cannot reuse another topic, failed query or ambiguous multiple queries", () => {
  for (const change of [
    (h) => h.push({ role: "user", content: [{ text: "Consulta de soles" }] }),
    (h) => { h[2].content[0].toolResult.status = "error"; },
    (h) => { h[1].content.push({ toolUse: { name: "get_sales", toolUseId: "second", input } }); },
    (h) => { h[1].content[0].toolUse.name = "get_member_purchases"; },
  ]) {
    const history = filteredTurn(); change(history);
    assert.equal(resolveSalesCategoryRemoval({ message: removal, history }), null);
  }
  assert.equal(resolveSalesCategoryRemoval({ message: removal, history: [] }), null);
});

test("category removal never selects an older matching period instead of the latest one", () => {
  const newer = filteredTurn();
  newer[1].content[0].toolUse.input.dateTo = "31/05/2023";
  assert.equal(resolveSalesCategoryRemoval({ message: removal, history: [...filteredTurn(), ...newer] }), null);
});

test("category removal can recover the same request previously answered without tools", () => {
  const history = [...filteredTurn(), { role: "user", content: [{ text: removal }] }, { role: "assistant", content: [{ text: "Muestra de 12 de 180 locales." }] }];
  const result = resolveSalesCategoryRemoval({ message: removal, history });
  assert.equal(result.dateTo, "31/01/2023");
  assert.ok(!Object.hasOwn(result, "categoryIds"));
});
