import test from "node:test";
import assert from "node:assert/strict";
import { resolveRepeatedSalesExport } from "../src/services/ai/salesExportFollowup.service.js";

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
