import test from "node:test";
import assert from "node:assert/strict";
import { resolveMemberPurchasesPage } from "../src/services/ai/memberPurchasesPresentation.service.js";
import { compactMemberPurchasePaginationHistory, trimConversation } from "../src/services/ai/conversation.service.js";

const input = { documentNumber: "[PII_DOCUMENT_NUMBER_1]", dateFrom: "01/01/2023", dateTo: "31/05/2023", customerIds: ["[PII_CUSTOMER_ID_1]"],
  categoryIds: ["[PII_CATEGORY_ID_1]"], mode: "detail", page: 9, rows: 10 };
const turn = (page = 9) => [
  { role: "user", content: [{ text: "Siguiente página" }] },
  { role: "assistant", content: [{ toolUse: { name: "get_member_purchases", toolUseId: `p${page}`, input: { ...structuredClone(input), page } } }] },
  { role: "user", content: [{ toolResult: { toolUseId: `p${page}`, status: "success", content: [{ json: {
    documentNumber: input.documentNumber, mode: "detail", page, rows: 10, totalRows: 170, totalPages: 17,
    hasMore: page < 17, nextPage: page < 17 ? page + 1 : null, data: [{ amount: 1 }],
  } }] } }] },
  { role: "assistant", content: [{ text: "Tabla anterior" }] },
];
const followup = "Siguiente página de las mismas compras, conserva filtros y tamaño de página.";
const suffix = ` Presenta una tabla con columnas exactas Fecha, Local, Rubro, Moneda, Importe. Incluye encabezados Documento: ${input.documentNumber} y Período: ${input.dateFrom} a ${input.dateTo}. Usa PYG en Moneda y números en formato paraguayo sin símbolos dentro de los importes. Muestra todas las filas, sin muestra ni límite de grupos. Indica la paginación real con formato Página X de Y; N compras en total.`;

test("page nine of seventeen advances to ten with unchanged identity, page size and filters", () => {
  const history = turn();
  const resolved = resolveMemberPurchasesPage({ message: followup + suffix, history });
  assert.deepEqual(resolved.input, { ...input, page: 10, knownTotalRows: 170 });
  resolved.input.customerIds.push("changed");
  assert.equal(history[1].content[0].toolUse.input.customerIds.length, 1);
});

test("all seventeen pages survive history compaction and trimming, and only the real last page ends", () => {
  let history = [];
  for (let page = 1; page <= 17; page++) {
    history = trimConversation(compactMemberPurchasePaginationHistory([...history, ...turn(page)]), 10);
    const result = resolveMemberPurchasesPage({ message: "Siguiente página", history });
    if (page < 17) {
      assert.equal(result.input.page, page + 1);
      assert.equal(result.input.documentNumber, input.documentNumber);
      assert.equal(result.input.rows, 10);
    } else assert.deepEqual(result, { answer: "No hay más páginas de compras para los filtros consultados." });
  }
});

test("identity, period or filter changes in continuation are never discarded", () => {
  for (const message of [followup + suffix.replace(input.documentNumber, "[PII_DOCUMENT_NUMBER_2]"),
    followup + suffix.replace("31/05/2023", "30/06/2023"), "Siguiente página solo del rubro deportes", "Siguiente página de otro socio", followup + suffix + " Solo en enero."]) {
    assert.equal(resolveMemberPurchasesPage({ message, history: turn() }), null);
  }
});

test("another topic, failed calls and mismatched or inconsistent metadata cannot replay purchases", () => {
  for (const change of [
    (h) => h.push({ role: "user", content: [{ text: "Contratos" }] }),
    (h) => { h[2].content[0].toolResult.status = "error"; },
    (h) => { h[1].content[0].toolUse.name = "get_invoices"; },
    (h) => { h[1].content[0].toolUse.input.unrecognizedFilter = "restricted"; },
    (h) => { h[2].content[0].toolResult.content[0].json.documentNumber = "other"; },
    (h) => { h[2].content[0].toolResult.content[0].json.nextPage = 11; },
    (h) => { h[2].content[0].toolResult.content[0].json.hasMore = false; },
    (h) => { h[2].content[0].toolResult.content[0].json.rows = 20; },
    (h) => { h[1].content.push({ toolUse: { name: "get_member_purchases", toolUseId: "other", input } }); },
  ]) {
    const history = turn(); change(history);
    assert.equal(resolveMemberPurchasesPage({ message: "Siguiente página", history }), null);
  }
});
