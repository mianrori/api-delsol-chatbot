import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildMemberPurchasesResponse as present } from "../src/services/ai/memberPurchasesPresentation.service.js";
import { protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
import { readConfig, runApiTests } from "../scripts/run-api-tests.mjs";
const document = randomUUID().replace(/\D/g, "").padEnd(9,"7").slice(0,9);
const call = (data, input = {}, extra = {}) => ({ name: "get_member_purchases", input: { dateFrom: "01/01/2023", dateTo: "31/05/2023", ...input },
  result: { documentNumber: document, mode: "summary", data, ...extra } });
const money = { symbol: "PYG", description: "GUARANIES" };
test("purchase presentation renders every local with intact escaped columns and PII restoration", () => {
  const query = call(Array.from({length:55},(_,i)=>({ customerName: `Synthetic | shop ${i}`, customerId: `private-${i}`, currency: money, totalAmount: i-1.5, purchaseCount: 1 })), { groupBy: ["customer"] });
  const protectedCall = { ...query, result: protectPiiDeep("purchase-presentation", query.result, null, ["get_member_purchases"]) };
  const response = restorePiiDeep("purchase-presentation", present([protectedCall], { restoreValue: (value) => restorePiiDeep("purchase-presentation", value) }));
  const rows = response.split("\n").filter(line=>line.startsWith("|"));
  assert.equal(rows.length,57);
  for (const row of rows) assert.equal(row.split(/(?<!\\)\|/).length,6);
  assert.ok(response.includes("Synthetic \\| shop 54"));
  assert.ok(!response.includes("private-"));
  assert.ok(response.includes("-1,5"));
});
test("purchase presentation retains actual page metadata, empty pages and currency separation",()=>{
  const query=call([{purchaseDate:"01/01/2023",customer:{name:"Shop"},category:{name:"Category"},currency:money,amount:0}],{}, {mode:"detail",page:2,totalPages:3,totalRows:5,hasMore:true});
  assert.match(present([query]),/Página 2 de 3; 5 compras en total/);
  assert.match(present([query]),/siguiente página/);
  query.result.data=[];assert.match(present([query]),/No hay compras en esta página/);
  assert.equal(present([query,query]),null);
  assert.equal(present([query,{name:"get_sales"}]),null);
  const response=present([call([{currency:money,totalAmount:1,purchaseCount:1},{currency:{symbol:"USD"},totalAmount:2,purchaseCount:1}])]);
  assert.match(response,/PYG/);assert.match(response,/USD/);
});
test("HTTP individual purchase suite accepts real backend presentation across summaries and pages",async()=>{
  let n=0;
  const report=await runApiTests(readConfig({BOT_TEST_SESSION_ID:"secret",BOT_TEST_SUITE:"member-purchases",BOT_TEST_PURCHASES_DOCUMENT:document,BOT_TEST_PURCHASES_PAGE_SIZE:"2"}),{progress:()=>{},fetchImpl:async(url)=>{
    if(url.endsWith("/reset"))return Response.json({env:"development",success:true});
    n++;
    const group=[undefined,"month","customer","category"][n-1];
    const query=n<=4?call([{month:"2023-01",customerName:"Shop",categoryName:"Category",currency:money,totalAmount:6,purchaseCount:3}],{groupBy:group?[group]:[]}):
      call(Array.from({length:n===5?2:1},()=>({purchaseDate:"01/01/2023",customer:{name:"Shop"},category:{name:"Category"},currency:money,amount:2})),{}, {mode:"detail",page:n-4,totalPages:2,totalRows:3,hasMore:n===5});
    return Response.json({env:"development",success:true,response:present([query]),actions:{}});
  }});
  assert.equal(report.success,true,JSON.stringify(report));
  assert.ok(!JSON.stringify(report).includes(document));
});
