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
    if (["./promotionSearchPresentation.service.js", "./campaignSalesPerformancePresentation.service.js", "./memberPurchasesVsSalesPresentation.service.js", "./conversationClarification.service.js", "./memberAnalysisFollowup.service.js", "./memberRankingPresentation.service.js", "./memberSummaryPresentation.service.js"].includes(spec)) {
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
  "../../../config.js": { default: {} },
  "node:crypto": { randomUUID: () => `test-id-${++uuidCounter}` },
  "../requestContext.service.js": requestContext,
  "@aws-sdk/client-bedrock-runtime": {
    BedrockRuntimeClient: class { async send(_command, options) {
      modelCalls++;
      if (mode === "direct-followup" || mode === "partial-followup" || mode === "cancel-between") {
        assert.fail("A summary follow-up must not invoke Bedrock");
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
    ConverseCommand: class {},
  },
  "../../tools/index.js": { tools: [] },
  "./toolExecutor.service.js": { executeTool: async (call) => {
    toolCalls++;
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

// Exercise the actual dispatcher: it must use the session proxy and close the
// connection even when a queried view is not authorized.
const dispatcherText = await readFile(new URL("../../src/services/ai/toolExecutor.service.js", import.meta.url), "utf8");
const dispatcherStubs = {};
for (const match of dispatcherText.matchAll(/import \{([^}]+)\} from "([^"]+)";/g)) {
  dispatcherStubs[match[2]] = Object.fromEntries(match[1].split(",").map((name) => [name.trim(), () => assert.fail("Unexpected unrelated tool")]));
}
let proxyClosed = 0; let proxyDenied = false;
dispatcherStubs["../sales/campaignSalesPerformance.service.js"] = { getCampaignSalesPerformance };
dispatcherStubs["../members/memberPurchasesVsSales.service.js"] = { compareMemberPurchasesVsSales };
dispatcherStubs["../sessions/oracleSession.service.js"] = { withOracleProxySession: async (id, callback) => {
  assert.equal(id, "authorized-session");
  try { return await callback({ username: "SYNTHETIC", connection: { execute: async (sql) => {
    if (proxyDenied) throw Object.assign(new Error("Denied"), { errorNum: 942 });
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
console.log("Lifecycle integration passed");
