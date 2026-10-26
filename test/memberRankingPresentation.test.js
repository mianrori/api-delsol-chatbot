import test from "node:test";
import assert from "node:assert/strict";
import { buildMemberRankingResponse } from "../src/services/ai/memberRankingPresentation.service.js";

const ranking = (input = {}, summary = {}) => ({
  name: "analyze_members",
  input: { resultMode: "members", orderBy: "totalAmount", ...input },
  result: {
    status: "FOUND",
    analysis: { periodDefinition: [{ dateFrom: "01/01/2023", dateTo: "31/12/2023" }] },
    summary: { hasMore: true, totalMatches: null, returnedCount: 2, ...summary },
    breakdown: {},
    members: [
      { fullName: "[PII_NAME_1]", age: 35, totalAmount: 1234567, purchaseCount: 8, currency: { symbol: "₲" } },
      { fullName: "[PII_NAME_2]", age: 38, totalAmount: 765432, purchaseCount: 4, currency: { symbol: "₲" } },
    ],
  },
});

test("the three demographic rankings preserve values, PII and limited-list notice", () => {
  for (const [input, label] of [
    [{ gender: "female" }, "Mujeres"],
    [{ ageMin: 30, ageMax: 40 }, "Edad actual máxima: 40 años"],
    [{ birthMonth: 10 }, "Cumpleaños en octubre"],
  ]) {
    const text = buildMemberRankingResponse([ranking(input)]);
    assert.ok(text.includes(label));
    assert.ok(text.includes("01/01/2023 al 31/12/2023"));
    assert.ok(text.includes("| Edad actual |"));
    assert.ok(text.includes("| 1 | [PII_NAME_1] | 35 | 8 | ₲ 1.234.567 |"));
    assert.ok(text.includes("| 2 | [PII_NAME_2] | 38 | 4 | ₲ 765.432 |"));
    assert.ok(text.includes("limitado a 2 socios; existen más"));
    assert.doesNotMatch(text, /IVA|facturad|\bneto\b|\bbruto\b|descarga|Excel/i);
  }
});

test("known universe is distinct from the returned ranking", () => {
  const text = buildMemberRankingResponse([ranking({}, { totalMatches: 25 })]);
  assert.ok(text.includes("Se muestran 2 de 25 socios"));
});

test("complete results do not claim additional matches", () => {
  const text = buildMemberRankingResponse([ranking({}, { hasMore: false, totalMatches: 2 })]);
  assert.doesNotMatch(text, /existen más|listado limitado|Se muestran/);
});

test("does not replace comparisons, combined answers, breakdowns or unsupported filters", () => {
  assert.equal(buildMemberRankingResponse(), null);
  assert.equal(buildMemberRankingResponse([ranking(), ranking()]), null);
  assert.equal(buildMemberRankingResponse([ranking(), { name: "get_sales" }]), null);
  for (const input of [{ customerIds: ["1"] }, { referenceDate: "01/01/2020" }, { resultMode: "summary" }]) {
    assert.equal(buildMemberRankingResponse([ranking(input)]), null);
  }
  const call = ranking();
  call.result.breakdown = { category: [] };
  assert.equal(buildMemberRankingResponse([call]), null);
  call.result.breakdown = {};
  call.result.status = "NOT_FOUND";
  assert.equal(buildMemberRankingResponse([call]), null);
});

test("preserves separate currencies and missing ages without inventing data", () => {
  const call = ranking();
  call.result.members[0].age = null;
  call.result.members[1].currency.symbol = "USD";
  call.result.members[1].totalAmount = 12.5;
  const text = buildMemberRankingResponse([call]);
  assert.ok(text.includes("[PII_NAME_1] | — |"));
  assert.ok(text.includes("USD 12,5"));
  assert.ok(text.includes("₲ 1.234.567"));
});
