-- Solo lectura. Ejecutar en DEV sin cambios concurrentes sobre las compras.
-- Por defecto compara SOLO ENERO 2023. Para otro mes, editar ambas fechas.
-- No recorrer todo el historico durante la comprobacion interactiva.
-- UNION ALL y GROUP BY comparan tambien claves NULL sin una union con OR.
-- No devuelve documentos ni nombres. Cancelar este SELECT no cambia la MV.
WITH period AS (
  SELECT DATE '2023-01-01' AS date_from, DATE '2023-02-01' AS date_until
  FROM dual
), expected AS (
  SELECT cod_socio, TRUNC(fecha_compra, 'MM') AS mes,
         SUM(importe) AS total_amount, COUNT(*) AS purchase_count
  FROM inv.vw_bot_compras_socio C CROSS JOIN period P
  WHERE C.fecha_compra >= P.date_from AND C.fecha_compra < P.date_until
  GROUP BY cod_socio, TRUNC(fecha_compra, 'MM')
), combined AS (
  SELECT cod_socio, mes, total_amount AS source_amount,
         CAST(NULL AS NUMBER) AS monthly_amount,
         purchase_count AS source_count, 0 AS monthly_count,
         1 AS source_groups, 0 AS monthly_groups
  FROM expected
  UNION ALL
  SELECT M.cod_socio, M.mes, CAST(NULL AS NUMBER), M.total_amount,
         0, M.purchase_count, 0, 1
  FROM inv.mv_bot_compras_socio_mes M CROSS JOIN period P
  WHERE M.mes >= P.date_from AND M.mes < P.date_until
), compared AS (
  SELECT cod_socio, mes, SUM(source_amount) AS source_amount,
         SUM(monthly_amount) AS monthly_amount,
         SUM(source_count) AS source_count, SUM(monthly_count) AS monthly_count,
         SUM(source_groups) AS source_groups, SUM(monthly_groups) AS monthly_groups
  FROM combined
  GROUP BY cod_socio, mes
)
SELECT COUNT(*) AS compared_groups,
       NVL(SUM(CASE WHEN source_groups <> 1 OR monthly_groups <> 1
         OR DECODE(source_amount, monthly_amount, 0, 1) = 1
         OR DECODE(source_count, monthly_count, 0, 1) = 1
         THEN 1 ELSE 0 END), 0) AS different_groups,
       NVL(SUM(monthly_count), 0) - NVL(SUM(source_count), 0) AS delta_purchases,
       NVL(SUM(monthly_amount), 0) - NVL(SUM(source_amount), 0) AS delta_amount
FROM compared;

-- La definicion debe referenciar INV.VW_BOT_COMPRAS_SOCIO.
SELECT query FROM all_mviews
WHERE owner = 'INV' AND mview_name = 'MV_BOT_COMPRAS_SOCIO_MES';

SELECT owner, mview_name, refresh_method, refresh_mode, last_refresh_date, staleness
FROM all_mviews
WHERE owner = 'INV' AND mview_name = 'MV_BOT_COMPRAS_SOCIO_MES';
