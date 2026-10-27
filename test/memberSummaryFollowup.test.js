import test from "node:test";
import assert from "node:assert/strict";
import { resolveMemberSummaryFollowup } from "../src/services/ai/memberAnalysisFollowup.service.js";

const inputs = ["01", "02"].map((month) => ({
  resultMode: "summary", metrics: ["totalAmount", "purchaseCount"], gender: "[PII_GENDER_1]",
  purchasePeriods: [{ dateFrom: `01/${month}/2023`, dateTo: `${month === "01" ? 31 : 28}/${month}/2023`, label: month }],
}));
const historyFor = (args = inputs) => [
  { role: "user", content: [{ text: "Comparar enero y febrero" }] },
  ...args.flatMap((input, index) => [
    { role: "assistant", content: [{ toolUse: { name: "analyze_members", toolUseId: `period-${index}`, input } }] },
    { role: "user", content: [{ toolResult: { toolUseId: `period-${index}`, status: "success", content: [{ json: {
      status: "FOUND", analysis: { periodDefinition: input.purchasePeriods },
      summary: { totalsByCurrency: [{ currency: { symbol: "₲" }, totalAmount: 100, purchaseCount: 1 }] },
    } }] } }] },
  ]),
  { role: "assistant", content: [{ text: "Comparación" }] },
];

test("each-month category follow-up preserves both periods, metrics and protected filters", () => {
  const history = historyFor();
  const before = structuredClone(history);
  const plans = resolveMemberSummaryFollowup({ message: "Ahora desglosa cada mes por rubro", history });
  assert.deepEqual(plans, inputs.map((input) => ({ ...input, breakdownBy: ["category"] })));
  plans[0].purchasePeriods[0].dateFrom = "01/01/2000";
  assert.deepEqual(history, before);
});

test("customer follow-up replaces the breakdown and preserves the period order", () => {
  const previous = inputs.map((input) => ({ ...input, breakdownBy: ["category"] })).reverse();
  assert.deepEqual(resolveMemberSummaryFollowup({ message: "Ahora por local", history: historyFor(previous) }),
    previous.map((input) => ({ ...input, breakdownBy: ["customer"] })));
});

test("equivalent retries for one period do not schedule duplicate queries", () => {
  const previous = [inputs[0], { ...inputs[0], breakdownBy: ["category"] }, inputs[1]];
  const plans = resolveMemberSummaryFollowup({ message: "Por rubro", history: historyFor(previous) });
  assert.equal(plans.length, 2);
  assert.equal(plans[0].purchasePeriods[0].dateFrom, "01/01/2023");
  assert.equal(plans[1].purchasePeriods[0].dateFrom, "01/02/2023");
});

test("explicit filter changes, other intents and previous topics use normal routing", () => {
  for (const message of ["Ahora por local en 2022", "Ahora solo mujeres por rubro", "Por local y mes", "Compras de Persona Ejemplo por rubro"]) {
    assert.equal(resolveMemberSummaryFollowup({ message, history: historyFor() }), null);
  }
  const history = [...historyFor(), { role: "user", content: [{ text: "Hola" }] }, { role: "assistant", content: [{ text: "Hola" }] }];
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history }), null);
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history: [] }), null);
});

test("incompatible filters, periods and tool types cannot be combined into one follow-up", () => {
  for (const changes of [{ gender: "male" }, { metrics: ["purchaseCount"] }, { ageMin: 40 }]) {
    assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por rubro", history: historyFor([inputs[0], { ...inputs[1], ...changes }]) }), null);
  }
  for (const purchasePeriods of [
    [{ dateFrom: "01/02/2023", dateTo: "30/02/2023" }],
    [{ dateFrom: "01/01/2023", dateTo: "30/01/2023" }],
    [{ dateFrom: "01/01/2023", dateTo: "28/02/2023" }],
    [...inputs[0].purchasePeriods, ...inputs[1].purchasePeriods],
  ]) assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por rubro", history: historyFor([{ ...inputs[0], purchasePeriods }]) }), null);
  const history = historyFor();
  history[1].content[0].toolUse.name = "get_sales";
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history }), null);
});

test("failed, missing and mismatched tool results are not reused", () => {
  const failed = historyFor();
  failed[2].content[0].toolResult.status = "error";
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history: failed }), null);
  const missing = historyFor();
  missing.splice(2, 1);
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history: missing }), null);
  const mismatched = structuredClone(historyFor());
  mismatched[2].content[0].toolResult.content[0].json.analysis.periodDefinition[0].dateTo = "30/01/2023";
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history: mismatched }), null);
});

test("a month with no purchases remains part of the comparison", () => {
  const history = historyFor();
  history[4].content[0].toolResult.content[0].json.status = "NOT_FOUND";
  history[4].content[0].toolResult.content[0].json.summary.totalsByCurrency = [];
  assert.equal(resolveMemberSummaryFollowup({ message: "Ahora por local", history }).length, 2);
});
