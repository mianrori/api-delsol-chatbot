import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readConfig, runApiTests, controls, comparisonControls } from "../scripts/run-api-tests.mjs";
import { generateChart } from "../src/services/charts/chart.service.js";
import { buildSalesYearComparisonResponse } from "../src/services/ai/salesYearComparison.service.js";
import { buildMemberSolesResponse } from "../src/services/ai/memberSolesPresentation.service.js";
import { buildSolesUsageResponse } from "../src/services/ai/solesUsagePresentation.service.js";
import { protectPiiText } from "../src/services/ai/pii.service.js";
import { campaignControl } from "../scripts/api-purchases-campaigns-checks.mjs";
import { buildMemberPurchasesVsSalesResponse } from "../src/services/ai/memberPurchasesVsSalesPresentation.service.js";
import { buildCampaignSalesPerformanceResponse } from "../src/services/ai/campaignSalesPerformancePresentation.service.js";
import { buildPromotionSearchResponse } from "../src/services/ai/promotionSearchPresentation.service.js";
import { getCampaignSalesPerformance } from "../src/services/sales/campaignSalesPerformance.service.js";
import { compareMemberPurchasesVsSales } from "../src/services/members/memberPurchasesVsSales.service.js";

import { buildVehicleResponse } from "../src/services/ai/vehiclePresentation.service.js";

const session = "test-session-secret";
// Generated only for the isolated mock server; never a real member fixture.
const memberDocument = randomUUID().replace(/\D/g, "").padEnd(9, "7").slice(0, 9);
const num = (value) => new Intl.NumberFormat("es-PY").format(value);
const fakeWorkbook = (buffer) => {
  const { rows, info } = JSON.parse(buffer.subarray(2));
  const wrap = (values) => ({ values: [undefined, ...values], getCell: (index) => ({ value: values[index - 1] }) });
  const sheet = (data) => ({ getRow: (index) => wrap(data[index - 1]), eachRow: (fn) => data.forEach((row, index) => fn(wrap(row), index + 1)) });
  return { getWorksheet: (name) => name === "Ventas" ? sheet(rows) : name === "Información" ? sheet(info) : undefined };
};
const mockApi = async (options = {}) => {
  const exports = new Map(); let chats = 0, downloads = 0, balanceCalls = 0, solesPage = 0, solesReferenceDate, campaignPage = 0;
  const memberName = "PERSONA PRIVADA DE PRUEBA";
  const movements = (options.missingSolesQuantities ? [3.5, -1, .5, 2, 0, null, null] : [3.5, -1, .5, 2, 1, 1.25, 2.75]).slice(0, options.singleSolesPage ? 3 : 7).map((quantity, index) => ({
    memberName, movementDate: index % 2 ? `2023-02-${String(index + 1).padStart(2, "0")}T12:00:00.000Z` : `${String(index + 1).padStart(2, "0")}/02/2023`, solesTypeDescription: index < 4 ? "PRIVATE_TYPE_A" : "PRIVATE_TYPE_B",
    movementType: "PRIVATE_MOVEMENT", destinationType: "LOCAL", destinationName: "PRIVATE_DESTINATION", solesUsed: quantity,
  }));
  const server = createServer(async (req, res) => {
    let body = ""; for await (const part of req) body += part;
    const data = body ? JSON.parse(body) : null;
    const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ env: options.env ?? "development", ...value })); };
    if (req.url.endsWith("/chat/reset")) return json(200, { success: true });
    if (req.url.endsWith("/chat") && !data.sessionId) return json(400, { success: false });
    if (req.url.includes("/exports/sales/")) {
      const id = req.url.split("/").at(-2), record = exports.get(id);
      if (!record) return json(404, { success: false });
      downloads++;
      res.writeHead(200, { "Content-Type": options.badMime ? "text/plain" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      res.end(Buffer.from("PK" + JSON.stringify(record.workbook))); return;
    }
    chats++;
    if (options.timeout) return;
    const question = data.message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (options.validateSolesPii) {
      const protectedText = protectPiiText("api-runner-soles-fixture", data.message);
      if (data.message.includes(memberDocument)) assert.ok(!protectedText.includes(memberDocument));
      else assert.equal(protectedText, data.message, "Calendar dates and grouping words must remain readable");
    }
    if (question.includes("canjes de facturas de socios frente a") || question.includes("comparacion de canjes de facturas")) {
      const monthly = question.includes("mes a mes"), january = question.includes("unicamente enero");
      const source = controls.monthly.slice(0, january ? 1 : 5);
      const groups = monthly ? source.map((row, index) => ({ label: `2023-${row.month}`, sales: row.amount, amount: (index + 1) * 1000000, count: (index + 1) * 10, members: index + 1 }))
        : [{ sales: source.reduce((sum, row) => sum + row.amount, 0), amount: january ? 1000000 : 15000000, count: january ? 10 : 150, members: january ? 1 : 5 }];
      const args = { dateFrom: "01/01/2023", dateTo: january ? "31/01/2023" : "31/05/2023", breakdownBy: monthly ? ["month"] : [], orderBy: "dimension", orderDirection: "asc" };
      const connection = { execute: async (sql) => ({ rows: groups.map((row) => ({
        DIMENSION_1_ID: row.label, DIMENSION_1_NAME: row.label,
        CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_SYMBOL: options.purchaseCurrency ?? "PYG",
        ...(sql.includes("VW_BOT_VENTAS_LOCALES") ? { SALES_AMOUNT: row.sales } : {
          EXCHANGE_AMOUNT: row.amount, INVOICE_COUNT: row.count, MEMBER_COUNT: row.members,
        }),
      })) }) };
      const result = await compareMemberPurchasesVsSales(args, connection);
      if (options.wrongPurchasePeriod) result.period.dateTo = "30/05/2023";
      if (options.wrongPurchaseSales) result.results[0].auditedSalesAmount++;
      if (options.wrongPurchasePercentage) result.results[0].percentage++;
      if (options.wrongPurchaseTotal && !monthly && !january) { result.results[0].exchangeAmount++; result.results[0].percentage = result.results[0].exchangeAmount / result.results[0].auditedSalesAmount * 100; }
      if (options.wrongPurchaseMembers && !monthly && !january) result.results[0].memberCount = 16;
      if (options.wrongPurchaseJanuary && january) result.results[0].invoiceCount++;
      if (options.emptyPurchases) for (const row of result.results) { row.invoiceCount = 0; row.memberCount = 0; row.exchangeAmount = 0; row.percentage = 0; }
      if (options.wrongPurchaseCurrency) result.results[0].currency.symbol = "USD";
      if (options.wrongPurchaseMonth && monthly) result.results[0].dimensions[0].name = "2024-01";
      if (options.truncatedPurchases) result.summary.hasMore = true;
      return json(200, { success: true, response: buildMemberPurchasesVsSalesResponse([{ name: "compare_member_purchases_vs_sales", result }]), actions: {} });
    }
    if (question.includes("campana navidad") || campaignPage && question === "siguiente pagina") {
      campaignPage++;
      const nextPage = options.campaignMultiPage && campaignPage === 1;
      const entries = Array.from({ length: 10 }, (_, index) => ({ optionId: index + 1,
        promotionName: "PRIVATE_PROMOTION", campaignName: index === 3 && !nextPage && !options.missingCampaign ? campaignControl.name : `PRIVATE_NAVIDAD_${index}`,
        dateFrom: options.wrongCampaignDates ? "16/11/2018" : "15/11/2018", dateTo: "06/01/2019" }));
      const result = { status: "AMBIGUOUS", totalRows: options.campaignMultiPage ? 20 : 10, page: campaignPage, totalPages: options.campaignMultiPage ? 2 : 1, options: entries, hasMore: nextPage };
      return json(200, { success: true, response: options.silentCampaignSelection ? "Elegí una campaña sin preguntar." : buildPromotionSearchResponse([{ name: "search_promotions", result }]), actions: {} });
    }
    if (question.startsWith("opcion ")) {
      assert.ok(question.startsWith("opcion 4."), "The selection must come from the returned options");
      const input = { promotionId: "SYNTHETIC_PROMO", campaignId: "SYNTHETIC_CAMPAIGN", campaignDateFrom: "15/11/2018", campaignDateTo: "06/01/2019" };
      let index = 0;
      const result = await getCampaignSalesPerformance(input, { execute: async (sql) => {
        if (sql.includes("VW_BOT_PROMOCIONES")) return { rows: [{ COD_PROMOCION: input.promotionId, COD_CAMPANIA: input.campaignId,
          NOMBRE_PROMOCION: "PRIVATE_PROMOTION", NOMBRE_CAMPANIA: campaignControl.name, FECHA_DESDE: input.campaignDateFrom, FECHA_HASTA: input.campaignDateTo }] };
        const row = campaignControl.periods[index++]; return { rows: [{ TOTAL_AMOUNT: row.amount, TOTAL_INVOICES: row.invoices, CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_ABBREVIATION: "PYG" }] };
      } });
      if (options.wrongCampaignTotals) result.periods.before.totalAmount++;
      if (options.wrongCampaignAverage) result.periods.during.averageDailyAmount++;
      if (options.wrongCampaignVariation) Object.values(result.comparisons)[0].totalInvoices.absoluteChange++;
      let response = buildCampaignSalesPerformanceResponse([{ name: "analyze_campaign_sales_performance", result }]);
      if (options.causalCampaign) response = response.replace("Estas variaciones describen las ventas observadas; no demuestran que la campaña haya causado los cambios.", "La campaña causó el aumento.");
      return json(200, { success: true, response, actions: {} });
    }
    const solesPeriod = { dateFrom: "01/01/2023", dateTo: "31/05/2023" };
    if (question.includes("saldo de soles") || question === "detallar por vencimiento") {
      const expiration = question === "detallar por vencimiento";
      if (!expiration) {
        balanceCalls++;
        solesReferenceDate = / con fecha de referencia (\d{2}\/\d{2}\/\d{4})/.exec(question)?.[1];
        assert.equal(solesReferenceDate, options.solesReferenceDate ?? "30/06/2023", "The request must specify the test reference date explicitly");
      }
      const rows = expiration ? [
        { typeDescription: "PRIVATE_TYPE_A", balance: 6.25 + (options.wrongSolesExpiration ? 1 : 0), expirationDate: "31/12/2098", recordCount: 1 },
        { typeDescription: "PRIVATE_TYPE_A", balance: 4.25, expirationDate: "31/12/2099", recordCount: 1 },
        { typeDescription: "PRIVATE_TYPE_B", balance: 4, expirationDate: "31/12/2099", recordCount: 1 },
      ] : [{ typeDescription: "PRIVATE_TYPE_A", balance: options.wrongSolesReturn && balanceCalls > 1 ? 5 : 10.5, recordCount: 2 }, { typeDescription: "PRIVATE_TYPE_B", balance: 4, recordCount: 1 }];
      const result = { data: rows, summary: { memberName: options.changedSolesMember && expiration ? "OTRA PERSONA PRIVADA" : memberName },
        queryContext: { mode: "summary", status: "current", referenceDate: options.ignoredSolesReference ? "29/10/2026" : solesReferenceDate, balanceOnly: true, groupBy: expiration ? ["type", "expirationDate"] : ["type"] } };
      let response = buildMemberSolesResponse([{ name: "get_member_soles", result }]);
      if (options.solesAsCurrency) response = response.replace("10,5", "₲ 10,5");
      return json(200, { success: true, response, actions: {} });
    }
    if (question.startsWith("soles utilizados")) {
      const groups = new Map();
      for (const movement of movements) {
        const previous = groups.get(movement.solesTypeDescription) ?? { memberName: options.wrongSolesUsageMember ? "OTRA PERSONA PRIVADA" : memberName,
          solesTypeDescription: movement.solesTypeDescription, totalSolesUsed: 0, movementCount: 0 };
        previous.totalSolesUsed += movement.solesUsed; previous.movementCount++; groups.set(movement.solesTypeDescription, previous);
      }
      if (options.wrongSolesUsageTotal) groups.values().next().value.totalSolesUsed += 1;
      const result = { mode: "summary", queryContext: solesPeriod, groupBy: ["solesType", "member"], metrics: ["totalSolesUsed", "movementCount"],
        data: options.emptySolesUsage ? [] : [...groups.values()], summary: { hasMore: Boolean(options.truncatedSolesUsage), returnedGroups: groups.size, totalGroups: groups.size + 1 } };
      return json(200, { success: true, response: buildSolesUsageResponse([{ name: "get_soles_usage", result }]), actions: {} });
    }
    if (question.startsWith("detalla los movimientos") || question === "siguiente pagina") {
      const pageSize = options.solesPageSize ?? 5, totalPages = Math.ceil(movements.length / pageSize);
      solesPage = question.startsWith("detalla") ? 1 : solesPage + 1;
      if (solesPage > totalPages) return json(200, { success: true, response: "No hay más páginas de movimientos para los filtros consultados.", actions: {} });
      const data = movements.slice((solesPage - 1) * pageSize, solesPage * pageSize).map((row) => ({ ...row,
        ...(options.invalidSolesQuantity ? { solesUsed: NaN } : {}),
        ...(options.emptySolesDetailType ? { solesTypeDescription: "" } : {}),
        ...(options.wrongSolesDetailDate ? { movementDate: "01/01/2024" } : {}),
      }));
      const result = { mode: "detail", data, queryContext: solesPeriod, pagination: {
        page: options.repeatedSolesPage ? 1 : solesPage, totalPages, totalRows: movements.length, hasMore: solesPage < totalPages,
      } };
      return json(200, { success: true, response: buildSolesUsageResponse([{ name: "get_soles_usage", result }]), actions: {} });
    }
    if (question.includes("2023 contra 2024") || question.includes("ambos anos")) {
      let from = 1, to = 12;
      if (question.includes("ambos anos") && !options.staleComparisonPeriod) {
        if (question.includes("enero a mayo")) to = 5;
        else from = to = 8;
      }
      const calls = [2023, 2024].map((year) => ({ name: "get_sales", input: {
        dateFrom: `01/${String(from).padStart(2, "0")}/${year}`, dateTo: `${new Date(Date.UTC(year, to, 0)).getUTCDate()}/${String(to).padStart(2, "0")}/${year}`,
        groupBy: ["month"], metrics: ["totalAmount", "totalInvoices"],
      }, result: { data: comparisonControls[year].flatMap((metrics, index) => !metrics || index < from - 1 || index >= to ? [] : [{ month: String(index + 1).padStart(2, "0"), totalAmount: metrics[0], totalInvoices: metrics[1], currency: { abbreviation: "PYG", symbol: "₲" } }]) } }));
      let response = buildSalesYearComparisonResponse(calls);
      if (options.comparisonMissingAsZero) response = response.replaceAll("| Sin registros | Sin registros |", "| ₲ 0 | 0 |");
      if (options.wrongComparisonValue) response = response.replace("₲ 58.706.137.966", "₲ 58.706.137.965");
      if (options.inventedComparison) response += "\n- Noviembre: las ventas de 2024 fueron mayores que en 2023.";
      if (options.wrongComparisonDirection) response = response.replaceAll("las ventas de 2024 fueron mayores", "las ventas de 2024 fueron menores");
      if (options.wrongComparisonDifference) response = response.replaceAll("4.899.996", "4.899.995");
      if (options.falseZeroClaim) response += "\nEn enero a mayo de 2024 no se registraron ventas.";
      return json(200, { success: true, response, actions: {} });
    }
    if (/\bgrafic/.test(question)) {
      const newPeriod = question.includes("enero a febrero");
      const points = newPeriod && !options.staleChartPeriod ? controls.monthly.slice(0, 2) : controls.monthly;
      const rows = points.map((point) => ({ month: point.month, totalAmount: point.amount, currency: { abbreviation: "PYG" } }));
      if (options.wrongChartAmount) rows[0].totalAmount = 1;
      const generated = await generateChart({ type: question.includes("lineas") ? "line" : "bar", title: "Ventas 2023", labelPaths: ["month"], datasets: [{ label: "Ventas", valuePath: "totalAmount" }] }, { sources: { example: { name: "get_sales", result: { data: rows } } } });
      const chart = generated.chart;
      if (options.wrongChartUnit) chart.valuePrefix = "US$";
      let svg = Buffer.from(chart.url.split(",")[1], "base64").toString();
      if (options.missingChartValues) svg = svg.replaceAll('data-value-label="true"', 'data-hidden-value="true"');
      if (options.activeSvg) svg = svg.replace("</svg>", "<script>alert(1)</script></svg>");
      chart.url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      if (options.invalidChartData) chart.url = "data:image/svg+xml;base64,%%%";
      return json(200, { success: true, response: "Aquí tienes el gráfico solicitado.", actions: { chart } });
    }
    if (question.includes("enero a mayo")) {
      const response = "Período: 01/01/2023 a 31/05/2023.\n| Mes | Ventas | Facturas |\n| --- | --- | --- |\n" + controls.monthly.map((row) => `| ${row.name} | ₲ ${num(row.amount)} | ${num(row.invoices)} |`).join("\n");
      return json(200, { success: true, response, actions: {} });
    }
    if (data.message.includes("vehículos") || data.message === "Ahora por género") {
      const groupBy = data.message === "Ahora por género" ? ["gender"] : [];
      const result = { mode: "summary", groupBy, queryContext: { dateFrom: "01/01/2025", dateTo: "31/12/2025", groupBy },
        totals: { vehicleCount: 23, plateCount: 23, memberCount: 7 },
        data: groupBy.length ? [{ gender: "F", vehicleCount: 2, plateCount: 2, memberCount: 1 },
          { gender: "M", vehicleCount: options.wrongVehicleGenderCount ? 20 : 21, plateCount: 21, memberCount: 6 }] : [] };
      let response = buildVehicleResponse([{ name: "get_vehicle_registrations", result }]);
      if (options.vehicleGenderCodes) response = response.replace("Femenino", "F").replace("Masculino", "M");
      if (options.vehicleArgsAsText && groupBy.length) response = JSON.stringify({ dateFrom: "01/01/2025", dateTo: "31/12/2025", groupBy });
      return json(200, { success: true, response, actions: {} });
    }
    if (data.message === "Ahora solo del rubro deportes") return json(200, { success: true, response: "DEPORTES: ₲ 2.994.866.457 y 7.049 facturas.", actions: {} });
    const sports = data.message === "Ahora por local", category = data.message.includes("por rubro");
    const february = data.message.includes("febrero"), month = february ? "02" : "01", end = february ? "28" : "31";
    const total = sports ? controls.sports : february ? controls.february : controls.january, count = sports ? 5 : category ? 34 : february ? 181 : 180;
    const id = options.sameExport ? "secret-export-1" : `secret-export-${chats}`;
    const fileName = `ventas_por_${category ? "rubro" : "local"}_2023${month}01_a_2023${month}${end}_2026_10_29.xlsx`;
    const rows = Array.from({ length: count }, (_, index) => [`Private Shop ${index}`, index ? 0 : total.amount, index ? 0 : total.invoices, "GUARANIES", "PYG"]);
    const response = `Período: 01/${month}/2023 a ${end}/${month}/2023.\n| Local | Ventas | Facturas |\n| --- | --- | --- |\n`
      + rows.slice(0, 12).map((row) => `| ${row[0]} | ₲ ${num(row[1])} | ${num(row[2])} |`).join("\n") + `\nSe muestran 12 de ${count} registros.`;
    if (sports) return json(200, { success: true, response, actions: {} });
    const info = [["Campo", "Valor"], ["Fecha desde", `01/${month}/2023`], ["Fecha hasta", `${end}/${month}/2023`], ["Agrupación", category ? "category" : "customer"], ["Export ID", id], ["Registros exportados", count], ["Usuario", "PRIVATE_OWNER"]];
    if (options.wrongAmount) rows.at(-1)[1] = 1;
    exports.set(id, { workbook: { rows: [[category ? "Rubro" : "Local", "Importe total", "Cantidad de facturas", "Moneda", "Abreviatura moneda"], ...rows], info } });
    json(200, { success: true, response, actions: { salesExport: { available: true, exportId: id, totalRecords: count, format: "xlsx", fileName, expiresAt: new Date(Date.now() + 600000).toISOString() } } });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { baseUrl: `http://127.0.0.1:${server.address().port}/chatbot/api/bot`,
    counts: () => ({ chats, downloads }), close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
};
const execute = async (options = {}) => {
  const api = await mockApi(options);
  try {
    const report = await runApiTests({ ...readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_SUITE: options.suite ?? "quick", BOT_TEST_BASE_URL: api.baseUrl,
      BOT_TEST_MEMBER_DOCUMENT: options.memberDocument ?? (options.suite === "soles" ? memberDocument : undefined),
      BOT_TEST_SOLES_REFERENCE_DATE: options.solesReferenceDate,
      BOT_TEST_SOLES_PAGE_SIZE: String(options.solesPageSize ?? 5), BOT_TEST_SOLES_MAX_PAGES: String(options.solesMaxPages ?? 10),
    }), timeoutMs: options.timeout ? 100 : 3000 }, { loadWorkbook: fakeWorkbook, progress: () => {} });
    return { report, counts: api.counts() };
  } finally { await api.close(); }
};

test("local API runner validates HTTP, fresh exports, Excel totals and changed month in sequence", async () => {
  const { report, counts } = await execute();
  assert.equal(report.success, true);
  assert.equal(report.summary.passed, 6);
  assert.deepEqual(counts, { chats: 3, downloads: 3 });
  assert.ok(report.steps.at(-1).checks.some((check) => check.code === "XLSX_PERIOD_AND_GROUP" && check.passed));
  for (const secret of [session, "secret-export", "Private Shop", "PRIVATE_OWNER", String(controls.january.amount)]) assert.ok(!JSON.stringify(report).includes(secret));
});

test("runner detects a full Excel total mismatch and stops dependent steps", async () => {
  const { report, counts } = await execute({ wrongAmount: true });
  assert.equal(report.steps[3].error, "XLSX_CONTROL_TOTALS");
  assert.equal(report.summary.skipped, 2);
  assert.equal(counts.chats, 1);
});

test("full runner preserves the sports/category and vehicle sequence without stale exports", async () => {
  const { report, counts } = await execute({ suite: "all" });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.summary.passed, 24);
  assert.deepEqual(counts, { chats: 21, downloads: 5 });
});

test("comparison suite validates both years, an empty range and the common August month", async () => {
  const { report, counts } = await execute({ suite: "comparisons" });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.summary.passed, 4);
  assert.deepEqual(counts, { chats: 3, downloads: 0 });
  assert.ok(report.steps[2].checks.some((check) => check.code === "COMPARISON_NO_PAIRED_VALUES" && check.passed));
  assert.ok(report.steps[3].checks.some((check) => check.code === "COMPARISON_NOTE_DIFFERENCES" && check.passed));
  assert.doesNotMatch(JSON.stringify(report), /58\.706\.137\.966|4\.899\.996/);
});

test("comparison suite rejects zero for missing rows, incorrect values and unsupported comparisons", async () => {
  for (const [flag, code] of [
    ["comparisonMissingAsZero", "COMPARISON_MISSING_IS_NOT_ZERO"], ["wrongComparisonValue", "COMPARISON_CONTROL_VALUES"],
    ["inventedComparison", "COMPARISON_COMPARABLE_NOTES"], ["wrongComparisonDirection", "COMPARISON_NOTE_DIRECTIONS"],
    ["wrongComparisonDifference", "COMPARISON_NOTE_DIFFERENCES"], ["falseZeroClaim", "COMPARISON_NO_FALSE_ZERO_CLAIM"],
  ]) {
    const { report } = await execute({ suite: "comparisons", [flag]: true });
    assert.equal(report.steps[1].error, code);
    assert.equal(report.summary.skipped, 2);
  }
});

test("comparison suite detects a follow-up that keeps the full-year dates", async () => {
  const { report } = await execute({ suite: "comparisons", staleComparisonPeriod: true });
  assert.equal(report.steps[2].error, "COMPARISON_PERIODS");
  assert.equal(report.summary.skipped, 1);
});

test("chart suite validates real SVG bars, lines and a new period without storing images", async () => {
  const { report, counts } = await execute({ suite: "charts" });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.summary.passed, 5);
  assert.deepEqual(counts, { chats: 4, downloads: 0 });
  for (const code of ["CHART_EXACT_MONTHLY_AMOUNTS", "CHART_MONTH_LABELS", "CHART_VALUE_ANCHORS_IN_VIEWBOX"]) {
    assert.ok(report.steps.at(-1).checks.some((check) => check.code === code && check.passed));
  }
  assert.doesNotMatch(JSON.stringify(report), /data:image|<svg|58\.706\.137\.966/);
});

test("chart suite detects incorrect units, hidden values, wrong amounts and active SVG content", async () => {
  for (const [flag, code] of [
    ["wrongChartUnit", "CHART_PYG_UNIT"], ["missingChartValues", "CHART_VISIBLE_VALUE_COUNT"],
    ["wrongChartAmount", "CHART_EXACT_MONTHLY_AMOUNTS"], ["activeSvg", "CHART_NO_ACTIVE_OR_EXTERNAL_CONTENT"],
    ["invalidChartData", "CHART_DATA_URL"],
  ]) {
    const { report } = await execute({ suite: "charts", [flag]: true });
    assert.equal(report.steps[2].error, code);
    assert.equal(report.summary.skipped, 2);
  }
});

test("chart suite detects when a changed period retains points from the old chart", async () => {
  const { report } = await execute({ suite: "charts", staleChartPeriod: true });
  assert.equal(report.steps[4].error, "CHART_POINTS_AND_SERIES");
});

test("runner rejects reused export IDs and invalid download MIME types", async () => {
  const repeated = await execute({ sameExport: true });
  assert.equal(repeated.report.steps[4].error, "NEW_EXPORT_ID");
  const mime = await execute({ badMime: true });
  assert.equal(mime.report.steps[3].error, "XLSX_MIME_TYPE");
});

test("runner bounds hung requests, redacts errors and refuses non-development responses", async () => {
  const timeout = await execute({ timeout: true });
  assert.equal(timeout.report.steps[3].error, "REQUEST_TIMEOUT");
  const production = await execute({ env: "production" });
  assert.equal(production.report.steps[0].error, "DEVELOPMENT_ENVIRONMENT");
  assert.equal(production.counts.chats, 0);
});

test("runner configuration requires a session and rejects credentials in URLs", () => {
  assert.throws(() => readConfig({}), /SESSION_ID_REQUIRED/);
  assert.throws(() => readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_BASE_URL: "http://user:password@localhost:5400" }), /INVALID_BASE_URL/);
  assert.throws(() => readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_TIMEOUT_MS: "0" }), /INVALID_TIMEOUT/);
  assert.throws(() => readConfig({ BOT_TEST_SESSION_ID: session, BOT_TEST_SUITE: "unknown" }), /INVALID_SUITE/);
});

test("soles suite checks balances, expirations, signed fractional usage, multiple pages and return to balance", async () => {
  const { report, counts } = await execute({ suite: "soles", validateSolesPii: true });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.summary.passed, 6);
  assert.deepEqual(counts, { chats: 7, downloads: 0 });
  assert.equal(report.coverage.solesUsageMultiplePages, true);
  for (const secret of [session, memberDocument, "PERSONA PRIVADA", "PRIVATE_TYPE", "PRIVATE_DESTINATION", "PRIVATE_MOVEMENT"]) assert.ok(!JSON.stringify(report).includes(secret));
});

test("all optionally includes soles only when the local document is configured", async () => {
  const regular = readConfig({ BOT_TEST_SESSION_ID: session });
  assert.equal(regular.soles, null);
  const { report, counts } = await execute({ suite: "all", memberDocument });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.optionalSuites.soles, "configured");
  assert.equal(report.summary.passed, 29);
  assert.deepEqual(counts, { chats: 28, downloads: 5 });
});

test("single-page soles fixtures disclose that multiple pages were not exercised", async () => {
  const { report, counts } = await execute({ suite: "soles", singleSolesPage: true });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.coverage.solesUsageMultiplePages, false);
  assert.deepEqual(counts, { chats: 6, downloads: 0 });
});

test("soles suite catches identity, unit, expiration and usage inconsistencies", async () => {
  for (const [flag, step, code] of [
    ["solesAsCurrency", 1, "SOLES_ARE_LOYALTY_UNITS"],
    ["wrongSolesExpiration", 2, "SOLES_EXPIRATION_MATCHES_TYPE_BALANCES"],
    ["changedSolesMember", 2, "SOLES_MEMBER_AND_REFERENCE_PRESERVED"],
    ["wrongSolesUsageMember", 3, "SOLES_USAGE_MEMBER_PRESERVED"],
    ["emptySolesUsage", 3, "SOLES_USAGE_FIXTURE_REQUIRED"],
    ["truncatedSolesUsage", 3, "SOLES_USAGE_SUMMARY_COMPLETE"],
    ["invalidSolesQuantity", 4, "SOLES_USAGE_DETAIL_NUMERIC"],
    ["emptySolesDetailType", 4, "SOLES_USAGE_DETAIL_TYPE_PRESENT"],
    ["wrongSolesDetailDate", 4, "SOLES_DETAIL_DATE_WITHIN_PERIOD"],
    ["repeatedSolesPage", 4, "SOLES_USAGE_PAGINATION"],
    ["wrongSolesUsageTotal", 4, "SOLES_USAGE_DETAIL_MATCHES_SUMMARY_BY_TYPE"],
    ["wrongSolesReturn", 5, "SOLES_BALANCE_PRESERVED_AFTER_USAGE"],
  ]) {
    const { report } = await execute({ suite: "soles", [flag]: true });
    assert.equal(report.steps[step].error, code, flag);
    assert.equal(report.summary.failed, 1);
    assert.equal(report.summary.skipped, 5 - step);
    assert.ok(!JSON.stringify(report).includes(memberDocument));
  }
});

test("soles traversal is bounded and configuration validates the private fixture and dates", async () => {
  const { report, counts } = await execute({ suite: "soles", solesMaxPages: 1 });
  assert.equal(report.steps[4].error, "SOLES_PAGE_LIMIT_CHOOSE_SMALLER_PERIOD");
  assert.equal(counts.chats, 3);
  const env = { BOT_TEST_SESSION_ID: session, BOT_TEST_SUITE: "soles" };
  assert.throws(() => readConfig(env), /SOLES_MEMBER_DOCUMENT_REQUIRED/);
  assert.throws(() => readConfig({ ...env, BOT_TEST_MEMBER_DOCUMENT: "<invalid>" }), /INVALID_SOLES_MEMBER_DOCUMENT/);
  for (const period of [{ BOT_TEST_SOLES_FROM: "31/02/2023" }, { BOT_TEST_SOLES_TO: "31/12/2022" }]) {
    assert.throws(() => readConfig({ ...env, BOT_TEST_MEMBER_DOCUMENT: memberDocument, ...period }), /INVALID_SOLES_USAGE_PERIOD/);
  }
  assert.throws(() => readConfig({ ...env, BOT_TEST_MEMBER_DOCUMENT: memberDocument, BOT_TEST_SOLES_PAGE_SIZE: "201" }), /INVALID_SOLES_PAGINATION/);
  assert.throws(() => readConfig({ ...env, BOT_TEST_MEMBER_DOCUMENT: memberDocument, BOT_TEST_SOLES_REFERENCE_DATE: "31/06/2023" }), /INVALID_SOLES_REFERENCE_DATE/);
});

test("soles date profile defaults to the DEV snapshot and supports another explicit reference", async () => {
  const current = await execute({ suite: "soles", validateSolesPii: true });
  assert.equal(current.report.success, true);
  assert.equal(current.report.profile.solesReferenceDate, "30/06/2023");
  const changed = await execute({ suite: "soles", solesReferenceDate: "31/05/2023", validateSolesPii: true });
  assert.equal(changed.report.success, true);
  assert.equal(changed.report.profile.solesReferenceDate, "31/05/2023");
});

test("soles suite rejects a response that ignores the requested reference and uses the real current year", async () => {
  const { report } = await execute({ suite: "soles", ignoredSolesReference: true });
  assert.equal(report.steps[1].error, "SOLES_REQUESTED_REFERENCE_DATE");
  assert.equal(report.summary.skipped, 4);
});

 test("soles detail preserves missing quantities and zero while reconciling COUNT and SUM semantics", async () => {
  const { report } = await execute({ suite: "soles", missingSolesQuantities: true });
  assert.equal(report.success, true, JSON.stringify(report));
  assert.equal(report.coverage.solesUsageMissingQuantities, true);
  assert.equal(report.summary.passed, 6);
});


test("purchase suite reconciles monthly and total canjes, distinct members and a changed period", async () => {
  for (const purchaseCurrency of ["PYG", "₲"]) {
    const { report, counts } = await execute({ suite: "purchases", purchaseCurrency, validateSolesPii: true });
    assert.equal(report.success, true, JSON.stringify(report));
    assert.equal(report.summary.passed, 4);
    assert.deepEqual(counts, { chats: 3, downloads: 0 });
    for (const secret of [session, "1000000", "15000000", "PRIVATE_"]) assert.ok(!JSON.stringify(report).includes(secret));
  }
});

test("purchase suite detects wrong periods, totals, currency, percentages and nonadditive members", async () => {
  for (const [flag, step, code] of [
    ["wrongPurchasePeriod", 1, "PURCHASES_PERIOD"],
    ["wrongPurchaseSales", 1, "PURCHASES_SALES_CONTROL_TOTALS"],
    ["wrongPurchasePercentage", 1, "PURCHASES_PERCENTAGE_ARITHMETIC"],
    ["wrongPurchaseCurrency", 1, "PURCHASES_PYG_CURRENCY"],
    ["wrongPurchaseMonth", 1, "PURCHASES_MONTHS_AND_ORDER"],
    ["truncatedPurchases", 1, "PURCHASES_ALL_GROUPS"],
    ["emptyPurchases", 1, "PURCHASES_REGISTERED_CANJES_FIXTURE_REQUIRED"],
    ["wrongPurchaseTotal", 2, "PURCHASES_TOTAL_MATCHES_MONTHS"],
    ["wrongPurchaseMembers", 2, "PURCHASES_DISTINCT_MEMBERS_BOUNDS"],
    ["wrongPurchaseJanuary", 3, "PURCHASES_CHANGED_PERIOD_MATCHES_JANUARY"],
  ]) {
    const { report } = await execute({ suite: "purchases", [flag]: true });
    assert.equal(report.steps[step].error, code, flag);
    assert.equal(report.summary.skipped, 3 - step);
  }
});

test("campaign suite selects from partial search and checks actual presentation of the three periods", async () => {
  for (const multiple of [false, true]) {
    const { report, counts } = await execute({ suite: "campaigns", campaignMultiPage: multiple });
    assert.equal(report.success, true, JSON.stringify(report));
    assert.equal(report.summary.passed, 3);
    assert.equal(report.coverage.campaignSearchMultiplePages, multiple);
    assert.deepEqual(counts, { chats: multiple ? 3 : 2, downloads: 0 });
    assert.ok(!JSON.stringify(report).includes("PRIVATE_PROMOTION"));
    assert.ok(!JSON.stringify(report).includes(String(campaignControl.periods[0].amount)));
  }
});

test("campaign suite catches silent selection, missing fixtures, dates, totals, averages and causality", async () => {
  for (const [flag, step, code] of [
    ["silentCampaignSelection", 1, "CAMPAIGNS_AMBIGUITY_REQUIRES_SELECTION"],
    ["missingCampaign", 1, "CAMPAIGNS_HISTORICAL_FIXTURE_REQUIRED"],
    ["wrongCampaignDates", 1, "CAMPAIGNS_SELECTED_DATES"],
    ["wrongCampaignTotals", 2, "CAMPAIGNS_CONTROL_TOTALS_AND_CURRENCY"],
    ["wrongCampaignAverage", 2, "CAMPAIGNS_DAILY_AVERAGE"],
    ["wrongCampaignVariation", 2, "CAMPAIGNS_VARIATIONS_ARITHMETIC"],
    ["causalCampaign", 2, "CAMPAIGNS_NO_CAUSAL_ATTRIBUTION"],
  ]) {
    const { report } = await execute({ suite: "campaigns", [flag]: true });
    assert.equal(report.steps[step].error, code, flag);
    assert.equal(report.summary.skipped, 2 - step);
  }
});


test("vehicle regression accepts real presentation labels and rejects raw arguments and incorrect counts", async () => {
  const valid = await execute({ suite: "all", vehicleGenderCodes: true });
  assert.equal(valid.report.success, true, JSON.stringify(valid.report));
  for (const [flag, code] of [["wrongVehicleGenderCount", "VEHICLE_GENDER_COUNTS"], ["vehicleArgsAsText", "VEHICLE_GENDER_COLUMNS"]]) {
    const { report } = await execute({ suite: "all", [flag]: true });
    assert.equal(report.steps[11].error, code);
    assert.equal(report.summary.skipped, 12);
  }
});
