# Reapertura: usuario afectado y proceso habitual

Base: 22f4b02. Estado: investigacion pendiente de reproduccion con el usuario DEV afectado; caso no resuelto.

Los controles historicos con otra sesion autorizada no acreditan la secuencia que comienza con denegacion. No se reutilizan como reproduccion ni se presupone la causa.

El ejecutor usa login DEV protegido (entradas ocultas, credenciales/sesion en memoria), el endpoint habitual 5400 y el modelo/ruta reales del proceso. No hay SDK controlado ni cuenta alternativa. Primero verifica el codigo de diez modulos cargados mediante el inspector loopback interno del contenedor, ademas del manifiesto de /app. La traza temporal envuelve el driver Oracle sin cambiar argumentos, resultados, identidad o permisos; registra solo SQL con literales ocultos, metadatos protegidos de argumentos/estado y senales de autorizacion. La identidad y los identificadores usan HMAC con clave efimera que no se publica.

Si la pregunta inicial no devuelve denegacion, el control se detiene con AFFECTED_INITIAL_DENIAL_NOT_REPRODUCED y el caso queda bloqueado. No continua con otra cuenta ni declara resuelta la incidencia. Si se reproduce, contrasta la matricula con SELECT independientes usando la misma identidad, luego reinicia solo la conversacion temporal propia y compara la pregunta en conversacion nueva. No se modifican datos de negocio, permisos o expiraciones.

Se restauran los metodos originales del driver, se cierra el inspector si lo abrio el control, se limpia la conversacion temporal propia, se cierran conexiones y se hace logout. La evidencia y cualquier hallazgo se revisaran antes de publicarlos. No hay correccion de aplicacion propuesta sin reproduccion y causa verificadas. PR en borrador; sin merge ni despliegue.

## Primera reproduccion con el usuario afectado

Ejecutor caed886; codigo de aplicacion **22f4b02**, confirmado en 319 archivos de /app y diez modulos cargados del proceso real. **La denegacion inicial si se reprodujo**, usando el login afectado sin otra cuenta ni SDK controlado. Tres preguntas reales en 5400: inicial denegada, matricula tras denegacion y misma matricula en conversacion nueva con la misma identidad. Dos reinicios limpiaron unicamente la conversacion temporal propia.

- La denegacion ocurre en search_invoice_customers dentro de 2023: busquedas autorizadas vacias, sondeo de restringidos con HAS_RESTRICTED_DATA=true y ACCESS_DENIED. Estado namedPhase=denied, sin ID de cliente confirmado.
- La pregunta autonoma usa solamente plate, mode=detail, page=1, rows=20. El estado anterior se retira; no hay cliente, concepto, fechas ni otros filtros heredados. Los binds SQL reales tienen matricula normalizada y limites de pagina.
- El SQL real conserva el predicado autorizado y sondea N. Para la matricula devuelve conteo autorizado cero y HAS_RESTRICTED_DATA=false. La misma identidad, verificada por PostgreSQL y Oracle proxy, obtiene ABSENT con SELECT independientes. La conversacion nueva produce el mismo resultado.
- No se observa persistencia de filtros, perdida de la senal N o ruta distinta: get_invoices es la unica herramienta de la pregunta autonoma. **Se reprodujo el texto de cero registros, pero no una discrepancia con Oracle. El caso no se declara resuelto.**

El usuario confirmo que ANX123 es literal. Queda preparada una auditoria adicional de normalizacion Unicode independiente y de la proyeccion de la vista cuando el usuario pueda leer su definicion. Esta comprobacion no repetira HTTP ni supondra que hay una factura positiva. La ausencia observada en la vista no prueba inexistencia global o ausencia en fuentes que esta identidad no pueda consultar.

Traza diagnostica completada; driver restaurado, cuatro conexiones trazadas cerradas y todas las conexiones independientes cerradas. Inspector propio cerrado, logout y logs sanitizados aprobados. Cero eventos Bedrock y cero descargas PDF. HMAC efimero para identidad/IDs; no se publica su clave. [Reporte sanitizado](invoice-affected-user-caed886.json), SHA-256 **d97cb76388f15c9fd0162c4775ebed16a41adf56eca85b288bcbdd6cf4e60065**. No se modifico la aplicacion ni se propone una correccion sin causa demostrada.
