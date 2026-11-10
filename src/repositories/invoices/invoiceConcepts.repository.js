import {oracleSearchText,normalizeSearchText as normalizeConceptName} from '../searchText.sql.js';
// src/repositories/invoiceConcepts.repository.js

const normalizeSearchText = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export const searchInvoiceConceptsRepository = async ({
  connection,
  query,
  limit = 10,
}) => {
  const searchText = normalizeSearchText(query);

  if (!searchText) {
    return [];
  }

  const normalizedQuery=normalizeConceptName(query),name=oracleSearchText("DESCRIPCION");
  const sql = `
    SELECT
      COD_CONCEPTO,
      DESCRIPCION
    FROM (
      SELECT
        COD_CONCEPTO,
        DESCRIPCION
      FROM VW_BOT_CONCEPTOS
      WHERE
        INSTR(${name}, :normalizedQuery) > 0
        OR UPPER(COD_CONCEPTO) = :query
      ORDER BY
        CASE
          WHEN ${name} = :normalizedQuery THEN 1
          WHEN INSTR(${name}, :normalizedQuery) = 1 THEN 2
          ELSE 3
        END,
        DESCRIPCION, COD_CONCEPTO
    )
    WHERE ROWNUM <= :limit
  `;

  const result = await connection.execute(
    sql,
    {
      query: searchText,
      normalizedQuery,
      limit: Number(limit),
    },
    {
      outFormat: 4002,
    },
  );

  return (result.rows ?? []).map((row) => ({
    conceptId: row.COD_CONCEPTO,
    description: row.DESCRIPCION,
  }));
};
