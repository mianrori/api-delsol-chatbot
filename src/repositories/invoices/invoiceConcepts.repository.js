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
        UPPER(DESCRIPCION) LIKE '%' || :query || '%'
        OR UPPER(COD_CONCEPTO) = :query
      ORDER BY
        CASE
          WHEN UPPER(DESCRIPCION) = :query THEN 1
          WHEN UPPER(DESCRIPCION) LIKE :query || '%' THEN 2
          ELSE 3
        END,
        DESCRIPCION
    )
    WHERE ROWNUM <= :limit
  `;

  const result = await connection.execute(
    sql,
    {
      query: searchText,
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
