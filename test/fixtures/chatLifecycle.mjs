import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import * as requestContext from "../../src/services/requestContext.service.js";
import { analyzeMembers } from "../../src/services/members/memberAnalysis.service.js";

const context = vm.createContext({ console, structuredClone, Intl, Date, Map, Set,
  Number, String, Array, JSON, Math, RegExp, Object, Boolean, Error, AbortController, process });
const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
}, { context });
const load = async (path, stubs) => {
  const main = new vm.SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
  await main.link(async (spec) => {
    if (["./memberAnalysisFollowup.service.js", "./memberRankingPresentation.service.js", "./memberSummaryPresentation.service.js"].includes(spec)) {
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

// Controller: normal completion is not cancellation; disconnect aborts work,
// emits no response, and always removes request/response event listeners.
let controllerMode = "disconnect";
let controllerStarted;
let capturedSignal;
const controller = await load("../../src/controllers/chat.controller.js", {
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
