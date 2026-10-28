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


test("canjes comparison preserves generic members, sales denominator and period", () => {
  const texts = [
    "¿Qué porcentaje representan los canjes de facturas de socios sobre las ventas de enero de 2023?",
    "Compara canjes de facturas de los socios respecto a las ventas de enero de 2023",
    "Canjes de comprobantes de las socias frente a las ventas de enero de 2023",
    "Facturas de los socios por rubro",
  ];
  for (const text of texts) {
    assert.equal(protectPiiText("pii-canjes", text), text);
    assert.equal(protectPiiDeep("pii-canjes", { text }).text, text);
  }
  clearPiiSession("pii-canjes");
});

test("named entities in invoice comparisons remain protected without hiding the comparison", () => {
  for (const name of ["Marca Ejemplo", "Socios Club", "Socios Persona Ejemplo"]) {
    const text = `Canjes de facturas de ${name} sobre las ventas de enero de 2023`;
    const protectedText = protectPiiText("pii-canjes-names", text);
    assert.match(protectedText, /\[PII_BUSINESS_ENTITY_\d+\]/);
    assert.ok(!protectedText.includes(name));
    assert.ok(protectedText.includes("sobre las ventas de enero de 2023"));
    assert.equal(restorePiiText("pii-canjes-names", protectedText), text);
  }
  clearPiiSession("pii-canjes-names");
});


test("usual soles-balance questions protect the member while preserving the request and date", () => {
  const cases = [
    ["Saldo de soles de Persona Ejemplo", "Persona Ejemplo", "NAME"],
    ['Saldo de soles de "Persona Ejemplo"', "Persona Ejemplo", "NAME"],
    ["¿Cuántos soles dispone Persona Ejemplo?", "Persona Ejemplo", "NAME"],
    ["Cuantos soles dispone 1234567", "1234567", "DOCUMENT"],
    ["Saldo de soles de 1.234.567", "1.234.567", "DOCUMENT"],
    ["Saldo de soles de Persona Ejemplo al 31/05/2023", "Persona Ejemplo", "NAME"],
    ["Saldo de soles de Persona Ejemplo, al 31/05/2023", "Persona Ejemplo", "NAME"],
    ["Saldo de soles de Persona Ejemplo por tipo", "Persona Ejemplo", "NAME"],
  ];
  for (const [text, identity, type] of cases) {
    const protectedText = protectPiiText("soles-common", text);
    assert.ok(!protectedText.includes(identity));
    assert.ok(protectedText.includes(`[PII_${type}_`));
    assert.equal(restorePiiText("soles-common", protectedText), text);
    if (text.includes("31/05/2023")) assert.ok(protectedText.includes("31/05/2023"));
    if (text.endsWith("por tipo")) assert.ok(protectedText.endsWith("por tipo"));
    assert.equal(protectPiiText("soles-common", protectedText), protectedText);
  }
  clearPiiSession("soles-common");
});

test("member follow-ups preserve destination references without treating them as personal names", () => {
  const session = "pii-usage-destination";
  for (const reference of ["ese", "este", "el", "aquel"]) {
    const text = `Muéstrame los soles utilizados por ese socio en ${reference} destino, entre enero y mayo de 2024, por tipo de soles`;
    assert.equal(protectPiiText(session, text), text);
    assert.equal(protectPiiDeep(session, { text }).text, text);
  }
  const named = "Muéstrame los soles utilizados por el socio Persona Ejemplo, entre enero y mayo de 2024";
  const protectedText = protectPiiText(session, named);
  assert.match(protectedText, /\[PII_NAME_\d+\]/);
  assert.equal(restorePiiText(session, protectedText), named);
  clearPiiSession(session);
});


test("year comparisons preserve both calendar periods rather than becoming business names", () => {
  const session = "pii-year-comparisons";
  for (const connector of ["contra", "vs", "vs.", "versus", "frente a", "respecto a", "respecto de", "comparado con", "y", "a", "hasta", "-"]) {
    const text = `Compara las ventas de 2023 ${connector} 2024, mes a mes, con monto total y cantidad de facturas`;
    assert.equal(protectPiiText(session, text), text);
    assert.equal(protectPiiDeep(session, { text }).text, text);
    assert.equal(protectPiiText(session, protectPiiText(session, text)), text);
  }
  for (const text of ["Compras de 2023 contra 2024 por mes", "Facturación de 2023 vs. 2024", "Ventas de los años 2023 contra 2024", "Ventas de 2023 contra el año 2024", "Ventas de 2022 contra 2023 contra 2024", "Ventas de 1999 versus 2000"]) assert.equal(protectPiiText(session, text), text);
  clearPiiSession(session);
});

test("commercial names containing years remain protected in year comparison requests", () => {
  const session = "pii-year-brands";
  for (const name of ["Marca 2023", "2023 Store", "2023 contra 2024 Outlet"]) {
    const text = `Compara las ventas de ${name} en 2023 contra 2024`;
    const protectedText = protectPiiText(session, text);
    assert.match(protectedText, /\[PII_BUSINESS_ENTITY_\d+\]/);
    assert.ok(!protectedText.includes(name));
    assert.ok(protectedText.endsWith("en 2023 contra 2024"));
    assert.equal(restorePiiText(session, protectedText), text);
  }
  // An explicit business context still protects a numeric commercial name.
  const explicit = "Ventas del local 2023";
  assert.match(protectPiiText(session, explicit), /\[PII_BUSINESS_ENTITY_\d+\]/);
  assert.equal(restorePiiText(session, protectPiiText(session, explicit)), explicit);
  clearPiiSession(session);
});
