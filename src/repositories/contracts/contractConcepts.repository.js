// src/repositories/contractConcepts.repository.js
// Oracle 11g.

export const getContractConceptsRepository = async ({
  connection,
  contractType,
  contractSeries,
  contractNumber,
  conceptCodes = [],
}) => {
  if (!connection) throw new Error("connection es obligatorio.");

  if (!contractType || !contractSeries || contractNumber == null) {
    throw new Error(
      "contractType, contractSeries y contractNumber son obligatorios.",
    );
  }

  const binds = {
    contractType,
    contractSeries,
    contractNumber: Number(contractNumber),
  };

  const where = [
    "TIP_CONTRATO = :contractType",
    "SER_CONTRATO = :contractSeries",
    "NRO_CONTRATO = :contractNumber",
  ];

  if (Array.isArray(conceptCodes) && conceptCodes.length > 0) {
    const placeholders = conceptCodes.map((code, index) => {
      const key = `conceptCode${index}`;
      binds[key] = String(code).trim();
      return `:${key}`;
    });

    where.push(`COD_CONCEPTO IN (${placeholders.join(", ")})`);
  }

  const sql = `
    SELECT
      TIP_CONTRATO,
      SER_CONTRATO,
      NRO_CONTRATO,
      COD_CONCEPTO,
      DES_CONCEPTO,
      SIGLAS_MONEDA_CONTRATO,
      DES_MONEDA_CONTRATO,
      SIGLAS_MONEDA_FACTURA,
      DES_MONEDA_FACTURA,
      TIPO_CAMBIO,
      MONTO_GASTO,
      FEC_DESDE,
      PORCENTAJE_GASTO,
      A_IPC,
      A_POR
    FROM VW_BOT_CONTRATOS_CONCEPTOS
    WHERE ${where.join("\n      AND ")}
    ORDER BY DES_CONCEPTO, COD_CONCEPTO
  `;

  const result = await connection.execute(sql, binds, { outFormat: 4002 });

  return (result.rows ?? []).map((row) => ({
    contract: {
      type: row.TIP_CONTRATO ?? null,
      series: row.SER_CONTRATO ?? null,
      number: Number(row.NRO_CONTRATO),
    },
    conceptCode: row.COD_CONCEPTO ?? null,
    description: row.DES_CONCEPTO ?? null,
    contractCurrency: {
      code: row.SIGLAS_MONEDA_CONTRATO ?? null,
      description: row.DES_MONEDA_CONTRATO ?? null,
    },
    invoiceCurrency: {
      code: row.SIGLAS_MONEDA_FACTURA ?? null,
      description: row.DES_MONEDA_FACTURA ?? null,
    },
    exchangeRateType: row.TIPO_CAMBIO ?? null,
    configuredAmount: row.MONTO_GASTO == null ? null : Number(row.MONTO_GASTO),
    effectiveFrom: row.FEC_DESDE ?? null,
    percentage:
      row.PORCENTAJE_GASTO == null ? null : Number(row.PORCENTAJE_GASTO),
    ipcFrequency: row.A_IPC == null ? null : Number(row.A_IPC),
    percentageRentFlag: row.A_POR ?? null,
  }));
};
