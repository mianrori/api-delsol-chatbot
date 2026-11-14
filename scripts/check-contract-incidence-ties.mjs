import { analyzeContractCostIncidence } from '../src/services/contracts/contractCostIncidence.service.js';
import { buildContractIncidenceResponse } from '../src/services/ai/contractIncidencePresentation.service.js';

// Execute the production repositories' SQL against synthetic, read-only Oracle
// CTE rows. No DEV record is created or changed, and no source result is logged.
export const checkContractIncidenceTies = async (connection, check) => {
  const contracts = `SELECT 'SYNTHETIC' COD_CLIENTE, 'Synthetic' NOM_CLIENTE, 'Synthetic' RAZON_SOCIAL,
    'L' NRO_LOCAL, 'CNT' TIP_CONTRATO, 'S' SER_CONTRATO, 1 NRO_CONTRATO,
    DATE '2023-01-01' FEC_CONTRATO, CAST(NULL AS DATE) FEC_VENCIMIENTO, 10 TOTAL_SUP_LOCAL FROM DUAL`;
  const concept = (code, label) => `SELECT 'CNT' TIP_CONTRATO, 'S' SER_CONTRATO, 1 NRO_CONTRATO,
    '${code}' COD_CONCEPTO, '${label}' DES_CONCEPTO, 'PYG' SIGLAS_MONEDA_CONTRATO,
    'GUARANIES' DES_MONEDA_CONTRATO, 'PYG' SIGLAS_MONEDA_FACTURA, 'GUARANIES' DES_MONEDA_FACTURA,
    CAST(NULL AS VARCHAR2(10)) TIPO_CAMBIO, 9999 MONTO_GASTO, DATE '2023-01-01' FEC_DESDE,
    0 PORCENTAJE_GASTO, 0 A_IPC, 'N' A_POR FROM DUAL`;
  const concepts = concept('6', 'Synthetic affected cost') + ' UNION ALL ' + concept('2', 'Synthetic unaffected cost');
  const sales = `SELECT 'SYNTHETIC' COD_CLIENTE, DATE '2023-01-31' FECHA, 1000 MONTO_TOTAL,
    'PYG' SIGLAS_MONEDA, 'GUARANIES' DES_MONEDA FROM DUAL`;
  const invoice = ({ amount = 100, currency = 'PYG', number = '2', day = '31', code = '6' } = {}) =>
    `SELECT 'SYNTHETIC' COD_CLIENTE, '${code}' COD_CONCEPTO, '01/2023' PERIODO,
      TO_DATE('2023-01-${day} 12:00:00','YYYY-MM-DD HH24:MI:SS') FECHA_EMISION,
      '${number}' NRO_FACTURA, ${currency == null ? 'CAST(NULL AS VARCHAR2(10))' : `'${currency}'`} SIMBOLO_MONEDA,
      ${amount} IMPORTE, 0 IVA, 'N' ANULADO, 'S' USER_CAN_CONSULT FROM DUAL`;
  const cases = [
    ['DIFFERENT_AMOUNTS', [invoice(), invoice({ amount: 999 })]],
    ['DIFFERENT_CURRENCIES', [invoice(), invoice({ amount: 999, currency: 'USD' })]],
    ['UNKNOWN_CURRENCY', [invoice({ currency: null }), invoice({ currency: 'USD' })]],
    ['IDENTICAL_ROWS', [invoice(), invoice()]],
    ['THREE_TIED_ROWS', [invoice(), invoice({ amount: 999 }), invoice({ amount: -10 })]],
    ['EQUIVALENT_NUMBERS', [invoice(), invoice({ amount: 999, number: '02' })]],
  ];
  const rate = { getUsdSellRate: async () => ({ sellRate: 2, source: 'Synthetic rate' }) };
  const render = (result) => buildContractIncidenceResponse([{ name: 'analyze_contract_cost_incidence', result }]);
  for (const [label, rows] of cases) for (const groupBy of ['summary', 'month']) {
    const fixtures = {
      VW_BOT_CONTRATOS_LOCALES: contracts,
      VW_BOT_CONTRATOS_CONCEPTOS: concepts,
      VW_BOT_VENTAS_LOCALES: sales,
      VW_BOT_FACTURAS: [...rows, invoice({ amount: 333, day: '20' }), invoice({ amount: 50, code: '2' })].join(' UNION ALL '),
    };
    const results = [];
    for (const reverse of [false, true]) {
      const synthetic = { execute: async (sql, binds) => {
        const source = Object.keys(fixtures).find((name) => sql.includes(name));
        if (!source) throw Error('UNEXPECTED_SYNTHETIC_QUERY');
        const rewritten = sql.replaceAll(source, 'SYNTHETIC_SOURCE');
        const cte = `WITH SYNTHETIC_SOURCE AS (${fixtures[source]})`;
        const query = /^\s*WITH\s+/i.test(rewritten) ? rewritten.replace(/^\s*WITH\s+/i, cte + ', ') : cte + ' ' + rewritten;
        const result = await connection.execute(query, binds);
        return { ...result, rows: reverse && source === 'VW_BOT_FACTURAS' ? [...result.rows].reverse() : result.rows };
      } };
      results.push(await analyzeContractCostIncidence({ customerId: 'SYNTHETIC', dateFrom: '01/01/2023', dateTo: '31/01/2023', groupBy }, synthetic, rate));
    }
    const prefix = `ORACLE_TIES_${label}_${groupBy.toUpperCase()}`;
    const [forward, reversed] = results;
    check(JSON.stringify(forward) === JSON.stringify(reversed), prefix + '_ORDER_INDEPENDENT_RESULT');
    check(render(forward) === render(reversed), prefix + '_ORDER_INDEPENDENT_PRESENTATION');
    const period = groupBy === 'month' ? forward.data[0] : forward;
    const affected = period.shoppingCost.concepts.find((c) => c.conceptCode === '6');
    const unaffected = period.shoppingCost.concepts.find((c) => c.conceptCode === '2');
    check(affected?.description === 'Synthetic affected cost' && affected.amountExcludingTax === null
      && affected.status === 'BILLING_AMBIGUOUS' && Boolean(affected.reason), prefix + '_AFFECTED_CONCEPT_NULL_WITH_REASON');
    check(unaffected?.amountExcludingTax === 50 && unaffected.currency.code === 'PYG', prefix + '_UNAFFECTED_CONCEPT_RETAINED');
    check(period.status === 'BILLING_AMBIGUOUS' && period.shoppingCost.amount === null && period.shoppingCost.usd === null
      && period.incidencePercentage === null && period.shoppingCost.complete === false, prefix + '_INVALID_TOTALS_NULL');
    check(period.shoppingCost.byCurrency.every((v) => v.amount === null || (v.code === 'PYG' && v.amount === 50)), prefix + '_NO_ARBITRARY_CURRENCY_SUBTOTAL');
    check(groupBy !== 'summary' || period.shoppingCost.conceptBreakdownByPeriod[0].concepts.find((c) => c.conceptCode === '6')?.amountExcludingTax === null,
      prefix + '_SUMMARY_BREAKDOWN_NULL');
    check(/Synthetic affected cost: sin calcular/.test(render(forward)) && !/\b(?:100|999|333)\b/.test(render(forward)), prefix + '_NO_ARBITRARY_AMOUNT_VISIBLE');
  }
};
