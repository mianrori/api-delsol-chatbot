// DEV-only integration checks. Values and identities remain in memory.
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withOracleProxySession } from "../src/services/sessions/oracleSession.service.js";
import { getInvoices } from "../src/services/invoices/invoices.service.js";
import { getContractConditions } from "../src/services/contracts/contractConditions.service.js";
import { getContractCostPerSqm } from "../src/services/contracts/contractCostPerSqm.service.js";

const report = { suite: "invoices-contracts-oracle", startedAt: new Date().toISOString(), checks: [] };
const check = (condition, code) => {
  report.checks.push({ code, passed: Boolean(condition) });
  if (!condition) throw Object.assign(new Error(code), { checkCode: code });
};
const rows = (result) => result.data ?? [result];
const currency = (value) => ["₲", "PYG", "GS", "GS."].includes(value) ? "PYG" : value;
const period = { dateFrom: "01/01/2023", dateTo: "31/05/2023" };
try {
  check(process.env.NODE_ENV === "development", "DEVELOPMENT_REQUIRED");
  check(Boolean(process.env.BOT_TEST_SESSION_ID?.trim()), "SESSION_REQUIRED");
  await withOracleProxySession(process.env.BOT_TEST_SESSION_ID, async ({ connection }) => {
    const total = rows(await getInvoices({ ...period, mode: "summary" }, connection));
    check(total.some((row) => row.invoiceCount > 0), "INVOICE_FIXTURE_HAS_RECORDS");
    check(new Set(total.map((row) => currency(row.currencySymbol))).size === total.length, "INVOICE_SEPARATE_CURRENCIES");
    const monthly = rows(await getInvoices({ ...period, mode: "summary", groupBy: ["month"] }, connection));
    for (const row of total) {
      const matching = monthly.filter((month) => currency(month.currencySymbol) === currency(row.currencySymbol));
      check(matching.length > 0 && matching.every((month) => /^(0[1-5])\/2023$/.test(month.month)), "INVOICE_MONTHS_WITHIN_PERIOD");
      const sum = matching.reduce((value, month) => value + month.totalAmount, 0);
      check(Math.abs(sum - row.totalAmount) <= Math.max(0.01, Math.abs(row.totalAmount) * 1e-12), "INVOICE_MONTHLY_AMOUNT_RECONCILIATION");
      // An invoice number may be repeated in different months; do not sum people/identities blindly.
      check(row.invoiceCount >= Math.max(...matching.map((month) => month.invoiceCount))
        && row.invoiceCount <= matching.reduce((value, month) => value + month.invoiceCount, 0), "INVOICE_DISTINCT_COUNT_BOUNDS");
    }
    const first = await getInvoices({ ...period, rows: 2, page: 1 }, connection);
    const second = await getInvoices({ ...period, rows: 2, page: 2 }, connection);
    check(first.totalRows > 2 && first.totalRows === second.totalRows && first.totalInvoices === second.totalInvoices
      && first.data.length === 2 && second.data.length === 2 && first.nextPage === 2, "INVOICE_DETAIL_PAGINATION");
    const customers = rows(await getInvoices({ ...period, mode: "summary", groupBy: ["customer"] }, connection));
    let resolved;
    // Optional local fixture avoids discovery; no customer identifier is reported.
    const candidates = process.env.BOT_TEST_CONTRACT_CUSTOMER_ID
      ? [process.env.BOT_TEST_CONTRACT_CUSTOMER_ID]
      : [...new Set(customers.map((row) => row.customerId).filter(Boolean))].slice(0, 30);
    for (const customerId of candidates) {
      const result = await getContractConditions({ customerId }, connection);
      if (result.status === "RESOLVED") { resolved = result; break; }
      if (result.status === "AMBIGUOUS") {
        const identity = result.contracts[0].contract;
        const selected = await getContractConditions({ customerId, contractType: identity.type, contractSeries: identity.series, contractNumber: identity.number }, connection);
        check(selected.status === "RESOLVED", "CONTRACT_AMBIGUITY_SELECTION");
        resolved = selected; break;
      }
    }
    check(Boolean(resolved), "CONTRACT_FIXTURE_REQUIRED");
    const { contract, concepts } = resolved;
    const exact = { customerId: contract.customerId, contractType: contract.contract.type, contractSeries: contract.contract.series, contractNumber: contract.contract.number };
    const selected = await getContractConditions(exact, connection);
    check(selected.status === "RESOLVED" && selected.contract.customerId === contract.customerId, "CONTRACT_EXACT_IDENTITY");
    const foreign = await getContractConditions({ ...exact, customerId: "SYNTHETIC-NONOWNER" }, connection);
    check(foreign.status === "NOT_FOUND", "CONTRACT_FOREIGN_CUSTOMER_REJECTED");
    check(concepts.length > 0, "CONTRACT_CONCEPT_FIXTURE_REQUIRED");
    for (const concept of concepts.filter((item) => item.lastBilled)) {
      const invoiceDate = new Date(concept.lastBilled.invoiceDate).getTime();
      check([contract.contractDate, concept.effectiveFrom].filter(Boolean).every((date) => invoiceDate >= new Date(date).getTime()), "CONTRACT_BILLING_WITHIN_VALIDITY");
    }
    const concept = concepts.find((item) => item.lastBilled) ?? concepts[0];
    const targetCurrency = currency(concept.invoiceCurrency?.code ?? concept.contractCurrency?.code ?? concept.lastBilled?.currencySymbol);
    if (["PYG", "USD"].includes(targetCurrency)) {
      const cost = await getContractCostPerSqm({ ...exact, conceptCode: concept.conceptCode, targetCurrency }, connection);
      if (cost.status === "OK") {
        check(Math.abs(cost.costPerSqm - concept.lastBilled.amountExcludingTax / contract.totalLocalArea) < 1e-8 && cost.exchangeRate === null, "CONTRACT_COST_PER_SQM_EXCLUDING_TAX");
      } else check(["AREA_NOT_AVAILABLE", "BILLED_AMOUNT_NOT_FOUND"].includes(cost.status), "CONTRACT_COST_UNAVAILABLE_EXPLICIT");
      report.coverage = { costPerSqmCalculated: cost.status === "OK" };
    } else report.coverage = { costPerSqmCalculated: false };
  });
  report.success = true;
} catch (error) {
  report.success = false;
  report.error = error.checkCode ?? (String(error.code ?? "").startsWith("ORACLE_SESSION_") ? error.code : "BUSINESS_INTEGRATION_ERROR");
  // Only diagnostic codes; never SQL, binds, exception messages or data rows.
  if (Number.isInteger(error.errorNum)) report.oracleErrorNum = error.errorNum;
}
report.finishedAt = new Date().toISOString();
const path = process.env.BOT_TEST_REPORT || join(tmpdir(), "chatbot-business-tests.json");
await writeFile(path, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(report));
process.exit(report.success ? 0 : 1);
