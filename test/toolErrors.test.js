import test from "node:test";
import assert from "node:assert/strict";
import { ACCESS_DENIED_CODE, ACCESS_DENIED_MESSAGE, isAccessDenied, accessDeniedError } from "../src/services/ai/toolErrors.service.js";

test("Oracle access errors retain a stable code and a safe message", () => {
  for (const errorNum of [942, 1031]) {
    const original = Object.assign(new Error("Oracle technical detail"), { errorNum });
    const error = accessDeniedError(original);
    assert.equal(isAccessDenied(original), true);
    assert.equal(isAccessDenied(error), true);
    assert.equal(error.code, ACCESS_DENIED_CODE);
    assert.equal(error.message, ACCESS_DENIED_MESSAGE);
    assert.equal(error.errorNum, errorNum);
    assert.equal(error.cause, original);
    assert.doesNotMatch(error.message, /Oracle technical detail|migraci|registros/);
  }
});

test("validation, missing sessions, cancellations and unrelated Oracle errors are not access denials", () => {
  for (const error of [null, new Error("Sesión Oracle no encontrada."), { status: 404 }, { errorNum: 1013 }, { errorNum: 904 }, { code: "TOOL_EXECUTION_ERROR" }]) assert.equal(isAccessDenied(error), false);
  assert.equal(isAccessDenied({ code: "ACCESS_DENIED" }), true);
});
