// src/repositories/invoiceCustomers.repository.js

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export const searchInvoiceCustomersRepository = async ({
  connection,
  query,
  limit = 10,
}) => {
  const searchText = normalizeText(query);

  if (!searchText) {
    return [];
  }

  /*
   * La búsqueda se realiza únicamente sobre registros consultables.
   * De esta forma tampoco se exponen indirectamente clientes que
   * solamente tengan facturas con USER_CAN_CONSULT = 'N'.
   */
  const sql = `
    SELECT
      COD_CLIENTE,
      NOM_CLIENTE,
      RAZON_SOCIAL,
      RUC
    FROM (
      SELECT
        COD_CLIENTE,
        NOM_CLIENTE,
        RAZON_SOCIAL,
        RUC
      FROM (
        SELECT DISTINCT
          COD_CLIENTE,
          NOM_CLIENTE,
          RAZON_SOCIAL,
          RUC
        FROM VW_BOT_FACTURAS
        WHERE
          NVL(USER_CAN_CONSULT, 'S') <> 'N'
          AND (
            UPPER(NOM_CLIENTE) LIKE '%' || :query || '%'
            OR UPPER(RAZON_SOCIAL) LIKE '%' || :query || '%'
            OR UPPER(RUC) LIKE '%' || :query || '%'
            OR UPPER(COD_CLIENTE) = :query
            OR REPLACE(
              REPLACE(
                UPPER(MATRICULA),
                '-',
                ''
              ),
              ' ',
              ''
            ) LIKE '%' ||
              REPLACE(
                REPLACE(
                  :query,
                  '-',
                  ''
                ),
                ' ',
                ''
              ) ||
              '%'
          )
      )
      ORDER BY
        CASE
          WHEN UPPER(RUC) = :query THEN 1
          WHEN UPPER(NOM_CLIENTE) = :query THEN 2
          WHEN UPPER(RAZON_SOCIAL) = :query THEN 3
          WHEN UPPER(NOM_CLIENTE) LIKE :query || '%' THEN 4
          WHEN UPPER(RAZON_SOCIAL) LIKE :query || '%' THEN 5
          ELSE 6
        END,
        NOM_CLIENTE,
        RAZON_SOCIAL
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
    customerId: row.COD_CLIENTE,
    customerName: row.NOM_CLIENTE ?? null,
    businessName: row.RAZON_SOCIAL ?? null,
    taxId: row.RUC ?? null,
  }));
};
