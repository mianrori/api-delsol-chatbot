import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveMemberAnalysisFollowup,
  buildMemberAnalysisFollowupResponse,
} from "../src/services/ai/memberAnalysisFollowup.service.js";

const input = {
  gender: "female", limit: 10, resultMode: "members",
  orderBy: "totalAmount", orderDirection: "desc",
  metrics: ["totalAmount", "purchaseCount"],
  purchasePeriods: [{ dateFrom: "01/01/2023", dateTo: "31/12/2023" }],
};
const result = {
  status: "FOUND", analysis: { periodDefinition: input.purchasePeriods },
  members: [{ fullName: "[PII_NAME_1]", documentNumber: "[PII_DOCUMENT_1]",
    currency: { symbol: "₲" }, breakdown: {
      category: [{ categoryName: "Rubro de prueba", totalAmount: 1234567, purchaseCount: 3 }],
      customer: [{ customerName: "[PII_CUSTOMER_NAME_1]", totalAmount: 1234567, purchaseCount: 3 }],
    } }],
};
const historyFor = (args = input, json = result) => [
  { role: "user", content: [{ text: "Ranking de prueba" }] },
  { role: "assistant", content: [{ toolUse: { name: "analyze_members", toolUseId: "ranking", input: args } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "ranking", status: "success", content: [{ json }] } }] },
  { role: "assistant", content: [{ text: "Ranking" }] },
];

test("category follow-up preserves all ranking arguments and does not mutate history", () => {
  const history = historyFor();
  const before = structuredClone(history);
  const plan = resolveMemberAnalysisFollowup({ message: "Ahora detalla sus compras por rubro", history });
  assert.deepEqual(plan, { ...input, breakdownBy: ["category"] });
  plan.purchasePeriods[0].dateFrom = "01/01/2000";
  assert.deepEqual(history, before);
});

test("customer follow-up after category replaces only breakdownBy", () => {
  const categoryInput = { ...input, breakdownBy: ["category"] };
  const plan = resolveMemberAnalysisFollowup({ message: "Ahora por local", history: historyFor(categoryInput) });
  assert.deepEqual(plan, { ...input, breakdownBy: ["customer"] });
});

test("explicit new filters, periods, individual requests and unrelated context use normal routing", () => {
  for (const message of ["Ahora por local en 2022", "Compras de Ana por rubro", "Ahora solo hombres por rubro", "Ahora por local y mes"]) {
    assert.equal(resolveMemberAnalysisFollowup({ message, history: historyFor() }), null);
  }
  assert.equal(resolveMemberAnalysisFollowup({ message: "Ahora por local", history: [] }), null);
  const history = [...historyFor(), { role: "user", content: [{ text: "Hola" }] },
    { role: "assistant", content: [{ text: "Hola" }] }];
  assert.equal(resolveMemberAnalysisFollowup({ message: "Ahora por local", history }), null);
});

test("failed results, summaries and multi-call comparisons are not treated as a single ranking", () => {
  for (const history of [historyFor({ ...input, resultMode: "summary" }), historyFor(input, { status: "NOT_FOUND" })]) {
    assert.equal(resolveMemberAnalysisFollowup({ message: "Ahora por rubro", history }), null);
  }
  const history = historyFor();
  history[1].content.push({ toolUse: { name: "analyze_members", toolUseId: "second", input } });
  assert.equal(resolveMemberAnalysisFollowup({ message: "Ahora por rubro", history }), null);
});

test("breakdown output preserves rows, amounts, currencies and PII without internal IDs or tax claims", () => {
  for (const dimension of ["category", "customer"]) {
    const text = buildMemberAnalysisFollowupResponse({ input: { ...input, breakdownBy: [dimension] }, result });
    assert.ok(text.includes("[PII_NAME_1]"));
    assert.ok(text.includes("₲ 1.234.567"));
    assert.ok(text.includes("01/01/2023 al 31/12/2023"));
    assert.doesNotMatch(text, /PII_DOCUMENT|IVA|facturado|categoryId|customerId/);
  }
});

test("renders every returned breakdown row and handles empty breakdowns", () => {
  const data = structuredClone(result);
  data.members[0].breakdown.category = Array.from({ length: 30 }, (_, i) => ({
    categoryName: `Rubro ${i}`, totalAmount: i, purchaseCount: 1,
  }));
  data.members.push({ fullName: "[PII_NAME_2]", breakdown: { category: [] } });
  const text = buildMemberAnalysisFollowupResponse({ input: { breakdownBy: ["category"] }, result: data });
  assert.equal(text.split("\n").filter((line) => line.startsWith("| [PII_NAME_1]")).length, 30);
  assert.ok(text.includes("Sin compras registradas para este desglose"));
});
