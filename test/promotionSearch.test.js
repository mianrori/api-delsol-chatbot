import test from "node:test";
import assert from "node:assert/strict";
import { resolvePromotion } from "../src/services/promotions/promotion.resolver.js";
import { searchPromotionsRepository } from "../src/repositories/promotions/promotion.repository.js";
import { buildPromotionSearchResponse, resolvePromotionSearchPage } from "../src/services/ai/promotionSearchPresentation.service.js";
import { protectPiiDeep } from "../src/services/ai/pii.service.js";

const row = (id, total = 6) => ({ COD_PROMOCION: "P", COD_CAMPANIA: id, NOMBRE_PROMOCION: "Navidad",
  NOMBRE_CAMPANIA: `Navidad ${2024 - id}`, FECHA_DESDE: `01/12/${2024 - id}`, FECHA_HASTA: `31/12/${2024 - id}`, TOTAL_ROWS: total });
const connectionFor = (rows, queries = []) => ({ execute: async (sql, binds) => { queries.push({ sql, binds }); return { rows }; } });

test("text search includes partial matches and paginates after ordering by the real date", async () => {
  const queries = [];
  const result = await resolvePromotion("Navidad", connectionFor([row(1), row(2), row(3), row(4), row(5)], queries), { page: 1, rows: 5 });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSTR\(NORMALIZED_PROMOTION/);
  assert.match(queries[0].sql, /OR \(\(INSTR/);
  assert.match(queries[0].sql, /START_DATE DESC NULLS LAST/);
  assert.match(queries[0].sql, /COUNT\(\*\) AS TOTAL_ROWS/);
  assert.ok(!queries[0].sql.includes("ROWNUM <="));
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(result.totalRows, 6);
  assert.equal(result.options.length, 5);
  assert.equal(result.nextPage, 2);
  assert.equal(result.totalPages, 2);
  assert.match(buildPromotionSearchResponse([{ name: "search_promotions", result }]), /6 coincidencias. Página 1 de 2/);
});

test("a final page with one option remains ambiguous and keeps global numbering and campaign identity", async () => {
  const result = await resolvePromotion("Navidad", connectionFor([row(6)]), { page: 2, rows: 5 });
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(result.options[0].optionId, "6");
  assert.equal(result.options[0].campaignId, 6);
  assert.equal(result.options[0].dateFrom, "01/12/2018");
  assert.equal(result.hasMore, false);
  assert.equal(result.nextPage, null);
});

test("only a unique match across the full search resolves automatically", async () => {
  const result = await resolvePromotion("Specific campaign", connectionFor([row(1, 1)]), { rows: 5 });
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.promotion.campaignId, 1);
  const beyond = await resolvePromotion("Navidad", connectionFor([{ TOTAL_ROWS: 6, COD_PROMOCION: null }]), { page: 3, rows: 5 });
  assert.equal(beyond.status, "AMBIGUOUS");
  assert.equal(beyond.totalRows, 6);
  assert.deepEqual(beyond.options, []);
});

test("names and IDs are bound and page arguments cannot silently ignore invalid input", async () => {
  const queries = [];
  await searchPromotionsRepository(connectionFor([row(1)], queries), "Navidad' OR 1=1", { page: 2, rows: 5 });
  assert.ok(!queries[0].sql.includes("Navidad' OR 1=1"));
  assert.equal(queries[0].binds.search, "Navidad' OR 1=1");
  assert.equal(queries[0].binds.startRow, 6);
  assert.equal(queries[0].binds.endRow, 10);
  for (const paging of [{ page: 0 }, { page: 1.5 }, { rows: 0 }, { rows: 51 }]) {
    await assert.rejects(searchPromotionsRepository({ execute: () => assert.fail("Invalid pagination must not query") }, "Navidad", paging));
  }
});

test("approximate fallback ranks all candidates before slicing and counts every qualifying row", async () => {
  let calls = 0;
  const result = await resolvePromotion("Navidd", { execute: async (sql) => {
    calls++;
    if (calls === 1) return { rows: [{ TOTAL_ROWS: 0, COD_PROMOCION: null }] };
    assert.ok(!sql.includes("candidateLimit"));
    assert.match(sql, /VW_BOT_PROMOCIONES.FECHA_DESDE DESC/);
    return { rows: Array.from({ length: 8 }, (_, index) => row(index + 1, 8)).reverse() };
  } }, { page: 2, rows: 5 });
  assert.equal(calls, 2);
  assert.equal(result.totalRows, 8);
  assert.equal(result.options.length, 3);
  assert.equal(result.options[0].optionId, "6");
  assert.equal(result.options[0].campaignId, 6);
});

test("next-page routing preserves protected search and page size, without crossing topics", () => {
  const input = { search: "[PII_PROMOTION_NAME_1]", rows: 5 };
  const result = { status: "AMBIGUOUS", totalRows: 6, page: 1, rows: 5, hasMore: true, nextPage: 2 };
  const history = [
    { role: "user", content: [{ text: "Busca Navidad" }] },
    { role: "assistant", content: [{ toolUse: { name: "search_promotions", toolUseId: "search", input } }] },
    { role: "user", content: [{ toolResult: { toolUseId: "search", status: "success", content: [{ json: result }] } }] },
    { role: "assistant", content: [{ text: "Opciones" }] },
  ];
  assert.deepEqual(resolvePromotionSearchPage({ message: "Siguiente página", history }), { input: { ...input, page: 2 } });
  assert.equal(input.page, undefined);
  assert.equal(resolvePromotionSearchPage({ message: "Siguiente página", history: [...history, { role: "user", content: [{ text: "Ventas 2023" }] }] }), null);
  result.hasMore = false;
  assert.ok(resolvePromotionSearchPage({ message: "Ver más", history }).answer.includes("No hay más páginas"));
});

test("presentation includes every page option, dates and totals while protecting campaign identities", () => {
  const result = protectPiiDeep("promotion-page-test", { status: "AMBIGUOUS", totalRows: 6, totalPages: 2, page: 1, rows: 5,
    hasMore: true, options: [{ optionId: "1", promotionName: "Promoción privada", campaignName: "Campaña privada", dateFrom: "01/12/2023", dateTo: "31/12/2023" }] });
  const text = buildPromotionSearchResponse([{ name: "search_promotions", result }]);
  assert.match(text, /6 coincidencias/);
  assert.match(text, /siguiente página/);
  assert.ok(!text.includes("Campaña privada"));
  assert.match(text, /01\/12\/2023/);
});
