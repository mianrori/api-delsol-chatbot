-- Oracle 19c DEV. Ejecutar conectado COMO INV, en una sesion dedicada y sin
-- transacciones pendientes. Activar DBMS Output en PL/SQL Developer.
-- Durante el cambio no ejecutar consultas del chatbot ni modificar compras.
-- No modifica VW_BOT_COMPRAS_SOCIO ni su seleccion de contratos/rubros.
-- Conserva la tabla contenedora, sus datos hasta el refresco atomico e indices.
-- DDL hace commits implicitos: ROLLBACK no deshace DROP/CREATE.
-- Tras terminar ejecutar verify-member-monthly-alignment.sql y
-- check-member-monthly-totals.sql. No usar el resultado si este bloque falla.
DECLARE
  c_name CONSTANT VARCHAR2(30) := 'MV_BOT_COMPRAS_SOCIO_MES';
  c_create CONSTANT VARCHAR2(1000) :=
    'CREATE MATERIALIZED VIEW INV.MV_BOT_COMPRAS_SOCIO_MES ' ||
    '(COD_SOCIO, MES, TOTAL_AMOUNT, PURCHASE_COUNT) ' ||
    'ON PREBUILT TABLE WITHOUT REDUCED PRECISION ' ||
    'REFRESH COMPLETE ON DEMAND DISABLE QUERY REWRITE AS ';
  l_old_query VARCHAR2(32767);
  l_query_len NUMBER;
  l_method VARCHAR2(30);
  l_mode VARCHAR2(30);
  l_count NUMBER;
  l_grant_count PLS_INTEGER := 0;
  l_changed BOOLEAN := FALSE;
  l_refreshed BOOLEAN := FALSE;
  l_error VARCHAR2(2000);
  TYPE statements IS TABLE OF VARCHAR2(4000) INDEX BY PLS_INTEGER;
  l_grants statements;
  l_indexes statements;
  l_index_count PLS_INTEGER := 0;

  FUNCTION recipient(p_name VARCHAR2) RETURN VARCHAR2 IS
  BEGIN
    IF p_name = 'PUBLIC' THEN RETURN 'PUBLIC'; END IF;
    RETURN DBMS_ASSERT.ENQUOTE_NAME(p_name, FALSE);
  END;

  PROCEDURE restore_grants IS
  BEGIN
    FOR i IN 1 .. l_grant_count LOOP
      EXECUTE IMMEDIATE l_grants(i);
    END LOOP;
  END;
BEGIN
  IF SYS_CONTEXT('USERENV', 'SESSION_USER') <> 'INV' THEN
    RAISE_APPLICATION_ERROR(-20001, 'Ejecutar conectado como INV. No basta ALTER SESSION SET CURRENT_SCHEMA.');
  END IF;

  SELECT query_len, refresh_method, refresh_mode
  INTO l_query_len, l_method, l_mode
  FROM user_mviews WHERE mview_name = c_name;
  IF l_query_len > 30000 OR l_method <> 'COMPLETE' OR l_mode <> 'DEMAND' THEN
    RAISE_APPLICATION_ERROR(-20002, 'La materializada no coincide con COMPLETE ON DEMAND esperado. No se modifico.');
  END IF;
  SELECT query INTO l_old_query FROM user_mviews WHERE mview_name = c_name;

  -- El contenedor tiene el mismo contrato de cuatro columnas que usa Node.
  SELECT COUNT(*) INTO l_count FROM user_tab_columns
  WHERE table_name = c_name;
  IF l_count <> 4 THEN
    RAISE_APPLICATION_ERROR(-20003, 'El contenedor no tiene las cuatro columnas esperadas. No se modifico.');
  END IF;
  SELECT COUNT(*) INTO l_count FROM user_tab_columns
  WHERE table_name = c_name AND column_name IN ('COD_SOCIO', 'MES', 'TOTAL_AMOUNT', 'PURCHASE_COUNT');
  IF l_count <> 4 THEN
    RAISE_APPLICATION_ERROR(-20004, 'Los nombres de columnas no coinciden. No se modifico.');
  END IF;

  -- Esta materializada no tiene columna moneda; debe representar la base PYG.
  SELECT COUNT(*) INTO l_count
  FROM inv.vw_bot_compras_socio
  WHERE (UPPER(TRIM(moneda)) NOT IN ('GUARANIES', 'GUARANÍES', 'PYG') OR moneda IS NULL)
    AND (UPPER(TRIM(simbolo_moneda)) NOT IN ('PYG', 'GS', 'GS.', 'G.', '₲') OR simbolo_moneda IS NULL);
  IF l_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20005, 'La fuente contiene moneda no reconocida como PYG. No se modifico.');
  END IF;

  -- Capturar solamente los permisos del objeto que pertenece a INV.
  FOR g IN (SELECT grantee, privilege, grantable, hierarchy
            FROM user_tab_privs_made WHERE table_name = c_name AND grantor = 'INV') LOOP
    l_grant_count := l_grant_count + 1;
    l_grants(l_grant_count) := 'GRANT ' || g.privilege ||
      ' ON INV.MV_BOT_COMPRAS_SOCIO_MES TO ' || recipient(g.grantee) ||
      CASE WHEN g.hierarchy = 'YES' THEN ' WITH HIERARCHY OPTION' ELSE '' END ||
      CASE WHEN g.grantable = 'YES' THEN ' WITH GRANT OPTION' ELSE '' END;
  END LOOP;
  FOR g IN (SELECT grantee, privilege, column_name, grantable
            FROM user_col_privs_made WHERE table_name = c_name AND grantor = 'INV') LOOP
    l_grant_count := l_grant_count + 1;
    l_grants(l_grant_count) := 'GRANT ' || g.privilege || ' (' ||
      DBMS_ASSERT.ENQUOTE_NAME(g.column_name, FALSE) ||
      ') ON INV.MV_BOT_COMPRAS_SOCIO_MES TO ' || recipient(g.grantee) ||
      CASE WHEN g.grantable = 'YES' THEN ' WITH GRANT OPTION' ELSE '' END;
  END LOOP;
  FOR idx IN (SELECT index_name FROM user_indexes WHERE table_name = c_name) LOOP
    l_index_count := l_index_count + 1;
    l_indexes(l_index_count) := idx.index_name;
  END LOOP;

  EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW INV.MV_BOT_COMPRAS_SOCIO_MES PRESERVE TABLE';
  l_changed := TRUE;
  EXECUTE IMMEDIATE c_create || q'[
    SELECT cod_socio, TRUNC(fecha_compra, 'MM') AS mes,
           SUM(importe) AS total_amount, COUNT(*) AS purchase_count
    FROM inv.vw_bot_compras_socio
    GROUP BY cod_socio, TRUNC(fecha_compra, 'MM')
  ]';

  -- ON PREBUILT TABLE registra la nueva consulta, no recalcula los datos.
  -- Es obligatorio completar este refresco antes de usar el chatbot.
  DBMS_MVIEW.REFRESH(list => 'INV.MV_BOT_COMPRAS_SOCIO_MES',
                     method => 'C', atomic_refresh => TRUE);
  l_refreshed := TRUE;
  restore_grants;
  FOR i IN 1 .. l_index_count LOOP
    SELECT COUNT(*) INTO l_count FROM user_indexes
    WHERE table_name = c_name AND index_name = l_indexes(i);
    IF l_count <> 1 THEN
      RAISE_APPLICATION_ERROR(-20006, 'No se conservo un indice existente. Revisar el objeto antes de usar el chatbot.');
    END IF;
  END LOOP;
  DBMS_OUTPUT.PUT_LINE('Materializada alineada con VW_BOT_COMPRAS_SOCIO y refrescada.');
  DBMS_OUTPUT.PUT_LINE('Permisos reproducidos: ' || l_grant_count || '. Indices conservados: ' || l_index_count || '.');
  DBMS_OUTPUT.PUT_LINE('Ejecutar las dos comprobaciones de solo lectura antes de retomar las pruebas.');
EXCEPTION
  WHEN OTHERS THEN
    l_error := SUBSTR(SQLERRM, 1, 1200);
    IF l_changed THEN
      BEGIN
        ROLLBACK;
        SELECT COUNT(*) INTO l_count FROM user_mviews WHERE mview_name = c_name;
        IF l_count > 0 THEN
          EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW INV.MV_BOT_COMPRAS_SOCIO_MES PRESERVE TABLE';
        END IF;
        EXECUTE IMMEDIATE c_create || l_old_query;
        -- Si los datos ya se refrescaron con la nueva definicion, reconstruir
        -- tambien los datos de la anterior antes de declarar recuperacion.
        IF l_refreshed THEN
          DBMS_MVIEW.REFRESH(list => 'INV.MV_BOT_COMPRAS_SOCIO_MES',
                             method => 'C', atomic_refresh => TRUE);
        END IF;
        restore_grants;
        DBMS_OUTPUT.PUT_LINE('Se restauro la definicion anterior. La correccion NO fue aplicada.');
      EXCEPTION
        WHEN OTHERS THEN
          RAISE_APPLICATION_ERROR(-20098, 'Fallo la correccion y su recuperacion. No usar el chatbot. Causa inicial: ' ||
            l_error || '. Recuperacion: ' || SUBSTR(SQLERRM, 1, 500));
      END;
    END IF;
    RAISE_APPLICATION_ERROR(-20099, 'Correccion no aplicada: ' || l_error);
END;
/
