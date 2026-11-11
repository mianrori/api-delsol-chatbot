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

## Auditoria adicional de normalizacion

Ejecutor b96353a con el login afectado; cero preguntas HTTP y cero resets. El predicado SQL no encuentra filas permitidas ni restringidas para ANX123. La busqueda diagnostica de candidatas, separada del predicado productivo y seguida de normalizacion Unicode en memoria, tampoco encontro candidatas. No se observa discrepancia de normalizacion para esta matricula; no se ampliaron las coincidencias de produccion ni se fabricaron datos.

La vista contiene filas restringidas con matricula nula y con matricula no nula; esto **no prueba que ANX123 este oculta**. La definicion de la vista fue legible y tiene expresiones condicionales, pero el control recogido no concluye si afectan a MATRICULA. Queda preparada una inspeccion de las expresiones y dependencias de vistas (solo metadatos, maximo dos niveles/seis definiciones), sin leer datos de tablas base ni exportar definiciones/propietarios sin sanitizar.

Conexiones e inspector cerrados, logout y logs sanitizados aprobados. Codigo cargado sigue en 22f4b02. [Reporte sanitizado de normalizacion](invoice-affected-user-normalization-b96353a.json), SHA-256 **94e8efbacdf9b26528972451117fe7d873cf8c8eaadc370190e4696335222b33**. El caso permanece abierto, sin correccion de aplicacion ni conclusion sobre datos no visibles en la vista.

## Proyeccion y alcance del permiso (11 de noviembre de 2026)

Ejecutor **b014b94**, aplicacion **22f4b02**, login protegido del mismo usuario afectado. Docker habia reiniciado: el preflight rechazo la evidencia de arranque anterior antes de pedir credenciales. Se verificaron de nuevo los 319 archivos (mismo manifiesto e imagen), diez modulos cargados y salud; no se reconstruyo ni desplego. Inicio actual del contenedor: 2026-11-11T12:04:20.303914333Z.

La definicion de VW_BOT_FACTURAS es accesible. USER_CAN_CONSULT combina un predicado de columna con EXISTS que compara con USER. Esto evidencia componentes de fila y de usuario en la expresion; no una constante global uniforme. La misma identidad ve tanto filas autorizadas como restringidas en la vista. **No corresponde denegar cualquier resultado vacio por existir alguna fila N en otro alcance.** No se publican nombres internos, valores de columnas ni literales de negocio.

MATRICULA sale de una expresion TRIM/UPPER con funciones anidadas y una referencia de columna. Su proyeccion no contiene CASE/DECODE, rama NULL ni referencia explicita a USER_CAN_CONSULT; tampoco comparte una funcion no trivial detectada con el permiso. **Esto no demuestra que las funciones llamadas o los predicados de las fuentes no oculten datos.** El ejecutor recorrio dependencias de tipo VIEW (ninguna adicional informada), no cuerpos de funciones/paquetes, politicas ni todos los predicados. metadataUnavailableForSomeDependencies=false solo describe ese recorrido limitado; no acredita acceso completo a esos otros objetos.

La secuencia HTTP caed886 y la auditoria Unicode b96353a siguen separadas: denegacion inicial real confirmada; ANX123 devuelve cero filas permitidas y cero restringidas que coincidan en la vista, tanto despues como en conversacion nueva, sin filtros heredados. No hay evidencia de una fila restringida ANX123 ni de su ocultacion; tampoco se puede concluir inexistencia global a partir de esta visibilidad. La auditoria actual no repite HTTP (cero POST y resets) ni demuestra que los datos no hayan cambiado entre sesiones.

**Bloqueo restante:** falta inspeccionar las funciones que producen MATRICULA y los predicados/politicas pertinentes para distinguir ausencia global de dato no visible. No se ha probado que sus definiciones sean inaccesibles: este ejecutor no las solicito. Se prepara [consulta de metadatos para administrador autorizado](../scripts/invoice-view-metadata-admin.sql), sin lectura de tablas de negocio ni cambios de privilegios. Si la definicion/cuerpo no es accesible o esta wrapped, registrar ese limite; no suplirlo con otra cuenta consultando facturas ni con un positivo fabricado.

[Reporte sanitizado de proyeccion](invoice-affected-user-projection-b014b94.json), SHA-256 **1da5be7a957d9cd91379cc5c119f333e1c766f1176a9b7818c547155a2d35d18**. Identidad PostgreSQL/Oracle coincidente; conexiones e inspector cerrados, logout y logs sanitizados aprobados. Cero eventos Bedrock y descargas PDF. Caso abierto, PR #50 en borrador; sin cambios de aplicacion, merge o despliegue. Se conservan reservas de mixtos/segunda pagina mixta y PDF positivo/404 separados.
