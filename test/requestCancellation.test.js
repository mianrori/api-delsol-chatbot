import test from "node:test";
import assert from "node:assert/strict";
import { runWithRequestSignal, getRequestSignal, throwIfRequestAborted, isTerminalSessionError } from "../src/services/requestContext.service.js";
import { executeOracleQuery } from "../src/database/oracle-query.database.js";

test("cancelling an active query breaks once and waits for break cleanup", async () => {
  const cancellation = new AbortController();
  const events = [];
  let rejectQuery;
  const connection = {
    execute: () => new Promise((_resolve, reject) => { events.push("execute"); rejectQuery = reject; }),
    break: async () => {
      events.push("break");
      rejectQuery(new Error("ORA-01013"));
      await new Promise((resolve) => setImmediate(resolve));
      events.push("break-finished");
    },
  };
  await runWithRequestSignal(cancellation.signal, async () => {
    const pending = executeOracleQuery(connection, "SELECT 1 FROM dual");
    cancellation.abort();
    cancellation.abort();
    await assert.rejects(pending, { code: "REQUEST_ABORTED" });
    assert.deepEqual(events, ["execute", "break", "break-finished"]);
    await assert.rejects(executeOracleQuery(connection, "SELECT 2 FROM dual"), { code: "REQUEST_ABORTED" });
  });
  assert.equal(events.filter((event) => event === "execute").length, 1);
});

test("a completed query removes its abort handler", async () => {
  const cancellation = new AbortController();
  let breaks = 0;
  await runWithRequestSignal(cancellation.signal, async () => {
    assert.deepEqual(await executeOracleQuery({ execute: async () => ({ rows: [1] }), break: async () => { breaks++; } }, "SELECT 1 FROM dual;"), [1]);
    cancellation.abort();
  });
  assert.equal(breaks, 0);
});

test("request signals are isolated across concurrent requests", async () => {
  const first = new AbortController();
  const second = new AbortController();
  await Promise.all([
    runWithRequestSignal(first.signal, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(getRequestSignal(), first.signal);
      first.abort();
      assert.throws(throwIfRequestAborted, { code: "REQUEST_ABORTED" });
    }),
    runWithRequestSignal(second.signal, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(getRequestSignal(), second.signal);
      throwIfRequestAborted();
    }),
  ]);
  assert.equal(getRequestSignal(), undefined);
});

test("all session failures are terminal while other tool errors remain recoverable", () => {
  for (const code of ["ORACLE_SESSION_ID_REQUIRED", "ORACLE_SESSION_NOT_FOUND", "ORACLE_SESSION_NOT_ACTIVE", "ORACLE_SESSION_EXPIRED", "ORACLE_SESSION_USERNAME_MISSING"]) {
    assert.equal(isTerminalSessionError({ code }), true);
  }
  assert.equal(isTerminalSessionError(new Error("Other error")), false);
});
