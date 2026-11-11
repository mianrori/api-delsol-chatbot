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

-- Continuacion administrativa tras 948332d. Ejecutar SOLO con acceso existente
-- de un administrador en el mismo DEV. Estas consultas no fueron ejecutadas
-- por el chatbot. No conectar otra cuenta para consultar facturas.
-- El control afectado vio diez dependencias TABLE y ninguna FUNCTION/PACKAGE;
-- ALL_POLICIES no mostro filas para la vista ni esas tablas. Verificar si esa
-- visibilidad coincide con el catalogo completo, sin cambiar privilegios.
SELECT owner, view_name, text_length, text
FROM dba_views
WHERE view_name = 'VW_BOT_FACTURAS';

SELECT d.owner, d.name, d.type, d.referenced_owner, d.referenced_name,
       d.referenced_type, d.referenced_link_name
FROM dba_dependencies d
WHERE d.type = 'VIEW' AND d.name = 'VW_BOT_FACTURAS'
ORDER BY d.owner, d.referenced_type, d.referenced_owner, d.referenced_name;

-- Incluye una fila por objeto aun sin politicas; revisar que el conjunto
-- corresponda a la definicion DEV esperada si hay varios propietarios.
WITH roots AS (
  SELECT owner, view_name AS object_name FROM dba_views
  WHERE view_name = 'VW_BOT_FACTURAS'
), scoped_objects AS (
  SELECT owner, object_name FROM roots
  UNION
  SELECT d.referenced_owner, d.referenced_name
  FROM dba_dependencies d
  JOIN roots r ON r.owner = d.owner AND r.object_name = d.name
  WHERE d.type = 'VIEW' AND d.referenced_type IN ('TABLE', 'VIEW')
    AND d.referenced_link_name IS NULL
)
SELECT o.owner, o.object_name, p.policy_name, p.pf_owner, p.package,
       p.function, p.sel, p.enable
FROM scoped_objects o
LEFT JOIN dba_policies p
  ON p.object_owner = o.owner AND p.object_name = o.object_name
ORDER BY o.owner, o.object_name, p.policy_name;

-- Si aparecen politicas o dependencias adicionales, inspeccionar sus cuerpos
-- con DBA_SOURCE siguiendo los binds anteriores. No ejecutarlos ni extraer
-- sus filas de negocio. Entregar solo: proyeccion de matricula condicionada
-- por identidad o no; predicados/politicas que pueden ocultar filas; alcance
-- de visibilidad confirmado o limite concreto. Los INNER JOIN ya observados
-- pueden excluir filas, pero no prueban que ANX123 exista antes de esos joins.
