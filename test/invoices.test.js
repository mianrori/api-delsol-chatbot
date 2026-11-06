import test from "node:test";
import assert from "node:assert/strict";
import { getInvoicesRepository } from "../src/repositories/invoices/invoices.repository.js";
import { getInvoices } from "../src/services/invoices/invoices.service.js";

const fakeConnection = (...results) => ({
  queries: [],
  async execute(sql, binds) {
    this.queries.push({ sql, binds });
    return { rows: results.shift() ?? [] };
  },
});

test("invoice detail binds all filters and distinguishes concept rows from distinct invoices", async () => {
  const connection = fakeConnection([{ TOTAL_ROWS: 3, TOTAL_INVOICES: 2 }], [{ NRO_FACTURA: "SYNTHETIC", IMPORTE: -25.5 }]);
  const result = await getInvoicesRepository({ connection, customerIds: ["SYNTHETIC'CUSTOMER"], conceptIds: ["C1"],
    dateFrom: "01/01/2023", dateTo: "31/01/2023", cancelled: false, plate: "ab- 123", period: "01/2023", page: 2, rows: 2 });
  assert.equal(result.totalInvoices, 2);
  assert.equal(result.totalRows, 3);
  assert.equal(result.totalPages, 2);
  assert.equal(result.hasMore, false);
  assert.equal(result.previousPage, 1);
  assert.equal(result.data[0].amount, -25.5);
  for (const { sql, binds } of connection.queries) {
    assert.match(sql, /NVL\(USER_CAN_CONSULT, 'S'\) <> 'N'/);
    assert.match(sql, /FECHA_EMISION < TO_DATE\(:dateTo, 'DD\/MM\/YYYY'\) \+ 1/);
    assert.ok(!sql.includes("SYNTHETIC'CUSTOMER"));
    assert.equal(binds.customerId0, "SYNTHETIC'CUSTOMER");
    assert.equal(binds.conceptId0, "C1");
    assert.equal(binds.cancelled, "N");
    assert.equal(binds.plate, "%AB123%");
  }
  assert.match(connection.queries[0].sql, /COUNT\(DISTINCT NRO_FACTURA\)/);
  assert.equal(connection.queries[1].binds.offset, 2);
  assert.equal(connection.queries[1].binds.maxRow, 4);
});

test("invoice summaries preserve multiple currencies even without a requested dimension", async () => {
  const connection = fakeConnection([{ CURRENCY_SYMBOL: "PYG", TOTAL_AMOUNT: 1000, INVOICE_COUNT: 2 },
    { CURRENCY_SYMBOL: "USD", TOTAL_AMOUNT: 10, INVOICE_COUNT: 1 }]);
  const result = await getInvoices({ mode: "summary" }, connection);
  assert.deepEqual(result.data.map((row) => [row.currencySymbol, row.totalAmount]), [["₲", 1000], ["USD", 10]]);
  const { sql } = connection.queries[0];
  assert.match(sql, /GROUP BY SIMBOLO_MONEDA/);
  assert.doesNotMatch(sql, /MAX\(SIMBOLO_MONEDA\)/);
});

test("monthly invoices keep chronological ordering and distinct invoice counting per currency", async () => {
  const connection = fakeConnection([{ MONTH: "01/2023", CURRENCY_SYMBOL: "PYG", TOTAL_AMOUNT: 0, INVOICE_COUNT: 1 }]);
  const result = await getInvoicesRepository({ connection, mode: "summary", groupBy: ["month"] });
  assert.equal(result.data[0].totalAmount, 0);
  assert.match(connection.queries[0].sql, /ORDER BY MIN\(TRUNC\(FECHA_EMISION, 'MM'\)\), SIMBOLO_MONEDA/);
  assert.match(connection.queries[0].sql, /COUNT\(DISTINCT NRO_FACTURA\)/);
});

test("single currency totals retain the scalar contract and empty detail pages retain counts", async () => {
  const summary = await getInvoices({ mode: "summary" }, fakeConnection([{ TOTAL_AMOUNT: 0, INVOICE_COUNT: 0, CURRENCY_SYMBOL: "GS." }]));
  assert.equal(summary.currencySymbol, "₲");
  assert.equal(summary.totalAmount, 0);
  const empty = await getInvoicesRepository({ connection: fakeConnection([{ TOTAL_ROWS: 2, TOTAL_INVOICES: 1 }], []), page: 3, rows: 1 });
  assert.equal(empty.totalRows, 2);
  assert.equal(empty.returnedRows, 0);
  assert.equal(empty.nextPage, null);
});

test("invalid invoice arguments fail before SQL instead of silently broadening the query", async () => {
  for (const args of [{ mode: "unknown" }, { groupBy: ["typo"] }, { metrics: ["typo"] }, { metrics: [] },
    { dateFrom: "31/02/2023" }, { dateTo: "2023-01-01" }, { dateFrom: "02/01/2023", dateTo: "01/01/2023" },
    { page: 1.5 }, { page: 0 }, { rows: 101 }, { rows: -1 }, { cancelled: "false" }]) {
    const connection = fakeConnection();
    await assert.rejects(getInvoicesRepository({ connection, ...args }));
    assert.equal(connection.queries.length, 0);
  }
});

test("invoice detail normalizes currency and omits raw PDF paths without inventing missing links", async () => {
  const result = await getInvoices({}, fakeConnection([{ TOTAL_ROWS: 1, TOTAL_INVOICES: 1 }], [{ SIMBOLO_MONEDA: "PYG", IMPORTE: 0 }]));
  assert.equal(result.data[0].currencySymbol, "₲");
  assert.equal(result.data[0].pdfUrl, null);
  assert.equal(result.data[0].pdf, undefined);
});
