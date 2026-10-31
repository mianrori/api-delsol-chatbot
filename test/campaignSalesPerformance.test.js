import test from "node:test";
import assert from "node:assert/strict";
import { getCampaignSalesPerformance } from "../src/services/sales/campaignSalesPerformance.service.js";
import { buildCampaignSalesPerformanceResponse } from "../src/services/ai/campaignSalesPerformancePresentation.service.js";
import { protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";

const args = { promotionId: "P1", campaignId: "C1", campaignDateFrom: "01/05/2023", campaignDateTo: "10/05/2023" };
const campaign = (input) => ({ COD_PROMOCION: input.promotionId, COD_CAMPANIA: input.campaignId,
  NOMBRE_PROMOCION: "Promoción sintética", NOMBRE_CAMPANIA: "Campaña sintética",
  FECHA_DESDE: input.campaignDateFrom, FECHA_HASTA: input.campaignDateTo });
const connectionFor = (input = args, options = {}) => {
  const queries = []; let salesIndex = 0;
  return { queries, execute: async (sql, binds) => {
    queries.push({ sql, binds });
    if (sql.includes("VW_BOT_PROMOCIONES")) return { rows: options.campaignRows ?? [campaign(input)] };
    const index = salesIndex++;
    options.onSales?.(index);
    return { rows: [{ TOTAL_AMOUNT: (options.amounts ?? [1000, 2000, 1500])[index], TOTAL_INVOICES: (options.invoices ?? [10, 20, 15])[index],
      CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_ABBREVIATION: (options.currencies ?? ["PYG", "PYG", "PYG"])[index] }] };
  }, break: async () => {} };
};
const present = (result) => buildCampaignSalesPerformanceResponse([{ name: "analyze_campaign_sales_performance", result }]);

test("campaign analysis queries the exact campaign and three consecutive equal periods with identical filters", async () => {
  const input = { ...args, promotionName: "Invented", campaignName: "Invented", customerIds: ["Local'42"], categoryIds: ["R7"] };
  const connection = connectionFor(input);
  const result = await getCampaignSalesPerformance(input, connection);
  assert.equal(connection.queries.length, 4);
  assert.deepEqual(connection.queries[0].binds, { promotionId: "P1", campaignId: "C1" });
  assert.deepEqual(connection.queries.slice(1).map((q) => [q.binds.dateFrom, q.binds.dateTo]), [
    ["21/04/2023", "30/04/2023"], ["01/05/2023", "10/05/2023"], ["11/05/2023", "20/05/2023"],
  ]);
  for (const { sql, binds } of connection.queries.slice(1)) {
    assert.ok(Object.values(binds).includes("Local'42"));
    assert.ok(Object.values(binds).includes("R7"));
    assert.ok(!sql.includes("Local'42"));
    assert.match(sql, /SUM\(MONTO_TOTAL\)/);
    assert.match(sql, /SUM\(CANTIDAD_FACTURAS\)/);
  }
  assert.equal(result.campaign.campaignName, "Campaña sintética");
  assert.equal(result.campaign.durationDays, 10);
  assert.equal(result.comparisons.duringVsBefore.totalAmount.percentageChange, 100);
  assert.equal(result.comparisons.afterVsDuring.totalAmount.percentageChange, -25);
  assert.equal(result.comparisons.afterVsBefore.totalAmount.percentageChange, 50);
  assert.equal(result.periods.during.averageDailyAmount, 200);
  assert.equal(result.interpretationRules.causalAttributionAllowed, false);
  assert.match(present(result), /no demuestran que la campaña haya causado/);
});

test("single-day leap-year campaigns and campaigns crossing the year use calendar days", async () => {
  for (const [from, to, expected] of [
    ["29/02/2024", "29/02/2024", [["28/02/2024", "28/02/2024"], ["29/02/2024", "29/02/2024"], ["01/03/2024", "01/03/2024"]]],
    ["31/12/2022", "01/01/2023", [["29/12/2022", "30/12/2022"], ["31/12/2022", "01/01/2023"], ["02/01/2023", "03/01/2023"]]],
  ]) {
    const input = { ...args, campaignDateFrom: from, campaignDateTo: to };
    const connection = connectionFor(input);
    await getCampaignSalesPerformance(input, connection);
    assert.deepEqual(connection.queries.slice(1).map((q) => [q.binds.dateFrom, q.binds.dateTo]), expected);
  }
});

test("zero reference amounts have no invented percentages and empty periods remain visible", async () => {
  const result = await getCampaignSalesPerformance(args, connectionFor(args, { amounts: [0, 2000, 0], invoices: [0, 20, 0] }));
  assert.equal(result.comparisons.duringVsBefore.totalAmount.percentageChange, null);
  assert.equal(result.comparisons.afterVsDuring.totalAmount.percentageChange, -100);
  const text = present(result);
  assert.match(text, /No calculable/);
  assert.match(text, /no tienen registros/);
  for (const label of ["Antes", "Durante", "Después"]) assert.ok(text.includes(label));
});

test("inconsistent currencies suppress monetary comparisons while invoice counts remain comparable", async () => {
  const result = await getCampaignSalesPerformance(args, connectionFor(args, { currencies: ["PYG", "USD", "PYG"] }));
  assert.equal(result.currency.consistent, false);
  for (const comparison of Object.values(result.comparisons)) {
    assert.equal(comparison.totalAmount, null);
    assert.equal(comparison.averageDailyAmount, null);
    assert.ok(comparison.totalInvoices);
  }
  assert.match(present(result), /monedas difieren/);
});

test("invalid dates, missing identities and malformed filters never query sales", async () => {
  for (const invalid of [{ campaignDateFrom: "31/02/2023" }, { campaignDateFrom: "11/05/2023" },
    { promotionId: "" }, { campaignId: undefined }, { customerIds: "1" }, { categoryIds: [""] }]) {
    const connection = connectionFor();
    await assert.rejects(getCampaignSalesPerformance({ ...args, ...invalid }, connection));
    assert.equal(connection.queries.length, 0);
  }
});

test("missing, ambiguous and date-mismatched campaigns cannot lead to sales queries", async () => {
  for (const campaignRows of [[], [campaign(args), campaign(args)], [{ ...campaign(args), FECHA_DESDE: "02/05/2023" }]]) {
    const connection = connectionFor(args, { campaignRows });
    await assert.rejects(getCampaignSalesPerformance(args, connection));
    assert.equal(connection.queries.length, 1);
  }
});

test("cancellation between periods stops the sequence and does not produce a partial analysis", async () => {
  const cancellation = new AbortController();
  const connection = connectionFor(args, { onSales: () => cancellation.abort() });
  await assert.rejects(runWithRequestSignal(cancellation.signal,
    () => getCampaignSalesPerformance(args, connection)), { code: "REQUEST_ABORTED" });
  assert.equal(connection.queries.length, 2);
});

test("campaign identity is protected before rendering while metrics remain exact", async () => {
  const result = await getCampaignSalesPerformance(args, connectionFor());
  const protectedResult = protectPiiDeep("campaign-test", result);
  assert.match(protectedResult.campaign.campaignName, /^\[PII_CAMPAIGN_NAME_/);
  assert.match(protectedResult.campaign.promotionId, /^\[PII_PROMOTION_ID_/);
  assert.equal(protectedResult.periods.during.totalAmount, 2000);
  assert.deepEqual(restorePiiDeep("campaign-test", protectedResult), result);
  const text = present(protectedResult);
  assert.ok(!text.includes("Campaña sintética"));
  assert.ok(!text.includes(protectedResult.campaign.promotionId));
  assert.equal(buildCampaignSalesPerformanceResponse([{ name: "analyze_campaign_sales_performance", result: {} }]), null);
  assert.equal(buildCampaignSalesPerformanceResponse([{ name: "get_sales", result }, { name: "analyze_campaign_sales_performance", result }]), null);
});
