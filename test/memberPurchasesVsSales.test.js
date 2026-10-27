import test from "node:test";
import assert from "node:assert/strict";
import { compareMemberPurchasesVsSales } from "../src/services/members/memberPurchasesVsSales.service.js";
import { buildMemberPurchasesVsSalesResponse } from "../src/services/ai/memberPurchasesVsSalesPresentation.service.js";
import { protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";

const period = { dateFrom: "01/01/2023", dateTo: "31/01/2023" };
const currency = { CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_SYMBOL: "₲" };
const row = (id, name, metrics, money = currency) => ({ ...money, DIMENSION_1_ID: id, DIMENSION_1_NAME: name, ...metrics });
const connectionFor = (sales, purchases, queries = []) => ({
  execute: async (sql, binds) => {
    queries.push({ sql, binds });
    return { rows: sql.includes("VW_BOT_VENTAS_LOCALES") ? sales : purchases };
  },
});
const present = (result) => buildMemberPurchasesVsSalesResponse([{ name: "compare_member_purchases_vs_sales", result }]);

test("compares aggregate canjes with sales, including unmatched groups and separate currencies", async () => {
  const usd = { CURRENCY_DESCRIPTION: "DOLARES", CURRENCY_SYMBOL: "USD" };
  const result = await compareMemberPurchasesVsSales({ ...period, breakdownBy: ["customer"] }, connectionFor([
    row("1", "Local Uno", { SALES_AMOUNT: 1000 }),
    row("2", "Local Dos", { SALES_AMOUNT: 0 }),
    row("4", "Solo Ventas", { SALES_AMOUNT: 500 }),
    row("1", "Local Uno", { SALES_AMOUNT: 20 }, usd),
  ], [
    row("1", "LOCAL UNO", { EXCHANGE_AMOUNT: 250, INVOICE_COUNT: 3, MEMBER_COUNT: 2 }),
    row("2", "Local Dos", { EXCHANGE_AMOUNT: 200, INVOICE_COUNT: 1, MEMBER_COUNT: 1 }),
    row("3", "Solo Canjes", { EXCHANGE_AMOUNT: 300, INVOICE_COUNT: 2, MEMBER_COUNT: 1 }),
    row("1", "Local Uno", { EXCHANGE_AMOUNT: 10, INVOICE_COUNT: 1, MEMBER_COUNT: 1 }, usd),
  ]));
  assert.equal(result.results.length, 5);
  assert.equal(result.results.find((r) => r.currency.symbol === "USD").percentage, 50);
  assert.equal(result.results.find((r) => r.dimensions[0].id === "1" && r.currency.symbol === "₲").percentage, 25);
  assert.equal(result.results.find((r) => r.dimensions[0].id === "2").percentage, null);
  assert.equal(result.results.find((r) => r.dimensions[0].id === "3").percentage, null);
  assert.equal(result.results.find((r) => r.dimensions[0].id === "4").percentage, 0);
  assert.match(present(result), /No calculable/);
});

test("sorts and limits only after the complete comparison, preserving limited-group notice", async () => {
  const result = await compareMemberPurchasesVsSales({ ...period, breakdownBy: ["month"], orderBy: "percentage", limit: 1 }, connectionFor([
    row("2023-01", "2023-01", { SALES_AMOUNT: 1000 }), row("2023-02", "2023-02", { SALES_AMOUNT: 1000 }),
  ], [row("2023-01", "2023-01", { EXCHANGE_AMOUNT: 100 }), row("2023-02", "2023-02", { EXCHANGE_AMOUNT: 500 })]));
  assert.equal(result.results[0].percentage, 50);
  assert.equal(result.results[0].dimensions[0].id, "2023-02");
  assert.equal(result.summary.totalGroups, 2);
  assert.equal(result.summary.hasMore, true);
  assert.match(present(result), /1 de 2 grupos/);
});

test("binds dates and local/category IDs and uses whitelisted dimensions in both sources", async () => {
  const queries = [];
  await compareMemberPurchasesVsSales({ ...period, customerIds: ["1' OR 1=1"], categoryIds: ["7"], breakdownBy: ["month", "category"] }, connectionFor([], [], queries));
  assert.equal(queries.length, 2);
  for (const { sql, binds } of queries) {
    assert.ok(!sql.includes("1' OR 1=1"));
    assert.ok(Object.values(binds).includes("1' OR 1=1"));
    assert.equal(binds.dateFrom, period.dateFrom);
    assert.equal(binds.dateTo, period.dateTo);
    assert.match(sql, /GROUP BY/);
    assert.match(sql, /DIMENSION_2_ID/);
  }
});

test("rejects invalid dates, reversed ranges, malformed filters, order and dimension injection", async () => {
  for (const invalid of [
    { dateTo: "31/02/2023" }, { dateFrom: "01/02/2023" }, { dateFrom: "2023-01-01" },
    { customerIds: "1" }, { categoryIds: [""] }, { limit: 0 }, { limit: 1.5 },
    { orderBy: "DROP" }, { orderDirection: "sideways" },
    { breakdownBy: "month" }, { breakdownBy: ["__proto__"] }, { breakdownBy: ["month", "year", "category"] },
  ]) {
    await assert.rejects(() => compareMemberPurchasesVsSales({ ...period, ...invalid }, { execute: () => assert.fail("Invalid arguments must not query") }));
  }
});

test("empty sources preserve the period and return an explicit no-data response", async () => {
  const result = await compareMemberPurchasesVsSales(period, connectionFor([], []));
  assert.equal(result.status, "NOT_FOUND");
  assert.deepEqual(result.period, period);
  assert.match(present(result), /No se encontraron ventas ni canjes/);
});

test("comparison dimension identities are protected before the model and restored for the user", async () => {
  const result = await compareMemberPurchasesVsSales({ ...period, breakdownBy: ["customer"] }, connectionFor([
    row("secret-42", "Local Privado", { SALES_AMOUNT: 1000 }),
  ], [row("secret-42", "Local Privado", { EXCHANGE_AMOUNT: 250 })]));
  const protectedResult = protectPiiDeep("comparison-test", result);
  const dimension = protectedResult.results[0].dimensions[0];
  assert.match(dimension.id, /^\[PII_CUSTOMER_ID_/);
  assert.match(dimension.name, /^\[PII_CUSTOMER_NAME_/);
  assert.ok(!JSON.stringify(protectedResult).includes("Local Privado"));
  assert.equal(protectedResult.results[0].percentage, 25);
  const text = present(protectedResult);
  assert.ok(!text.includes(dimension.id));
  assert.ok(text.includes(dimension.name));
  assert.deepEqual(restorePiiDeep("comparison-test", protectedResult), result);
});

test("cancellation after the sales query prevents the purchases query from starting", async () => {
  const cancellation = new AbortController(); let queries = 0;
  await assert.rejects(runWithRequestSignal(cancellation.signal, () => compareMemberPurchasesVsSales(period, {
    execute: async () => { queries++; cancellation.abort(); return { rows: [] }; },
    break: async () => {},
  })), { code: "REQUEST_ABORTED" });
  assert.equal(queries, 1);
});

test("permission errors remain errors and are never represented as no results", async () => {
  await assert.rejects(compareMemberPurchasesVsSales(period, { execute: async () => {
    throw Object.assign(new Error("Denied"), { errorNum: 942 });
  } }), { errorNum: 942 });
});
