import test from "node:test";
import assert from "node:assert/strict";
import { getSolesUsage } from "../src/services/soles/solesUsage.service.js";
import { searchSolesUsageDestinations } from "../src/services/soles/solesUsageDestination.resolver.js";
import { searchSolesUsageMovementTypes } from "../src/services/soles/solesUsageMovementType.resolver.js";
import { buildSolesUsageResponse, resolveSolesUsagePage } from "../src/services/ai/solesUsagePresentation.service.js";
import { protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";

const dates = { dateFrom: "01/01/2023", dateTo: "31/05/2023" };
const connectionFor = (callback) => {
  const queries = [];
  return { queries, execute: async (sql, binds) => { queries.push({ sql, binds }); return { rows: await callback(sql, binds, queries.length) }; }, break: async () => {} };
};
const present = (result) => buildSolesUsageResponse([{ name: "get_soles_usage", result }]);
const typeRow = (id, amount, total = 2) => ({ SOLES_TYPE_ID: id, SOLES_TYPE_DESCRIPTION: `Tipo ${id}`, TOTAL_SOLES_USED: amount, MOVEMENT_COUNT: 1, TOTAL_GROUPS: total });

test("summary preserves soles types and signed amounts without turning use into balance or currency", async () => {
  const connection = connectionFor(() => [typeRow(1, 20), typeRow(2, -5)]);
  const result = await getSolesUsage({ ...dates, documentNumber: "1234567" }, connection);
  assert.deepEqual(result.groupBy, ["solesType"]);
  assert.equal(result.data[1].totalSolesUsed, -5);
  assert.equal(result.summary.totalGroups, 2);
  assert.match(connection.queries[0].sql, /GROUP BY/);
  assert.equal(connection.queries[0].binds.documentNumber, "1234567");
  assert.match(present(result), /Tipo 2 \\?\| -5/);
  assert.ok(!present(result).includes("₲"));
  assert.match(present(result), /no representan el saldo vigente/);
});

test("destination type and code remain paired, and all date/category/type filters are bound", async () => {
  const connection = connectionFor(() => []);
  await getSolesUsage({ ...dates, movementTypes: ["MOVIMIENTO REAL"], destinationTypes: ["LOCAL", "SOCIO"],
    destinations: [{ destinationType: "LOCAL", destinationCode: "42" }, { destinationType: "SOCIO", destinationCode: "42" }],
    solesTypeIds: [10], categoryIds: ["R'1"], transactionNumber: "12345678901234567890", solesMin: -5, solesMax: 100,
  }, connection);
  const { sql, binds } = connection.queries[0];
  assert.match(sql, /TIPO_DESTINO = :destinationType0 AND COD_DESTINO = :destinationCode0/);
  assert.equal(binds.destinationType0, "LOCAL");
  assert.equal(binds.destinationType1, "SOCIO");
  assert.equal(binds.destinationCode0, "42");
  assert.equal(binds.transactionNumber, "12345678901234567890");
  assert.equal(binds.dateTo, "31/05/2023");
  assert.ok(!sql.includes("R'1"));
  assert.equal(binds.categoryId0, "R'1");
});

test("invalid filters, missing destination components, dates and dimensions cannot silently broaden the query", async () => {
  for (const invalid of [
    { dateFrom: "31/02/2023" }, { dateFrom: "01/06/2023" }, { dateFrom: "" }, { mode: "other" },
    { groupBy: ["__proto__"] }, { metrics: ["DROP"] }, { movementTypes: "PAGO" }, { destinationTypes: ["GUESS"] },
    { destinations: [{ destinationType: "SOCIO" }] }, { solesTypeIds: ["invalid"] }, { transactionNumber: "1 OR 1=1" },
    { documentNumber: " " }, { limit: 0 }, { pageSize: 201 }, { page: 1.2 }, { orderBy: "DROP" }, { orderDirection: "sideways" },
    { solesMin: 10, solesMax: 1 },
  ]) await assert.rejects(getSolesUsage({ ...dates, ...invalid }, { execute: () => assert.fail("Invalid filters must not query") }));
});

test("rankings select distinct members before retrieving their complete breakdown by type", async () => {
  const connection = connectionFor((_sql, binds, query) => query === 1
    ? [{ MEMBER_DOCUMENT_NUMBER: "1234567", MEMBER_NAME: "Persona sintética", TOTAL_SOLES_USED: 27, TOTAL_GROUPS: 3 }]
    : [typeRow(1, 20), typeRow(2, 7)]);
  const result = await getSolesUsage({ ...dates, groupBy: ["member"], orderBy: "totalSolesUsed", limit: 1 }, connection);
  assert.equal(connection.queries.length, 2);
  assert.equal(connection.queries[0].binds.resultLimit, 1);
  assert.equal(connection.queries[1].binds.documentNumber, "1234567");
  assert.equal(connection.queries[1].binds.resultLimit, undefined);
  assert.equal(result.rankingBy, "member");
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].solesTypes.length, 2);
  assert.equal(result.summary.totalMembers, 3);
  assert.match(present(result), /1 de 3 socios/);
  assert.match(present(result), /Tipo 2/);
});

test("summary ordering includes its metric in the select and limits only complete grouped results", async () => {
  const connection = connectionFor(() => [{ ...typeRow(1, 20, 5), AVERAGE_SOLES_USED: 10 }]);
  const result = await getSolesUsage({ ...dates, metrics: ["movementCount"], orderBy: "averageSolesUsed", limit: 1 }, connection);
  assert.match(connection.queries[0].sql, /AVG\(SOLES_UTILIZADOS\)/);
  assert.match(connection.queries[0].sql, /ORDER BY AVERAGE_SOLES_USED DESC/);
  assert.match(connection.queries[0].sql, /ROWNUM <= :resultLimit/);
  assert.equal(result.summary.totalGroups, 5);
  assert.equal(result.summary.hasMore, true);
});

test("detail pagination includes exact totals and preserves empty-page metadata", async () => {
  const row = { RN: 2, TOTAL_ROWS: 2, COD_SOCIO: "1234567", NOM_SOCIO: "Persona sintética", ID_TIPO_SOL: 10, DES_TIPO_SOL: "Soles de prueba", SOLES_UTILIZADOS: -5, TIPO_MOVIMIENTO: "MOVIMIENTO REAL", DESTINO: "Destino sintético", TIPO_DESTINO: "SOCIO", COD_DESTINO: "42" };
  const connection = connectionFor(() => [row]);
  const result = await getSolesUsage({ ...dates, mode: "detail", page: 2, pageSize: 1 }, connection);
  assert.equal(result.pagination.totalRows, 2);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.hasMore, false);
  assert.equal(result.data[0].solesUsed, -5);
  const empty = await getSolesUsage({ ...dates, mode: "detail", page: 3, pageSize: 1 }, connectionFor(() => [{ TOTAL_ROWS: 2, RN: null }]));
  assert.equal(empty.data.length, 0);
  assert.equal(empty.pagination.totalRows, 2);
});

test("lookup does not confuse LOCAL/SOCIO destinations or resolve a truncated candidate set as unique", async () => {
  const destination = await searchSolesUsageDestinations({ search: "Destino", limit: 1 }, connectionFor(() => [{ DESTINATION_NAME: "Destino", DESTINATION_TYPE: "SOCIO", DESTINATION_CODE: "42", TOTAL_MATCHES: 2 }]));
  assert.equal(destination.status, "AMBIGUOUS");
  assert.equal(destination.totalMatches, 2);
  assert.equal(destination.hasMore, true);
  const full = await searchSolesUsageDestinations({ search: "Destino" }, connectionFor(() => [
    { DESTINATION_NAME: "Destino", DESTINATION_TYPE: "SOCIO", DESTINATION_CODE: "42", TOTAL_MATCHES: 2 },
    { DESTINATION_NAME: "Destino", DESTINATION_TYPE: "LOCAL", DESTINATION_CODE: "42", TOTAL_MATCHES: 2 },
  ]));
  assert.equal(full.options.length, 2);
  assert.notEqual(full.options[0].destinationType, full.options[1].destinationType);
  const movement = await searchSolesUsageMovementTypes({ search: "Pago" }, connectionFor(() => [{ MOVEMENT_TYPE: "PAGO REAL", TOTAL_MATCHES: 1 }]));
  assert.equal(movement.status, "RESOLVED");
  assert.equal(movement.movementType, "PAGO REAL");
});

test("usage identities and destination names are protected, while amounts and signs remain unchanged", async () => {
  const result = await getSolesUsage({ ...dates, mode: "detail" }, connectionFor(() => [{ RN: 1, TOTAL_ROWS: 1, COD_SOCIO: "1234567", NOM_SOCIO: "Persona sintética", DES_TIPO_SOL: "Tipo privado", ID_TIPO_SOL: 10, SOLES_UTILIZADOS: -5, DESTINO: "Destino privado", COD_DESTINO: "secret-42", TIPO_DESTINO: "SOCIO", TIPO_MOVIMIENTO: "MOVIMIENTO PRIVADO", NRO_TRANSACCION: "TX-PRIVATE" }]));
  const protectedResult = protectPiiDeep("usage-pii", result, null, ["get_soles_usage"]);
  for (const value of ["1234567", "Persona sintética", "Tipo privado", "Destino privado", "secret-42", "MOVIMIENTO PRIVADO", "TX-PRIVATE"]) assert.ok(!JSON.stringify(protectedResult).includes(value));
  assert.equal(protectedResult.data[0].solesUsed, -5);
  assert.equal(restorePiiDeep("usage-pii", protectedResult).data[0].destinationName, "Destino privado");
});

test("usage page follow-up retains every protected filter and does not cross unrelated topics", () => {
  const input = { mode: "detail", documentNumber: "[PII_DOCUMENT_1]", ...dates, movementTypes: ["[PII_MOVEMENT_TYPE_1]"], destinations: [{ destinationType: "SOCIO", destinationCode: "[PII_DESTINATION_CODE_1]" }] };
  const history = [
    { role: "user", content: [{ text: "Detalle de uso de soles" }] },
    { role: "assistant", content: [{ toolUse: { name: "get_soles_usage", toolUseId: "usage", input } }] },
    { role: "user", content: [{ toolResult: { toolUseId: "usage", status: "success", content: [{ json: { mode: "detail", pagination: { hasMore: true, nextPage: 2, pageSize: 5 } } }] } }] },
    { role: "assistant", content: [{ text: "Página 1" }] },
  ];
  assert.deepEqual(resolveSolesUsagePage({ message: "Siguiente", history }), { toolName: "get_soles_usage", input: { ...input, page: 2, pageSize: 5 } });
  assert.equal(input.page, undefined);
  assert.equal(resolveSolesUsagePage({ message: "Ver más", history: [...history, { role: "user", content: [{ text: "Saldo de soles" }] }] }), null);
});

test("cancellation between ranking and member breakdown stops the remaining queries", async () => {
  const cancellation = new AbortController();
  const connection = connectionFor(() => { cancellation.abort(); return []; });
  await assert.rejects(runWithRequestSignal(cancellation.signal, () => getSolesUsage({ ...dates, groupBy: ["member"], limit: 1 }, connection)), { code: "REQUEST_ABORTED" });
  assert.equal(connection.queries.length, 1);
});

test("movement type listing accepts empty or omitted search and preserves the complete catalog", async () => {
  for (const search of [undefined, "", "  "]) {
    const connection = connectionFor(() => [
      { MOVEMENT_TYPE: "MOVIMIENTO A", TOTAL_MATCHES: 2 },
      { MOVEMENT_TYPE: "MOVIMIENTO B", TOTAL_MATCHES: 2 },
    ]);
    const result = await searchSolesUsageMovementTypes({ search }, connection);
    assert.equal(result.status, "LISTED");
    assert.equal(result.totalMatches, 2);
    assert.equal(result.hasMore, false);
    assert.equal(connection.queries[0].binds.search, null);
    assert.match(connection.queries[0].sql, /:search IS NULL OR INSTR/);
    const answer = buildSolesUsageResponse([{ name: "search_soles_usage_movement_types", result }]);
    assert.match(answer, /MOVIMIENTO A/);
    assert.match(answer, /MOVIMIENTO B/);
    assert.doesNotMatch(answer, /Indica cuál/);
  }
  const limited = await searchSolesUsageMovementTypes({}, connectionFor(() => [{ MOVEMENT_TYPE: "A", TOTAL_MATCHES: 30 }]));
  assert.equal(limited.hasMore, true);
  assert.match(buildSolesUsageResponse([{ name: "search_soles_usage_movement_types", result: limited }]), /1 de 30/);
});

test("destination lookup presentation shows choices and names without internal codes", () => {
  for (const status of ["RESOLVED", "AMBIGUOUS"]) {
    const row = { destinationType: "LOCAL", destinationCode: "INTERNAL-SECRET", name: "Local sintético" };
    const result = { status, ...row, options: [row, { ...row, destinationType: "SOCIO" }] };
    const answer = buildSolesUsageResponse([{ name: "search_soles_usage_destinations", result }]);
    assert.match(answer, /LOCAL/);
    assert.match(answer, /Local sintético/);
    assert.doesNotMatch(answer, /INTERNAL-SECRET|Código/);
    if (status === "AMBIGUOUS") assert.match(answer, /SOCIO/);
    assert.equal(buildSolesUsageResponse([{ name: "search_members", result }, { name: "search_soles_usage_destinations", result }]), null);
  }
});
