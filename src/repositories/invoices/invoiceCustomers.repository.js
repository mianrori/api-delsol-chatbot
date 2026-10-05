// src/repositories/invoices/invoiceCustomers.repository.js

import config from "../../../config.js";

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

const normalizeOracleText = (column) => `
  UPPER(
    REGEXP_REPLACE(
      TRANSLATE(
        NVL(${column}, ''),
        'ÁÉÍÓÚÜÑáéíóúüñ',
        'AEIOUUNAEIOUUN'
      ),
      '[^A-Za-z0-9]',
      ''
    )
  )
`;

const buildBaseFilter = ({ dateFrom, dateTo, binds }) => {
  const where = ["NVL(USER_CAN_CONSULT, 'S') <> 'N'"];

  if (dateFrom) {
    binds.dateFrom = dateFrom;
    where.push(
      "FECHA_EMISION >= TO_DATE(:dateFrom, 'DD/MM/YYYY')",
    );
  }

  if (dateTo) {
    binds.dateTo = dateTo;
    where.push(
      "FECHA_EMISION < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1",
    );
  }

  return where;
};

const mapRow = (row) => ({
  customerId: row.COD_CLIENTE,
  customerName: row.NOM_CLIENTE ?? null,
  businessName: row.RAZON_SOCIAL ?? null,
  taxId: row.RUC ?? null,
  similarity:
    row.SIMILARITY === null || row.SIMILARITY === undefined
      ? null
      : Number(row.SIMILARITY),
  matchPriority: Number(row.MATCH_PRIORITY ?? 99),
  exactMatch: Number(row.MATCH_PRIORITY ?? 99) <= 5,
  strongMatch: Number(row.MATCH_PRIORITY ?? 99) <= 7,
});

export const searchInvoiceCustomersRepository = async ({
  connection,
  query,
  dateFrom,
  dateTo,
  limit = 10,
  minSimilarity = Number(config.minSimilarity || 70),
}) => {
  const queryNormalized = normalizeText(query);

  if (!queryNormalized) {
    return [];
  }

  const customerIdSql = normalizeOracleText("COD_CLIENTE");
  const customerNameSql = normalizeOracleText("NOM_CLIENTE");
  const businessNameSql = normalizeOracleText("RAZON_SOCIAL");
  const taxIdSql = normalizeOracleText("RUC");
  const plateSql = normalizeOracleText("MATRICULA");

  /*
   * ETAPA 1: coincidencias fuertes.
   *
   * Primero buscamos identificadores exactos y coincidencias reales de texto
   * en nombre o razón social. Si encontramos al menos una, NO ejecutamos
   * búsqueda fuzzy.
   *
   * Ejemplo:
   *   query = NIKE
   *   NOM_CLIENTE = NIKE - TA
   *
   * La versión normalizada NIKETA contiene NIKE, por lo que esta coincidencia
   * debe tener prioridad absoluta sobre NINE WEST, NICE STORE, NICOLETTA, etc.
   */
  const strongBinds = {
    queryNormalized,
    limit: Number(limit),
  };

  const strongWhere = buildBaseFilter({
    dateFrom,
    dateTo,
    binds: strongBinds,
  });

  const strongSql = `
    SELECT
      COD_CLIENTE,
      NOM_CLIENTE,
      RAZON_SOCIAL,
      RUC,
      MATCH_PRIORITY,
      SIMILARITY
    FROM (
      SELECT
        base.*,
        CASE
          WHEN ${customerIdSql} = :queryNormalized THEN 1
          WHEN ${taxIdSql} = :queryNormalized THEN 2
          WHEN ${plateSql} = :queryNormalized THEN 3
          WHEN ${customerNameSql} = :queryNormalized THEN 4
          WHEN ${businessNameSql} = :queryNormalized THEN 5
          WHEN INSTR(${customerNameSql}, :queryNormalized) > 0 THEN 6
          WHEN INSTR(${businessNameSql}, :queryNormalized) > 0 THEN 7
          ELSE 99
        END AS MATCH_PRIORITY,
        CAST(NULL AS NUMBER) AS SIMILARITY
      FROM (
        SELECT DISTINCT
          COD_CLIENTE,
          NOM_CLIENTE,
          RAZON_SOCIAL,
          RUC,
          MATRICULA
        FROM VW_BOT_FACTURAS
        WHERE ${strongWhere.join("\n          AND ")}
      ) base
    )
    WHERE MATCH_PRIORITY <= 7
    ORDER BY
      MATCH_PRIORITY,
      NOM_CLIENTE,
      RAZON_SOCIAL
  `;

  const strongResult = await connection.execute(
    strongSql,
    strongBinds,
    {
      outFormat: 4002,
      maxRows: Number(limit),
    },
  );

  const strongRows = (strongResult.rows ?? []).map(mapRow);

  if (strongRows.length > 0) {
    return strongRows.slice(0, Number(limit));
  }

  /*
   * ETAPA 2: fuzzy matching solamente como fallback.
   *
   * Para textos cortos Jaro-Winkler tiende a premiar demasiado los prefijos
   * compartidos. Por eso elevamos el umbral dinámicamente.
   */
  if (queryNormalized.length < 4) {
    return [];
  }

  const effectiveMinSimilarity = Math.max(
    Number(minSimilarity),
    queryNormalized.length <= 4
      ? 90
      : queryNormalized.length <= 6
        ? 85
        : 80,
  );

  const fuzzyBinds = {
    queryNormalized,
    minSimilarity: effectiveMinSimilarity,
  };

  const fuzzyWhere = buildBaseFilter({
    dateFrom,
    dateTo,
    binds: fuzzyBinds,
  });

  const fuzzySql = `
    SELECT
      COD_CLIENTE,
      NOM_CLIENTE,
      RAZON_SOCIAL,
      RUC,
      8 AS MATCH_PRIORITY,
      SIMILARITY
    FROM (
      SELECT
        base.*,
        GREATEST(
          NVL(
            UTL_MATCH.JARO_WINKLER_SIMILARITY(
              ${customerNameSql},
              :queryNormalized
            ),
            0
          ),
          NVL(
            UTL_MATCH.JARO_WINKLER_SIMILARITY(
              ${businessNameSql},
              :queryNormalized
            ),
            0
          )
        ) AS SIMILARITY
      FROM (
        SELECT DISTINCT
          COD_CLIENTE,
          NOM_CLIENTE,
          RAZON_SOCIAL,
          RUC
        FROM VW_BOT_FACTURAS
        WHERE ${fuzzyWhere.join("\n          AND ")}
      ) base
    )
    WHERE SIMILARITY >= :minSimilarity
    ORDER BY
      SIMILARITY DESC,
      NOM_CLIENTE,
      RAZON_SOCIAL
  `;

  const fuzzyResult = await connection.execute(
    fuzzySql,
    fuzzyBinds,
    {
      outFormat: 4002,
      maxRows: Number(limit),
    },
  );

  return (fuzzyResult.rows ?? [])
    .map(mapRow)
    .slice(0, Number(limit));
};
