import { generateChart } from "../../src/services/charts/chart.service.js";
import { getVehicleRegistrations } from "../../src/services/vehicles/vehicleRegistrations.service.js";
import { getSolesUsage } from "../../src/services/soles/solesUsage.service.js";
import { getMemberSoles } from "../../src/services/soles/memberSoles.service.js";
import { searchSolesTypes } from "../../src/services/soles/searchSolesTypes.service.js";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import * as conversationStore from "../../src/state/conversation.store.js";
import { getPiiSession } from "../../src/state/pii.store.js";
import * as requestContext from "../../src/services/requestContext.service.js";
import { resolvePromotion } from "../../src/services/promotions/promotion.resolver.js";
import { getCampaignSalesPerformance } from "../../src/services/sales/campaignSalesPerformance.service.js";
import { compareMemberPurchasesVsSales } from "../../src/services/members/memberPurchasesVsSales.service.js";
import { analyzeMembers } from "../../src/services/members/memberAnalysis.service.js";

const context = vm.createContext({ console, structuredClone, Intl, Date, Map, Set,
  Number, String, Array, JSON, Math, RegExp, Object, Boolean, Error, AbortController, process });
const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
}, { context });
const load = async (path, stubs) => {
  const main = new vm.SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
  await main.link(async (spec) => {
    if (["./salesHistory.service.js", "./salesSamplePresentation.service.js"].includes(spec)) {
      return new vm.SourceTextModule(await readFile(new URL("../../src/services/ai/" + spec.slice(2), import.meta.url), "utf8"), { context });
    }
    if (["./salesExportFollowup.service.js", "./salesYearComparison.service.js", "./toolErrors.service.js", "./salesSeriesPresentation.service.js", "./vehiclePresentation.service.js", "./solesUsagePresentation.service.js", "./memberSolesPresentation.service.js", "./promotionSearchPresentation.service.js", "./campaignSalesPerformancePresentation.service.js", "./memberPurchasesVsSalesPresentation.service.js", "./conversationClarification.service.js", "./memberAnalysisFollowup.service.js", "./memberRankingPresentation.service.js", "./memberSummaryPresentation.service.js"].includes(spec)) {
      return new vm.SourceTextModule(await readFile(new URL("../../src/services/ai/" + spec.slice(2), import.meta.url), "utf8"), { context });
    }
    assert.ok(stubs[spec], `Missing stub: ${spec}`);
    return synthetic(stubs[spec]);
  });
  await main.evaluate();
  return main.namespace;
};

let modelCalls = 0;
let toolCalls = 0;
let writes = 0;
let pendingModel;
let modelSignal;
let mode = "cancel-model";
let comparisonStep = 0;
let aggregateQueries = 0;
let storedHistory = [];
const plannedCalls = [];
let cancelBetweenPeriods;
let uuidCounter = 0;
const same = (_id, value) => value;
const chat = await load("../../src/services/ai/chat.service.js", {
  "../../prompts/sections/charts.prompt.js": { chartsPrompt: "Instrucciones de gráficos" },
  "../charts/chartSource.service.js": await import("../../src/services/charts/chartSource.service.js"),
  "../../../config.js": { default: {} },
  "node:crypto": { randomUUID: () => `test-id-${++uuidCounter}` },
  "../requestContext.service.js": requestContext,
  "@aws-sdk/client-bedrock-runtime": {
    BedrockRuntimeClient: class { async send(_command, options) {
      modelCalls++;
      if (mode.startsWith("sales-history-")) {
        const step = comparisonStep++;
        assert.ok(step < 2, "A historical sales reuse can retry only once");
        if (step === 0 || mode === "sales-history-stubborn") return { stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: "| Local | Ventas |\n| --- | --- |\n| Vieja muestra | ₲ 999999 |" }] } } };
        assert.ok(_command.input.system.some((item) => item.text.includes("muestra histórica de ventas")));
        assert.ok(!_command.input.messages.some((item) => JSON.stringify(item).includes("999999")), "Rejected output cannot become evidence for the retry");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "get_sales", toolUseId: "refreshed-equivalent", input: { dateFrom: "01/01/2023", dateTo: "31/01/2023", groupBy: ["customer"], metrics: ["totalAmount", "totalInvoices"] },
        } }] } } };
      }
      if (mode.startsWith("sales-export-")) {
        assert.ok(!mode.endsWith("denied"), "Permission denial must bypass the model");
        assert.equal(comparisonStep++, 0);
        const latest = _command.input.messages.at(-1).content[0].toolResult;
        assert.equal(latest.status, "success");
        assert.ok(latest.content[0].json.resultSet.fullResultAvailableInExport);
        return { stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: `Se muestran 12 de ${latest.content[0].json.resultSet.totalRecords} locales. El detalle completo está disponible para exportación.` }] } } };
      }
      if (mode === "direct-followup" || mode === "partial-followup" || mode === "cancel-between") {
        assert.fail("A summary follow-up must not invoke Bedrock");
      }
      if (mode === "sales-year-comparison") assert.fail("Explicit year comparisons and follow-ups are calculated directly by the backend");
      if (mode.startsWith("permission-")) {
        assert.notEqual(mode, "permission-followup", "A denied direct follow-up must not call Bedrock");
        assert.equal(comparisonStep++, 0, "Permission denials must not be rewritten by the model");
        const content = [{ toolUse: { name: "get_member_vehicles", toolUseId: "denied-vehicle", input: { plate: "SYN123" } } }];
        if (mode === "permission-batch") content.push({ toolUse: { name: "get_sales", toolUseId: "must-stop", input: {} } });
        if (mode === "permission-chart") content.push({ toolUse: { name: "generate_chart", toolUseId: "must-stop", input: {} } });
        return { stopReason: "tool_use", output: { message: { role: "assistant", content } } };
      }
      if (mode === "sales-series") {
        assert.equal(comparisonStep++, 0, "Temporal sales must render before a model can invent a sustained trend");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "get_sales", toolUseId: "sales-series", input: { dateFrom: "01/01/2023", dateTo: "31/05/2023", groupBy: ["month"], metrics: ["totalAmount", "totalInvoices"] },
        } }] } } };
      }
      if (mode === "chart-vehicles" || mode === "chart-followup") {
        const step = comparisonStep++;
        assert.ok(step < (mode === "chart-vehicles" ? 2 : 1), "A generated chart must not be rewritten by Bedrock");
        const first = mode === "chart-vehicles" && step === 0;
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: first ? "get_vehicle_registrations" : "generate_chart", toolUseId: first ? "vehicles-chart-data" : "chart-result",
          input: first ? { dateFrom: "01/01/2025", dateTo: "31/12/2025", groupBy: ["month"] } : {
            type: mode === "chart-vehicles" ? "line" : "bar", labelPaths: ["month"], datasets: [{ label: "Registros", valuePath: "vehicleCount" }],
          },
        } }] } } };
      }
      if (mode === "vehicle-detail") {
        assert.equal(comparisonStep++, 0, "Vehicle table and pagination must not invoke Bedrock again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "get_vehicle_registrations", toolUseId: "vehicle", input: { relativePeriod: "today", mode: "detail", rows: 1, groupBy: ["gender"], ageMin: 18 },
        } }] } } };
      }
      if (mode === "usage-destinations" || mode === "usage-movements") {
        assert.equal(comparisonStep++, 0, "Lookup rendering must not call Bedrock again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: mode === "usage-destinations" ? "search_soles_usage_destinations" : "search_soles_usage_movement_types",
          toolUseId: "usage-lookup", input: mode === "usage-destinations" ? { search: "Local sintético" } : {},
        } }] } } };
      }
      if (mode === "usage" || mode === "usage-detail") {
        assert.equal(comparisonStep++, 0, "Usage presentation and paging must not call Bedrock again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "get_soles_usage", toolUseId: "usage", input: {
            documentNumber: "1234567", dateFrom: "01/01/2023", dateTo: "31/05/2023",
            mode: mode === "usage" ? "summary" : "detail", pageSize: 1, page: 1,
          },
        } }] } } };
      }
      if (mode === "soles") {
        const step = comparisonStep++;
        assert.ok(step < 3, "Soles table must not call the model again");
        const name = ["search_members", "search_soles_types", "get_member_soles"][step];
        const input = [{ search: "Persona sintética" }, { query: "Soles normales" },
          { documentNumber: "1234567", typeIds: [10], referenceDate: "31/05/2023" }][step];
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: { name, input, toolUseId: `soles-${step}` } }] } } };
      }
      if (mode === "soles-detail") {
        assert.equal(comparisonStep++, 0, "Soles detail paging must not call the model again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "get_member_soles", toolUseId: "soles-detail", input: {
            documentNumber: "1234567", typeIds: [10], referenceDate: "31/05/2023", mode: "detail", status: "all", page: 1, rows: 1,
          },
        } }] } } };
      }
      if (mode === "promotion-pages") {
        assert.equal(comparisonStep++, 0, "Promotion pages must not invoke Bedrock again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "search_promotions", toolUseId: "promotion-search", input: { search: "Navidad", page: 1, rows: 5 },
        } }] } } };
      }
      if (mode === "campaign") {
        const step = comparisonStep++;
        assert.ok(step < 2, "Campaign presentation must not call Bedrock again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: step === 0 ? "search_promotions" : "analyze_campaign_sales_performance",
          toolUseId: `campaign-${step}`,
          input: step === 0 ? { search: "Promoción sintética" } : {
            promotionId: "P1", campaignId: "C1", campaignDateFrom: "01/05/2023", campaignDateTo: "10/05/2023",
          },
        } }] } } };
      }
      if (mode === "vs-sales") {
        assert.equal(comparisonStep++, 0, "Comparison presentation must not call Bedrock again");
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "compare_member_purchases_vs_sales", toolUseId: "vs-sales", input: {
            dateFrom: "01/01/2023", dateTo: "31/01/2023", breakdownBy: ["customer"],
          },
        } }] } } };
      }
      if (mode === "compare") {
        comparisonStep++;
        if (comparisonStep === 3) return { stopReason: "end_turn", output: { message: {
          role: "assistant", content: [{ text: "Incorrect invented amount: 999999" }],
        } } };
        const month = comparisonStep === 1 ? "01" : "02";
        return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
          name: "analyze_members", toolUseId: `period-${month}`, input: {
            resultMode: "summary", metrics: ["totalAmount", "purchaseCount"], breakdownBy: ["category"],
            purchasePeriods: [{ dateFrom: `01/${month}/2023`, dateTo: `${month === "01" ? 31 : 28}/${month}/2023` }],
          },
        } }] } } };
      }
      if (mode === "cancel-model") {
        modelSignal = options.abortSignal;
        return new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener("abort", () => reject(new Error("Aborted model")), { once: true });
          pendingModel();
        });
      }
      return { stopReason: "tool_use", output: { message: { role: "assistant", content: [{ toolUse: {
        name: "analyze_members", toolUseId: "test-tool", input: { resultMode: "summary" },
      } }] } } };
    } },
    ConverseCommand: class { constructor(input) {
      this.input = input;
      assert.ok(!JSON.stringify(input).includes("data:image/svg+xml"), "Chart images must not reach Bedrock or history");
    } },
  },
  "../../tools/index.js": { tools: [] },
  "./toolExecutor.service.js": { executeTool: async (call) => {
    toolCalls++;
    if (mode.startsWith("sales-history-")) {
      assert.equal(call.name, "get_sales");
      assert.equal(call.arguments.dateTo, "31/01/2023");
      if (mode === "sales-history-denied") throw Object.assign(new Error("Access denied"), { code: "ACCESS_DENIED" });
      return { data: Array.from({ length: 180 }, (_, i) => ({ customerName: `Local ${i}`, totalAmount: i * 1000, totalInvoices: i, currency: { symbol: "₲", abbreviation: "PYG" } })),
        export: { available: true, exportId: "current-equivalent-export", totalRecords: 180, expiresAt: new Date(Date.now() + 600000).toISOString() } };
    }
    if (mode.startsWith("sales-export-")) {
      assert.equal(call.name, "get_sales");
      const removing = mode.includes("removal");
      assert.equal(call.arguments.dateTo, removing ? "31/01/2023" : "31/05/2023");
      assert.equal(call.arguments.dayType, "weekend");
      assert.equal(JSON.stringify(call.arguments.customerIds), '["[PII_CUSTOMER_ID_1]"]');
      if (removing) {
        assert.ok(!Object.hasOwn(call.arguments, "categoryIds"));
        assert.equal(JSON.stringify(call.arguments.groupBy), '["customer"]');
      }
      if (mode.endsWith("denied")) throw Object.assign(new Error("Access denied"), { code: "ACCESS_DENIED" });
      const totalRecords = removing ? 180 : 187;
      return { data: Array.from({ length: totalRecords }, (_, i) => ({ customerName: `Local ${i}`, totalAmount: i, totalInvoices: 1 })),
        export: { available: true, exportId: `fresh-${toolCalls}`, totalRecords, expiresAt: new Date(Date.now() + 600000).toISOString() } };
    }
    if (mode === "sales-year-comparison") {
      assert.equal(call.name, "get_sales");
      const year = call.arguments.dateFrom.slice(-4), to = call.arguments.dateTo;
      return { data: year === "2023" ? [{ month: to.startsWith("31/05") ? "01" : "08", totalAmount: 100004, totalInvoices: 228, currency: { abbreviation: "PYG", symbol: "₲" } }]
        : to.startsWith("31/05") ? [] : [{ month: "08", totalAmount: 5000000, totalInvoices: 1, currency: { abbreviation: "PYG", symbol: "₲" } }] };
    }

    if (mode.startsWith("permission-")) {
      assert.equal(call.name, mode === "permission-followup" ? "get_member_soles" : "get_member_vehicles", "No alternative tool may execute after denial");
      throw Object.assign(new Error("El usuario no tiene permisos para consultar esta información."), { code: "ACCESS_DENIED" });
    }

    if (mode === "sales-series") return { data: [
      { month: "01", totalAmount: 58706137966, totalInvoices: 366427, currency: { abbreviation: "PYG", symbol: "₲" } },
      { month: "02", totalAmount: 63255876492, totalInvoices: 358354, currency: { abbreviation: "PYG", symbol: "₲" } },
      { month: "05", totalAmount: 86767167311, totalInvoices: 432821, currency: { abbreviation: "PYG", symbol: "₲" } },
    ] };

    if (call.name === "generate_chart") return generateChart(call.arguments, { sources: call.context.chartSources, restoreText: call.context.restoreChartText });
    if (mode === "chart-vehicles") return getVehicleRegistrations(call.arguments, { execute: async () => ({ rows: [
      { MONTH: "2025-01", VEHICLE_COUNT: 2, PLATE_COUNT: 2, MEMBER_COUNT: 2, TOTAL_VEHICLE_COUNT: 5, TOTAL_PLATE_COUNT: 5, TOTAL_MEMBER_COUNT: 3 },
      { MONTH: "2025-02", VEHICLE_COUNT: 3, PLATE_COUNT: 3, MEMBER_COUNT: 1, TOTAL_VEHICLE_COUNT: 5, TOTAL_PLATE_COUNT: 5, TOTAL_MEMBER_COUNT: 3 },
    ] }) });

    if (mode === "usage" || mode === "usage-detail") {
      assert.equal(call.name, "get_soles_usage");
      return getSolesUsage(call.arguments, { execute: async (_sql, binds) => {
        assert.equal(binds.documentNumber, "1234567");
        assert.equal(binds.dateFrom, "01/01/2023");
        if (mode === "usage-detail") return { rows: [{ RN: call.arguments.page, TOTAL_ROWS: 2,
          COD_SOCIO: "1234567", NOM_SOCIO: "Persona sintética", SOLES_UTILIZADOS: 5,
          FECHA_MOVIMIENTO: "01/02/2023", TIPO_MOVIMIENTO: "MOVIMIENTO REAL", DESTINO: "Destino sintético",
          COD_DESTINO: "42", TIPO_DESTINO: "SOCIO", ID_TIPO_SOL: 10, DES_TIPO_SOL: "Soles de prueba",
        }] };
        return { rows: [{ SOLES_TYPE_ID: 10, SOLES_TYPE_DESCRIPTION: "Soles de prueba", TOTAL_SOLES_USED: 10, MOVEMENT_COUNT: 2, TOTAL_GROUPS: 1 }] };
      } });
    }
    if (mode === "soles" || mode === "soles-detail") {
      if (call.name === "search_members") return { status: "RESOLVED", member: { documentNumber: "1234567", fullName: "Persona sintética" } };
      if (call.name === "search_soles_types") return { status: "RESOLVED", typeId: 10, description: "Soles de prueba" };
      assert.equal(call.name, "get_member_soles");
      return getMemberSoles(call.arguments, { execute: async (sql, binds) => {
        assert.equal(binds.documentNumber, "1234567");
        assert.equal(binds.referenceDate, call.arguments.status === "all" ? undefined : "31/05/2023");
        if (mode === "soles-detail") return { rows: [{ TOTAL_ROWS: 2, COD_SOCIO: "1234567", NOM_SOCIO: "Persona sintética",
          COD_TIPO_SOL: 10, DES_TIPO_SOL: "Soles de prueba", TOTAL: 25, SALDO: binds.offset === 0 ? 20 : 5,
          NRO_TRANSACCION: binds.offset + 1, FECHA_ALTA: "01/01/2023", VENCIMIENTO: "31/12/2023",
        }] };
        return { rows: sql.includes("GROUP BY") ? [{ TYPE_ID: 10, TYPE_DESCRIPTION: "Soles de prueba", EXPIRATION_DATE: "31/12/2023", GENERATED_AMOUNT: 50, BALANCE: 25, RECORD_COUNT: 1 }]
          : [{ BALANCE: 25, RECORD_COUNT: 1 }] };
      } });
    }
    if (mode === "promotion-pages") {
      assert.equal(call.name, "search_promotions");
      const page = call.arguments.page;
      assert.equal(call.arguments.search, "Navidad");
      assert.equal(call.arguments.rows, 5);
      return resolvePromotion(call.arguments.search, { execute: async (_sql, binds) => {
        assert.equal(binds.startRow, page === 1 ? 1 : 6);
        return { rows: Array.from({ length: page === 1 ? 5 : 1 }, (_, index) => ({
          COD_PROMOCION: "P1", COD_CAMPANIA: (page - 1) * 5 + index + 1,
          NOMBRE_PROMOCION: "Navidad", NOMBRE_CAMPANIA: `Navidad sintética ${(page - 1) * 5 + index + 1}`,
          FECHA_DESDE: "01/12/2022", FECHA_HASTA: "31/12/2022", TOTAL_ROWS: 6,
        })) };
      } }, { page, rows: call.arguments.rows });
    }
    if (mode === "vehicle-detail") return getVehicleRegistrations(call.arguments, { execute: async (_sql, binds) => ({ rows: [{ RN: binds.startRow, VEHICLE_COUNT: 2, PLATE_COUNT: 2, MEMBER_COUNT: 2,
      MATRICULA: `SYNTH${binds.startRow}`, NOM_SOCIO: "Persona sintética", ACTIVO: "S", REGISTRATION_DATE: binds.dateFrom,
    }] }) });
    if (mode === "usage-destinations") return { status: "RESOLVED", destinationType: "LOCAL", destinationCode: "INTERNAL-SECRET", name: "Local sintético" };
    if (mode === "usage-movements") return { status: "LISTED", totalMatches: 2, returnedMatches: 2, hasMore: false, options: [{ movementType: "A" }, { movementType: "B" }] };
    if (mode === "campaign") {
      if (call.name === "search_promotions") return { status: "RESOLVED", promotion: {
        promotionId: "P1", campaignId: "C1", dateFrom: "01/05/2023", dateTo: "10/05/2023",
      } };
      assert.equal(call.name, "analyze_campaign_sales_performance");
      return getCampaignSalesPerformance(call.arguments, { execute: async (sql) => ({ rows: sql.includes("VW_BOT_PROMOCIONES") ? [{
        COD_PROMOCION: "P1", COD_CAMPANIA: "C1", NOMBRE_PROMOCION: "Promoción sintética", NOMBRE_CAMPANIA: "Campaña sintética",
        FECHA_DESDE: "01/05/2023", FECHA_HASTA: "10/05/2023",
      }] : [{ TOTAL_AMOUNT: 2000, TOTAL_INVOICES: 20, CURRENCY_DESCRIPTION: "GUARANIES", CURRENCY_ABBREVIATION: "PYG" }] }) });
    }
    if (mode === "vs-sales") return compareMemberPurchasesVsSales(call.arguments, {
      execute: async (sql) => ({ rows: [{ DIMENSION_1_ID: "1", DIMENSION_1_NAME: "Local sintético",
        CURRENCY_SYMBOL: "₲", CURRENCY_DESCRIPTION: "GUARANIES",
        ...(sql.includes("VW_BOT_VENTAS_LOCALES") ? { SALES_AMOUNT: 1000 } : { EXCHANGE_AMOUNT: 250, INVOICE_COUNT: 2, MEMBER_COUNT: 1 }),
      }] }),
    });
    if (["compare", "direct-followup", "partial-followup", "cancel-between"].includes(mode)) {
      plannedCalls.push(structuredClone(call));
      assert.equal(call.name, "analyze_members");
      assert.equal(call.context.sessionId, "test");
      const result = await analyzeMembers(call.arguments, { execute: async (sql, binds) => {
        aggregateQueries++;
        assert.match(sql, /GROUP BY GROUPING SETS/);
        if (mode === "partial-followup" && binds.dateFrom === "01/02/2023") throw new Error("Simulated query failure");
        const amount = binds.dateFrom === "01/01/2023" ? 3000 : 4000;
        return { rows: [
          { ROW_KIND: "universe", MEMBER_COUNT: 1, PURCHASE_COUNT: 2 },
          { ROW_KIND: "total", MEMBER_COUNT: 1, PURCHASE_COUNT: 2, TOTAL_AMOUNT: amount, CURRENCY_SYMBOL: "PYG", CURRENCY_DESCRIPTION: "GUARANIES" },
          { ROW_KIND: "detail", CATEGORY_ID: "1", CATEGORY_NAME: "Rubro de prueba", CUSTOMER_ID: "1", CUSTOMER_NAME: "Local de prueba", MEMBER_COUNT: 1, PURCHASE_COUNT: 2, TOTAL_AMOUNT: amount, CURRENCY_SYMBOL: "PYG", CURRENCY_DESCRIPTION: "GUARANIES" },
        ] };
      } }, "TEST");
      if (mode === "cancel-between") cancelBetweenPeriods.abort();
      return result;
    }
    assert.fail("A cancelled model must not invoke tools");
  } },
  "../../state/conversation.store.js": { getConversation: () => storedHistory, setConversation: (_id, history) => { writes++; storedHistory = history; } },
  "./conversation.service.js": { compactMemberPurchasePaginationHistory: (x) => x, trimConversation: (x) => x },
  "../../prompts/system.prompt.js": { getSystemPrompt: () => "" },
  "../../utils/debug.logger.js": Object.fromEntries(["logBedrockRequest", "logBedrockResponse", "logToolCall", "logToolResult"].map((key) => [key, () => {}])),
  "./pii.service.js": { protectPiiDeep: same, protectPiiText: same, restorePiiDeep: same, restorePiiTextForUser: same },
});
const cancellation = new AbortController();
const modelStarted = new Promise((resolve) => { pendingModel = resolve; });
const pending = requestContext.runWithRequestSignal(cancellation.signal,
  () => chat.chatService({ message: "Comparar", sessionId: "test" }));
await modelStarted;
cancellation.abort();
await assert.rejects(pending);
assert.equal(modelSignal, cancellation.signal);
assert.equal(toolCalls, 0);
assert.equal(modelCalls, 1);
assert.equal(writes, 0);

// A new conversation asks for subject and period without model or tool calls.
mode = "direct-followup";
const beforeClarification = modelCalls;
const clarification = await chat.chatService({ message: "Ahora por local", sessionId: "test" });
assert.equal(modelCalls, beforeClarification);
assert.equal(toolCalls, 0);
assert.equal(clarification.toolIterations, 0);
assert.equal(clarification.usage, null);
assert.match(clarification.answer, /ventas, compras de socios/);
assert.match(clarification.answer, /período/);
assert.equal(storedHistory.length, 2);
assert.equal(storedHistory.at(-1).content[0].text, clarification.answer);
storedHistory = []; writes = 0;

mode = "compare";
const comparison = await chat.chatService({ message: "Desglosa enero y febrero por rubro", sessionId: "test" });
assert.equal(aggregateQueries, 2);
assert.equal(toolCalls, 2);
assert.equal(comparisonStep, 3);
assert.ok(comparison.answer.includes("₲ 3.000"));
assert.ok(comparison.answer.includes("₲ 4.000"));
assert.ok(!comparison.answer.includes("999999"));
assert.equal(writes, 1);

mode = "direct-followup";
const callsBeforeFollowups = modelCalls;
for (const [message, dimension] of [["Ahora desglosa cada mes por rubro", "category"], ["Ahora por local", "customer"]]) {
  const before = plannedCalls.length;
  const response = await chat.chatService({ message, sessionId: "test" });
  assert.equal(modelCalls, callsBeforeFollowups);
  assert.equal(plannedCalls.length - before, 2);
  assert.equal(plannedCalls.at(-2).arguments.purchasePeriods[0].dateFrom, "01/01/2023");
  assert.equal(plannedCalls.at(-1).arguments.purchasePeriods[0].dateFrom, "01/02/2023");
  assert.equal(plannedCalls.at(-1).arguments.breakdownBy[0], dimension);
  assert.equal(response.toolIterations, 1);
  assert.equal(response.usage, null);
  assert.ok(response.answer.includes("₲ 3.000"));
  assert.ok(response.answer.includes("₲ 4.000"));
  assert.equal(storedHistory.at(-1).content[0].text, response.answer);
}
// Exact repetitions also re-query both months and keep the direct route alive.
for (const message of ["Desglosa enero y febrero por rubro", "Desglosa enero y febrero por rubro", "Ahora por local"]) {
  const before = plannedCalls.length;
  const response = await chat.chatService({ message, sessionId: "test" });
  assert.equal(plannedCalls.length - before, 2);
  assert.equal(modelCalls, callsBeforeFollowups);
  assert.ok(response.answer.includes("₲ 3.000"));
  assert.ok(response.answer.includes("₲ 4.000"));
}
const historyBeforeFailure = JSON.stringify(storedHistory);
const writesBeforeCancellation = writes;
mode = "cancel-between";
cancelBetweenPeriods = new AbortController();
const beforeCancellation = plannedCalls.length;
await assert.rejects(requestContext.runWithRequestSignal(cancelBetweenPeriods.signal,
  () => chat.chatService({ message: "Ahora por rubro", sessionId: "test" })), { code: "REQUEST_ABORTED" });
assert.equal(plannedCalls.length - beforeCancellation, 1);
assert.equal(writes, writesBeforeCancellation);
assert.equal(modelCalls, callsBeforeFollowups);
assert.equal(JSON.stringify(storedHistory), historyBeforeFailure);
mode = "partial-followup";
const failedComparison = await chat.chatService({ message: "Ahora por rubro", sessionId: "test" });
assert.equal(modelCalls, callsBeforeFollowups);
assert.ok(failedComparison.answer.includes("No fue posible completar"));
assert.ok(!failedComparison.answer.includes("₲ 3.000"));

mode = "vs-sales"; comparisonStep = 0; storedHistory = [];
const beforeComparisonModel = modelCalls;
const vsSales = await chat.chatService({ sessionId: "test", message: "Compara canjes con ventas por local en enero 2023" });
assert.equal(modelCalls - beforeComparisonModel, 1);
assert.equal(vsSales.toolIterations, 1);
assert.match(vsSales.answer, /25 %/);
assert.match(vsSales.answer, /Local sintético/);
assert.equal(storedHistory.at(-1).content[0].text, vsSales.answer);

mode = "campaign"; comparisonStep = 0; storedHistory = [];
const beforeCampaignModel = modelCalls;
const campaignResponse = await chat.chatService({ sessionId: "test", message: "Analiza las ventas antes, durante y después de la campaña sintética" });
assert.equal(modelCalls - beforeCampaignModel, 2);
assert.equal(campaignResponse.toolIterations, 2);
assert.match(campaignResponse.answer, /21\/04\/2023/);
assert.match(campaignResponse.answer, /20\/05\/2023/);
assert.match(campaignResponse.answer, /no demuestran/);
assert.equal(storedHistory.at(-1).content[0].text, campaignResponse.answer);

mode = "promotion-pages"; comparisonStep = 0; storedHistory = [];
const beforePageModels = modelCalls;
const firstPromotionPage = await chat.chatService({ sessionId: "test", message: "Busca Navidad" });
assert.equal(modelCalls - beforePageModels, 1);
assert.match(firstPromotionPage.answer, /6 coincidencias. Página 1 de 2/);
const beforeNextPageTools = toolCalls;
const nextPromotionPage = await chat.chatService({ sessionId: "test", message: "Siguiente página" });
assert.equal(modelCalls - beforePageModels, 1);
assert.equal(toolCalls - beforeNextPageTools, 1);
assert.match(nextPromotionPage.answer, /Página 2 de 2/);
assert.match(nextPromotionPage.answer, /\| 6 \| Navidad/);
assert.equal(storedHistory.at(-1).content[0].text, nextPromotionPage.answer);
const noMorePages = await chat.chatService({ sessionId: "test", message: "Ver más" });
assert.match(noMorePages.answer, /No hay más páginas/);
assert.equal(modelCalls - beforePageModels, 1);
assert.equal(toolCalls - beforeNextPageTools, 1);

mode = "soles"; comparisonStep = 0; storedHistory = [];
const beforeSolesModels = modelCalls;
const solesSummary = await chat.chatService({ sessionId: "test", message: "Soles vigentes de Persona sintética" });
assert.equal(modelCalls - beforeSolesModels, 3);
assert.equal(solesSummary.toolIterations, 3);
assert.match(solesSummary.answer, /Soles de prueba \| 25/);
assert.match(solesSummary.answer, /Detallar por vencimiento/);
const beforeSolesBreakdownModels = modelCalls;
const solesByExpiration = await chat.chatService({ sessionId: "test", message: "Detallar por vencimiento" });
assert.equal(modelCalls, beforeSolesBreakdownModels);
assert.match(solesByExpiration.answer, /31\/12\/2023/);
assert.match(solesByExpiration.answer, /Soles de prueba/);
assert.ok(!solesSummary.answer.includes("₲"));
assert.equal(storedHistory.at(-1).content[0].text, solesByExpiration.answer);
const permissionFollowupHistory = structuredClone(storedHistory);
mode = "soles-detail"; comparisonStep = 0; storedHistory = [];
const beforeSolesDetailModels = modelCalls;
const firstSolesPage = await chat.chatService({ sessionId: "test", message: "Detalle de soles" });
assert.match(firstSolesPage.answer, /Página 1 de 2/);
const secondSolesPage = await chat.chatService({ sessionId: "test", message: "Siguiente página" });
assert.match(secondSolesPage.answer, /Página 2 de 2/);
assert.equal(modelCalls - beforeSolesDetailModels, 1);
assert.equal(storedHistory.at(-1).content[0].text, secondSolesPage.answer);

for (const lookup of ["usage-destinations", "usage-movements"]) {
  mode = lookup; comparisonStep = 0; storedHistory = [];
  const before = modelCalls;
  const result = await chat.chatService({ sessionId: "test", message: "Buscar catálogo de usos de soles" });
  assert.equal(modelCalls, before + 1);
  assert.doesNotMatch(result.answer, /INTERNAL-SECRET|Código/);
  assert.match(result.answer, lookup === "usage-destinations" ? /Local sintético/ : /Tipos de movimiento/);
  assert.equal(storedHistory.at(-1).content[0].text, result.answer);
}
mode = "usage"; comparisonStep = 0; storedHistory = [];
const beforeUsageModels = modelCalls;
const usage = await chat.chatService({ sessionId: "test", message: "Soles utilizados del socio con documento 1234567 de enero a mayo de 2023" });
assert.equal(modelCalls - beforeUsageModels, 1);
assert.match(usage.answer, /Soles de prueba \| 10/);
assert.equal(storedHistory.at(-1).content[0].text, usage.answer);
mode = "usage-detail"; comparisonStep = 0; storedHistory = [];
const beforeUsageDetailModels = modelCalls;
const usageFirstPage = await chat.chatService({ sessionId: "test", message: "Detalle de usos de soles del socio con documento 1234567" });
assert.match(usageFirstPage.answer, /Página 1 de 2/);
const usageNextPage = await chat.chatService({ sessionId: "test", message: "Siguiente página" });
assert.match(usageNextPage.answer, /Página 2 de 2/);
assert.equal(modelCalls - beforeUsageDetailModels, 1);
assert.equal(storedHistory.at(-1).content[0].text, usageNextPage.answer);

mode = "vehicle-detail"; comparisonStep = 0; storedHistory = [];
const beforeVehicleModels = modelCalls;
const vehiclePage = await chat.chatService({ sessionId: "test", message: "Vehículos registrados hoy, detalle de uno por página" });
assert.match(vehiclePage.answer, /1 de 2 registros/);
const vehicleNextPage = await chat.chatService({ sessionId: "test", message: "Siguiente página" });
assert.match(vehicleNextPage.answer, /página 2 de 2/);
assert.equal(modelCalls - beforeVehicleModels, 1);
assert.equal(storedHistory.at(-1).content[0].text, vehicleNextPage.answer);

mode = "sales-series"; comparisonStep = 0; storedHistory = [];
const beforeSalesModels = modelCalls;
const salesSeries = await chat.chatService({ sessionId: "test", message: "Ventas de enero a mayo de 2023 por mes" });
assert.equal(modelCalls - beforeSalesModels, 1);
assert.match(salesSeries.answer, /cantidad de facturas presentó subidas y bajadas/);
assert.match(salesSeries.answer, /-8.073; -2,20 %/);
assert.equal(storedHistory.at(-1).content[0].text, salesSeries.answer);

mode = "chart-vehicles"; comparisonStep = 0; storedHistory = [];
const beforeChartModels = modelCalls;
const plotted = await chat.chatService({ sessionId: "test", message: "Vehículos registrados por mes de 2025 en un gráfico" });
assert.equal(modelCalls - beforeChartModels, 2);
assert.equal(plotted.actions.chart.available, true);
assert.match(plotted.actions.chart.url, /^data:image\/svg\+xml;base64,/);
assert.equal(plotted.answer, "Aquí tienes el gráfico solicitado.");
assert.ok(!JSON.stringify(storedHistory).includes("data:image"));
mode = "chart-followup"; comparisonStep = 0;
const beforeFollowupTools = toolCalls;
const changedChart = await chat.chatService({ sessionId: "test", message: "Grafícalo en barras" });
assert.equal(changedChart.actions.chart.type, "bar");
assert.equal(toolCalls, beforeFollowupTools + 1, "Chart follow-up must not query Oracle again");

for (const deniedMode of ["permission-denied", "permission-batch", "permission-chart", "permission-followup"]) {
  mode = deniedMode; comparisonStep = 0;
  storedHistory = deniedMode === "permission-followup" ? structuredClone(permissionFollowupHistory) : [];
  const beforeModels = modelCalls, beforeTools = toolCalls;
  const result = await chat.chatService({ sessionId: "test", message: deniedMode === "permission-followup" ? "Detallar por vencimiento" : deniedMode === "permission-chart" ? "Propietario de la chapa SYN123 y un gráfico" : "Propietario de la chapa SYN123" });
  assert.equal(result.answer, "El usuario no tiene permisos para consultar esta información.");
  assert.equal(JSON.stringify(result.actions), "{}");
  assert.equal(modelCalls - beforeModels, deniedMode === "permission-followup" ? 0 : 1);
  assert.equal(toolCalls - beforeTools, 1);
  assert.equal(storedHistory.at(-1).content[0].text, result.answer);
  const toolErrors = storedHistory.flatMap((item) => item.content ?? []).map((block) => block.toolResult).filter(Boolean);
  assert.ok(toolErrors.some((response) => response.content?.[0]?.json?.error === "ACCESS_DENIED"));
  if (["permission-batch", "permission-chart"].includes(deniedMode)) assert.ok(toolErrors.some((response) => response.content?.[0]?.json?.error === "REQUEST_STOPPED"));
}

const exportQuestion = "Ventas de enero a mayo de 2023 por local, con monto total y cantidad de facturas";
const exportInput = { dateFrom: "01/01/2023", dateTo: "31/05/2023", groupBy: ["customer"], metrics: ["totalAmount", "totalInvoices"], dayType: "weekend", customerIds: ["[PII_CUSTOMER_ID_1]"] };
storedHistory = [
  { role: "user", content: [{ text: exportQuestion }] },
  { role: "assistant", content: [{ toolUse: { name: "get_sales", toolUseId: "expired-sales", input: exportInput } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "expired-sales", status: "success", content: [{ json: {
    data: [], resultSet: { fullResultAvailableInExport: true, truncated: true, totalRecords: 187 },
  } }] } }] },
  { role: "assistant", content: [{ text: "Se muestran 12 de 187 locales." }] },
  // Reproduce the old no-tool answer after an export expired.
  { role: "user", content: [{ text: exportQuestion }] },
  { role: "assistant", content: [{ text: "El detalle está disponible para exportación." }] },
];
mode = "sales-export-repeat";
let lastExportId;
for (let repeat = 0; repeat < 2; repeat++) {
  comparisonStep = 0;
  const before = toolCalls;
  const refreshed = await chat.chatService({ sessionId: "test", message: exportQuestion });
  assert.equal(toolCalls - before, 1, "Each repeat must reauthorize and rerun the original query");
  assert.equal(refreshed.actions.salesExport.available, true);
  assert.notEqual(refreshed.actions.salesExport.exportId, lastExportId);
  assert.ok(Date.parse(refreshed.actions.salesExport.expiresAt) > Date.now());
  lastExportId = refreshed.actions.salesExport.exportId;
  assert.ok(!JSON.stringify(storedHistory).includes(lastExportId), "Client export metadata stays outside model history");
}
mode = "sales-export-denied";
const beforeDeniedExportModels = modelCalls;
const deniedExport = await chat.chatService({ sessionId: "test", message: exportQuestion });
assert.equal(deniedExport.answer, "El usuario no tiene permisos para consultar esta información.");
assert.equal(JSON.stringify(deniedExport.actions), "{}");
assert.equal(modelCalls, beforeDeniedExportModels);

const removalQuestion = "Ahora todos los rubros, manteniendo enero de 2023 y el desglose por local";
const seedCategoryHistory = () => [
  { role: "user", content: [{ text: "Ventas de enero de 2023 por local" }] },
  { role: "assistant", content: [{ toolUse: { name: "get_sales", toolUseId: "old-all-categories", input: { ...exportInput, dateTo: "31/01/2023" } } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "old-all-categories", status: "success", content: [{ json: { data: [], resultSet: { fullResultAvailableInExport: true, truncated: true } } }] } }] },
  { role: "assistant", content: [{ text: "Muestra de 12 de 180 locales." }] },
  { role: "user", content: [{ text: "Ahora por local solo del rubro deportes" }] },
  { role: "assistant", content: [{ toolUse: { name: "get_sales", toolUseId: "filtered-categories", input: { ...exportInput, dateTo: "31/01/2023", categoryIds: ["[PII_CATEGORY_ID_9]"] } } }] },
  { role: "user", content: [{ toolResult: { toolUseId: "filtered-categories", status: "success", content: [{ json: { data: [{ totalAmount: 2994866457, totalInvoices: 7049 }] } }] } }] },
  { role: "assistant", content: [{ text: "Cinco locales de deportes." }] },
];
for (const removalMode of ["sales-export-removal", "sales-export-removal-denied"]) {
  mode = removalMode; comparisonStep = 0; storedHistory = seedCategoryHistory();
  const before = toolCalls, beforeModels = modelCalls;
  const result = await chat.chatService({ sessionId: "test", message: removalQuestion });
  assert.equal(toolCalls - before, 1, "Removing a filter must execute a fresh query even when an older matching sample exists");
  if (mode.endsWith("denied")) {
    assert.equal(result.answer, "El usuario no tiene permisos para consultar esta información.");
    assert.equal(JSON.stringify(result.actions), "{}");
    assert.equal(modelCalls, beforeModels);
  } else {
    assert.equal(result.actions.salesExport.totalRecords, 180);
    assert.equal(result.actions.salesExport.available, true);
    assert.match(result.actions.salesExport.exportId, /^fresh-/);
  }
}

for (const reuseMode of ["sales-history-reuse", "sales-history-stubborn", "sales-history-denied"]) {
  mode = reuseMode; comparisonStep = 0;
  storedHistory = seedCategoryHistory().slice(0, 4);
  const before = toolCalls, beforeModels = modelCalls;
  const result = await chat.chatService({ sessionId: "test", message: "Ventas de enero de 2023 por local, con monto total y cantidad de facturas" });
  assert.equal(modelCalls - beforeModels, 2);
  assert.equal(toolCalls - before, reuseMode === "sales-history-stubborn" ? 0 : 1);
  assert.doesNotMatch(result.answer, /999999/);
  assert.ok(!JSON.stringify(storedHistory).includes("999999"));
  if (reuseMode === "sales-history-denied") {
    assert.equal(result.answer, "El usuario no tiene permisos para consultar esta información.");
    assert.equal(JSON.stringify(result.actions), "{}");
  } else if (reuseMode === "sales-history-stubborn") {
    assert.equal(result.answer, "No fue posible actualizar la consulta de ventas. Vuelve a intentarlo.");
    assert.equal(JSON.stringify(result.actions), "{}");
  } else {
    assert.match(result.answer, /Se muestran 12 de 180 registros/);
    assert.match(result.answer, /Período: 01\/01\/2023 a 31\/01\/2023/);
    assert.equal(result.actions.salesExport.exportId, "current-equivalent-export");
  }
}

mode = "sales-year-comparison"; storedHistory = [];
const beforeYearModels = modelCalls, beforeYearTools = toolCalls;
const yearComparison = await chat.chatService({ sessionId: "test", message: "Compara las ventas de 2023 contra 2024, mes a mes, con monto total y cantidad de facturas" });
assert.match(yearComparison.answer, /Agosto: las ventas de 2024 fueron mayores/);
assert.equal(toolCalls - beforeYearTools, 2);
const narrowedComparison = await chat.chatService({ sessionId: "test", message: "Ahora compara únicamente enero a mayo de ambos años" });
assert.match(narrowedComparison.answer, /2024: no se encontraron registros/);
assert.doesNotMatch(narrowedComparison.answer, /Agosto/);
assert.equal(toolCalls - beforeYearTools, 4);
assert.equal(modelCalls, beforeYearModels);
assert.equal(storedHistory.at(-1).content[0].text, narrowedComparison.answer);

// Exercise the actual dispatcher: it must use the session proxy and close the
// connection even when a queried view is not authorized.
const dispatcherText = await readFile(new URL("../../src/services/ai/toolExecutor.service.js", import.meta.url), "utf8");
const dispatcherStubs = {};
for (const match of dispatcherText.matchAll(/import \{([^}]+)\} from "([^"]+)";/g)) {
  dispatcherStubs[match[2]] = Object.fromEntries(match[1].split(",").map((name) => [name.trim(), () => assert.fail("Unexpected unrelated tool")]));
}
let proxyClosed = 0; let proxyDenied = false;
dispatcherStubs["../charts/chart.service.js"] = { generateChart };
dispatcherStubs["../vehicles/vehicleRegistrations.service.js"] = { getVehicleRegistrations };
dispatcherStubs["../soles/solesUsage.service.js"] = { getSolesUsage };
dispatcherStubs["../soles/memberSoles.service.js"] = { getMemberSoles };
dispatcherStubs["../soles/searchSolesTypes.service.js"] = { searchSolesTypes };
dispatcherStubs["../sales/campaignSalesPerformance.service.js"] = { getCampaignSalesPerformance };
dispatcherStubs["../members/memberPurchasesVsSales.service.js"] = { compareMemberPurchasesVsSales };
dispatcherStubs["../sessions/oracleSession.service.js"] = { withOracleProxySession: async (id, callback) => {
  assert.equal(id, "authorized-session");
  try { return await callback({ username: "SYNTHETIC", connection: { execute: async (sql) => {
    if (proxyDenied) throw Object.assign(new Error("Denied"), { errorNum: typeof proxyDenied === "number" ? proxyDenied : 942 });
    return { rows: sql.includes("VW_BOT_PROMOCIONES") ? [{ COD_PROMOCION: "P1", COD_CAMPANIA: "C1",
      NOMBRE_PROMOCION: "Promoción sintética", NOMBRE_CAMPANIA: "Campaña sintética", FECHA_DESDE: "01/05/2023", FECHA_HASTA: "10/05/2023" }] : [] };
  } } }); } finally { proxyClosed++; }
} };
const dispatcher = await load("../../src/services/ai/toolExecutor.service.js", dispatcherStubs);
const comparisonRequest = { name: "compare_member_purchases_vs_sales", arguments: { dateFrom: "01/01/2023", dateTo: "31/01/2023" }, context: { sessionId: "authorized-session" } };
assert.equal((await dispatcher.executeTool(comparisonRequest)).status, "NOT_FOUND");
assert.equal(proxyClosed, 1);
proxyDenied = true;
await assert.rejects(dispatcher.executeTool(comparisonRequest), /no tiene permisos/);
assert.equal(proxyClosed, 2);
proxyDenied = false;
const campaignRequest = { name: "analyze_campaign_sales_performance", arguments: {
  promotionId: "P1", campaignId: "C1", campaignDateFrom: "01/05/2023", campaignDateTo: "10/05/2023",
}, context: { sessionId: "authorized-session" } };
assert.equal((await dispatcher.executeTool(campaignRequest)).analysisType, "campaignSalesPerformance");
assert.equal(proxyClosed, 3);
proxyDenied = true;
await assert.rejects(dispatcher.executeTool(campaignRequest), /no tiene permisos/);
assert.equal(proxyClosed, 4);
proxyDenied = false;
const solesRequest = { name: "get_member_soles", arguments: { documentNumber: "1234567", mode: "balance", referenceDate: "31/05/2023" }, context: { sessionId: "authorized-session" } };
assert.deepEqual(JSON.stringify((await dispatcher.executeTool(solesRequest)).queryContext.groupBy), JSON.stringify(["type"]));
assert.equal(proxyClosed, 5);
proxyDenied = true;
await assert.rejects(dispatcher.executeTool(solesRequest), /no tiene permisos/);
assert.equal(proxyClosed, 6);
proxyDenied = false;
const usageRequest = { name: "get_soles_usage", arguments: { documentNumber: "1234567", dateFrom: "01/01/2023", dateTo: "31/05/2023" }, context: { sessionId: "authorized-session" } };
assert.equal((await dispatcher.executeTool(usageRequest)).mode, "summary");
assert.equal(proxyClosed, 7);
proxyDenied = true;
await assert.rejects(dispatcher.executeTool(usageRequest), /no tiene permisos/);
assert.equal(proxyClosed, 8);

// Controller: normal completion is not cancellation; disconnect aborts work,
// emits no response, and always removes request/response event listeners.
let controllerMode = "disconnect";
let controllerStarted;
let capturedSignal;
let sessionValidationError;
const lifecycle = await load("../../src/services/ai/conversationLifecycle.service.js", {
  "../../state/conversation.store.js": { clearConversation: (id) => { storedHistory = []; conversationStore.clearConversation(id); } },
  "../sessions/oracleSession.service.js": { getValidOracleSession: async () => {
    if (sessionValidationError) throw sessionValidationError;
    return {};
  } },
});
const controller = await load("../../src/controllers/chat.controller.js", {
  "../services/ai/conversationLifecycle.service.js": lifecycle,
  "../services/requestContext.service.js": requestContext,
  "../services/sessions/oracleSession.service.js": { getValidOracleSession: async () => ({}) },
  "../services/ai/chat.service.js": { chatService: async () => {
    capturedSignal = requestContext.getRequestSignal();
    if (controllerMode === "disconnect") {
      return new Promise((_resolve, reject) => {
        capturedSignal.addEventListener("abort", () => reject(Object.assign(new Error("Cancelled"), { code: "REQUEST_ABORTED" })), { once: true });
        controllerStarted();
      });
    }
    if (controllerMode === "session") throw Object.assign(new Error("Sesión inactiva."), { code: "ORACLE_SESSION_NOT_ACTIVE" });
    return { answer: "Resultado", actions: {} };
  } },
});
const http = () => {
  const req = new EventEmitter(); req.body = { message: "Comparar", sessionId: "test" };
  const res = new EventEmitter(); res.responses = [];
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.responses.push(data); res.writableEnded = true; res.emit("close"); return res; };
  return { req, res };
};
const disconnected = http();
const started = new Promise((resolve) => { controllerStarted = resolve; });
const pendingHttp = controller.chatController(disconnected.req, disconnected.res);
await started;
const busyReset = http();
await controller.resetConversationController(busyReset.req, busyReset.res);
assert.equal(busyReset.res.statusCode, 409);
assert.ok(storedHistory.length > 0);
const busyChat = http();
await controller.chatController(busyChat.req, busyChat.res);
assert.equal(busyChat.res.statusCode, 409);
disconnected.res.emit("close");
await pendingHttp;
assert.equal(capturedSignal.aborted, true);
assert.equal(disconnected.res.responses.length, 0);
assert.equal(disconnected.req.listenerCount("aborted"), 0);
assert.equal(disconnected.res.listenerCount("close"), 0);
controllerMode = "success";
const successful = http();
await controller.chatController(successful.req, successful.res);
assert.equal(successful.res.statusCode, 200);
assert.equal(capturedSignal.aborted, false);
controllerMode = "session";
const expired = http();
await controller.chatController(expired.req, expired.res);
assert.equal(expired.res.statusCode, 401);
assert.equal(expired.res.responses[0].message, "Sesión inactiva.");
assert.equal(expired.res.responses[0].code, undefined);

// A session failure cannot clear history. A successful reset affects only the
// conversation store and does not log out or open an Oracle connection.
sessionValidationError = Object.assign(new Error("Sesión inactiva."), { code: "ORACLE_SESSION_NOT_ACTIVE" });
const rejectedReset = http();
await controller.resetConversationController(rejectedReset.req, rejectedReset.res);
assert.equal(rejectedReset.res.statusCode, 401);
assert.ok(storedHistory.length > 0);
sessionValidationError = undefined;
conversationStore.setConversation("test", [{ role: "user", content: [{ text: "Synthetic" }] }]);
conversationStore.setConversation("other", [{ role: "user", content: [{ text: "Other" }] }]);
const targetPii = getPiiSession("test"); targetPii.tokenToValue.set("TOKEN", "Synthetic");
const otherPii = getPiiSession("other"); otherPii.tokenToValue.set("TOKEN", "Other");
const reset = http();
await controller.resetConversationController(reset.req, reset.res);
assert.equal(reset.res.statusCode, 200);
assert.equal(storedHistory.length, 0);
assert.equal(conversationStore.getConversation("test").length, 0);
assert.equal(getPiiSession("test").tokenToValue.size, 0);
assert.equal(conversationStore.getConversation("other").length, 1);
assert.equal(getPiiSession("other"), otherPii);
const invalidReset = http(); invalidReset.req.body = {};
await controller.resetConversationController(invalidReset.req, invalidReset.res);
assert.equal(invalidReset.res.statusCode, 400);
// The lock is released after success, failure and cancellation.
controllerMode = "success";
const afterReset = http();
await controller.chatController(afterReset.req, afterReset.res);
assert.equal(afterReset.res.statusCode, 200);

let closes = 0;
let touches = 0;
const acquiring = new AbortController();
const sessions = await load("../../src/services/sessions/oracleSession.service.js", {
  "../requestContext.service.js": requestContext,
  "../../database/oracle.database.js": { connectWithProxy: async () => {
    acquiring.abort();
    return { close: async () => { closes++; } };
  } },
  "../../repositories/sessions/oracleSession.repository.js": {
    getOracleSessionRepository: async () => ({ session_id: "test", status: "ACTIVE", username: "TEST" }),
    touchOracleSessionRepository: async () => { touches++; return {}; },
  },
});
await assert.rejects(requestContext.runWithRequestSignal(acquiring.signal,
  () => sessions.createProxyConnectionBySessionId("test")), { code: "REQUEST_ABORTED" });
assert.equal(closes, 1);
assert.equal(touches, 0);
proxyDenied = false;
const beforeVehicleProxyClosed = proxyClosed;
const vehicleRequest = { name: "get_vehicle_registrations", arguments: { dateFrom: "01/01/2023", dateTo: "31/05/2023", groupBy: ["gender"] }, context: { sessionId: "authorized-session" } };
assert.equal((await dispatcher.executeTool(vehicleRequest)).mode, "summary");
assert.equal(proxyClosed, beforeVehicleProxyClosed + 1);
proxyDenied = true;
await assert.rejects(dispatcher.executeTool(vehicleRequest), /no tiene permisos/);
assert.equal(proxyClosed, beforeVehicleProxyClosed + 2);
const beforeChartProxyClosed = proxyClosed;
const chartRequest = { name: "generate_chart", arguments: { sourceToolUseId: "v", type: "bar", labelPaths: ["month"], datasets: [{ label: "Registros", valuePath: "vehicleCount" }] }, context: { sessionId: "authorized-session", chartSources: { v: { result: { data: [{ month: "2025-01", vehicleCount: 2 }] } } } } };
assert.equal((await dispatcher.executeTool(chartRequest)).chart.available, true);
assert.equal(proxyClosed, beforeChartProxyClosed, "Chart generation does not open Oracle");
const beforeSpecificDenials = proxyClosed;
for (const errorNum of [942, 1031]) {
  proxyDenied = errorNum;
  await assert.rejects(dispatcher.executeTool(vehicleRequest), (error) => {
    assert.equal(error.code, "ACCESS_DENIED");
    assert.equal(error.errorNum, errorNum);
    assert.equal(error.message, "El usuario no tiene permisos para consultar esta información.");
    return true;
  });
}
assert.equal(proxyClosed, beforeSpecificDenials + 2);
console.log("Lifecycle integration passed");
