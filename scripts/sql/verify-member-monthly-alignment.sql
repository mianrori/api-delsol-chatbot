-- Solo lectura. Ejecutar en DEV sin cambios concurrentes sobre las compras.
-- Compara TODOS los socios y meses, incluyendo claves e importes NULL.
-- No devuelve documentos ni nombres.
WITH expected AS (
  SELECT cod_socio, TRUNC(fecha_compra, 'MM') AS mes,
         SUM(importe) AS total_amount, COUNT(*) AS purchase_count, 1 AS present
  FROM inv.vw_bot_compras_socio
  GROUP BY cod_socio, TRUNC(fecha_compra, 'MM')
), actual AS (
  SELECT cod_socio, mes, total_amount, purchase_count, 1 AS present
  FROM inv.mv_bot_compras_socio_mes
), compared AS (
  SELECT E.present AS expected_present, A.present AS actual_present,
    E.total_amount AS expected_amount, A.total_amount AS actual_amount,
    E.purchase_count AS expected_count, A.purchase_count AS actual_count
  FROM expected E FULL OUTER JOIN actual A
    ON (E.cod_socio = A.cod_socio OR (E.cod_socio IS NULL AND A.cod_socio IS NULL))
   AND (E.mes = A.mes OR (E.mes IS NULL AND A.mes IS NULL))
)
SELECT COUNT(*) AS compared_groups,
       NVL(SUM(CASE WHEN expected_present IS NULL OR actual_present IS NULL
         OR DECODE(expected_amount, actual_amount, 0, 1) = 1
         OR DECODE(expected_count, actual_count, 0, 1) = 1
         THEN 1 ELSE 0 END), 0) AS different_groups,
       NVL(SUM(actual_count), 0) - NVL(SUM(expected_count), 0) AS delta_purchases,
       NVL(SUM(actual_amount), 0) - NVL(SUM(expected_amount), 0) AS delta_amount
FROM compared;

-- La definicion debe referenciar INV.VW_BOT_COMPRAS_SOCIO.
SELECT query FROM all_mviews
WHERE owner = 'INV' AND mview_name = 'MV_BOT_COMPRAS_SOCIO_MES';

SELECT owner, mview_name, refresh_method, refresh_mode, last_refresh_date, staleness
FROM all_mviews
WHERE owner = 'INV' AND mview_name = 'MV_BOT_COMPRAS_SOCIO_MES';
