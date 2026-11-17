import test from "node:test";
import assert from "node:assert/strict";
import { clarifyInitialBreakdown } from "../src/services/ai/conversationClarification.service.js";

test("initial bare breakdown asks for subject and period without assuming sales", () => {
  for (const message of ["Ahora por local", "Por locales", "Ahora desglosa cada mes por rubro", "¿Por categoría?", "Muestra el desglose por comercio"]) {
    const answer = clarifyInitialBreakdown({ message });
    assert.match(answer, /ventas, compras de socios u otra información/);
    assert.match(answer, /período/);
  }
});

test("existing context and explicit requests retain normal routing", () => {
  const history = [{ role: "user", content: [{ text: "Compras de enero 2023" }] }];
  assert.equal(clarifyInitialBreakdown({ message: "Ahora por local", history }), null);
  for (const message of ["Ventas por local", "Compras de socios por rubro", "Por local en enero de 2023", "Hola", "Ventas de este mes", ""]) {
    assert.equal(clarifyInitialBreakdown({ message }), null);
  }
});
