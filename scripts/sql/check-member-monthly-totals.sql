-- Read-only diagnostic. Change the two dates together to inspect another month.
-- No documents or names are returned. Run outside the interactive chatbot.
WITH period AS (
  SELECT DATE '2023-01-01' AS date_from, DATE '2023-02-01' AS date_until FROM dual
), source_totals AS (
  SELECT CASE
    WHEN UPPER(TRIM(C.SIMBOLO_MONEDA)) IN ('PYG', 'GS', 'GS.', 'G.', '₲')
      OR UPPER(TRIM(C.MONEDA)) IN ('GUARANIES', 'GUARANÍES', 'PYG')
    THEN 'PYG' ELSE NVL(C.MONEDA, C.SIMBOLO_MONEDA) END AS currency,
    COUNT(DISTINCT C.COD_SOCIO) AS members,
    COUNT(*) AS purchases, NVL(SUM(C.IMPORTE), 0) AS amount
  FROM VW_BOT_COMPRAS_SOCIO C
  INNER JOIN VW_BOT_SOCIOS S ON S.COD_SOCIO = C.COD_SOCIO
  CROSS JOIN period P
  WHERE C.FECHA_COMPRA >= P.date_from AND C.FECHA_COMPRA < P.date_until
  GROUP BY CASE
    WHEN UPPER(TRIM(C.SIMBOLO_MONEDA)) IN ('PYG', 'GS', 'GS.', 'G.', '₲')
      OR UPPER(TRIM(C.MONEDA)) IN ('GUARANIES', 'GUARANÍES', 'PYG')
    THEN 'PYG' ELSE NVL(C.MONEDA, C.SIMBOLO_MONEDA) END
), monthly_totals AS (
  SELECT 'PYG' AS currency, COUNT(DISTINCT M.COD_SOCIO) AS members,
    NVL(SUM(M.PURCHASE_COUNT), 0) AS purchases, NVL(SUM(M.TOTAL_AMOUNT), 0) AS amount
  FROM MV_BOT_COMPRAS_SOCIO_MES M
  INNER JOIN VW_BOT_SOCIOS S ON S.COD_SOCIO = M.COD_SOCIO
  CROSS JOIN period P
  WHERE M.MES >= P.date_from AND M.MES < P.date_until
)
SELECT NVL(S.currency, M.currency) AS currency,
  S.members AS source_members, M.members AS monthly_members,
  S.purchases AS source_purchases, M.purchases AS monthly_purchases,
  S.amount AS source_amount, M.amount AS monthly_amount,
  NVL(M.purchases, 0) - NVL(S.purchases, 0) AS delta_purchases,
  NVL(M.amount, 0) - NVL(S.amount, 0) AS delta_amount
FROM source_totals S FULL OUTER JOIN monthly_totals M ON M.currency = S.currency;

-- Refresh metadata is evidence of freshness, not proof of matching definitions.
SELECT owner, mview_name, last_refresh_type, last_refresh_date, staleness
FROM all_mviews
WHERE mview_name = 'MV_BOT_COMPRAS_SOCIO_MES';
