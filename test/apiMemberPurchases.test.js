import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readConfig, runApiTests } from "../scripts/run-api-tests.mjs";
const document = randomUUID().replace(/\D/g, "").padEnd(9,"7").slice(0,9);
const config = () => readConfig({ BOT_TEST_SESSION_ID: "private-session", BOT_TEST_SUITE: "member-purchases", BOT_TEST_PURCHASES_DOCUMENT: document, BOT_TEST_PURCHASES_PAGE_SIZE: "2" });
const execute = async (flag) => {
  let calls = 0;
  return runApiTests(config(), { progress: () => {}, fetchImpl: async (url, options) => {
    if (url.endsWith("/reset")) return Response.json({ env: "development", success: true });
    const input = JSON.parse(options.body); calls++;
    assert.ok(!input.message.includes("Página 1 de 2; 3 compras en total."), "Expected counts must not be supplied to the model");
    const prefix = `Documento: ${flag === "identity" ? "OTHER" : document}\nPeríodo: 01/01/2023 a 31/05/2023.\n`;
    let table;
    if (calls < 5) {
      const dimension = [null,"Mes","Local","Rubro"][calls-1];
      table = `| ${dimension ? dimension+" | " : ""}Moneda | Importe | Compras |\n| --- | --- | --- |\n| ${dimension ? (dimension === "Mes" ? "2023-01" : "PRIVATE_LABEL")+" | " : ""}${flag === "currency" ? "USD" : "PYG"} | ${flag === "total" && calls === 2 ? "7000" : "6000"} | 3 |`;
    } else {
      const page = calls-4, count = page === 1 ? 2 : 1;
      table = `Página ${flag === "page" ? 1 : page} de 2; 3 compras en total.\n| Fecha | Local | Rubro | Moneda | Importe |\n| --- | --- | --- | --- | --- |\n`+
        Array.from({length: count}, () => `| ${flag === "date" ? "01/01/2024" : "01/01/2023"} | PRIVATE_LOCAL | PRIVATE_CATEGORY | PYG | ${flag === "detail" ? "3000" : "2000"} |`).join("\n");
    }
    return Response.json({env: "development", success: true, response: flag === "unicode" ? (prefix+table).replace("Documento: ", "**Documento:**\u202f").replaceAll("6000", "6\u202f000").replaceAll("2000", "2\u00a0000").replaceAll("2023-01", "2023\u201101") : flag === "month" ? (prefix+table).replaceAll("2023-01", "2024-01") : flag === "malformed" ? (prefix+table).replaceAll("6000", "6 00") : prefix+table, actions: {}});
  } });
};
test("personal purchase suite reconciles summaries and all pages without storing private data", async () => {
  const report = await execute();
  assert.equal(report.success,true,JSON.stringify(report));
  assert.equal(report.summary.passed,6);
  assert.equal(report.coverage.memberPurchasesMultiplePages,true);
  for (const secret of [document,"private-session","PRIVATE_LABEL","PRIVATE_LOCAL"]) assert.ok(!JSON.stringify(report).includes(secret));
});
test("personal purchase checks reject identity, currency, changed totals, dates and pages",async () => {
  for (const [flag,code] of [["identity","MEMBER_PURCHASES_DOCUMENT_PRESERVED"],["currency","MEMBER_PURCHASES_NUMERIC_PYG"],
    ["total","MEMBER_PURCHASES_BREAKDOWN_MATCHES_TOTAL"],["page","MEMBER_PURCHASES_PAGE_METADATA"],
    ["date","MEMBER_PURCHASES_DETAIL_VALUES_AND_DATES"],["detail","MEMBER_PURCHASES_DETAIL_MATCHES_TOTAL"]]) {
    const report=await execute(flag); assert.equal(report.steps.find(s=>s.status==="failed")?.error,code,flag);
  }
});
test("personal purchase configuration requires private fixture and bounds calendar dates and pagination",()=>{
  const env={ BOT_TEST_SESSION_ID:"session",BOT_TEST_SUITE:"member-purchases" };
  assert.throws(()=>readConfig(env),/MEMBER_PURCHASES_DOCUMENT_REQUIRED/);
  for (const invalid of [{BOT_TEST_PURCHASES_FROM:"31/02/2023"},{BOT_TEST_PURCHASES_TO:"01/01/2022"},{BOT_TEST_PURCHASES_PAGE_SIZE:"101"},{BOT_TEST_PURCHASES_MAX_PAGES:"0"}]) {
    assert.throws(()=>readConfig({...env,BOT_TEST_PURCHASES_DOCUMENT:document,...invalid}),/INVALID_MEMBER_PURCHASES/);
  }
});


test("purchase checks accept bold Unicode headers and correctly grouped Unicode thousands", async () => {
  const report = await execute("unicode");
  assert.equal(report.success, true, JSON.stringify(report));
  const outside = await execute("month");
  assert.equal(outside.steps.find(s => s.status === "failed")?.error, "MEMBER_PURCHASES_MONTHS_WITHIN_PERIOD");
  const invalid = await execute("malformed");
  assert.equal(invalid.steps.find(s => s.status === "failed")?.error, "MEMBER_PURCHASES_NUMERIC_PYG");
});
