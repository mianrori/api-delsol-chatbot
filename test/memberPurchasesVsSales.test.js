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

test("ambiguous dollar descriptions and contradictory metadata leave amounts intact and explain non-calculation", async () => {
  for (const [description,symbol,status,reason] of [
    ["$","$","ambiguous","CURRENCY_AMBIGUOUS"],
    ["GUARANIES","USD","contradictory","CURRENCY_CONTRADICTION"],
    ["DOLARES","₲","contradictory","CURRENCY_CONTRADICTION"],
    ["CAD","USD","contradictory","CURRENCY_CONTRADICTION"],
    ["SIN IDENTIFICAR","USD","ambiguous","CURRENCY_AMBIGUOUS"],
    [null,null,"ambiguous","CURRENCY_AMBIGUOUS"],
  ]) {
    const money={CURRENCY_DESCRIPTION:description,CURRENCY_SYMBOL:symbol};
    const result=await compareMemberPurchasesVsSales(period,connectionFor([
      {...money,SALES_AMOUNT:100},
    ],[{...money,EXCHANGE_AMOUNT:20,INVOICE_COUNT:2,MEMBER_COUNT:1}]));
    const r=result.results[0];
    assert.equal(r.percentage,null);assert.equal(r.percentageReasonCode,reason);
    assert.equal(r.currency.status,status);assert.equal(r.currency.code,null);
    assert.equal(r.auditedSalesAmount,100);assert.equal(r.exchangeAmount,20);
    assert.equal(r.invoiceCount,2);assert.equal(r.memberCount,1);
    const text=present(result);
    assert.match(text,/No calculable/);assert.ok(text.includes(r.percentageReason));
    assert.ok(!text.includes("20 %"));assert.match(text,/\| 100 \| 20 \|/);
  }
});

test("recognized compatible currencies calculate only within the exact source metadata pair",async()=>{
  for(const [description,symbol,code] of [
    ["GUARANÍES","₲","PYG"],["PYG",null,"PYG"],
    ["Dólares americanos","$","USD"],[null,"USD","USD"],["$","US$","USD"],
    ["DOLARES CANADIENSES","$","CAD"],["CAD","C$","CAD"],
  ]){
    const money={CURRENCY_DESCRIPTION:description,CURRENCY_SYMBOL:symbol};
    const result=await compareMemberPurchasesVsSales(period,connectionFor([{...money,SALES_AMOUNT:100}],[{...money,EXCHANGE_AMOUNT:20}]));
    const r=result.results[0];assert.equal(r.currency.code,code);assert.equal(r.currency.status,"identified");
    assert.equal(r.percentage,20);assert.equal(r.percentageReasonCode,null);assert.equal(r.percentageReason,null);
    assert.match(present(result),/20 %/);assert.ok(!present(result).includes("No calculable"));
  }
});

test("recognized incompatible source currencies keep both amounts separate and neither row calculates a percentage",async()=>{
  const result=await compareMemberPurchasesVsSales(period,connectionFor([
    {CURRENCY_DESCRIPTION:"DOLARES",CURRENCY_SYMBOL:"USD",SALES_AMOUNT:100},
  ],[{CURRENCY_DESCRIPTION:"GUARANIES",CURRENCY_SYMBOL:"₲",EXCHANGE_AMOUNT:20,INVOICE_COUNT:2,MEMBER_COUNT:1}]));
  assert.equal(result.results.length,2);
  for(const r of result.results){assert.equal(r.percentage,null);assert.equal(r.percentageReasonCode,"CURRENCY_INCOMPATIBLE");assert.ok(present(result).includes(r.percentageReason));}
  assert.equal(result.results.find(r=>r.currency.code==="USD").auditedSalesAmount,100);
  assert.equal(result.results.find(r=>r.currency.code==="USD").exchangeAmount,0);
  assert.equal(result.results.find(r=>r.currency.code==="PYG").exchangeAmount,20);
  assert.equal(result.results.find(r=>r.currency.code==="PYG").auditedSalesAmount,0);
  assert.equal((present(result).match(/No calculable/g)??[]).length,2);
});

test("recognized aliases remain separate without conversions or addition of distinct members",async()=>{
  const result=await compareMemberPurchasesVsSales(period,connectionFor([
    {CURRENCY_DESCRIPTION:"DOLARES",CURRENCY_SYMBOL:"USD",SALES_AMOUNT:100},
  ],[{CURRENCY_DESCRIPTION:"DOLARES AMERICANOS",CURRENCY_SYMBOL:"US$",EXCHANGE_AMOUNT:20,MEMBER_COUNT:2}]));
  assert.equal(result.results.length,2);
  for(const r of result.results){assert.equal(r.currency.code,"USD");assert.equal(r.percentage,null);assert.equal(r.percentageReasonCode,"CURRENCY_METADATA_MISMATCH");}
  assert.deepEqual(result.results.map(r=>r.memberCount),[0,2]);
  assert.match(present(result),/no se unen alias/);
});

test("ambiguous groups never merge and inversion preserves every group's amounts and reason",async()=>{
  const money=["$","MONEDA SIN DEFINIR",null].map(d=>({CURRENCY_DESCRIPTION:d,CURRENCY_SYMBOL:"$"}));
  const sales=money.map((m,i)=>({...m,SALES_AMOUNT:100*(i+1)}));
  const purchases=money.map((m,i)=>({...m,EXCHANGE_AMOUNT:10*(i+1),MEMBER_COUNT:1}));
  const values=[];
  for(const reverse of [false,true]){
    const result=await compareMemberPurchasesVsSales(period,connectionFor(reverse?[...sales].reverse():sales,reverse?[...purchases].reverse():purchases));
    assert.equal(result.results.length,3);
    assert.ok(result.results.every(r=>r.percentage===null&&r.percentageReasonCode==="CURRENCY_AMBIGUOUS"&&r.memberCount===1));
    values.push(result.results.map(r=>JSON.stringify(r)).sort());
  }
  assert.deepEqual(values[0],values[1]);
});

test("a shared dollar symbol cannot merge different currency descriptions", async () => {
  const usd = { CURRENCY_DESCRIPTION: "DOLARES AMERICANOS", CURRENCY_SYMBOL: "$" };
  const cad = { CURRENCY_DESCRIPTION: "DOLARES CANADIENSES", CURRENCY_SYMBOL: "$" };
  const ambiguous = { CURRENCY_DESCRIPTION: null, CURRENCY_SYMBOL: "$" };
  for (const reverse of [false, true]) {
    const sales = [row("1", "Local", { SALES_AMOUNT: 100 }, usd), row("1", "Local", { SALES_AMOUNT: 400 }, cad), row("1", "Local", { SALES_AMOUNT: 100 }, ambiguous)];
    const purchases = [row("1", "Local", { EXCHANGE_AMOUNT: 20, MEMBER_COUNT: 1 }, usd), row("1", "Local", { EXCHANGE_AMOUNT: 40, MEMBER_COUNT: 1 }, cad), row("1", "Local", { EXCHANGE_AMOUNT: 7, MEMBER_COUNT: 1 }, ambiguous)];
    const result = await compareMemberPurchasesVsSales({ ...period, breakdownBy: ["customer"] }, connectionFor(reverse ? sales.reverse() : sales, reverse ? purchases.reverse() : purchases));
    assert.equal(result.results.length, 3);
    assert.equal(result.results.find(r => r.currency.description === usd.CURRENCY_DESCRIPTION).percentage, 20);
    assert.equal(result.results.find(r => r.currency.description === cad.CURRENCY_DESCRIPTION).percentage, 10);
    const unknown = result.results.find(r => r.currency.description === null);
    assert.equal(unknown.exchangeAmount, 7);
    assert.equal(unknown.percentage, null);
    const text = present(result);
    assert.match(text, /DOLARES AMERICANOS/);
    assert.match(text, /DOLARES CANADIENSES/);
  }
});

test("different currency metadata is retained without summing distinct members or matching aliases", async () => {
  const result = await compareMemberPurchasesVsSales(period, connectionFor([
    { ...currency, SALES_AMOUNT: 100 },
  ], [
    { ...currency, EXCHANGE_AMOUNT: 10, MEMBER_COUNT: 2 },
    { ...currency, CURRENCY_SYMBOL: "PYG", EXCHANGE_AMOUNT: 20, MEMBER_COUNT: 2 },
  ]));
  assert.equal(result.results.length, 2);
  assert.deepEqual(result.results.map(r => r.memberCount), [2, 2]);
  assert.equal(result.results.find(r => r.currency.symbol === "PYG").percentage, null);
});

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
