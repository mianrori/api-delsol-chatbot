import test from "node:test";
import assert from "node:assert/strict";
import { buildMemberSummaryResponse } from "../src/services/ai/memberSummaryPresentation.service.js";

const call = (month, amount) => ({ name: "analyze_members", input: { resultMode: "summary", breakdownBy: ["category"] },
  result: { status: "FOUND", analysis: { periodDefinition: [{ dateFrom: `01/${month}/2023`, dateTo: `${month === "01" ? 31 : 28}/${month}/2023` }] },
    summary: { totalsByCurrency: [{ currency: { symbol: "₲" }, totalAmount: amount, purchaseCount: 7 }] },
    breakdown: { category: [{ categoryName: "[PII_CATEGORY_NAME_1]", currency: { symbol: "₲" }, totalAmount: amount, purchaseCount: 7 }] },
  } });

test("monthly breakdowns preserve every returned value and keep periods separate", () => {
  const text = buildMemberSummaryResponse([call("01", 1000000), call("02", 2000000)]);
  const january = text.slice(text.indexOf("**Del 01/01"), text.indexOf("**Del 01/02"));
  const february = text.slice(text.indexOf("**Del 01/02"));
  assert.ok(january.includes("₲ 1.000.000"));
  assert.ok(!january.includes("₲ 2.000.000"));
  assert.ok(february.includes("₲ 2.000.000"));
  assert.ok(!february.includes("₲ 1.000.000"));
  assert.doesNotMatch(text, /IVA|facturado|aument[oó]|disminuy/);
});

test("all rows and currencies are preserved without invented totals", () => {
  const result = call("01", 1000000);
  result.result.breakdown.category = Array.from({ length: 30 }, (_, i) => ({
    categoryName: `Rubro ${i}`, currency: { symbol: i === 29 ? "USD" : "₲" }, totalAmount: i, purchaseCount: 1,
  }));
  const text = buildMemberSummaryResponse([result]);
  assert.equal(text.split("\n").filter((line) => line.startsWith("| Rubro ") && /\d/.test(line)).length, 30);
  assert.ok(text.includes("USD 29"));
});

test("incomplete periods, errors and mixed tools retain the normal response path", () => {
  assert.equal(buildMemberSummaryResponse([]), null);
  assert.equal(buildMemberSummaryResponse([call("01", 10), { name: "get_sales" }]), null);
  const failed = call("01", 10);
  delete failed.result.breakdown.category;
  assert.equal(buildMemberSummaryResponse([failed]), null);
  failed.result.status = "ERROR";
  assert.equal(buildMemberSummaryResponse([failed]), null);
});
