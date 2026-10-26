import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import * as requestContext from "../../src/services/requestContext.service.js";

const context = vm.createContext({ console, structuredClone, Intl, Date, Map, Set,
  Number, String, Array, JSON, Math, RegExp, Object, Boolean, Error, AbortController, process });
const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
}, { context });
const load = async (path, stubs) => {
  const main = new vm.SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
  await main.link(async (spec) => {
    if (["./memberAnalysisFollowup.service.js", "./memberRankingPresentation.service.js"].includes(spec)) {
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
let mode = "session";
const same = (_id, value) => value;
const chat = await load("../../src/services/ai/chat.service.js", {
  "../../../config.js": { default: {} },
  "node:crypto": { randomUUID: () => "test-id" },
  "../requestContext.service.js": requestContext,
  "@aws-sdk/client-bedrock-runtime": {
    BedrockRuntimeClient: class { async send(_command, options) {
      modelCalls++;
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
  "./toolExecutor.service.js": { executeTool: async () => {
    toolCalls++;
    throw Object.assign(new Error("La sesión Oracle no está activa."), { code: "ORACLE_SESSION_NOT_ACTIVE" });
  } },
  "../../state/conversation.store.js": { getConversation: () => [], setConversation: () => { writes++; } },
  "./conversation.service.js": { compactMemberPurchasePaginationHistory: (x) => x, trimConversation: (x) => x },
  "../../prompts/system.prompt.js": { getSystemPrompt: () => "" },
  "../../utils/debug.logger.js": Object.fromEntries(["logBedrockRequest", "logBedrockResponse", "logToolCall", "logToolResult"].map((key) => [key, () => {}])),
  "./pii.service.js": { protectPiiDeep: same, protectPiiText: same, restorePiiDeep: same, restorePiiTextForUser: same },
});
await assert.rejects(chat.chatService({ message: "Comparar", sessionId: "test" }), { code: "ORACLE_SESSION_NOT_ACTIVE" });
assert.equal(modelCalls, 1);
assert.equal(toolCalls, 1);
assert.equal(writes, 0);

mode = "cancel-model";
const cancellation = new AbortController();
const modelStarted = new Promise((resolve) => { pendingModel = resolve; });
const pending = requestContext.runWithRequestSignal(cancellation.signal,
  () => chat.chatService({ message: "Comparar", sessionId: "test" }));
await modelStarted;
cancellation.abort();
await assert.rejects(pending);
assert.equal(modelSignal, cancellation.signal);
assert.equal(toolCalls, 1);
assert.equal(writes, 0);

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
assert.match(expired.res.responses[0].message, /Vuelve a iniciar sesión/);

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
