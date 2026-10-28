import test from "node:test";
import assert from "node:assert/strict";
import { getMemberSoles, getSolesGenerationPeriodStart } from "../src/services/soles/memberSoles.service.js";
import { searchSolesTypes } from "../src/services/soles/searchSolesTypes.service.js";
import { buildMemberSolesResponse, resolveMemberSolesPage } from "../src/services/ai/memberSolesPresentation.service.js";
import { protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";

const basic = { documentNumber: "1234567", referenceDate: "28/10/2026" };
const summarize = (result) => buildMemberSolesResponse([{ name: "get_member_soles", result }]);
const connectionFor = (callback) => {
  const queries = [];
  return { queries, execute: async (sql, binds) => { queries.push({ sql, binds }); return { rows: await callback(sql, binds) }; }, break: async () => {} };
};

test("current soles default to type and expiration-date summary with explicit total from Oracle", async () => {
  const connection = connectionFor((sql) => sql.includes("GROUP BY") ? [
    { TYPE_ID: 5, TYPE_DESCRIPTION: "Soles de prueba", EXPIRATION_DATE: "31/10/2026", GENERATED_AMOUNT: 50, BALANCE: 20, RECORD_COUNT: 1, MEMBER_NAME: "Persona sintética" },
    { TYPE_ID: 5, TYPE_DESCRIPTION: "Soles de prueba", EXPIRATION_DATE: null, GENERATED_AMOUNT: 10, BALANCE: 10, RECORD_COUNT: 1, MEMBER_NAME: "Persona sintética" },
  ] : [{ BALANCE: 30, RECORD_COUNT: 2, MEMBER_NAME: "Persona sintética" }]);
  const result = await getMemberSoles(basic, connection);
  assert.equal(connection.queries.length, 2);
  assert.deepEqual(result.queryContext.groupBy, ["type", "expirationDate"]);
  assert.equal(result.summary.currentBalance, 30);
  assert.equal(result.data.length, 2);
  for (const { sql, binds } of connection.queries) {
    assert.match(sql, /VENCIMIENTO IS NULL/);
    assert.match(sql, /VENCIMIENTO >= TO_DATE\(:referenceDate/);
    assert.equal(binds.documentNumber, "1234567");
  }
  const text = summarize(result);
  assert.match(text, /30 soles/);
  assert.match(text, /Sin vencimiento/);
  assert.ok(!text.includes("₲"));
  assert.ok(!text.includes("PYG"));
});

test("expired soles use the November generation boundary and allow explicit full history", async () => {
  for (const [referenceDate, expected] of [["31/10/2026", "01/11/2025"], ["01/11/2026", "01/11/2026"], ["01/01/2026", "01/11/2025"]]) {
    const connection = connectionFor(() => [{ BALANCE: 7, RECORD_COUNT: 1 }]);
    const result = await getMemberSoles({ ...basic, referenceDate, status: "expired" }, connection);
    assert.equal(connection.queries[0].binds.generationDateFrom, expected);
    assert.equal(connection.queries[0].binds.generationDateTo, referenceDate);
    assert.match(connection.queries[0].sql, /VENCIMIENTO < TO_DATE\(:referenceDate/);
    assert.equal(result.queryContext.generationPeriod.currentPeriodApplied, true);
  }
  const all = connectionFor(() => []);
  await getMemberSoles({ ...basic, status: "expired", useCurrentGenerationPeriod: false }, all);
  assert.equal(all.queries[0].binds.generationDateFrom, undefined);
  const explicit = connectionFor(() => []);
  await getMemberSoles({ ...basic, status: "expired", generationDateFrom: "01/01/2023", generationDateTo: "31/05/2023" }, explicit);
  assert.equal(explicit.queries[0].binds.generationDateFrom, "01/01/2023");
  assert.equal(getSolesGenerationPeriodStart(new Date(Date.UTC(2026, 10, 1))).toISOString().slice(0,10), "2026-11-01");
});

test("all status and explicit generation/expiration filters are bound without silently adding current dates", async () => {
  const connection = connectionFor(() => []);
  const result = await getMemberSoles({ ...basic, status: "all", mode: "summary", groupBy: ["month"], typeIds: [1, 2],
    generationDateFrom: "01/01/2023", generationDateTo: "31/05/2023", expirationDateFrom: "01/06/2023", expirationDateTo: "31/12/2023" }, connection);
  const { sql, binds } = connection.queries[0];
  assert.ok(!sql.includes(":referenceDate"));
  assert.equal(binds.generationDateFrom, "01/01/2023");
  assert.equal(binds.expirationDateTo, "31/12/2023");
  assert.ok(Object.values(binds).includes(1));
  assert.deepEqual(result.data, []);
  assert.match(summarize(result), /No se encontraron registros/);
});

test("detail pagination preserves total count even for empty pages and does not invent missing results", async () => {
  const connection = connectionFor(() => [{ TOTAL_ROWS: 21, COD_SOCIO: "1234567", NOM_SOCIO: "Persona sintética", COD_TIPO_SOL: 1, DES_TIPO_SOL: "Soles de prueba", TOTAL: 10, SALDO: 3, FECHA_ALTA: "01/01/2023", VENCIMIENTO: "31/12/2023" }]);
  const result = await getMemberSoles({ ...basic, status: "all", mode: "detail", page: 2, rows: 20 }, connection);
  assert.equal(result.totalRows, 21);
  assert.equal(result.startRow, 21);
  assert.equal(result.endRow, 21);
  assert.equal(result.totalPages, 2);
  assert.equal(result.hasMore, false);
  assert.equal(result.data[0].balance, 3);
  assert.equal(connection.queries[0].binds.offset, 20);
  const empty = await getMemberSoles({ ...basic, mode: "detail", page: 3 }, connectionFor(() => [{ TOTAL_ROWS: 21, COD_SOCIO: null }]));
  assert.deepEqual(empty.data, []);
  assert.equal(empty.totalRows, 21);
  assert.equal(empty.startRow, null);
});

test("invalid filters, dates and paging are rejected before a query", async () => {
  for (const invalid of [{ documentNumber: " " }, { referenceDate: "" }, { referenceDate: "31/02/2023" }, { status: "other" }, { mode: "other" },
    { typeIds: ["5 OR 1=1"] }, { groupBy: ["unsupported"] }, { page: 1.5 }, { rows: 101 }, { useCurrentGenerationPeriod: "false" },
    { generationDateFrom: "02/01/2023", generationDateTo: "01/01/2023" }, { expirationDateFrom: "31/02/2023" }]) {
    await assert.rejects(getMemberSoles({ ...basic, ...invalid }, { execute: () => assert.fail("No query expected") }));
  }
});

test("soles types resolve aliases and real IDs, and all ambiguous matches remain available", async () => {
  const connection = connectionFor(() => [{ COD_TIPO_SOL: 901, DESCRIPCION: "SOLES" }, { COD_TIPO_SOL: 902, DESCRIPCION: "SOLES OBSEQUIO" }]);
  const result = await searchSolesTypes({ query: "Soles normales" }, connection);
  assert.equal(result.status, "RESOLVED");
  assert.equal(result.typeId, 901);
  assert.equal(connection.queries[0].binds.query, "SOLES");
  assert.ok(!connection.queries[0].sql.includes("ROWNUM"));
  const ambiguous = await searchSolesTypes({ query: "Obse" }, connectionFor(() => Array.from({ length: 12 }, (_, id) => ({ COD_TIPO_SOL: id + 1, DESCRIPCION: `Obsequio ${id}` }))));
  assert.equal(ambiguous.status, "AMBIGUOUS");
  assert.equal(ambiguous.options.length, 12);
  const missing = await searchSolesTypes({ query: "ZZZZZZZZ" }, connectionFor(() => []));
  assert.equal(missing.status, "NOT_FOUND");
});

test("cancellation between grouped summary and total query stops without producing a partial response", async () => {
  const cancellation = new AbortController();
  const connection = connectionFor(() => { cancellation.abort(); return []; });
  await assert.rejects(runWithRequestSignal(cancellation.signal, () => getMemberSoles(basic, connection)), { code: "REQUEST_ABORTED" });
  assert.equal(connection.queries.length, 1);
});

test("member and type identities stay protected while balances remain exact", async () => {
  const result = await getMemberSoles({ ...basic, mode: "detail", status: "all" }, connectionFor(() => [{ TOTAL_ROWS: 1, COD_SOCIO: "1234567", NOM_SOCIO: "Persona sintética", COD_TIPO_SOL: 10, DES_TIPO_SOL: "Tipo privado", TOTAL: 10, SALDO: 3, NRO_TRANSACCION: "TX-PRIVATE" }]));
  const protectedResult = protectPiiDeep("soles-pii", result, null, ["get_member_soles"]);
  const json = JSON.stringify(protectedResult);
  assert.ok(!json.includes("1234567"));
  assert.ok(!json.includes("Persona sintética"));
  assert.ok(!json.includes("Tipo privado"));
  assert.ok(!json.includes("TX-PRIVATE"));
  assert.equal(protectedResult.data[0].balance, 3);
  assert.equal(restorePiiDeep("soles-pii", protectedResult).documentNumber, "1234567");
  assert.ok(!summarize(protectedResult).includes(protectedResult.data[0].type.typeId));
  const type = protectPiiDeep("soles-type-pii", { status: "RESOLVED", typeId: 10, description: "Tipo privado" }, null, ["search_soles_types"]);
  assert.match(type.description, /^\[PII_SOLES_TYPE_NAME_/);
});

test("detail next-page requests preserve protected document, type, dates and all filters", () => {
  const input = { documentNumber: "[PII_DOCUMENT_1]", typeIds: ["[PII_SOLES_TYPE_ID_1]"], mode: "detail", status: "all", rows: 20, generationDateFrom: "01/01/2023" };
  const result = { queryContext: { mode: "detail", referenceDate: "28/10/2026" }, hasMore: true, nextPage: 2, rows: 20 };
  const history = [
    { role: "user", content: [{ text: "Detalle de soles" }] },
    { role: "assistant", content: [{ toolUse: { name: "get_member_soles", toolUseId: "soles", input } }] },
    { role: "user", content: [{ toolResult: { toolUseId: "soles", status: "success", content: [{ json: result }] } }] },
    { role: "assistant", content: [{ text: "Detalle" }] },
  ];
  assert.deepEqual(resolveMemberSolesPage({ message: "Siguiente", history }), { input: { ...input, page: 2, referenceDate: "28/10/2026" } });
  assert.equal(input.page, undefined);
  assert.equal(resolveMemberSolesPage({ message: "Ver más", history: [...history, { role: "user", content: [{ text: "Hola" }] }] }), null);
});
