import { contractBusinessConfig } from "../../config/contractBusiness.config.js";
import { getMonthlyBilledAmountsByConceptRepository } from "../../repositories/contracts/contractInvoiceAmounts.repository.js";
import { getHistoricalContractByMonthRepository } from "../../repositories/contracts/contractHistoryByPeriod.repository.js";
import { getContractConceptsRepository } from "../../repositories/contracts/contractConcepts.repository.js";
import { getIncidenceSalesRepository } from "../../repositories/contracts/incidenceSales.repository.js";
import { getCurrentUsdSellRateFromMaxicambios } from "../exchange/maxicambios.service.js";
import { throwIfRequestAborted } from "../requestContext.service.js";

const date = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCFullYear() === +m[3] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1] ? d : null;
};
const monthKey = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const normalizeMonth = (v) => /^\d{2}\/\d{4}$/.test(String(v)) ? v : monthKey(new Date(v));
const time = (v) => v == null ? -Infinity : new Date(v).getTime();
const key = (c) => [c.type, c.series, c.number].join("|");
const currency = (v) => {
  const s = String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["PYG", "GS", "GS.", "₲"].includes(s) || s.includes("GUARANI")) return "PYG";
  if (["USD", "$", "US$"].includes(s) || s.includes("DOLAR")) return "USD";
  return null;
};
const currencyInfo = (code) => ({ code, symbol: code === "PYG" ? "₲" : code });
const summarizeAmounts = (rows) => {
  const codes = new Set(rows.map((r) => r.code));
  const valid = rows.every((r) => r.code && Number.isFinite(r.amount)) && codes.size === 1;
  return { amount: valid ? rows.reduce((n, r) => n + r.amount, 0) : null,
    currency: currencyInfo(valid ? rows[0].code : null),
    byCurrency: [...codes].map((code) => ({ code, amount: code && rows.filter((r) => r.code === code).every((r) => Number.isFinite(r.amount))
      ? rows.filter((r) => r.code === code).reduce((n, r) => n + r.amount, 0) : null })) };
};
const reasons = {
  CONTRACT_NOT_AVAILABLE: "No existe contrato histórico aplicable al período.",
  CONTRACT_AMBIGUOUS: "Varios contratos coinciden en el período; las facturas por cliente no permiten atribuirles un costo único.",
  CONTRACT_PARTIAL_PERIOD: "El contrato no cubre todo el intervalo solicitado del mes; no se extrapolan costos ni vigencias.",
  COST_NOT_AVAILABLE: "No hay importes válidos de los conceptos oficiales vigentes.",
  PARTIAL_COST: "Faltan importes de uno o más conceptos oficiales; el costo total y su incidencia no están completos.",
  BILLING_AMBIGUOUS: "La última factura no es única para un concepto; no se elige una fila arbitrariamente.",
  CURRENCY_MISMATCH: "Las monedas son distintas, desconocidas o contradictorias; no se calcula incidencia entre monedas.",
  NO_SALES: "No hay registros de ventas en el período.", ZERO_SALES: "Las ventas registradas suman cero; no se divide por cero.",
  INVALID_AMOUNT: "Hay importes ausentes o no finitos; no se sustituyen por cero.",
};

const buildPeriod = ({ month, start, end, history, concepts, invoices, salesRows }) => {
  const sourceSales = salesRows.filter((r) => r.month === month);
  const normalizedSales = sourceSales.map((r) => {
    const abbreviation = currency(r.code), description = currency(r.description);
    const code = String(r.code ?? "").trim() && !abbreviation ? null : abbreviation && description && abbreviation !== description ? null : abbreviation ?? description;
    return { code, amount: r.invalidRows > 0 ? null : r.amount };
  });
  const sales = sourceSales.length ? summarizeAmounts(normalizedSales) : { amount: 0, currency: currencyInfo(null), byCurrency: [] };
  sales.rowCount = sourceSales.reduce((n, r) => n + r.rowCount, 0);
  const applicable = history?.applicable === true;
  const configured = applicable ? concepts.filter((c) => c.effectiveFrom == null || (Number.isFinite(time(c.effectiveFrom)) && time(c.effectiveFrom) < end)) : [];
  const configuredCodes = [...new Set(configured.map((c) => String(c.conceptCode)))];
  const selected = [], missing = [];
  let billingAmbiguous = false;
  for (const code of configuredCodes) {
    const invoiceOrder = (a, b) => time(b.invoiceDate) - time(a.invoiceDate)
      || String(b.invoiceNumber).localeCompare(String(a.invoiceNumber), "en", { numeric: true });
    const candidates = invoices.filter((r) => normalizeMonth(r.periodMonth) === month && String(r.conceptCode) === code
      && time(r.invoiceDate) >= start && time(r.invoiceDate) < end
      && configured.some((c) => String(c.conceptCode) === code && (c.effectiveFrom == null || time(c.effectiveFrom) <= time(r.invoiceDate))))
      .sort(invoiceOrder);
    const latest = candidates[0];
    if (!latest) { missing.push({ conceptCode: code, description: configured.find((c) => String(c.conceptCode) === code)?.description ?? null }); continue; }
    const latestCandidates = candidates.filter((r) => invoiceOrder(r, latest) === 0);
    const ambiguous = latestCandidates.length > 1;
    if (ambiguous) billingAmbiguous = true;
    const latestCurrencies = new Set(latestCandidates.map((r) => currency(r.currencySymbol)));
    const conceptCurrency = latestCurrencies.size === 1 ? [...latestCurrencies][0] : null;
    selected.push({ conceptCode: code, description: configured.find((c) => String(c.conceptCode) === code)?.description ?? null,
      amountExcludingTax: ambiguous ? null : latest.amountExcludingTax, currency: currencyInfo(conceptCurrency),
      ...(ambiguous ? { status: "BILLING_AMBIGUOUS", reason: reasons.BILLING_AMBIGUOUS } : {}) });
  }
  const amounts = summarizeAmounts(selected.map((r) => ({ amount: r.amountExcludingTax, code: r.currency.code })));
  if (billingAmbiguous) amounts.amount = null;
  const shoppingCost = { ...amounts, complete: applicable && configuredCodes.length > 0 && !missing.length && selected.length === configuredCodes.length && !billingAmbiguous && amounts.amount !== null,
    concepts: selected, missingConcepts: missing };
  let status = !applicable ? history?.resolution ?? "CONTRACT_NOT_AVAILABLE"
    : billingAmbiguous ? "BILLING_AMBIGUOUS"
    : !selected.length ? "COST_NOT_AVAILABLE"
    : selected.some((r) => !Number.isFinite(r.amountExcludingTax)) || sourceSales.some((r) => r.invalidRows > 0) ? "INVALID_AMOUNT"
    : amounts.amount === null || (sourceSales.length && (sales.amount === null || sales.currency.code !== amounts.currency.code)) ? "CURRENCY_MISMATCH"
    : !sales.rowCount ? "NO_SALES"
    : sales.amount === 0 ? "ZERO_SALES"
    : !shoppingCost.complete ? "PARTIAL_COST" : "OK";
  const area = applicable ? history.totalLocalArea : null;
  return { month, status, reason: reasons[status] ?? null, sales, shoppingCost,
    contract: applicable ? { ...history.contract, applicable: true, resolution: "APPLICABLE" } : null,
    area: { min: area ?? null, max: area ?? null, available: area != null, changedWithinPeriod: false, unit: "m2" },
    incidencePercentage: status === "OK" ? Number((shoppingCost.amount / sales.amount * 100).toFixed(4)) : null,
    incidenceBasis: status === "OK" ? "COMPLETE_COST" : null };
};

export const analyzeContractCostIncidence = async (input, connection, { getUsdSellRate = getCurrentUsdSellRateFromMaxicambios } = {}) => {
  const { customerId, dateFrom, dateTo, groupBy = "summary", localNumber, contractType, contractSeries, contractNumber } = input;
  throwIfRequestAborted();
  const start = date(dateFrom), end = date(dateTo);
  if (!start || !end || start > end) throw new Error("Rango de fechas inválido.");
  if (!["summary", "month"].includes(groupBy)) throw new Error("Agrupación inválida.");
  for (const value of [customerId, ...[localNumber, contractType, contractSeries, contractNumber].filter((v) => v !== undefined && v !== null)]) {
    if (!["string", "number"].includes(typeof value) || !String(value).trim() || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Identificadores inválidos.");
  }
  const provided = [contractType, contractSeries, contractNumber].filter((v) => v !== undefined && v !== null).length;
  if (provided && (provided !== 3 || !Number.isSafeInteger(Number(contractNumber)) || Number(contractNumber) < 0)) throw new Error("Identidad contractual incompleta o inválida.");
  const months = [];
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(new Date(d));
  const history = await getHistoricalContractByMonthRepository({ connection, customerId, dateFrom, dateTo, localNumber, contractType, contractSeries, contractNumber });
  const byContract = new Map();
  for (const h of history.filter((h) => h.applicable)) {
    if (!byContract.has(key(h.contract))) byContract.set(key(h.contract), await getContractConceptsRepository({ connection, contractType: h.contract.type,
      contractSeries: h.contract.series, contractNumber: h.contract.number, conceptCodes: contractBusinessConfig.incidenceConceptCodes }));
  }
  const invoices = await getMonthlyBilledAmountsByConceptRepository({ connection, customerId, dateFrom, dateTo,
    conceptCodes: contractBusinessConfig.incidenceConceptCodes, allCandidates: true });
  const salesRows = await getIncidenceSalesRepository({ connection, customerId, dateFrom, dateTo });
  const periods = months.map((d) => {
    const month = monthKey(d), h = history.find((r) => r.periodMonth === month);
    return buildPeriod({ month, start: Math.max(+start, +d), end: Math.min(+end + 86400000, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
      history: h, concepts: h?.contract ? byContract.get(key(h.contract)) ?? [] : [], invoices, salesRows });
  });
  const aggregate = (field) => summarizeAmounts(periods.map((r) => ({ amount: r[field].amount, code: r[field].currency.code })));
  const sales = aggregate("sales"), shoppingCost = aggregate("shoppingCost");
  const failures = [...new Set(periods.filter((r) => r.status !== "OK").map((r) => r.status))];
  if (!failures.length && (sales.amount === null || shoppingCost.amount === null || sales.currency.code !== shoppingCost.currency.code)) failures.push("CURRENCY_MISMATCH");
  if (!failures.length && sales.amount === 0) failures.push("ZERO_SALES");
  const summary = { status: failures[0] ?? "OK", reason: failures.length ? failures.map((c) => reasons[c]).join(" ") : null, nonCalculableReasons: failures,
    sales: { ...sales, rowCount: periods.reduce((n, r) => n + r.sales.rowCount, 0) },
    shoppingCost: { ...shoppingCost, complete: periods.every((r) => r.shoppingCost.complete),
      missingConceptsByPeriod: periods.filter((r) => r.shoppingCost.missingConcepts.length).map((r) => ({ month: r.month, concepts: r.shoppingCost.missingConcepts })),
      conceptBreakdownByPeriod: periods.map((r) => ({ month: r.month, concepts: r.shoppingCost.concepts, missingConcepts: r.shoppingCost.missingConcepts })),
      ...(periods.length === 1 ? { concepts: periods[0].shoppingCost.concepts, missingConcepts: periods[0].shoppingCost.missingConcepts } : {}) },
    incidencePercentage: failures.length ? null : Number((shoppingCost.amount / sales.amount * 100).toFixed(4)), incidenceBasis: failures.length ? null : "COMPLETE_COST" };
  let exchange = { available: false, reason: "EXCHANGE_RATE_NOT_REQUIRED", currentRate: true, rateType: "sell" };
  if (periods.some((r) => [r.sales, r.shoppingCost].some((v) => v.currency.code === "PYG" && v.amount !== null))) {
    try { const r = await getUsdSellRate(); if (!Number.isFinite(r?.sellRate) || r.sellRate <= 0) throw Error("Invalid rate");
      exchange = { available: true, sellRate: r.sellRate, source: r.source, currentRate: true, rateType: "sell" }; }
    catch { exchange.reason = "EXCHANGE_RATE_UNAVAILABLE"; }
    throwIfRequestAborted();
  }
  for (const r of [...periods, summary]) for (const field of ["sales", "shoppingCost"]) {
    const v = r[field]; v.usd = v.currency.code === "USD" ? v.amount : v.currency.code === "PYG" && v.amount !== null && exchange.available ? v.amount / exchange.sellRate : null;
  }
  const concepts = [...new Map([...byContract.values()].flat().map((c) => [String(c.conceptCode), { conceptCode: String(c.conceptCode), description: c.description ?? null }])).values()];
  const common = { customer: { id: String(customerId), name: history.find((h) => h.customerName)?.customerName ?? null }, dateFrom, dateTo, groupBy, exchange,
    configuredCostConcepts: concepts, queryContext: { costDefinition: "officialConfiguredConceptsByHistoricalContract", contractRule: "uniqueContractCoveringRequestedMonthlyInterval",
      billedAmountRule: "latestValidInvoiceByCustomerConceptAndInvoiceMonthExcludingTax", salesRule: "auditedSalesSameExactInterval", conversionRule: "currentSellRateForDisplayOnlyNeverForCrossCurrencyHistoricalIncidence" } };
  return groupBy === "month" ? { ...common, status: summary.status, reason: summary.reason, data: periods } : { ...common, ...summary };
};
