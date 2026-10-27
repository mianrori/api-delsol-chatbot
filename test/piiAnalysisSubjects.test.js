import test from "node:test";
import assert from "node:assert/strict";
import {
  protectPiiText, protectPiiDeep, restorePiiText,
} from "../src/services/ai/pii.service.js";
import { clearPiiSession } from "../src/state/pii.store.js";

test("the monthly member comparison reaches the model without losing subject or dates", () => {
  const session = "pii-comparison";
  const text = "Compara el monto total y la cantidad de compras de los socios entre enero y febrero de 2023";
  assert.equal(protectPiiText(session, text), text);
  assert.equal(protectPiiDeep(session, [{ role: "user", content: [{ text }] }])[0].content[0].text, text);
  clearPiiSession(session);
});

test("generic cohorts remain readable with filters and calendar qualifiers", () => {
  const texts = [
    "Compras de socios en 2023", "Compras de las socias entre enero y febrero de 2023",
    "Compras de todos los socios activos en enero de 2023",
    "Compras de todas las socias registradas por rubro",
    "Compras de los socios entre 30 y 40 años en 2023",
    "Ventas de los locales entre enero y febrero de 2023",
    "Compras de los hombres en 2023", "Compras de las mujeres por local",
    "Compras de enero y febrero de 2023", "Ventas de 2023",
  ];
  for (const text of texts) assert.equal(protectPiiText("pii-generic", text), text);
  clearPiiSession("pii-generic");
});

test("commercial names stay protected and periods remain outside the token", () => {
  const cases = [
    ["Ventas de Marca Ejemplo entre enero y febrero de 2023", "Marca Ejemplo", "entre enero y febrero de 2023"],
    ["Compras de Marca Ejemplo de enero a abril de 2023", "Marca Ejemplo", "de enero a abril de 2023"],
    ["Facturación de ALMACEN DE PRUEBA por mes", "ALMACEN DE PRUEBA", "por mes"],
    ["Compras de Socios Club en 2023", "Socios Club", "en 2023"],
    ["Compras de las socias Persona Ejemplo en 2023", "Persona Ejemplo", "en 2023"],
  ];
  for (const [text, name, suffix] of cases) {
    const protectedText = protectPiiText("pii-brands", text);
    assert.match(protectedText, /\[PII_BUSINESS_ENTITY_\d+\]/);
    assert.ok(!protectedText.includes(name));
    assert.ok(protectedText.endsWith(suffix));
    assert.equal(restorePiiText("pii-brands", protectedText), text);
    assert.equal(protectPiiText("pii-brands", protectedText), protectedText);
  }
  clearPiiSession("pii-brands");
});

test("explicit business context protects names even when they resemble generic cohorts", () => {
  for (const text of ["Ventas del local Mujeres", "Compras del cliente Socios"] ) {
    const protectedText = protectPiiText("pii-explicit", text);
    assert.match(protectedText, /\[PII_BUSINESS_ENTITY_\d+\]/);
    assert.equal(restorePiiText("pii-explicit", protectedText), text);
  }
  clearPiiSession("pii-explicit");
});

test("personal fields and contact details remain protected in analytical conversations", () => {
  const session = "pii-personal";
  const value = { documentNumber: "1234567", fullName: "Persona Ejemplo", email: "persona@example.test", phone: "0981123456" };
  const protectedValue = protectPiiDeep(session, value);
  for (const [key, raw] of Object.entries(value)) {
    assert.notEqual(protectedValue[key], raw);
    assert.match(protectedValue[key], /^\[PII_[A-Z_]+_\d+\]$/);
    assert.equal(restorePiiText(session, protectedValue[key]), raw);
  }
  const text = "Compras de los socios entre enero y febrero de 2023. Email persona@example.test, documento 1234567";
  const protectedText = protectPiiText(session, text);
  assert.ok(protectedText.includes("los socios entre enero y febrero de 2023"));
  assert.ok(!protectedText.includes("persona@example.test"));
  assert.ok(!protectedText.includes("1234567"));
  clearPiiSession(session);
});
