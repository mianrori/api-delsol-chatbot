// src/repositories/contractInvoiceAmounts.repository.js
// Oracle 11g.

/*
 * Regla confirmada:
 * el importe facturado se busca por COD_CLIENTE + COD_CONCEPTO.
 *
 * NO se exige TIPO_CONTRATO / SERIE_CONTRATO / NRO_CONTRATO en VW_BOT_FACTURAS.
 */

const buildConceptInClause = ({
  conceptCodes,
  binds,
  prefix = "conceptCode",
}) => {
  if (!Array.isArray(conceptCodes) || conceptCodes.length === 0) {
    throw new Error("conceptCodes debe contener al menos un concepto.");
  }

  return conceptCodes
    .map((code, index) => {
      const key = `${prefix}${index}`;
      binds[key] = String(code).trim();
      return `:${key}`;
    })
    .join(", ");
};

export const getLatestBilledAmountsByConceptRepository = async ({
  connection,
  customerId,
  conceptCodes,
}) => {
  if (!connection) throw new Error("connection es obligatorio.");
  if (!customerId) throw new Error("customerId es obligatorio.");

  const binds = {
    customerId: String(customerId).trim(),
  };

  const conceptInClause = buildConceptInClause({
    conceptCodes,
    binds,
  });

  const sql = `
    SELECT
      COD_CONCEPTO,
      PERIODO,
      FECHA_EMISION,
      NRO_FACTURA,
      SIMBOLO_MONEDA,
      IMPORTE,
      IVA,
      IMPORTE_SIN_IVA
    FROM (
      SELECT
        F.COD_CONCEPTO,
        F.PERIODO,
        F.FECHA_EMISION,
        F.NRO_FACTURA,
        F.SIMBOLO_MONEDA,
        F.IMPORTE,
        F.IVA,
        NVL(F.IMPORTE, 0) - NVL(F.IVA, 0) AS IMPORTE_SIN_IVA,
        ROW_NUMBER() OVER (
          PARTITION BY F.COD_CONCEPTO
          ORDER BY
            F.FECHA_EMISION DESC,
            F.NRO_FACTURA DESC
        ) AS RN
      FROM VW_BOT_FACTURAS F
      WHERE F.COD_CLIENTE = :customerId
        AND F.COD_CONCEPTO IN (${conceptInClause})
        AND NVL(F.ANULADO, 'N') <> 'S'
        AND NVL(F.USER_CAN_CONSULT, 'S') <> 'N'
    )
    WHERE RN = 1
    ORDER BY COD_CONCEPTO
  `;

  const result = await connection.execute(sql, binds, { outFormat: 4002 });

  return (result.rows ?? []).map((row) => ({
    conceptCode: row.COD_CONCEPTO ?? null,
    billingPeriod: row.PERIODO ?? null,
    invoiceDate: row.FECHA_EMISION ?? null,
    invoiceNumber: row.NRO_FACTURA ?? null,
    currencySymbol: row.SIMBOLO_MONEDA ?? null,
    amountIncludingTax: Number(row.IMPORTE ?? 0),
    taxAmount: Number(row.IVA ?? 0),
    amountExcludingTax: Number(row.IMPORTE_SIN_IVA ?? 0),
  }));
};

/*
 * Para incidencia mensual:
 * por cada mes + concepto toma la última factura válida del concepto
 * dentro de ese mes.
 *
 * También retorna PERIODO de la factura seleccionada para conservar
 * el contexto de facturación.
 */
export const getMonthlyBilledAmountsByConceptRepository = async ({
  connection,
  customerId,
  conceptCodes,
  dateFrom,
  dateTo,
}) => {
  if (!connection) throw new Error("connection es obligatorio.");
  if (!customerId) throw new Error("customerId es obligatorio.");
  if (!dateFrom || !dateTo) {
    throw new Error("dateFrom y dateTo son obligatorios.");
  }

  const binds = {
    customerId: String(customerId).trim(),
    dateFrom,
    dateTo,
  };

  const conceptInClause = buildConceptInClause({
    conceptCodes,
    binds,
  });

  const sql = `
    SELECT
      PERIOD_MONTH,
      COD_CONCEPTO,
      PERIODO,
      FECHA_EMISION,
      NRO_FACTURA,
      SIMBOLO_MONEDA,
      IMPORTE_SIN_IVA
    FROM (
      SELECT
        TRUNC(F.FECHA_EMISION, 'MM') AS PERIOD_MONTH,
        F.COD_CONCEPTO,
        F.PERIODO,
        F.FECHA_EMISION,
        F.NRO_FACTURA,
        F.SIMBOLO_MONEDA,
        NVL(F.IMPORTE, 0) - NVL(F.IVA, 0) AS IMPORTE_SIN_IVA,
        ROW_NUMBER() OVER (
          PARTITION BY
            TRUNC(F.FECHA_EMISION, 'MM'),
            F.COD_CONCEPTO
          ORDER BY
            F.FECHA_EMISION DESC,
            F.NRO_FACTURA DESC
        ) AS RN
      FROM VW_BOT_FACTURAS F
      WHERE F.COD_CLIENTE = :customerId
        AND F.COD_CONCEPTO IN (${conceptInClause})
        AND F.FECHA_EMISION >= TO_DATE(:dateFrom, 'DD/MM/YYYY')
        AND F.FECHA_EMISION < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1
        AND NVL(F.ANULADO, 'N') <> 'S'
        AND NVL(F.USER_CAN_CONSULT, 'S') <> 'N'
    )
    WHERE RN = 1
    ORDER BY PERIOD_MONTH, COD_CONCEPTO
  `;

  const result = await connection.execute(sql, binds, { outFormat: 4002 });

  return (result.rows ?? []).map((row) => ({
    periodMonth: row.PERIOD_MONTH ?? null,
    conceptCode: row.COD_CONCEPTO ?? null,
    billingPeriod: row.PERIODO ?? null,
    invoiceDate: row.FECHA_EMISION ?? null,
    invoiceNumber: row.NRO_FACTURA ?? null,
    currencySymbol: row.SIMBOLO_MONEDA ?? null,
    amountExcludingTax: Number(row.IMPORTE_SIN_IVA ?? 0),
  }));
};
