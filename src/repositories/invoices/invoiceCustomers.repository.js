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

  const binds = {
    queryNormalized,
    minSimilarity: Number(minSimilarity),
    limit: Number(limit),
  };

  const baseWhere = ["NVL(USER_CAN_CONSULT, 'S') <> 'N'"];

  if (dateFrom) {
    binds.dateFrom = dateFrom;
    baseWhere.push(
      "FECHA_EMISION >= TO_DATE(:dateFrom, 'DD/MM/YYYY')",
    );
  }

  if (dateTo) {
    binds.dateTo = dateTo;
    baseWhere.push(
      "FECHA_EMISION < TO_DATE(:dateTo, 'DD/MM/YYYY') + 1",
    );
  }

  const customerIdSql = normalizeOracleText("COD_CLIENTE");
  const customerNameSql = normalizeOracleText("NOM_CLIENTE");
  const businessNameSql = normalizeOracleText("RAZON_SOCIAL");
  const taxIdSql = normalizeOracleText("RUC");
  const plateSql = normalizeOracleText("MATRICULA");

  /*
   * La búsqueda se realiza únicamente sobre registros consultables.
   *
   * A diferencia de la implementación inicial, una búsqueda por nombre
   * ya no puede incorporar clientes solamente porque el texto aparezca
   * parcialmente en RUC, matrícula o código.
   *
   * Los identificadores se consideran coincidencia únicamente cuando son
   * exactos. Los nombres y razones sociales admiten coincidencia aproximada
   * mediante Jaro-Winkler y respetan el mismo umbral configurable utilizado
   * por el resolver general de clientes.
   */
  const sql = `
    SELECT
      COD_CLIENTE,
      NOM_CLIENTE,
      RAZON_SOCIAL,
      RUC,
      SIMILARITY,
      MATCH_PRIORITY
    FROM (
      SELECT
        ranked.*
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
          ) AS SIMILARITY,
          CASE
            WHEN ${customerIdSql} = :queryNormalized THEN 1
            WHEN ${taxIdSql} = :queryNormalized THEN 2
            WHEN ${plateSql} = :queryNormalized THEN 3
            WHEN ${customerNameSql} = :queryNormalized THEN 4
            WHEN ${businessNameSql} = :queryNormalized THEN 5
            ELSE 6
          END AS MATCH_PRIORITY
        FROM (
          SELECT DISTINCT
            COD_CLIENTE,
            NOM_CLIENTE,
            RAZON_SOCIAL,
            RUC,
            MATRICULA
          FROM VW_BOT_FACTURAS
          WHERE ${baseWhere.join("\n            AND ")}
        ) base
      ) ranked
      WHERE
        ranked.MATCH_PRIORITY < 6
        OR ranked.SIMILARITY >= :minSimilarity
      ORDER BY
        ranked.MATCH_PRIORITY,
        ranked.SIMILARITY DESC,
        ranked.NOM_CLIENTE,
        ranked.RAZON_SOCIAL
    )
    WHERE ROWNUM <= :limit
  `;

  const result = await connection.execute(sql, binds, {
    outFormat: 4002,
  });

  return (result.rows ?? []).map((row) => ({
    customerId: row.COD_CLIENTE,
    customerName: row.NOM_CLIENTE ?? null,
    businessName: row.RAZON_SOCIAL ?? null,
    taxId: row.RUC ?? null,
    similarity: Number(row.SIMILARITY ?? 0),
    exactMatch: Number(row.MATCH_PRIORITY ?? 6) < 6,
  }));
};
