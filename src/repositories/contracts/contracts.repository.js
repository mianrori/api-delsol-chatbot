// src/repositories/contracts.repository.js
// Oracle 11g.

export const getActiveContractsRepository = async ({
  connection,
  customerId,
  localNumber,
  contractType = "CNT",
  activeStatus = "A",
}) => {
  if (!connection) throw new Error("connection es obligatorio.");
  if (!customerId) throw new Error("customerId es obligatorio.");

  const binds = {
    customerId: String(customerId).trim(),
    contractType,
    activeStatus,
  };

  const where = [
    "COD_CLIENTE = :customerId",
    "TIP_CONTRATO = :contractType",
    "ESTADO = :activeStatus",
  ];

  if (localNumber !== undefined && localNumber !== null && localNumber !== "") {
    binds.localNumber = String(localNumber).trim();
    where.push("NRO_LOCAL = :localNumber");
  }

  const sql = `
    SELECT
      COD_CLIENTE,
      NOM_CLIENTE,
      RAZON_SOCIAL,
      NRO_LOCAL,
      TIP_CONTRATO,
      SER_CONTRATO,
      NRO_CONTRATO,
      TIP_CONTRATO_REF,
      SER_CONTRATO_REF,
      NRO_CONTRATO_REF,
      FEC_CONTRATO,
      FEC_VENCIMIENTO,
      FECHA_IPC,
      PLAZO,
      TIPO_PLAZO,
      ESTADO,
      OBSERVACION,
      TOTAL_SUP_LOCAL,
      TOTAL_SUP_VIDRIERA,
      TOTAL_SUP_LOCAL_COMP,
      TOTAL_SUP_VIDRIERA_COMP,
      ARRENDAMIENTO_DICIEMBRE,
      INCLUIR_METRAJE,
      PORC_AJUSTE,
      CANT_MESES_AJUSTE,
      COD_USUARIO_ALTA,
      NOMBRE_USUARIO_ALTA,
      FECHA_ALTA,
      COD_USUARIO_ACT,
      NOMBRE_USUARIO_ACT,
      FECHA_ACT,
      ULTIMO_IPC
    FROM VW_BOT_CONTRATOS_LOCALES
    WHERE ${where.join("\n      AND ")}
    ORDER BY
      FEC_CONTRATO DESC NULLS LAST,
      NRO_CONTRATO DESC,
      NRO_LOCAL
  `;

  const result = await connection.execute(sql, binds, { outFormat: 4002 });

  return (result.rows ?? []).map((row) => ({
    customerId: row.COD_CLIENTE ?? null,
    customerName: row.NOM_CLIENTE ?? null,
    businessName: row.RAZON_SOCIAL ?? null,
    localNumber: row.NRO_LOCAL ?? null,

    contract: {
      type: row.TIP_CONTRATO ?? null,
      series: row.SER_CONTRATO ?? null,
      number: row.NRO_CONTRATO == null ? null : Number(row.NRO_CONTRATO),
    },

    referencedContract: {
      type: row.TIP_CONTRATO_REF ?? null,
      series: row.SER_CONTRATO_REF ?? null,
      number:
        row.NRO_CONTRATO_REF == null ? null : Number(row.NRO_CONTRATO_REF),
    },

    contractDate: row.FEC_CONTRATO ?? null,
    expirationDate: row.FEC_VENCIMIENTO ?? null,
    ipcDate: row.FECHA_IPC ?? null,
    term: row.PLAZO == null ? null : Number(row.PLAZO),
    termType: row.TIPO_PLAZO ?? null,
    status: row.ESTADO ?? null,
    observation: row.OBSERVACION ?? null,

    totalLocalArea:
      row.TOTAL_SUP_LOCAL == null ? null : Number(row.TOTAL_SUP_LOCAL),
    totalStorefrontArea:
      row.TOTAL_SUP_VIDRIERA == null ? null : Number(row.TOTAL_SUP_VIDRIERA),
    complementaryLocalArea:
      row.TOTAL_SUP_LOCAL_COMP == null
        ? null
        : Number(row.TOTAL_SUP_LOCAL_COMP),
    complementaryStorefrontArea:
      row.TOTAL_SUP_VIDRIERA_COMP == null
        ? null
        : Number(row.TOTAL_SUP_VIDRIERA_COMP),

    decemberRent:
      row.ARRENDAMIENTO_DICIEMBRE == null
        ? null
        : Number(row.ARRENDAMIENTO_DICIEMBRE),

    includeArea: row.INCLUIR_METRAJE ?? null,
    adjustmentPercentage:
      row.PORC_AJUSTE == null ? null : Number(row.PORC_AJUSTE),
    adjustmentMonths:
      row.CANT_MESES_AJUSTE == null ? null : Number(row.CANT_MESES_AJUSTE),
    lastIpc: row.ULTIMO_IPC == null ? null : Number(row.ULTIMO_IPC),

    audit: {
      createdByCode: row.COD_USUARIO_ALTA ?? null,
      createdByName: row.NOMBRE_USUARIO_ALTA ?? null,
      createdAt: row.FECHA_ALTA ?? null,
      updatedByCode: row.COD_USUARIO_ACT ?? null,
      updatedByName: row.NOMBRE_USUARIO_ACT ?? null,
      updatedAt: row.FECHA_ACT ?? null,
    },
  }));
};

export const getContractByIdentityRepository = async ({
  connection,
  contractType,
  contractSeries,
  contractNumber,
}) => {
  if (!contractType || !contractSeries || contractNumber == null) {
    throw new Error(
      "contractType, contractSeries y contractNumber son obligatorios.",
    );
  }

  const sql = `
    SELECT
      COD_CLIENTE,
      NOM_CLIENTE,
      RAZON_SOCIAL,
      NRO_LOCAL,
      TIP_CONTRATO,
      SER_CONTRATO,
      NRO_CONTRATO,
      FEC_CONTRATO,
      FEC_VENCIMIENTO,
      FECHA_IPC,
      PLAZO,
      TIPO_PLAZO,
      ESTADO,
      OBSERVACION,
      TOTAL_SUP_LOCAL,
      TOTAL_SUP_VIDRIERA,
      TOTAL_SUP_LOCAL_COMP,
      TOTAL_SUP_VIDRIERA_COMP,
      ARRENDAMIENTO_DICIEMBRE,
      INCLUIR_METRAJE,
      PORC_AJUSTE,
      CANT_MESES_AJUSTE,
      ULTIMO_IPC
    FROM VW_BOT_CONTRATOS_LOCALES
    WHERE TIP_CONTRATO = :contractType
      AND SER_CONTRATO = :contractSeries
      AND NRO_CONTRATO = :contractNumber
  `;

  const result = await connection.execute(
    sql,
    {
      contractType,
      contractSeries,
      contractNumber: Number(contractNumber),
    },
    { outFormat: 4002 },
  );

  const row = result.rows?.[0];
  if (!row) return null;

  return {
    customerId: row.COD_CLIENTE ?? null,
    customerName: row.NOM_CLIENTE ?? null,
    businessName: row.RAZON_SOCIAL ?? null,
    localNumber: row.NRO_LOCAL ?? null,
    contract: {
      type: row.TIP_CONTRATO ?? null,
      series: row.SER_CONTRATO ?? null,
      number: Number(row.NRO_CONTRATO),
    },
    contractDate: row.FEC_CONTRATO ?? null,
    expirationDate: row.FEC_VENCIMIENTO ?? null,
    ipcDate: row.FECHA_IPC ?? null,
    term: row.PLAZO == null ? null : Number(row.PLAZO),
    termType: row.TIPO_PLAZO ?? null,
    status: row.ESTADO ?? null,
    observation: row.OBSERVACION ?? null,
    totalLocalArea:
      row.TOTAL_SUP_LOCAL == null ? null : Number(row.TOTAL_SUP_LOCAL),
    totalStorefrontArea:
      row.TOTAL_SUP_VIDRIERA == null ? null : Number(row.TOTAL_SUP_VIDRIERA),
    complementaryLocalArea:
      row.TOTAL_SUP_LOCAL_COMP == null
        ? null
        : Number(row.TOTAL_SUP_LOCAL_COMP),
    complementaryStorefrontArea:
      row.TOTAL_SUP_VIDRIERA_COMP == null
        ? null
        : Number(row.TOTAL_SUP_VIDRIERA_COMP),
    decemberRent:
      row.ARRENDAMIENTO_DICIEMBRE == null
        ? null
        : Number(row.ARRENDAMIENTO_DICIEMBRE),
    includeArea: row.INCLUIR_METRAJE ?? null,
    adjustmentPercentage:
      row.PORC_AJUSTE == null ? null : Number(row.PORC_AJUSTE),
    adjustmentMonths:
      row.CANT_MESES_AJUSTE == null ? null : Number(row.CANT_MESES_AJUSTE),
    lastIpc: row.ULTIMO_IPC == null ? null : Number(row.ULTIMO_IPC),
  };
};
