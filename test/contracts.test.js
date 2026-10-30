import test from "node:test";
import assert from "node:assert/strict";
import { getContractConditions } from "../src/services/contracts/contractConditions.service.js";
import { getContractCostPerSqm } from "../src/services/contracts/contractCostPerSqm.service.js";
import { getMonthlyBilledAmountsByConceptRepository } from "../src/repositories/contracts/contractInvoiceAmounts.repository.js";
import { analyzeContractCostIncidence } from "../src/services/contracts/contractCostIncidence.service.js";

const contract = { COD_CLIENTE: "SYNTHETIC-CUSTOMER", TIP_CONTRATO: "CNT", SER_CONTRATO: "S", NRO_CONTRATO: 7,
  FEC_CONTRATO: new Date("2023-01-01T00:00:00Z"), TOTAL_SUP_LOCAL: 20 };
const concept = { COD_CONCEPTO: "6", SIGLAS_MONEDA_FACTURA: "PYG", MONTO_GASTO: 9999,
  FEC_DESDE: new Date("2023-02-01T00:00:00Z"), A_IPC: 6, A_POR: "S" };
const billed = { COD_CONCEPTO: "6", FECHA_EMISION: new Date("2023-03-01T00:00:00Z"),
  IMPORTE: 1100, IVA: 100, IMPORTE_SIN_IVA: 1000, SIMBOLO_MONEDA: "PYG" };
const connectionFor = (options = {}) => ({ queries: [], async execute(sql, binds) {
  this.queries.push({ sql, binds });
  if (sql.includes("VW_BOT_CONTRATOS_CONCEPTOS")) return { rows: options.concepts ?? [concept] };
  if (sql.includes("VW_BOT_FACTURAS")) return { rows: options.billed ?? [billed] };
  return { rows: options.contracts ?? [contract] };
} });
const args = { customerId: "SYNTHETIC-CUSTOMER" };

test("contract ambiguity and absence stop before retrieving concepts or billing", async () => {
  for (const [contracts, status] of [[[], "NOT_FOUND"], [[contract, { ...contract, NRO_CONTRATO: 8 }], "AMBIGUOUS"]]) {
    const connection = connectionFor({ contracts });
    const result = await getContractConditions(args, connection);
    assert.equal(result.status, status);
    assert.equal(connection.queries.length, 1);
    if (status === "AMBIGUOUS") assert.deepEqual(result.contracts.map((item) => item.option), [1, 2]);
  }
});

test("exact contract selection cannot return a contract belonging to another customer", async () => {
  const connection = connectionFor({ contracts: [{ ...contract, COD_CLIENTE: "OTHER-SYNTHETIC" }] });
  assert.equal((await getContractConditions({ ...args, contractType: "CNT", contractSeries: "S", contractNumber: 7 }, connection)).status, "NOT_FOUND");
  assert.equal(connection.queries.length, 1);
});

test("exact contract selection also honors an explicitly requested local", async () => {
  const connection = connectionFor({ contracts: [{ ...contract, NRO_LOCAL: "SYNTHETIC-A" }] });
  const result = await getContractConditions({ ...args, localNumber: "SYNTHETIC-B", contractType: "CNT", contractSeries: "S", contractNumber: 7 }, connection);
  assert.equal(result.status, "NOT_FOUND");
  assert.equal(connection.queries.length, 1);
});

test("partial or invalid contract identities fail before falling back to another contract", async () => {
  for (const identity of [{ contractType: "CNT" }, { contractNumber: 7 }, { contractType: "CNT", contractSeries: "S" },
    { contractType: "CNT", contractSeries: "S", contractNumber: "oops" }]) {
    const connection = connectionFor();
    await assert.rejects(getContractConditions({ ...args, ...identity }, connection));
    assert.equal(connection.queries.length, 0);
  }
});

test("last billing must satisfy both contract and concept validity; configured amounts remain separate", async () => {
  for (const [invoiceDate, applicable] of [["2022-12-31", false], ["2023-01-31", false], ["2023-02-01", true]]) {
    const connection = connectionFor({ billed: [{ ...billed, FECHA_EMISION: new Date(invoiceDate + "T00:00:00Z") }] });
    const result = await getContractConditions(args, connection);
    const item = result.concepts[0];
    assert.equal(Boolean(item.lastBilled), applicable);
    assert.equal(item.configuredAmount, 9999);
    assert.equal(item.ipcFrequencyDescription, "Semestral");
    assert.equal(item.percentageRent, "Sí");
    if (applicable) assert.equal(item.lastBilled.amountExcludingTax, 1000);
    const { sql, binds } = connection.queries.at(-1);
    assert.match(sql, /NVL\(F.USER_CAN_CONSULT, 'S'\) <> 'N'/);
    assert.match(sql, /NVL\(F.ANULADO, 'N'\) <> 'S'/);
    assert.equal(binds.customerId, args.customerId);
    assert.match(sql, /NVL\(F.IMPORTE, 0\) - NVL\(F.IVA, 0\)/);
  }
});

test("contract flags skip unnecessary queries and preserve missing amounts", async () => {
  const connection = connectionFor();
  assert.deepEqual((await getContractConditions({ ...args, includeConcepts: false }, connection)).concepts, []);
  assert.equal(connection.queries.length, 1);
  const noBilling = connectionFor();
  await getContractConditions({ ...args, includeLastBilledAmounts: false }, noBilling);
  assert.equal(noBilling.queries.length, 2);
  const missing = await getContractConditions(args, connectionFor({ billed: [] }));
  assert.equal(missing.concepts[0].lastBilled, null);
});

test("cost per square meter uses billed amount excluding VAT rather than the configured amount", async () => {
  const result = await getContractCostPerSqm({ ...args, conceptCode: "6" }, connectionFor());
  assert.equal(result.status, "OK");
  assert.equal(result.costPerSqm, 50);
  assert.equal(result.sourceAmountExcludingTax, 1000);
  assert.equal(result.exchangeRate, null);
});

test("cost per square meter reports missing area, concept, billing and unsupported currency", async () => {
  for (const [options, code, status] of [
    [{ contracts: [{ ...contract, TOTAL_SUP_LOCAL: 0 }] }, "6", "AREA_NOT_AVAILABLE"],
    [{}, "missing", "CONCEPT_NOT_FOUND"], [{ billed: [] }, "6", "BILLED_AMOUNT_NOT_FOUND"],
    [{ concepts: [{ ...concept, SIGLAS_MONEDA_FACTURA: "EUR" }] }, "6", "CURRENCY_NOT_SUPPORTED"],
  ]) assert.equal((await getContractCostPerSqm({ ...args, conceptCode: code }, connectionFor(options))).status, status);
});

test("monthly billing binds dates, selects the last valid invoice per month/concept and retains credit signs", async () => {
  const connection = connectionFor({ billed: [{ ...billed, IMPORTE_SIN_IVA: -12.5 }] });
  const result = await getMonthlyBilledAmountsByConceptRepository({ connection, ...args, conceptCodes: ["6"], dateFrom: "01/01/2023", dateTo: "31/05/2023" });
  assert.equal(result[0].amountExcludingTax, -12.5);
  assert.match(connection.queries[0].sql, /PARTITION BY\s+TRUNC\(F.FECHA_EMISION, 'MM'\),\s+F.COD_CONCEPTO/);
  assert.match(connection.queries[0].sql, /F.FECHA_EMISION < TO_DATE\(:dateTo, 'DD\/MM\/YYYY'\) \+ 1/);
  assert.equal(connection.queries[0].binds.dateTo, "31/05/2023");
});

test("incidence rejects invalid calendar ranges and unsupported grouping before Oracle", async () => {
  for (const input of [{ dateFrom: "31/02/2023" }, { dateTo: "31/12/2022" }, { groupBy: "customer" }]) {
    const connection = connectionFor();
    await assert.rejects(analyzeContractCostIncidence({ ...args, dateFrom: "01/01/2023", dateTo: "31/05/2023", ...input }, connection));
    assert.equal(connection.queries.length, 0);
  }
});

const incidenceConnection = (currencies = ["PYG"], sales = 10000) => ({ async execute(sql) {
  if (sql.includes("VW_BOT_CONTRATOS_LOCALES")) return { rows: [{ ...contract, PERIOD_MONTH: "01/2023", IS_APPLICABLE: 1 }] };
  if (sql.includes("VW_BOT_CONTRATOS_CONCEPTOS")) return { rows: currencies.map((currency, index) => ({ ...concept, COD_CONCEPTO: ["6", "2"][index], SIGLAS_MONEDA_FACTURA: currency })) };
  if (sql.includes("VW_BOT_FACTURAS")) return { rows: currencies.map((currency, index) => ({ ...billed, PERIOD_MONTH: "01/2023", COD_CONCEPTO: ["6", "2"][index], SIMBOLO_MONEDA: currency })) };
  return { rows: [{ YEAR: "2023", MONTH: "01", TOTAL_AMOUNT: sales, CURRENCY_ABBREVIATION: "PYG" }] };
} });

test("contract incidence computes real billed cost and keeps missing months visible", async () => {
  const result = await analyzeContractCostIncidence({ ...args, dateFrom: "01/01/2023", dateTo: "28/02/2023", groupBy: "month" }, incidenceConnection());
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].shoppingCost.amount, 1000);
  assert.equal(result.data[0].incidencePercentage, 10);
  assert.equal(result.data[1].status, "COST_NOT_AVAILABLE");
  assert.equal(result.data[1].incidencePercentage, null);
});

test("mixed cost currencies cannot produce summed costs or a summary percentage", async () => {
  const input = { ...args, dateFrom: "01/01/2023", dateTo: "31/01/2023" };
  const monthly = await analyzeContractCostIncidence({ ...input, groupBy: "month" }, incidenceConnection(["PYG", "USD"]));
  assert.equal(monthly.data[0].status, "CURRENCY_MISMATCH");
  assert.equal(monthly.data[0].incidencePercentage, null);
  assert.equal(monthly.data[0].shoppingCost.amount, null);
  assert.equal(monthly.data[0].shoppingCost.concepts.length, 2);
  const summary = await analyzeContractCostIncidence(input, incidenceConnection(["PYG", "USD"]));
  assert.equal(summary.status, "CURRENCY_MISMATCH");
  assert.equal(summary.shoppingCost.amount, null);
  assert.equal(summary.incidencePercentage, null);
});

test("zero sales do not produce an invented incidence percentage", async () => {
  const result = await analyzeContractCostIncidence({ ...args, dateFrom: "01/01/2023", dateTo: "31/01/2023" }, incidenceConnection(["PYG"], 0));
  assert.equal(result.status, "NO_SALES");
  assert.equal(result.incidencePercentage, null);
});

test("unknown cost currencies do not inherit the currency of other concepts", async () => {
  for (const currencies of [[null], ["PYG", null]]) {
    const result = await analyzeContractCostIncidence({ ...args, dateFrom: "01/01/2023", dateTo: "31/01/2023" }, incidenceConnection(currencies));
    assert.equal(result.status, "CURRENCY_MISMATCH");
    assert.equal(result.shoppingCost.amount, null);
    assert.equal(result.incidencePercentage, null);
  }
});
