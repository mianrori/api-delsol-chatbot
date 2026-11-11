-- Diagnostico de solo lectura para un administrador autorizado.
-- No conceder privilegios ni consultar datos de tablas base.
-- No publicar la salida cruda (propietarios, codigo y literales).
-- Revisar localmente y entregar solo conclusiones sanitizadas.

SELECT owner, view_name, text_length, text
FROM all_views
WHERE view_name = 'VW_BOT_FACTURAS';

-- Binds tomados de la definicion, nunca del frontend. Repetir solo para
-- dependencias relevantes a MATRICULA, USER_CAN_CONSULT y predicados WHERE.
-- Incluye funciones/paquetes: el control b014b94 solo recorrio vistas.
SELECT owner, name, type, referenced_owner, referenced_name, referenced_type
FROM all_dependencies
WHERE owner = :object_owner AND name = :object_name
ORDER BY referenced_type, referenced_owner, referenced_name;

SELECT owner, view_name, text_length, text
FROM all_views
WHERE owner = :dependency_owner AND view_name = :dependency_name;

SELECT owner, name, type, line, text
FROM all_source
WHERE owner = :dependency_owner AND name = :dependency_name
  AND type IN ('FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TYPE', 'TYPE BODY')
ORDER BY type, line;

-- Revisar sinonimos y politicas si afectan a las fuentes pertinentes.
SELECT owner, synonym_name, table_owner, table_name, db_link
FROM all_synonyms
WHERE synonym_name = :dependency_name
  AND owner IN (:object_owner, 'PUBLIC');

SELECT object_owner, object_name, policy_name, pf_owner, package, function,
       sel, enable
FROM all_policies
WHERE object_owner = :dependency_owner AND object_name = :dependency_name;

-- Si ALL_* no ofrece visibilidad suficiente, usar DBA_* equivalentes solo
-- con la autorizacion existente del administrador. Una salida vacia no
-- demuestra ausencia de dependencia/politica. Documentar codigo wrapped,
-- referencias remotas y objetos no accesibles como limites.
-- Preguntas: de que campo/expresion sale MATRICULA; puede devolver NULL por
-- permisos; que parte del permiso depende de USER y que parte de la fila;
-- puede un predicado ocultar filas antes de evaluar la matricula.
-- No buscar ANX123 en tablas base para eludir restricciones de la vista.
