import test from "node:test";
import assert from "node:assert/strict";
import { getMemberPurchaseBreakdownRepository } from "../src/repositories/members/memberAnalysis.repository.js";
import { analyzeMembers } from "../src/services/members/memberAnalysis.service.js";
import { getMemberGroupedSummaryRepository } from "../src/repositories/members/memberGroupedSummary.repository.js";

const input = { resultMode: "summary", metrics: ["totalAmount", "purchaseCount"],
  purchasePeriods: [{ dateFrom: "01/01/2023", dateTo: "31/01/2023" }], breakdownBy: ["category"] };
const rows = [
  { ROW_KIND: "universe", MEMBER_COUNT: 2, PURCHASE_COUNT: 7 },
  { ROW_KIND: "total", MEMBER_COUNT: 2, PURCHASE_COUNT: 7, TOTAL_AMOUNT: 3500, CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_SYMBOL: "PYG" },
  { ROW_KIND: "detail", CATEGORY_ID: "1", CATEGORY_NAME: "Rubro de prueba", MEMBER_COUNT: 2, PURCHASE_COUNT: 5, TOTAL_AMOUNT: 3000, CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_SYMBOL: "PYG" },
  { ROW_KIND: "detail", CATEGORY_ID: null, CATEGORY_NAME: null, MEMBER_COUNT: 1, PURCHASE_COUNT: 2, TOTAL_AMOUNT: 500, CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_SYMBOL: "PYG" },
];

test("summary and breakdown come from one aggregate query, without personal rows or document lists", async () => {
  const calls = [];
  const result = await analyzeMembers(input, { execute: async (sql, binds) => {
    calls.push({ sql, binds }); return { rows };
  } }, "TEST");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /GROUP BY GROUPING SETS/);
  assert.match(calls[0].sql, /COUNT\(DISTINCT C.COD_SOCIO\)/);
  assert.doesNotMatch(calls[0].sql, /NOMBRE_COMPLETO|EMAIL|TELEFONO|ORDER BY|documentNumber\d+|MV_BOT_COMPRAS_SOCIO_MES/);
  assert.deepEqual(calls[0].binds, { dateFrom: "01/01/2023", dateTo: "31/01/2023" });
  assert.equal(result.members, undefined);
  assert.equal(result.summary.totalMatches, 2);
  assert.equal(result.summary.purchaseCount, 7);
  assert.equal(result.summary.totalsByCurrency[0].totalAmount, 3500);
  assert.equal(result.breakdown.category.length, 2);
  assert.equal(result.breakdown.category[1].categoryName, "Sin rubro");
  assert.equal(result.breakdown.category.reduce((sum, row) => sum + row.totalAmount, 0), 3500);
  assert.equal(result.breakdown.category.reduce((sum, row) => sum + row.purchaseCount, 0), 7);
});

test("all supported dimensions use whitelisted SQL and preserve each period", async () => {
  for (const dimension of ["category", "customer", "month", "year"]) {
    let calls = 0;
    const result = await getMemberGroupedSummaryRepository({ ...input,
      purchasePeriods: [{ dateFrom: "01/02/2023", dateTo: "28/02/2023" }], breakdownBy: [dimension] }, {
      execute: async (sql, binds) => {
        calls++;
        assert.equal(binds.dateFrom, "01/02/2023");
        assert.equal(binds.dateTo, "28/02/2023");
        assert.match(sql, /C.FECHA_COMPRA/);
        return { rows: [{ ROW_KIND: "universe", MEMBER_COUNT: 0, PURCHASE_COUNT: 0 }] };
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.breakdown[dimension], []);
  }
});

test("currencies stay separate and unique members are counted over the full universe", async () => {
  const result = await getMemberGroupedSummaryRepository(input, { execute: async () => ({ rows: [
    ...rows.map((row) => row.ROW_KIND === "universe" ? { ...row, PURCHASE_COUNT: 8 } : row),
    { ROW_KIND: "total", MEMBER_COUNT: 1, PURCHASE_COUNT: 1, TOTAL_AMOUNT: 20, CURRENCY_DESCRIPTION: "DOLARES", CURRENCY_SYMBOL: "USD" },
    { ROW_KIND: "detail", CATEGORY_ID: "1", CATEGORY_NAME: "Rubro de prueba", MEMBER_COUNT: 1, PURCHASE_COUNT: 1, TOTAL_AMOUNT: 20, CURRENCY_DESCRIPTION: "DOLARES", CURRENCY_SYMBOL: "USD" },
  ] }) });
  assert.equal(result.memberCount, 2);
  assert.equal(result.purchaseCount, 8);
  assert.equal(result.totalsByCurrency.length, 2);
  assert.equal(result.totalsByCurrency[0].currency.symbol, "₲");
  assert.equal(result.totalsByCurrency[1].currency.symbol, "USD");
  assert.equal(result.totalAmount, undefined);
  assert.equal(result.breakdown.category[2].currency.symbol, "USD");
});

test("unsupported analysis never silently drops filters", async () => {
  for (const change of [
    { resultMode: "members" }, { activityStatus: "inactive" }, { amountMin: 100 },
    { customerIds: ["1"] }, { breakdownBy: ["gender"] },
    { breakdownBy: ["category", "customer"] }, { breakdownBy: ["category); DROP TABLE X"] },
  ]) {
    assert.equal(await getMemberGroupedSummaryRepository({ ...input, ...change }, {
      execute: () => assert.fail("Unexpected SQL"),
    }), null);
  }
});

test("demographic filters remain bound, with the same age convention", async () => {
  await getMemberGroupedSummaryRepository({ ...input, gender: "male", ageMin: 30, ageMax: 40, birthMonth: 10 }, {
    execute: async (sql, binds) => {
      assert.equal(binds.gender, "M");
      assert.equal(binds.ageMin, 30);
      assert.equal(binds.ageMax, 40);
      assert.equal(binds.birthMonth, 10);
      assert.match(sql, /TRUNC\(SYSDATE\)/);
      return { rows: [] };
    },
  });
});

test("legacy member analysis paths no longer print raw SQL bind values", async () => {
  const original = console.log;
  const output = [];
  console.log = (...args) => output.push(JSON.stringify(args));
  try {
    await getMemberPurchaseBreakdownRepository({
      connection: { execute: async () => ({ rows: [] }) },
      documentNumbers: ["PRIVATE_TEST_DOCUMENT"], dimension: "category",
      purchasePeriods: input.purchasePeriods,
    });
  } finally { console.log = original; }
  assert.ok(!output.join("\n").includes("PRIVATE_TEST_DOCUMENT"));
});
