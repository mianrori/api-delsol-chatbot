import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVehicleRegistrationArgs, getVehicleRegistrations } from "../src/services/vehicles/vehicleRegistrations.service.js";
import { getMemberVehicles } from "../src/services/members/memberVehicle.service.js";
import { buildVehicleResponse, resolveVehiclePage } from "../src/services/ai/vehiclePresentation.service.js";
import { protectPiiText, protectPiiDeep, restorePiiDeep } from "../src/services/ai/pii.service.js";
import { runWithRequestSignal } from "../src/services/requestContext.service.js";
const range = { dateFrom: "01/01/2023", dateTo: "31/05/2023" };
const connectionFor = (rows) => {
  const queries = [];
  return { queries, execute: async (sql, binds) => { queries.push({ sql, binds }); return { rows: typeof rows === "function" ? rows(sql, binds) : rows }; } };
};
const present = (result) => buildVehicleResponse([{ name: "get_vehicle_registrations", result }]);

test("relative registration periods resolve calendar boundaries and Monday weeks", () => {
  const today = new Date("2024-03-01T00:00:00Z");
  const cases = { today: ["01/03/2024", "01/03/2024"], yesterday: ["29/02/2024", "29/02/2024"], thisWeek: ["26/02/2024", "01/03/2024"], thisMonth: ["01/03/2024", "01/03/2024"], thisYear: ["01/01/2024", "01/03/2024"] };
  for (const [relativePeriod, dates] of Object.entries(cases)) {
    const result = normalizeVehicleRegistrationArgs({ relativePeriod }, today);
    assert.deepEqual([result.dateFrom, result.dateTo], dates);
  }
  const sunday = normalizeVehicleRegistrationArgs({ relativePeriod: "thisWeek" }, new Date("2024-03-03T00:00:00Z"));
  assert.equal(sunday.dateFrom, "26/02/2024");
});

test("relative defaults use Paraguay calendar and do not depend on container timezone", () => {
  const result = normalizeVehicleRegistrationArgs({ relativePeriod: "today" });
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  assert.equal(result.dateFrom, `${parts.day}/${parts.month}/${parts.year}`);
});

test("invalid dates, conflicting periods, demographic filters and pagination cannot broaden a query", async () => {
  const invalid = [{ relativePeriod: "today" }, { dateFrom: "31/02/2023" }, { dateTo: "01/01/2022" }, { dateFrom: "" }, { groupBy: ["__proto__"] }, { groupBy: "gender" }, { gender: "GUESS" }, { ageMin: -1 }, { ageMax: 121 }, { ageMin: 40, ageMax: 20 }, { ageReference: "other" }, { referenceDate: "31/02/2023" }, { page: 0 }, { page: 1.5 }, { rows: 101 }, { active: "S" }, { active: false }, { brand: " " }, { mode: "other" }, { groupBy: ["age", "ageRange"] }];
  for (const args of invalid) await assert.rejects(getVehicleRegistrations({ ...range, ...args }, { execute: () => assert.fail("Invalid input queried Oracle") }));
  await assert.rejects(getVehicleRegistrations({}, {}), /período/);
});

test("counts use registration dates, inclusive end, normalized distinct plates and bound filters", async () => {
  const connection = connectionFor([{ VEHICLE_COUNT: 8, PLATE_COUNT: 6, MEMBER_COUNT: 4 }]);
  const result = await getVehicleRegistrations({ ...range, brand: "Marca' OR 1=1", active: true, automaticDebit: true }, connection);
  const { sql, binds } = connection.queries[0];
  assert.match(sql, /V.FECHA_ALTA >= TO_DATE\(:dateFrom/);
  assert.match(sql, /V.FECHA_ALTA < TO_DATE\(:dateTo, 'DD\/MM\/YYYY'\) \+ 1/);
  assert.match(sql, /COUNT\(DISTINCT UPPER\(TRIM\(MATRICULA\)\)\)/);
  assert.doesNotMatch(sql, /VW_BOT_SOCIOS|OR 1=1/);
  assert.equal(binds.brand, "MARCA' OR 1=1");
  assert.equal(binds.active, "S");
  assert.match(sql, /V\.ACTIVO = :active/); assert.equal(binds.automaticDebit, "S");
  assert.deepEqual(result.totals, { vehicleCount: 8, plateCount: 6, memberCount: 4 });
  assert.match(present(result), /Registros: \*\*8\*\*/);
});

test("demographic segmentation retains unknown members and calculates independent global counts", async () => {
  const connection = connectionFor([
    { GENDER: "M", AGE_RANGE: "30-39", VEHICLE_COUNT: 3, PLATE_COUNT: 2, MEMBER_COUNT: 1, TOTAL_VEHICLE_COUNT: 5, TOTAL_PLATE_COUNT: 3, TOTAL_MEMBER_COUNT: 2 },
    { GENDER: "Sin datos", AGE_RANGE: "Sin datos", VEHICLE_COUNT: 2, PLATE_COUNT: 2, MEMBER_COUNT: 1, TOTAL_VEHICLE_COUNT: 5, TOTAL_PLATE_COUNT: 3, TOTAL_MEMBER_COUNT: 2 },
  ]);
  const result = await getVehicleRegistrations({ ...range, groupBy: ["gender", "ageRange"], referenceDate: "28/10/2026" }, connection);
  const { sql, binds } = connection.queries[0];
  assert.match(sql, /LEFT JOIN members S/);
  assert.match(sql, /COUNT\(DISTINCT GENERO\) = 1/);
  assert.match(sql, /FROM VW_BOT_SOCIOS GROUP BY COD_SOCIO/);
  assert.match(sql, /MONTHS_BETWEEN\(TO_DATE\(:referenceDate/);
  assert.equal(binds.referenceDate, "28/10/2026");
  assert.equal(result.totals.plateCount, 3); // The grouped distinct values add to 4, not 3.
  assert.match(present(result), /Sin datos/);
  assert.match(present(result), /Edad del socio al 28\/10\/2026/);
  assert.match(present(result), /no se suman entre grupos/);
});

test("age-at-registration filters use vehicle registration date and do not bind unused reference dates", async () => {
  const connection = connectionFor([]);
  await getVehicleRegistrations({ ...range, groupBy: ["age"], ageMin: 18, ageMax: 29, gender: "female", ageReference: "registration" }, connection);
  const { sql, binds } = connection.queries[0];
  assert.match(sql, /MONTHS_BETWEEN\(TRUNC\(V.FECHA_ALTA\), S.FECHA_NACIMIENTO\)/);
  assert.equal(binds.referenceDate, undefined);
  assert.equal(binds.gender, "F"); assert.equal(binds.ageMin, 18); assert.equal(binds.ageMax, 29);
  assert.match(sql, /AGE >= :ageMin AND AGE <= :ageMax/);
});

test("vehicle detail preserves totals for empty pages and maps unknown flags without inventing false", async () => {
  const connection = connectionFor([{ VEHICLE_COUNT: 3, PLATE_COUNT: 2, MEMBER_COUNT: 1, RN: null }]);
  const empty = await getVehicleRegistrations({ ...range, mode: "detail", page: 3, rows: 2 }, connection);
  assert.equal(connection.queries.length, 1);
  assert.match(connection.queries[0].sql, /LEFT JOIN ranked P/);
  assert.equal(empty.pagination.totalRows, 3); assert.equal(empty.pagination.returnedRows, 0);
  assert.equal(empty.pagination.hasMore, false);
  const result = await getVehicleRegistrations({ ...range, mode: "detail", rows: 1 }, connectionFor([{ VEHICLE_COUNT: 2, PLATE_COUNT: 2, MEMBER_COUNT: 1, RN: 1, MATRICULA: "ABC123", NOM_SOCIO: "Persona sintética", ACTIVO: null, DEBITO_AUTOMATICO: "N", REGISTRATION_DATE: "01/05/2023" }]));
  assert.equal(result.data[0].active, null); assert.equal(result.data[0].automaticDebit, false);
  assert.match(present(result), /Sin datos/);
  assert.match(present(result), /1 de 2 registros/);
});

test("vehicle paging freezes relative period and demographic reference and does not cross topics", async () => {
  const result = await getVehicleRegistrations({ relativePeriod: "today", mode: "detail", groupBy: ["ageRange"], ageMin: 18, rows: 1 }, connectionFor([{ VEHICLE_COUNT: 2, PLATE_COUNT: 2, MEMBER_COUNT: 2, RN: 1 }]));
  const history = [{ role: "user", content: [{ text: "Registros de hoy" }] }, { role: "assistant", content: [{ toolUse: { name: "get_vehicle_registrations", toolUseId: "v", input: { relativePeriod: "today" } } }] }, { role: "user", content: [{ toolResult: { toolUseId: "v", status: "success", content: [{ json: result }] } }] }];
  const followup = resolveVehiclePage({ message: "Siguiente página", history });
  assert.equal(followup.input.relativePeriod, undefined);
  assert.equal(followup.input.dateFrom, result.queryContext.dateFrom);
  assert.equal(followup.input.referenceDate, result.queryContext.referenceDate);
  assert.equal(followup.input.ageMin, 18); assert.equal(followup.input.rows, 1); assert.equal(followup.input.page, 2);
  assert.doesNotThrow(() => normalizeVehicleRegistrationArgs(followup.input));
  assert.equal(resolveVehiclePage({ message: "Ver más", history: [...history, { role: "user", content: [{ text: "Ventas de enero" }] }] }), null);
});

test("plate queries preserve multiple registered members instead of choosing one owner", async () => {
  const connection = connectionFor([
    { COD_SOCIO: "1234567", NOM_SOCIO: "Persona A", MATRICULA: "ABC123", ACTIVO: "S" },
    { COD_SOCIO: "7654321", NOM_SOCIO: "Persona B", MATRICULA: "ABC123", ACTIVO: "S" },
  ]);
  const result = await getMemberVehicles({ plate: "abc123" }, connection);
  assert.equal(connection.queries.length, 1);
  assert.equal(result.status, "AMBIGUOUS"); assert.equal(result.registrations.length, 2);
  const answer = buildVehicleResponse([{ name: "get_member_vehicles", result }]);
  assert.match(answer, /Persona A/); assert.match(answer, /Persona B/);
  assert.match(answer, /más de un socio/);
  assert.equal(connection.queries[0].binds.plate, "ABC123");
});

test("vehicle identities stay protected and registered-owner response omits unrelated personal fields", () => {
  const session = "vehicle-pii";
  for (const word of ["chapa", "matrícula", "vehículo"]) {
    const input = `¿De quién es la ${word} ABC123?`;
    assert.match(protectPiiText(session, input), /\[PII_PLATE_\d+\]/);
  }
  assert.equal(protectPiiText(session, "Vehículo registrado hoy"), "Vehículo registrado hoy");
  const result = { status: "FOUND", owner: { fullName: "Persona sintética", documentNumber: "1234567", email: "private@example.test" }, vehicle: { plate: "ABC123", status: "Activo" } };
  const protectedResult = protectPiiDeep(session, result);
  const answer = buildVehicleResponse([{ name: "get_member_vehicles", result: protectedResult }]);
  assert.doesNotMatch(answer, /Persona sintética|1234567|ABC123|private@example/);
  assert.match(answer, /\[PII_NAME_\d+\]/);
  assert.deepEqual(restorePiiDeep(session, protectedResult), result);
});

test("registration queries honor request cancellation before Oracle work", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runWithRequestSignal(controller.signal, () => getVehicleRegistrations(range, { execute: () => assert.fail("Cancelled request queried Oracle") })));
});


test("logical deletions are excluded in every registration mode, grouping and plate lookup", async () => {
  for (const args of [{}, { mode: "detail" }, { groupBy: ["gender", "ageRange"] }, { groupBy: ["month"] }]) {
    const connection = connectionFor([]);
    await getVehicleRegistrations({ ...range, ...args }, connection);
    assert.match(connection.queries[0].sql, /V\.ACTIVO = :active/);
    assert.equal(connection.queries[0].binds.active, "S");
  }
  for (const filter of [{ plate: "ABC123" }, { documentNumber: "1234567", activeOnly: false }]) {
    const connection = connectionFor([]);
    await getMemberVehicles(filter, connection);
    assert.match(connection.queries[0].sql, /ACTIVO = :active/);
    assert.equal(connection.queries[0].binds.active, "S");
  }
});


test("plate whitespace is removed before lookup and split plates remain protected from the model", async () => {
  const session = "vehicle-spaced-plate";
  for (const plate of ["abc 123", "  abc   123  ", "a b c 1 2 3", "ABC\t123", "ABC\u00a0123", "abcd 123"]) {
    const connection = connectionFor([]);
    await getMemberVehicles({ plate }, connection);
    assert.equal(connection.queries[0].binds.plate, plate.replace(/\s+/g, "").toUpperCase());
    assert.equal(connection.queries[0].binds.active, "S");
    for (const word of ["chapa", "matrícula", "vehículo"]) {
      const input = `De quién es la ${word} ${plate.trim()}?`;
      const protectedText = protectPiiText(session, input);
      assert.match(protectedText, /\[PII_PLATE_\d+\]/);
      assert.ok(!protectedText.includes(plate.trim()));
      assert.equal(restorePiiDeep(session, { text: protectedText }).text, input);
      assert.equal(protectPiiText(session, protectedText), protectedText);
    }
  }
  const input = "Chapa abc 123 registrada en 2023";
  assert.match(protectPiiText(session, input), /\[PII_PLATE_\d+\] registrada en 2023$/);
  await assert.rejects(getMemberVehicles({ plate: "   " }, { execute: () => assert.fail("Empty plate queried Oracle") }), /vacía/);
});
