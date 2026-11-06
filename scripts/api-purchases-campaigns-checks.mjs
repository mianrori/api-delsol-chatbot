const clean = (value) => String(value ?? "").replace(/\*\*/g, "").replace(/[\u00a0\u202f]/g, " ").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const numeric = (value) => {
  const text = clean(value).replace(/₲|\s|%/g, "");
  return /^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(text) ? Number(text.replace(/\./g, "").replace(",", ".")) : null;
};
const tables = (text) => {
  const result = []; let current;
  for (const line of String(text).split("\n")) {
    if (!/^\s*\|/.test(line)) { current = null; continue; }
    const row = line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => clean(cell).replace(/\\\|/g, "|"));
    if (row.every((cell) => /^:?-+:?$/.test(cell))) continue;
    if (!current) { current = { headers: row, rows: [] }; result.push(current); }
    else current.rows.push(row);
  }
  return result;
};
const same = (left, right, tolerance = .011) => Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
const noActions = (body, check) => check(!body.actions?.chart && !body.actions?.salesExport, "PURCHASES_CAMPAIGNS_NO_STALE_ACTIONS");

// These controls were verified against the historical DEV campaign. No personal
// identifiers or response data are written to the report.
export const campaignControl = {
  name: "TU LUZ HACE LA MAGIA DE LA NAVIDAD", days: 53,
  periods: [
    { label: "Antes", from: "23/09/2018", to: "14/11/2018", amount: 81975498634, invoices: 651507 },
    { label: "Durante", from: "15/11/2018", to: "06/01/2019", amount: 120490114653, invoices: 857905 },
    { label: "Después", from: "07/01/2019", to: "28/02/2019", amount: 79632388020, invoices: 854475 },
  ],
};

export const createPurchaseCases = ({ chat, check, monthlyControls }) => {
  let months;
  const inspect = (body, from, to, monthly, expected) => {
    noActions(body, check);
    check(body.response.includes(`Del ${from} al ${to}.`), "PURCHASES_PERIOD");
    check(/Canjes de facturas de socios frente a ventas/.test(body.response), "PURCHASES_COMPARED_WITH_SALES");
    check(!/Se muestran \d+ de \d+ grupos/.test(body.response), "PURCHASES_ALL_GROUPS");
    const parsed = tables(body.response);
    const headers = [...(monthly ? ["Mes"] : []), "Moneda", "Ventas", "Importe de canjes", "Cantidad de canjes", "Socios", "Canjes sobre ventas"];
    check(parsed.length === 1 && JSON.stringify(parsed[0].headers) === JSON.stringify(headers), "PURCHASES_COLUMNS");
    check(parsed[0].rows.length === expected.length, "PURCHASES_GROUP_COUNT");
    const rows = parsed[0].rows.map((row, index) => {
      const offset = monthly ? 1 : 0, [currency, sales, amount, count, members, percentage] = row.slice(offset);
      check(row.length === headers.length && ["₲", "PYG"].includes(currency), "PURCHASES_PYG_CURRENCY");
      if (monthly) check(row[0] === `2023-${expected[index].month}`, "PURCHASES_MONTHS_AND_ORDER");
      const result = { sales: numeric(sales), amount: numeric(amount), count: numeric(count), members: numeric(members), percentage: numeric(percentage) };
      check(Object.values(result).every(Number.isFinite) && Number.isInteger(result.count) && result.count >= 0
        && Number.isInteger(result.members) && result.members >= 0 && result.members <= result.count, "PURCHASES_NUMERIC_METRICS");
      check(same(result.sales, expected[index].sales ?? expected[index].amount), "PURCHASES_SALES_CONTROL_TOTALS");
      check(same(result.percentage, result.amount / result.sales * 100), "PURCHASES_PERCENTAGE_ARITHMETIC");
      return result;
    });
    check(rows.some((row) => row.count > 0), "PURCHASES_REGISTERED_CANJES_FIXTURE_REQUIRED");
    return rows;
  };
  return [
    ["purchases-monthly-vs-sales", async () => {
      months = inspect(await chat("Compara el importe de canjes de facturas de socios frente a las ventas de enero a mayo de 2023, mes a mes en orden cronológico ascendente, incluyendo importe de ventas, importe de canjes, cantidad de canjes, socios y porcentaje de canjes sobre ventas. Sin filtros comerciales ni límite de grupos."), "01/01/2023", "31/05/2023", true, monthlyControls);
    }],
    ["purchases-total-vs-months", async () => {
      const sums = months.reduce((sum, row) => ({ sales: sum.sales + row.sales, amount: sum.amount + row.amount, count: sum.count + row.count }), { sales: 0, amount: 0, count: 0 });
      const [total] = inspect(await chat("Ahora la misma comparación de canjes de facturas de socios frente a ventas de enero a mayo de 2023 en un solo total, sin desglose mensual ni filtros comerciales. Incluye ventas, importe de canjes, cantidad de canjes, socios y porcentaje."), "01/01/2023", "31/05/2023", false, [sums]);
      check(same(total.amount, sums.amount) && total.count === sums.count, "PURCHASES_TOTAL_MATCHES_MONTHS");
      // Distinct members may recur in different months and must not be summed.
      check(total.members >= Math.max(...months.map((row) => row.members)) && total.members <= months.reduce((sum, row) => sum + row.members, 0), "PURCHASES_DISTINCT_MEMBERS_BOUNDS");
    }],
    ["purchases-change-to-january", async () => {
      const [january] = inspect(await chat("Ahora compara únicamente enero de 2023, en un solo total, los canjes de facturas de socios frente a ventas, con los mismos indicadores y sin filtros comerciales."), "01/01/2023", "31/01/2023", false, [months[0]]);
      check(same(january.amount, months[0].amount) && january.count === months[0].count && january.members === months[0].members, "PURCHASES_CHANGED_PERIOD_MATCHES_JANUARY");
    }],
  ];
};

export const createCampaignCases = ({ chat, check, coverage }) => {
  let selected;
  return [
    ["campaigns-search-christmas", async () => {
      let body = await chat("Compara las ventas antes, durante y después de la campaña Navidad"), total, found = false;
      for (let page = 1; page <= 10; page++) {
        noActions(body, check);
        const metadata = /Se encontraron (\d+) coincidencias\. Página (\d+) de (\d+)\./.exec(body.response);
        check(Boolean(metadata), "CAMPAIGNS_AMBIGUITY_REQUIRES_SELECTION");
        const [count, actualPage, pages] = metadata.slice(1).map(Number);
        check(count >= 10 && actualPage === page && pages >= page && pages <= 10 && (total == null || total === count), "CAMPAIGNS_SEARCH_PAGINATION");
        total = count;
        const parsed = tables(body.response);
        check(parsed.length === 1 && JSON.stringify(parsed[0].headers) === JSON.stringify(["Opción", "Promoción", "Campaña", "Desde", "Hasta"]), "CAMPAIGNS_SEARCH_COLUMNS");
        check(parsed[0].rows.length > 0 && parsed[0].rows.length <= count && /Indica el número de la opción/.test(body.response), "CAMPAIGNS_OPTIONS_REQUIRE_SELECTION");
        for (const row of parsed[0].rows) {
          check(row.length === 5 && Number.isInteger(numeric(row[0])) && numeric(row[0]) > 0 && normalize(row[2]).includes("navidad"), "CAMPAIGNS_PARTIAL_SEARCH_RESULTS");
          if (normalize(row[2]) === normalize(campaignControl.name)) {
            check(row[3] === "15/11/2018" && row[4] === "06/01/2019", "CAMPAIGNS_SELECTED_DATES");
            check(!found, "CAMPAIGNS_TARGET_UNAMBIGUOUS"); selected = numeric(row[0]); found = true;
          }
        }
        if (found || page === pages) break;
        body = await chat("Siguiente página");
      }
      check(found, "CAMPAIGNS_HISTORICAL_FIXTURE_REQUIRED");
      coverage("campaignSearchMultiplePages", !/Página 1 de/.test(body.response));
    }],
    ["campaigns-before-during-after", async () => {
      const body = await chat(`Opción ${selected}. Compara las ventas antes, durante y después de esta campaña, con períodos de igual duración, sin filtros comerciales.`);
      noActions(body, check);
      check(body.response.includes(`Campaña: ${campaignControl.name}.`) && body.response.includes(`períodos de ${campaignControl.days} días calendario.`), "CAMPAIGNS_SELECTED_IDENTITY_AND_DURATION");
      const parsed = tables(body.response);
      check(parsed.length === 2 && JSON.stringify(parsed[0].headers) === JSON.stringify(["Período", "Desde", "Hasta", "Ventas", "Cantidad de facturas", "Venta diaria promedio"]), "CAMPAIGNS_PERIOD_COLUMNS");
      check(parsed[0].rows.length === 3, "CAMPAIGNS_THREE_PERIODS");
      parsed[0].rows.forEach((row, index) => {
        const expected = campaignControl.periods[index];
        check(row.length === 6 && row[0] === expected.label && row[1] === expected.from && row[2] === expected.to, "CAMPAIGNS_EQUAL_CONSECUTIVE_PERIODS");
        check(row[3].startsWith("₲ ") && row[5].startsWith("₲ ") && numeric(row[3]) === expected.amount && numeric(row[4]) === expected.invoices, "CAMPAIGNS_CONTROL_TOTALS_AND_CURRENCY");
        check(same(numeric(row[5]), expected.amount / campaignControl.days, .00011), "CAMPAIGNS_DAILY_AVERAGE");
      });
      check(JSON.stringify(parsed[1].headers) === JSON.stringify(["Comparación", "Variación de ventas", "Variación de ventas (%)", "Variación de facturas", "Variación de facturas (%)"]) && parsed[1].rows.length === 3, "CAMPAIGNS_COMPARISON_COLUMNS");
      [[1, 0], [2, 1], [2, 0]].forEach(([current, previous], index) => {
        const a = campaignControl.periods[current], b = campaignControl.periods[previous], row = parsed[1].rows[index];
        check(row.length === 5 && row[0] === `${a.label} frente a ${b.label}` && row[1].startsWith("₲ ") && row[2].endsWith(" %") && row[4].endsWith(" %"), "CAMPAIGNS_COMPARISON_LABELS");
        check(numeric(row[1]) === a.amount - b.amount && numeric(row[3]) === a.invoices - b.invoices
          && same(numeric(row[2]), (a.amount - b.amount) / b.amount * 100, .00011)
          && same(numeric(row[4]), (a.invoices - b.invoices) / b.invoices * 100, .00011), "CAMPAIGNS_VARIATIONS_ARITHMETIC");
      });
      check(/no demuestran que la campaña haya causado los cambios/.test(body.response), "CAMPAIGNS_NO_CAUSAL_ATTRIBUTION");
    }],
  ];
};
