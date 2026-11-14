# Reapertura: usuario afectado y proceso habitual

## Reorientacion PR #50: autorizacion por fila (12 de noviembre de 2026)

**Estado vigente: PR #50 fusionada y merge f2c2b2f desplegado en Docker DEV; caso original abierto.** La vista devuelve filas y `USER_CAN_CONSULT` decide si pueden mostrarse. La comprobacion administrativa deja de ser un requisito para este trabajo; no se repiten inspecciones de catalogos, dependencias o politicas. Los estados anteriores de borrador/lista para revision se conservan como historia, no instrucciones vigentes.

### Merge y validacion del endpoint habitual 5400

El 12 de noviembre de 2026 se fusiono la PR #50 con head revisado f4f7d1d mediante merge **f2c2b2fecf417dbbafd981e256c52520dba0b35b**. La rama local feature/chat-sales-pilot se actualizo por avance rapido y se reconstruyo/recreo exclusivamente el servicio chatbot de docker-compose.dev.yml. ERP y Oracle no se reconstruyeron. No se repitieron suites completas, las 71 pruebas ni las 17 pruebas locales del preflight.

**Despliegue comprobado:** 334 archivos de aplicacion, scripts, pruebas y configuracion coinciden con el merge; diez modulos cargados del proceso real se verificaron por hash con el inspector loopback temporal. Imagen `sha256:872527d6c50f525b92608e6e60f21d584db49e9822ea340c1c780a396159fb3f`, Node 22.23.5, arranque 12:09:00 America/Asuncion (15:09:00 UTC). PM2 online con cero reinicios, arranque sin texto de error, salud GET 200/development tanto antes como despues del control. Logging de payloads sensibles desactivado. Manifiesto de fuentes SHA-256 `cc4e3c96587a1d0ef6efac94493dac9e7f6ae10460767210143b762764766244`.

**Dos POST reales en el endpoint habitual 5400**, con login protegido del usuario afectado, 12:15:29–12:15:41 America/Asuncion; 17 comprobaciones del control desplegado aprobadas, sin sumar sus aserciones a las pruebas anteriores. Identidad PostgreSQL/USER/SESSION_USER Oracle coincidente y proxy presente; sin cuenta alternativa, servidor aislado o sustitucion del modelo.

| Pregunta | HTTP real | Oracle independiente con la misma identidad |
| --- | --- | --- |
| Facturas de arrendamiento minimo de 2023 del local Impacto | Denegacion en search_invoice_customers; sin filas, enlaces PDF ni acciones. La traza confirma que el bit restringido produce ACCESS_DENIED. | Para las coincidencias fuertes y fechas efectivas del resolver: existencia autorizada falsa y restringida verdadera. Solo salen bits, no datos de clientes restringidos. |
| Facturas de la matricula ANX123 | Ausencia de registros. Solo get_invoices con plate/mode/page/rows; sin cliente, concepto, fechas u otro alcance heredado. Estado nominal anterior retirado. | Cero coincidencias autorizadas y bit restringido falso; misma igualdad REGEXP_REPLACE(UPPER(MATRICULA), '[-[:space:]]', '') sobre la matricula normalizada. Conteos y pagina vacia conciliados; sin PDFs. |

El SQL de conteo real mantiene el filtro autorizado y el sondeo EXISTS de restringidos, ambos con el unico bind de matricula. El detalle mantiene el predicado autorizado; no se recuperaron datos restringidos. **La discrepancia original de ANX123 sigue pendiente: su ausencia actual coincide con Oracle y no demuestra que el caso original este corregido ni ausencia global. No se obtuvo muestra mixta Oracle; tampoco se acredita la denegacion total de get_invoices con factura restringida, porque Impacto se detuvo en el resolver.** Se conservan segunda pagina mixta y PDF positivo/404 como reservas anteriores.

Se instalo solo durante la secuencia una traza acotada a la identidad de prueba y un bloqueo temporal de send de Bedrock para impedir una salida accidental. **Cero intentos de proveedor, cero eventos Bedrock y cero descargas PDF.** Se restauraron driver y bloqueo, se cerraron 3/3 conexiones trazadas y 4/4 independientes sin errores, se limpio una sola conversacion propia con reset, se cerro el pool PostgreSQL del worker y se retiro/cerró el inspector propio; logout ERP confirmado. La imagen/arranque del servicio no cambiaron durante el control. Logs sanitizados aprobados: 45 lineas chatbot reconocidas (payloads ocultos, sesiones enmascaradas, cero registros desconocidos y Bedrock) y 2 lineas ERP solo de metadatos protegidos de autenticacion. Salud final 12:16:42, HTTP 200 y PM2 online con cero reinicios.

Un primer preflight diagnostico rechazo el protocolo del reporte por esperar baseCommit en vez de commit; se corrigio el ejecutor temporal antes del login. No se hizo HTTP de negocio, consulta de datos o llamada al proveedor en ese intento. No fue un fallo de la aplicacion ni motivo para reiniciar el servicio. Los ejecutores temporales y build logs permanecen en logs/ ignorado; sus hashes se registran en el reporte. No se cambiaron archivos de aplicacion, configuracion, datos de negocio, permisos o expiraciones para generar muestras; solo el ciclo normal de login/actividad/logout propio.

[Fuentes, arranque y salud inicial](invoice-pr50-dev-deployed-source.json), SHA-256 `12b7ceb71c57105857c682c03653fe7f4dc198a01d77c545542085365591e8d1`. [Reporte HTTP/Oracle sanitizado](invoice-pr50-dev-live-f2c2b2f.json), SHA-256 **f5abf6e8021b99079d33da2769f96929e57a51ae1ef4c58db6470b244936bfed**. [Salud final](invoice-pr50-dev-final-health.json). La documentacion posterior no implica otro rebuild: el codigo ejecutado permanece en el merge f2c2b2f.

`NVL(USER_CAN_CONSULT, 'S') <> 'N'` excluye las filas restringidas antes del conteo y del detalle por matricula. Por eso un conteo autorizado de cero no permite distinguir denegacion de ausencia. Se conserva ese predicado obligatorio para datos, totales, resumenes, paginacion y PDFs. La existencia de restringidos se determina con `CASE WHEN EXISTS (SELECT 1 FROM VW_BOT_FACTURAS WHERE USER_CAN_CONSULT = 'N' AND ...filtros efectivos...) THEN 1 ELSE 0 END`, sin devolver sus columnas, importes, identificadores, PDFs ni cantidades.

El sondeo ya existia en 22f4b02. Este cambio hace explicita una unica lista de filtros efectivos compartida por ambos predicados, en lugar de obtener el alcance restringido con `where.slice(1)`. No se afirma que faltara el sondeo en la reproduccion historica ni que este refactor arregle ANX123. En detalle, el bit independiente sigue viajando junto al conteo autorizado en una sentencia; no depende de su pagina ni de que haya filas autorizadas. En resumen, se obtiene con SELECT sobre DUAL separado del agregado autorizado.

Cliente, concepto, fechas, factura, periodo, matricula y anulacion usan los mismos predicados y binds. Ambas ramas usan `normalizeInvoicePlate` y la misma igualdad `REGEXP_REPLACE(UPPER(MATRICULA), '[-[:space:]]', '') = :plate`. No se amplian coincidencias con LIKE ni se inventa una restriccion por existir filas N fuera del alcance.

| Filas coincidentes autorizadas | Existen restringidas en el mismo alcance | Respuesta |
| --- | --- | --- |
| Ninguna | Si | ACCESS_DENIED: «El usuario no tiene permisos para consultar esta información». Sin datos, enlaces ni acciones. |
| Si | Si | Solo filas autorizadas y aviso parcial; conteos, importes y PDFs exclusivamente autorizados. |
| Ninguna | No | Ausencia de coincidencias; sin denegacion falsa. |
| Si | No | Resultado autorizado habitual. Una pagina fuera de rango conserva sus totales y no se convierte en denegacion. |

### Regresion y contraste disponible

71/71 pruebas enfocadas aprobadas con Node 22.23.4 en candidato temporal aislado, sin cambiar /app ni reiniciar el servicio. Incluye `invoiceAccess`, `invoices`, `invoicePlateScope`, `invoicePlatePdf` e `invoiceNamedRequest`. Se comparan los predicados completos y binds de ambos alcances en detalle/resumen para variantes normalizadas de matricula, y el mensaje exacto del servicio. La secuencia «facturas de arrendamiento minimo del 2023 del local impacto» (denegada) → «facturas de la matricula anx123» incluye ahora tambien mixtos, chat/HTTP y con/sin recorte de historial, aviso parcial, conteos y enlace PDF autorizado. Son conexiones Oracle simuladas y flujo determinista sin modelo real; no acreditan positivos Oracle restringidos ni descarga de PDFs.

La fixture HTTP fija ahora `NODE_ENV=development`: antes dependia del entorno del proceso y omitia `env` al ejecutarse localmente sin NODE_ENV. Se verifico de nuevo el archivo de alcance tras ese ajuste; el refactor de aplicacion ya habia pasado la suite enfocada.

Se contrasta la regresion con el [reporte Oracle/HTTP del usuario afectado caed886](invoice-affected-user-caed886.json), reutilizado como evidencia historica, no como ejecucion del candidato nuevo: identidad PostgreSQL/proxy Oracle coincidente; primera pregunta denegada en search_invoice_customers; consulta autonoma de matricula sin cliente, concepto o fechas heredadas; en secuencia y conversacion nueva, conteo autorizado cero y bit restringido falso, conciliados con SELECT independientes de la misma identidad. La [auditoria de normalizacion b96353a](invoice-affected-user-normalization-b96353a.json) tampoco encontro candidatas para el literal ANX123.

**Estado al preparar be559ef:** no se habia hecho un nuevo login ni Oracle/POST con el usuario afectado. Esa limitacion se supera en el contraste nuevo documentado a continuacion; no se reutilizan los ejecutores fijados a 22f4b02 como evidencia del candidato. Se mantienen pendientes los positivos Oracle de facturas solo restringidas, mixtas, segunda pagina mixta y PDF positivo/404 separados. No se infiere ausencia global a partir de la vista.

Sin merge, despliegue, cambios de datos, permisos, configuracion o expiraciones. Sin nuevas inspecciones administrativas.

### Contraste nuevo de be559ef con login protegido del usuario afectado

Ejecutado el 12 de noviembre de 2026, **09:35:03–09:35:46 America/Asuncion** (12:35:03–12:35:46 UTC). Commit de aplicacion ejecutado: **be559ef69a5e376c37fd479c36796b7f4023e831**, Node 22.23.4, 324 archivos verificados contra el archivo Git del candidato; manifiesto SHA-256 `cd78a36974c22dee44d98659e1ce2474e0ff3b47b5f713b713b1232845446a8f`. El ejecutor nuevo se copia aparte y se identifica por su hash; no forma parte del commit de aplicacion ejecutado.

Login DEV del usuario afectado introducido por el usuario en consola con entrada oculta; credenciales y sessionId solo en memoria/stdin. La identidad obtenida de PostgreSQL mediante sessionId coincide con USER/SESSION_USER Oracle y tiene PROXY_USER. Sin cuenta alternativa ni identidad elegida por el frontend.

**28/28 comprobaciones del control, dos POST HTTP reales** sobre listener loopback temporal, con router/controller/chat/services/repositories del candidato y Oracle real. La ruta tipada es determinista: SDK que rechaza invocaciones y cero llamadas al modelo/proveedor. Acredita HTTP/Oracle del candidato aislado; no interpretacion por modelo remoto ni el proceso desplegado de 5400. No se repitieron las 71 pruebas.

| Paso | Resultado HTTP y contraste Oracle independiente | Limite |
| --- | --- | --- |
| «facturas de arrendamiento minimo del 2023 del local Impacto» | Denegacion reproducida en search_invoice_customers, con fechas 2023. Sondeo real de restringidos, SELECT 1 y sin recuperar clientes; respuesta sin datos, enlaces o acciones. Clasificacion Oracle independiente del alcance nominal/concepto/2023: RESTRICTED. | No llego a get_invoices: no acredita su rama de denegacion total real. |
| «facturas de la matricula anx123» | Unicamente get_invoices, argumentos efectivos plate/mode/page/rows, sin cliente, concepto, fechas ni alcance heredado. Binds SQL con plate=ANX123. HTTP informa ausencia. Oracle independiente: cero filas autorizadas y existencia restringida falsa, con la misma igualdad REGEXP_REPLACE(UPPER(MATRICULA), '[-[:space:]]', '') = :p. | **ANX123 no reproduce una factura restringida ni mixta. Caso original pendiente; no se presenta como corregido con evidencia real.** |

Se verifico el SQL realmente ejecutado: conteo/detalle con `NVL(USER_CAN_CONSULT, 'S') <> 'N'`; sondeo `CASE WHEN EXISTS (SELECT 1 ... USER_CAN_CONSULT = 'N' ...matricula...)` devuelve solo un bit, sin columnas sensibles ni conteos restringidos. Los binds del sondeo contienen solo la matricula normalizada; no quedan filtros heredados. El resultado y la paginacion vacios coinciden con Oracle independiente y no incluyen PDFs. Estos controles vacios no acreditan totales, paginas o PDF positivos de una muestra mixta. La distincion entre los tres resultados mantiene la cobertura sintetica anterior; **en esta ejecucion real solo se observaron denegacion en el resolver y ausencia de facturas por matricula, no resultado mixto**.

Todas las conexiones Oracle cerradas sin errores; driver restaurado; servidor temporal cerrado; conversacion temporal propia limpiada; worker terminado; **logout confirmado**. La imagen y StartedAt del contenedor habitual no cambiaron. Logs auditados: chatbot sin lineas nuevas, ERP dos lineas exclusivamente de metadatos protegidos de autenticacion; ninguna linea desconocida o payload sensible. La consola del worker suprime payloads y el reporte publico contiene solo metadatos y comprobaciones; cero descargas PDF, modelo, proveedor e inspector. No se modificaron datos de negocio, permisos ni expiraciones; solo el ciclo normal de login/actividad/logout de la sesion creada para el control.

[Reporte sanitizado](invoice-candidate-affected-be559ef.json), SHA-256 **625691ea1139638b24b205bab1272455aa2a4148d3e81fc7d4d51a9140b2d636**. Worker SHA-256 `3a992583a29cb71b40149d0d6368e17acd474444f81c868736a94d2beb0dd46e`; helper SHA-256 `6e0a0ca7169f3a51b6685b212182816abf8a4ca45a3585e00296dba6b626c2c0`. No filas, nombres, identificadores de negocio, credenciales, sesiones ni URLs PDF publicados. `unobservedPermissionClasses` se refiere al resultado de get_invoices para la matricula: RESTRICTED y MIXED no se observaron alli; no niega la denegacion inicial del resolver.

PR #50 sigue en borrador, caso original pendiente. Sin merge, despliegue o inspecciones administrativas.

### Correccion local del preflight posterior a 6c395d9

La revision detecto que el preflight comparaba todo scripts/ contra be559ef y rechazaba los ejecutores anadidos en 6c395d9. Se corrige con `invoice-candidate-source-preflight.mjs`: aplicacion (src e index.js), pruebas de negocio, configuracion y restantes scripts se fijan a **be559ef**; seis archivos de ejecutores/dependencias enumerados explicitamente y su nueva prueba local se verifican contra **HEAD**, resuelto al SHA completo del commit que los contiene. No se excluye scripts/ en bloque. Documentacion y evidencia no se tratan como codigo ejecutable.

Commit de correccion: **85354030d84c9ce2b75f2e95602b7a0d61654994**. El preflight de fuentes real sobre ese commit devolvio SOURCE_PREFLIGHT_COMPLETE: 152 archivos de aplicacion, 90 pruebas de negocio, 9 de configuracion y 78 scripts adicionales coinciden con be559ef; 6 ejecutores y 1 prueba de validacion coinciden con 8535403. La revision posterior solo anade este registro documental; el comando resuelve nuevamente HEAD al verificar el commit final que contiene la documentacion. No cambia los commits ni hashes del reporte Oracle/HTTP aprobado.

Se contrastan tanto los commits como el indice y el arbol de trabajo. Se rechazan archivos funcionales nuevos, cambios preparados ocultos por una copia de trabajo restaurada y un commit de ejecutores incompleto. En una futura ejecucion autorizada, los ejecutores se exportan desde su commit verificado y se cotejan por hash al copiarlos; el archivo Git de la aplicacion permanece fijado a be559ef. El worker y la aplicacion no cambian.

**17/17 comprobaciones locales aprobadas** en repositorios Git temporales: candidato final con ejecutores versionados aceptado; modificaciones de aplicacion/pruebas/configuracion/otros scripts rechazadas; cada ejecutor alterado detectado; alteraciones preparadas en el indice y cambios funcionales ya committeados tampoco se ocultan restaurando la copia de trabajo. Comando: `node --test test/invoiceCandidatePreflight.test.js`, Node 24.21.0 local. No se ejecutan las 71 pruebas de negocio ni se usa login, Docker, red u Oracle.

El comando `node scripts/run-invoice-candidate-affected-login.mjs --source-preflight` (o PowerShell con `-SourcePreflight`) ejecuta unicamente esta verificacion Git sobre el commit final. El preflight DEV previo y la ejecucion real tambien exigen la misma verificacion antes de acceder a servicios. Esta correccion no repite ni amplifica el control Oracle/HTTP de be559ef: el reporte historico y sus hashes permanecen intactos. La denegacion real de Impacto fue en el resolver; **ANX123 sigue pendiente y falta una muestra mixta Oracle real**. No se afirma que el nuevo ejecutor haya sido validado otra vez contra servicios externos.

Sin merge, despliegue ni cambios de datos, permisos o expiraciones. Una PR lista para revision no equivale al cierre del caso original.

## Estado historico anterior (11 de noviembre de 2026)

El usuario confirma que no hay acceso administrativo. La consulta DBA_* preparada no se ejecuto y no hay resultado administrativo que revisar. No se solicitaron privilegios ni se sustituyo la identidad afectada.

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

## Dependencias y predicados accesibles: 948332d

Control completado el 11 de noviembre de 2026 con login protegido del mismo usuario afectado. Aplicacion 22f4b02 y diez modulos cargados confirmados. Solo metadatos: cero POST, resets, consultas de filas de negocio, ejecuciones de funciones referidas o cambios de permisos.

**Aclaracion de la reserva anterior:** las funciones anidadas de MATRICULA son LOWER, REPLACE (dos veces), UPPER y TRIM sobre una columna. No hay funcion propia, CASE/DECODE, consulta a USER ni condicion de USER_CAN_CONSULT en esa expresion. El recorrido de ALL_DEPENDENCIES informa diez objetos TABLE, sin FUNCTION/PACKAGE/VIEW/SYNONYM ni referencia remota adicionales. No se encontro un cuerpo de funcion propio pendiente de lectura para esa proyeccion; ALL_SOURCE no se consulto porque no aparecio un objeto de esos tipos. Un contador generico de llamada no clasificada en la definicion completa no acredita una funcion propia de matricula. Los literales de reemplazo y nombres internos no se publican.

La definicion completa contiene varios **INNER JOIN** y predicados ON de igualdad. Por estructura, una fila sin una relacion requerida queda fuera del resultado relacional observable antes de poder clasificarla por USER_CAN_CONSULT o buscar su matricula. Se describe la semantica del resultado, no un orden fisico de ejecucion Oracle. La proyeccion tampoco garantiza una matricula no nula si su columna fuente lo es. **Estas posibilidades no prueban que una fila ANX123 exista, este restringida, pierda una relacion o quede excluida.** No se leyeron tablas base para averiguarlo ni se eludieron permisos.

USER_CAN_CONSULT conserva la expresion CASE con condicion de columna y EXISTS que compara con USER; actua sobre las filas que llegan a la vista, no como certificado de que todas las facturas de las fuentes esten visibles. La evidencia b014b94 de filas permitidas y restringidas para la misma identidad se mantiene separada. No se convierte cero coincidencias en denegacion ni en ausencia global.

ALL_POLICIES devolvio cero politicas visibles en la vista y en cada una de las diez tablas referidas. No hubo error de metadatos, limite de profundidad/objetos ni fuente wrapped observada. **blockers=[] indica que las consultas previstas terminaron; no certifica completitud del catalogo ALL_* ni ausencia global de politicas.** La definicion de tablas figura definitionReadable=false por diseno: solo se consultaron sus dependencias/politicas, no sus datos ni DDL.

**Bloqueo concreto restante:** sin confirmacion de un administrador sobre el catalogo completo, no puede descartarse una politica o dependencia no visible a esta identidad; tampoco puede atribuirse a ANX123 ninguno de los mecanismos estructurales observados. La [consulta preparada](../scripts/invoice-view-metadata-admin.sql) incluye ahora DBA_VIEWS, DBA_DEPENDENCIES y un inventario DBA_POLICIES acotado a la vista y sus fuentes directas, sin datos de negocio. Debe ejecutarla un administrador autorizado con sus permisos existentes y entregar un resumen sanitizado; todavia no se recibio ese resultado. Si no tiene acceso, registrar el error/limite, sin conceder permisos.

La secuencia original y la consulta aislada caed886 siguen siendo la evidencia HTTP: denegacion inicial confirmada, matricula autonoma sin filtros heredados y ninguna coincidencia autorizada/restringida en la vista para la misma identidad. Unicode b96353a no encontro candidatas. No se repitieron esos controles ni se asume que los datos sean inmutables entre sesiones. **No hay causa demostrada de un defecto de la aplicacion; caso abierto y PR #50 en borrador.**

[Reporte sanitizado de dependencias](invoice-affected-user-dependencies-948332d.json), SHA-256 **c378792808e660ad20c02a68d8b6bda422bb330d97cd8275fdb141a15d260351**. Identidad PostgreSQL/Oracle proxy coincidente, conexiones e inspector cerrados, logout y logs sanitizados aprobados. Cero Bedrock/PDF. Sin cambios de aplicacion, merge o despliegue; reservas anteriores conservadas.

## Sin acceso administrativo

El usuario confirma que no hay acceso para ejecutar la comprobacion administrativa pendiente. Se conserva la consulta preparada para una futura ejecucion autorizada; no se presenta como ejecutada ni como evidencia Oracle adicional. El bloqueo es la falta de confirmacion de completitud del catalogo y de politicas/dependencias fuera de la visibilidad de la identidad afectada. No es un error Oracle observado al consultar DBA_*: esas consultas no se intentaron.

La evidencia disponible demuestra la denegacion inicial, la retirada del alcance heredado y cero coincidencias visibles para ANX123 en secuencia y aislada. No demuestra ausencia global, restriccion de ANX123 ni su exclusion por un join o politica. El caso y la PR #50 siguen abiertos, en borrador; sin cambios de aplicacion, controles repetidos, nuevas sesiones o cambios de datos/permisos/expiraciones. Se conservan las reservas previas y los cierres/logout ya documentados.
