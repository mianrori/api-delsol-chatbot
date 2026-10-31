const clean = (value) => String(value ?? "").replace(/\*\*/g, "").replace(/[\u00a0\u202f]/g, " ").trim();
const normalize = (value) => clean(value).normalize("NFC").toLowerCase().replace(/\s+/g, " ");
const number = (value) => /^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(clean(value))
  ? Number(clean(value).replace(/\./g, "").replace(",", ".")) : null;
const date = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  if (!match) return null;
  const [, d, m, y] = match, parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return parsed.getUTCFullYear() === Number(y) && parsed.getUTCMonth() === Number(m) - 1 && parsed.getUTCDate() === Number(d) ? parsed.getTime() : null;
};
const movementDay = (value) => {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value ?? "");
  return date(iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value?.slice(0, 10));
};
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
const table = (text) => {
  const rows = String(text).split("\n").filter((line) => /^\s*\|/.test(line))
    .map((line) => line.split(/(?<!\\)\|/).slice(1, -1).map((value) => clean(value).replace(/\\\|/g, "|")))
    .filter((row) => !row.every((value) => /^:?-+:?$/.test(value)));
  return { headers: rows[0] ?? [], rows: rows.slice(1) };
};
const sameTotals = (left, right, withCount = false) => left.size === right.size && [...left].every(([key, value]) =>
  right.has(key) && close(value.amount, right.get(key).amount) && (!withCount || value.count === right.get(key).count));
const add = (map, key, amount, count = 0) => {
  const previous = map.get(key) ?? { amount: 0, count: 0 };
  map.set(key, { amount: previous.amount + amount, count: previous.count + count });
};

export const readSolesConfig = (env, suite, fail) => {
  const documentNumber = env.BOT_TEST_MEMBER_DOCUMENT?.trim();
  if (suite !== "soles" && !(suite === "all" && documentNumber)) return null;
  if (!documentNumber) return fail("SOLES_MEMBER_DOCUMENT_REQUIRED");
  if (!/^[A-Za-z0-9][A-Za-z0-9. -]{2,29}$/.test(documentNumber)) return fail("INVALID_SOLES_MEMBER_DOCUMENT");
  const referenceDate = env.BOT_TEST_SOLES_REFERENCE_DATE || "30/06/2023";
  if (date(referenceDate) === null) return fail("INVALID_SOLES_REFERENCE_DATE");
  const dateFrom = env.BOT_TEST_SOLES_FROM || "01/01/2023", dateTo = env.BOT_TEST_SOLES_TO || "31/05/2023";
  if (date(dateFrom) === null || date(dateTo) === null || date(dateFrom) > date(dateTo)) return fail("INVALID_SOLES_USAGE_PERIOD");
  const pageSize = Number(env.BOT_TEST_SOLES_PAGE_SIZE || 5), maxPages = Number(env.BOT_TEST_SOLES_MAX_PAGES || 10);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) return fail("INVALID_SOLES_PAGINATION");
  return { documentNumber, referenceDate, dateFrom, dateTo, pageSize, maxPages };
};

// Personal names, amounts and the document remain in this closure only. The
// runner receives check codes and coverage booleans, never private values.
export const createSolesCases = ({ config, chat, check, progress, coverage }) => {
  let memberName, referenceDate, balances, usages;
  const common = (body) => {
    check(!body.actions?.chart && !body.actions?.salesExport, "SOLES_NO_STALE_ACTIONS");
    check(!/₲|\b(?:PYG|USD|PEN|guaran[ií]es|d[oó]lares)\b/i.test(body.response), "SOLES_ARE_LOYALTY_UNITS");
  };
  const balance = (body, expiration = false) => {
    common(body);
    check(!/No se encontraron registros de soles/.test(body.response), "SOLES_BALANCE_FIXTURE_REQUIRED");
    check(/Soles vigentes del programa de fidelización/.test(body.response), "SOLES_CURRENT_BALANCE");
    const name = /^Socio:\s*(.+)\.$/m.exec(clean(body.response))?.[1];
    const ref = /Fecha de referencia para la vigencia: (\d{2}\/\d{2}\/\d{4})\./.exec(body.response)?.[1];
    check(Boolean(name) && date(ref) !== null, "SOLES_MEMBER_AND_REFERENCE");
    check(ref === config.referenceDate, "SOLES_REQUESTED_REFERENCE_DATE");
    if (memberName) check(normalize(name) === normalize(memberName) && ref === referenceDate, "SOLES_MEMBER_AND_REFERENCE_PRESERVED");
    else { memberName = name; referenceDate = ref; }
    const parsed = table(body.response), expected = expiration ? ["Tipo", "Vencimiento", "Saldo de soles"] : ["Tipo", "Saldo de soles"];
    check(JSON.stringify(parsed.headers) === JSON.stringify(expected), "SOLES_BALANCE_COLUMNS");
    check(parsed.rows.length > 0, "SOLES_BALANCE_FIXTURE_REQUIRED");
    const totals = new Map();
    for (const row of parsed.rows) {
      const value = number(row.at(-1));
      check(row.length === expected.length && Boolean(row[0]) && value !== null && Number.isFinite(value) && value >= 0, "SOLES_NUMERIC_BALANCE_BY_TYPE");
      if (expiration) check(row[1] === "Sin vencimiento" || date(row[1]) !== null && date(row[1]) >= date(referenceDate), "SOLES_CURRENT_EXPIRATION_DATES");
      add(totals, normalize(row[0]), value);
    }
    check([...totals.values()].some((value) => value.amount > 0), "SOLES_POSITIVE_BALANCE_FIXTURE");
    if (expiration) check(sameTotals(balances, totals), "SOLES_EXPIRATION_MATCHES_TYPE_BALANCES");
    else check(/Detallar por vencimiento/.test(body.response), "SOLES_EXPIRATION_OFFER");
    return totals;
  };
  const usageCommon = (body) => {
    common(body);
    check(body.response.includes(`Período: ${config.dateFrom} a ${config.dateTo}.`), "SOLES_USAGE_PERIOD");
    check(/no representan el saldo vigente de soles/.test(body.response), "SOLES_USAGE_IS_NOT_BALANCE");
  };
  return [
    ["soles-balance-by-type", async () => { balances = balance(await chat(`Saldo de soles de ${config.documentNumber} con fecha de referencia ${config.referenceDate}`)); }],
    ["soles-by-expiration", async () => { balance(await chat("Detallar por vencimiento"), true); }],
    ["soles-usage-by-member-and-type", async () => {
      const body = await chat(`Soles utilizados del mismo socio entre ${config.dateFrom} y ${config.dateTo}, agrupados por tipo de soles y por socio, con cantidad de soles utilizados y cantidad de movimientos`);
      usageCommon(body);
      check(!/No se encontraron usos de soles/.test(body.response), "SOLES_USAGE_FIXTURE_REQUIRED");
      check(!/Se muestran \d+ de \d+ (?:grupos|socios)/.test(body.response), "SOLES_USAGE_SUMMARY_COMPLETE");
      const parsed = table(body.response), fields = ["Socio", "Tipo de soles", "Soles utilizados", "Movimientos"];
      check(parsed.headers.length === 4 && fields.every((field) => parsed.headers.includes(field)), "SOLES_USAGE_SUMMARY_COLUMNS");
      check(parsed.rows.length > 0, "SOLES_USAGE_FIXTURE_REQUIRED");
      const indices = Object.fromEntries(fields.map((field) => [field, parsed.headers.indexOf(field)]));
      usages = new Map();
      for (const row of parsed.rows) {
        const amount = number(row[indices["Soles utilizados"]]), count = number(row[indices.Movimientos]);
        check(row.length === 4 && normalize(row[indices.Socio]) === normalize(memberName), "SOLES_USAGE_MEMBER_PRESERVED");
        check(amount !== null && Number.isFinite(amount) && Number.isInteger(count) && count > 0 && Boolean(row[indices["Tipo de soles"]]), "SOLES_USAGE_SUMMARY_NUMERIC");
        add(usages, normalize(row[indices["Tipo de soles"]]), amount, count);
      }
    }],
    ["soles-usage-details-and-pages", async () => {
      const total = [...usages.values()].reduce((sum, row) => sum + row.count, 0), pages = Math.ceil(total / config.pageSize);
      check(pages <= config.maxPages, "SOLES_PAGE_LIMIT_CHOOSE_SMALLER_PERIOD");
      coverage("solesUsageMultiplePages", pages > 1);
      const detail = new Map();
      let hasMissingQuantities = false;
      for (let page = 1; page <= pages; page++) {
        progress(`Comprobando página ${page} de ${pages} de movimientos de soles...`);
        const message = page === 1 ? `Detalla los movimientos de soles utilizados del mismo socio entre ${config.dateFrom} y ${config.dateTo}, página 1 con ${config.pageSize} movimientos por página` : "Siguiente página";
        const body = await chat(message); usageCommon(body);
        check(body.response.includes(`Página ${page} de ${pages}; ${total} movimientos en total.`), "SOLES_USAGE_PAGINATION");
        const parsed = table(body.response), fields = ["Socio", "Fecha", "Tipo de soles", "Movimiento", "Tipo de destino", "Destino", "Soles utilizados"];
        check(JSON.stringify(parsed.headers) === JSON.stringify(fields), "SOLES_USAGE_DETAIL_COLUMNS");
        check(parsed.rows.length === Math.min(config.pageSize, total - (page - 1) * config.pageSize), "SOLES_USAGE_PAGE_ROW_COUNT");
        for (const row of parsed.rows) {
          const amount = number(row[6]), movementDate = movementDay(row[1]);
          check(row.length === fields.length && normalize(row[0]) === normalize(memberName), "SOLES_DETAIL_MEMBER_PRESERVED");
          const missing = row[6] === "—";
          check(Boolean(row[2]), "SOLES_USAGE_DETAIL_TYPE_PRESENT");
          check(missing || amount !== null && Number.isFinite(amount), "SOLES_USAGE_DETAIL_NUMERIC");
          hasMissingQuantities ||= missing;
          check(movementDate !== null && movementDate >= date(config.dateFrom) && movementDate <= date(config.dateTo), "SOLES_DETAIL_DATE_WITHIN_PERIOD");
          // COUNT(*) includes missing quantities; SUM(NVL(..., 0)) adds only
          // known quantities. Keep the display marker distinct from numeric zero.
          add(detail, normalize(row[2]), missing ? 0 : amount, 1);
        }
      }
      coverage("solesUsageMissingQuantities", hasMissingQuantities);
      check(sameTotals(usages, detail, true), "SOLES_USAGE_DETAIL_MATCHES_SUMMARY_BY_TYPE");
      const exhausted = await chat("Siguiente página"); common(exhausted);
      check(/^No hay más páginas de movimientos/.test(exhausted.response), "SOLES_USAGE_END_OF_PAGES");
    }],
    ["soles-return-to-balance", async () => {
      const current = balance(await chat(`Volvamos al saldo de soles de ${config.documentNumber} con fecha de referencia ${config.referenceDate}, por tipo de soles`));
      check(sameTotals(balances, current), "SOLES_BALANCE_PRESERVED_AFTER_USAGE");
    }],
  ];
};
