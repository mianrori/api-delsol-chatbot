const clean = (v) => String(v ?? "").replace(/\*\*/g, "").replace(/[\u00a0\u202f]/g, " ").trim();
const number = (v) => /^-?(?:\d+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?: \d{3})+)(?:,\d+)?$/.test(clean(v))
  ? Number(clean(v).replace(/[. ]/g, "").replace(",", ".")) : null;
const day = (v) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v ?? ""); if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2]-1, +m[1]));
  return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2]-1 && d.getUTCFullYear() === +m[3] ? +d : null;
};
const table = (text) => String(text).split("\n").filter((line) => /^\s*\|/.test(line))
  .map((line) => line.split(/(?<!\\)\|/).slice(1,-1).map(clean)).filter((r) => !r.every((v) => /^:?-+:?$/.test(v)));
export const readMemberPurchasesConfig = (env, suite, fail) => {
  if (suite !== "member-purchases") return null;
  const document = (env.BOT_TEST_PURCHASES_DOCUMENT || env.BOT_TEST_MEMBER_DOCUMENT)?.trim();
  if (!document || !/^[A-Za-z0-9][A-Za-z0-9. -]{2,29}$/.test(document)) return fail("MEMBER_PURCHASES_DOCUMENT_REQUIRED");
  const from = env.BOT_TEST_PURCHASES_FROM || "01/01/2023", to = env.BOT_TEST_PURCHASES_TO || "31/05/2023";
  if (day(from) === null || day(to) === null || day(from) > day(to)) return fail("INVALID_MEMBER_PURCHASES_PERIOD");
  const pageSize = Number(env.BOT_TEST_PURCHASES_PAGE_SIZE || 20), maxPages = Number(env.BOT_TEST_PURCHASES_MAX_PAGES || 20);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) return fail("INVALID_MEMBER_PURCHASES_PAGINATION");
  return { document, from, to, pageSize, maxPages };
};
export const createMemberPurchaseCases = ({ config: c, chat, check, coverage }) => {
  let total;
  const common = (body) => {
    check(!body.actions?.chart && !body.actions?.salesExport, "MEMBER_PURCHASES_NO_STALE_ACTIONS");
    check(clean(body.response).includes(`Documento: ${c.document}`), "MEMBER_PURCHASES_DOCUMENT_PRESERVED");
    check(body.response.includes(c.from) && body.response.includes(c.to), "MEMBER_PURCHASES_PERIOD_PRESERVED");
  };
  const format = (columns) => `Presenta una tabla con columnas exactas ${columns.join(", ")}. Incluye encabezados Documento: ${c.document} y Período: ${c.from} a ${c.to}. Usa PYG en Moneda y números en formato paraguayo sin símbolos dentro de los importes. Muestra todas las filas, sin muestra ni límite de grupos.`;
  const summary = async (question, dimension) => {
    const columns = [...(dimension ? [dimension] : []), "Moneda", "Importe", "Compras"];
    const body = await chat(`${question} ${format(columns)}`); common(body);
    const [header, ...rows] = table(body.response);
    check(JSON.stringify(header) === JSON.stringify(columns), "MEMBER_PURCHASES_SUMMARY_COLUMNS");
    check(rows.length > 0 && !/muestra parcial|se muestran \d+ de/i.test(body.response), "MEMBER_PURCHASES_COMPLETE_SUMMARY_REQUIRED");
    let amount = 0, count = 0; const keys = new Set();
    for (const row of rows) {
      const offset = dimension ? 1 : 0, a = number(row[offset+1]), n = number(row[offset+2]);
      check(row.length === columns.length && row[offset] === "PYG" && a !== null && Number.isInteger(n) && n > 0, "MEMBER_PURCHASES_NUMERIC_PYG");
      if (dimension) check(Boolean(row[0]), "MEMBER_PURCHASES_GROUP_LABEL");
      if (dimension === "Mes") row[0] = row[0].replace(/[\u2010\u2011]/g, "-");
      if (dimension === "Mes") { check(!keys.has(row[0]), "MEMBER_PURCHASES_UNIQUE_MONTHS"); keys.add(row[0]); }
      if (dimension === "Mes") {
        const m = /^(\d{4})-(\d{2})$/.exec(row[0]);
        check(Boolean(m) && +m[2] >= 1 && +m[2] <= 12 && row[0] >= c.from.split("/").reverse().join("-").slice(0,7) && row[0] <= c.to.split("/").reverse().join("-").slice(0,7), "MEMBER_PURCHASES_MONTHS_WITHIN_PERIOD");
      }
      amount += a; count += n;
    }
    if (!dimension) check(rows.length === 1, "MEMBER_PURCHASES_SINGLE_TOTAL");
    if (total) check(Math.abs(amount-total.amount) <= .011 && count === total.count, "MEMBER_PURCHASES_BREAKDOWN_MATCHES_TOTAL");
    return { amount, count };
  };
  return [
    ["member-purchases-total", async () => { total = await summary(`Compras del socio con documento ${c.document} entre ${c.from} y ${c.to}, importe total y cantidad de compras, sin filtros comerciales ni desglose.`, null); }],
    ["member-purchases-monthly", async () => { await summary("Ahora las compras del mismo socio por mes (Mes en formato YYYY-MM), conserva período e indicadores y sin filtros comerciales.", "Mes"); }],
    ["member-purchases-by-local", async () => { await summary("Ahora las compras del mismo socio por local, conserva período e indicadores y sin filtros comerciales.", "Local"); }],
    ["member-purchases-by-category", async () => { await summary("Ahora las compras del mismo socio por rubro, conserva período e indicadores y sin filtros comerciales.", "Rubro"); }],
    ["member-purchases-detail-pages", async () => {
      const pages = Math.ceil(total.count/c.pageSize);
      check(pages <= c.maxPages, "MEMBER_PURCHASES_PAGE_LIMIT_REDUCE_PERIOD");
      coverage("memberPurchasesMultiplePages", pages > 1);
      let amount = 0, count = 0;
      for (let page = 1; page <= pages; page++) {
        const body = await chat(`${page === 1 ? `Detalle de compras del mismo socio en el mismo período, sin filtros comerciales, página 1 con ${c.pageSize} compras por página.` : "Siguiente página de las mismas compras, conserva filtros y tamaño de página."} ${format(["Fecha", "Local", "Rubro", "Moneda", "Importe"])} Indica la paginación real con formato Página X de Y; N compras en total.`);
        common(body);
        const [header, ...rows] = table(body.response);
        check(JSON.stringify(header) === JSON.stringify(["Fecha", "Local", "Rubro", "Moneda", "Importe"]), "MEMBER_PURCHASES_DETAIL_COLUMNS");
        check(body.response.includes(`Página ${page} de ${pages}; ${total.count} compras en total.`), "MEMBER_PURCHASES_PAGE_METADATA");
        check(rows.length === Math.min(c.pageSize,total.count-count), "MEMBER_PURCHASES_PAGE_ROW_COUNT");
        for (const row of rows) {
          const value = number(row[4]), date = day(row[0]);
          check(row.length === 5 && row[3] === "PYG" && value !== null && date !== null && date >= day(c.from) && date <= day(c.to), "MEMBER_PURCHASES_DETAIL_VALUES_AND_DATES");
          amount += value; count++;
        }
      }
      check(Math.abs(amount-total.amount) <= .011 && count === total.count, "MEMBER_PURCHASES_DETAIL_MATCHES_TOTAL");
    }],
  ];
};
