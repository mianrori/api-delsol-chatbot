import test from "node:test";
import assert from "node:assert/strict";
import { canUseMemberSummary, getMemberSummaryRepository } from "../src/repositories/members/memberSummary.repository.js";
import { analyzeMembers } from "../src/services/members/memberAnalysis.service.js";

const input = {
  resultMode: "summary", metrics: ["totalAmount", "purchaseCount"],
  purchasePeriods: [{ dateFrom: "01/01/2023", dateTo: "31/01/2023", label: "Enero" }],
};

test("monthly summaries aggregate in Oracle without retrieving personal fields or sorting members", async () => {
  const calls = [];
  const connection = { execute: async (sql, binds) => {
    calls.push({ sql, binds });
    return { rows: [{ MEMBER_COUNT: 2, TOTAL_AMOUNT: 3500, PURCHASE_COUNT: 7 }] };
  } };
  const result = await analyzeMembers(input, connection, "TEST");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /MV_BOT_COMPRAS_SOCIO_MES/);
  assert.doesNotMatch(calls[0].sql, /NOMBRE_COMPLETO|EMAIL|TELEFONO|ORDER BY|VW_BOT_COMPRAS_SOCIO\b/);
  assert.deepEqual(calls[0].binds, { dateFrom: "01/01/2023", dateTo: "31/01/2023" });
  assert.equal(result.summary.totalMatches, 2);
  assert.equal(result.summary.purchaseCount, 7);
  assert.equal(result.summary.totalsByCurrency[0].totalAmount, 3500);
  assert.equal(result.summary.hasMore, false);
  assert.equal(result.members, undefined);
  assert.equal(result.export.available, false);
});

test("January and February remain separate queries and results", async () => {
  const calls = [];
  const connection = { execute: async (_sql, binds) => {
    calls.push(binds);
    return { rows: [{ MEMBER_COUNT: 1, TOTAL_AMOUNT: binds.dateFrom === "01/01/2023" ? 1000 : 2000, PURCHASE_COUNT: 1 }] };
  } };
  const jan = await analyzeMembers(input, connection, "TEST");
  const feb = await analyzeMembers({ ...input, purchasePeriods: [{ dateFrom: "01/02/2023", dateTo: "28/02/2023" }] }, connection, "TEST");
  assert.equal(calls.length, 2);
  assert.equal(jan.summary.totalsByCurrency[0].totalAmount, 1000);
  assert.equal(feb.summary.totalsByCurrency[0].totalAmount, 2000);
});

test("unsupported filters, breakdowns and partial or invalid months retain the original path", async () => {
  for (const changed of [
    { resultMode: "members" }, { breakdownBy: ["category"] },
    { customerIds: ["1"] }, { amountMin: 100 }, { activityStatus: "inactive" },
    { metrics: ["recurrenceMonths"] }, { dateFrom: "01/01/2023" },
    { purchasePeriods: [{ dateFrom: "02/01/2023", dateTo: "31/01/2023" }] },
    { purchasePeriods: [{ dateFrom: "01/02/2023", dateTo: "29/02/2023" }] },
    { purchasePeriods: [{ dateFrom: "01/03/2023", dateTo: "28/02/2023" }] },
    { purchasePeriods: [input.purchasePeriods[0], input.purchasePeriods[0]] },
  ]) {
    const args = { ...input, ...changed };
    assert.equal(canUseMemberSummary(args), false);
    assert.equal(await getMemberSummaryRepository(args, { execute: () => assert.fail("Unexpected query") }), null);
  }
});

test("demographic filters are bound parameters and preserve the existing age convention", async () => {
  const args = { ...input, gender: "female", birthMonth: 10, ageMin: 30, ageMax: 40 };
  await getMemberSummaryRepository(args, { execute: async (sql, binds) => {
    assert.equal(binds.gender, "F");
    assert.equal(binds.birthMonth, 10);
    assert.equal(binds.ageMin, 30);
    assert.match(sql, /TRUNC\(SYSDATE\)/);
    assert.match(sql, /S.GENERO = :gender/);
    return { rows: [] };
  } });
});

test("empty summaries and leap-year full months preserve result semantics", async () => {
  const args = { ...input, purchasePeriods: [{ dateFrom: "01/02/2024", dateTo: "29/02/2024" }] };
  assert.equal(canUseMemberSummary(args), true);
  const result = await analyzeMembers(args, { execute: async () => ({ rows: [{ MEMBER_COUNT: 0, TOTAL_AMOUNT: 0, PURCHASE_COUNT: 0 }] }) }, "TEST");
  assert.equal(result.status, "NOT_FOUND");
  assert.equal(result.summary.totalMatches, 0);
  assert.deepEqual(result.summary.totalsByCurrency, []);
});
