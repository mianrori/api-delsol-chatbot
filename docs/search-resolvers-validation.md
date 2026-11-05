# Validación dirigida de buscadores

Base: `00a1acb` (PR #36 fusionada y desplegada). Rama independiente
`test/search-resolvers-dev`. Candidato de código `c8525a6`.

## Alcance y evidencia reutilizada

Solo buscadores sin contraste suficiente en la matriz: locales, rubros, socios,
conceptos y clientes facturados, tipos/destinos/movimientos de soles; de promociones
únicamente el fallback aproximado y su recorrido paginado. No se repiten el
catálogo/paginación textual de R, compras promocionales, saldos/usos, ventas,
segmentación ni los bloques B/D/Q/I ya aprobados.

La segmentación desplegada `00a1acb` aprobó 10/10 controles de una consulta real
en 5,873 s, cierre y salud; los 159 archivos comparados coincidieron. Se conserva
esa evidencia local con su commit y no se atribuye a este candidato.

## Correcciones y pruebas controladas

Las siete reproducciones iniciales fallaron antes de corregir el candidato.
Ahora **68/68 pruebas enfocadas Node 22 aprobadas**, sin red ni credenciales:
`searchResolvers`, `searchSelection`, integración `chatLifecycle` y los consumidores
afectados `promotionSearch`, `solesUsage`, `memberSoles`. Los conteos se solapan
con pruebas históricas; no se suman como casos únicos ni como validación Oracle.

- Locales: filtro contractual activo antes del límite. Mantiene la política
  existente de buscar locales activos; no habilita locales históricos inactivos.
  Locales/rubros admiten fragmentos literales normalizados además del fallback
  Jaro-Winkler. Exactitud se determina por texto normalizado, no por una similitud
  redondeada. Conteos antes del límite y orden determinista por código.
- Rubros: varios exactos conservan ambigüedad; una fila de un resultado limitado
  no se convierte en identidad única. Socios: email/teléfono compartidos no
  eligen la primera identidad; el límite visible conserva el conteo y la búsqueda
  nominal acotada declara incertidumbre si alcanzó el tope de candidatos.
- Soles: varios códigos con la misma descripción canónica/alias conservan
  ambigüedad, incluso invirtiendo el orden de las filas.
- Clientes facturados: deduplicación de identidad Oracle antes de `maxRows`,
  conservando fechas/USER_CAN_CONSULT y prioridad de coincidencias. Los conceptos
  usan fragmentos literales; `%` y `_` no amplían el filtro como comodines SQL.
- Chat: impide consultar datos tras una búsqueda ambigua/ausente en el mismo
  lote. Una selección numérica solo acepta opciones mostradas y conserva filtros
  del intento anterior; facturas conserva además el período de la búsqueda.
  Destinos mantienen la pareja tipo/código y cada identificador usa el contrato
  real de su consumidor. Un número no resuelve dos catálogos ambiguos a la vez.
  Se probó la integración completa búsqueda → bloqueo → opción 2 → consulta con
  modelo y datos controlados. No acredita interpretación libre exhaustiva.

## Contraste DEV ejecutado

`scripts/run-search-resolvers-dev.mjs` recibe solo sesiones por stdin, resuelve
identidad con el servicio existente y compara los usuarios Oracle reales. Ejecuta
solo las variantes anteriores y sus rechazos 942/1031 sin datos; cuenta todos los
proxies y verifica cierre. No autentica usuarios en el chatbot ni recibe username
para decidir la identidad Oracle.

El control independiente lee las vistas autorizadas por un camino distinto de
los repositorios: catálogos y puntuaciones Oracle separadas, filtro/selección por
identidad y cotejo en memoria. Comprueba período de clientes facturados y límites
reales de destinos/movimientos. Reconstruye el fallback de promociones desde el
catálogo y lo recorre conservando término/tamaño de página; no repite la búsqueda
textual ya aprobada. Cada llamada Oracle tiene 60 s y las lecturas de control
se limitan a 10.000 filas; un exceso es fallo/limitación, nunca aprobación parcial
silenciosa. Los tiempos y fallos se identifican por caso y código técnico.

Los buscadores sin parámetro page no se presentan como paginados: conservan sus
límites de opciones y requieren precisar la consulta. La búsqueda nominal de
socios conserva el tope configurado; no garantiza encontrar todos los aproximados
fuera de esa cohorte. Las muestras reales ausentes se informarán por código,
separadas de controles fallidos y de pendientes de implementación.

Se reutiliza el cliente de login DEV protegido validado en la rama independiente
de login, sin repetir sus suites. El helper local ignorado comprueba previamente
loopback 5300/5400, development, protección de logging instalada y hash, y destinos
Oracle/PostgreSQL coincidentes; luego solicita ambas cuentas mediante cuatro
entradas ocultas. Credenciales y sesiones permanecen en memoria/stdin; se hace
logout únicamente de las sesiones creadas, también tras fallos. No van en env,
argv, reportes, archivos temporales ni Git. El flujo de login del producto no se
modifica y no se despliega el candidato: `/app` permanece intacto.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-resolvers-dev.ps1 -Preflight
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-resolvers-dev.ps1
```

Preflight aprobado antes de solicitar credenciales. Reportes locales ignorados:
`logs/search-focused.txt` (controladas) y `logs/search-resolvers-final.json` (DEV).
**100/100 controles reales Oracle aprobados sobre `7ced8d9`**, 04/11/2026
17:21:45.408–17:21:56.696 UTC (**11,288 segundos**); helper finalizado en COMPLETE,
success=true, código 0. El código de `c8525a6` y el de `7ced8d9` son idénticos;
este último solo incorporó documentación. Coincidieron los 162 archivos de la
copia candidata preparados para esa ejecución.

- Nueve buscadores contrastados: exacta/parcial/ausencia de locales y rubros con
  identidades, estado y conteo; documento y pertenencia de identidades nominales
  parciales de socios; conceptos y clientes facturados con límite por identidad
  y aislamiento de período; tipos/alias de soles, destinos y movimientos con sus
  metadatos reales de límite. No se atribuye una lectura íntegra de cada catálogo.
- Fallback aproximado de promociones: **ocho páginas**, total, hasMore/nextPage
  y multiconjunto completo conciliados con el catálogo independiente. Solo este
  fallback era nuevo; no se repitió la paginación textual ya aprobada.
- Usuarios Oracle reales distintos y **nueve rechazos 942/1031 sin datos**, uno
  por buscador. Todos los proxies cerraron; ambos logout de sesiones propias
  aprobaron, registrados aparte de los 100 checks del worker.
- Logs del intervalo: cuatro eventos compactos ERP, ninguno error ni con campos
  extra/etiquetas sensibles; sin logger de cuerpos detectado. Sin error fatal o
  de cierre detectado en logs del chatbot. No se publican sus líneas crudas.
- El reporte no dejó muestras pendientes para sus casos ejecutados. Esto no
  elimina las muestras históricas ni acredita otros positivos fuzzy, empates
  exactos reales, completitud nominal fuera de la cohorte acotada o un destino
  SOCIO/LOCAL real con el mismo código. Esas variantes tienen cobertura controlada
  o permanecen delimitadas en la matriz; no se declaran casos reales aprobados.

La selección y conservación de filtros se acreditan con la integración de chat
controlada descrita arriba; los 100 checks DEV usan el dispatcher real/Oracle,
no constituyen nueve conversaciones HTTP nuevas ni interpretación libre.
No se repitieron controles ni login al revisar los reportes. PR #37 permanece
en borrador para revisión final; sin merge ni despliegue del candidato.

Se conservan sin fabricar muestras: superficie cero/cambiante, ventas registradas
que sumen cero, socios/promociones/segmentación con varias monedas y demás límites
históricos de la matriz. Sin merge ni cambios de datos, permisos o expiraciones.

## Correcciones de revisión — `2094624`

Los tres P2 de la revisión de `7ced8d9` se corrigen en código, con validación
controlada y contraste DEV afectado aprobados:

- El guard reconstruye búsquedas pendientes a través de los turnos e iteraciones
  conservados en el contexto. «Continúa», preguntas sin selección y opciones
  inexistentes no liberan la identidad. Solo una opción numérica mostrada o una
  nueva búsqueda RESOLVED sin truncamiento libera la consulta. El ID se toma del
  resultado real y se conservan los filtros del intento original; los intentos
  posteriores bloqueados no pueden reemplazarlos.
- `get_soles_usage` es consumidor de `search_categories`: bloqueo y selección de
  `categoryIds` conservan socio, período, movimientos y pareja de destino.
- El fallback de promociones usa como clave la opción visible completa (IDs,
  nombres y fechas), deduplica filas indistinguibles y añade esa clave como último
  desempate. Se mantiene la prioridad existente de similitud/fecha/IDs. Las
  opciones visibles distintas empatadas quedan ordenadas sin depender de Oracle;
  la rama textual no cambia. No garantiza un snapshot entre peticiones si otro
  proceso modifica el catálogo concurrentemente.

**44/44 pruebas enfocadas Node 22 aprobadas** sobre `2094624`, incluidas conversaciones
por HTTP de loopback con ruta/controlador/chat reales y modelo/buscadores/consumidores
controlados, no Oracle real. Cubren dos «continúa», elección explícita y sus filtros,
nueva búsqueda unívoca y denegación sin datos/acciones. La paginación recorre filas
empatadas invertidas, duplicados idénticos y una página posterior al final. El
control independiente de promociones también tiene su regresión de empates.

`scripts/run-search-corrections-dev.mjs` prepara solo controles afectados:
CTE sintéticas sobre DUAL ejecutadas por Oracle, un recorrido aproximado real
contrastado con una consulta independiente de todas las columnas de opción,
denegación y cierre; HTTP candidata con sesiones y búsquedas de rubros Oracle
reales, modelo controlado y consumidores de negocio como espías de argumentos
(sin releer compras/usos). El servidor HTTP es temporal, en loopback, y no
modifica `/app` ni el servicio desplegado. La prueba declara expresamente esa
separación; no se atribuyen al consumidor resultados de negocio no consultados.

Se verifica por hash el reporte anterior y se reutilizan sus 100 controles de
`7ced8d9` para implementaciones sin cambios, con su SHA original; no se atribuye
el orden aproximado anterior a `2094624`. No se repiten suites completas ni los
otros catálogos. El login protegido solo obtiene sesiones nuevas para esta etapa;
credenciales y sesiones permanecen en memoria/stdin y los logout son propios.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-corrections-dev.ps1
```

El preflight probó entorno, guard de logs y el comando HTTP sintético completo
en Docker DEV sin credenciales. **78/78 controles afectados aprobados sobre
`2bfa637`**, 04/11/2026 17:54:00.184–17:54:02.723 UTC (**2,539 segundos**),
helper COMPLETE/success=true/salida 0. `2bfa637` solo documenta el código validado
`2094624`; los 166 archivos candidatos preparados coincidían por hash.

- **10 checks de empates Oracle controlados:** CTE sobre DUAL, filas empatadas
  invertidas, duplicados indistinguibles y página posterior al final; secuencia
  estable, sin repeticiones u omisiones. No son cambios ni muestras fabricadas
  en datos DEV.
- **Ocho páginas reales** aproximadas más la **novena petición vacía**: total,
  hasMore/nextPage, ambigüedad conservada y secuencia ordenada completa por todas
  las columnas cotejadas contra el control independiente. Opciones únicas y
  rechazo Oracle sin datos comprobados.
- **31 checks HTTP / 11 peticiones** a la candidata de loopback: bloqueo de
  elección arbitraria y dos «continúa» por flujo, opción explícita/filtros exactos
  para ventas y usos de soles, nueva búsqueda unívoca/ID real, denegación sin
  datos ni acciones. Ruta/controlador/chat y validación de sesiones son reales;
  lookups de rubros usan Oracle DEV. El modelo y los consumidores de negocio
  son controlados: no se releyeron compras/usos ni se acredita interpretación
  libre o la respuesta de un consumidor de negocio real.
- Identidades reales PG/proxy coincidentes y usuarios Oracle distintos; todos
  los proxies cerrados; **dos logout propios aprobados aparte** de los 78 checks.
- Logs del intervalo: cuatro eventos ERP compactos, cero error/campos extra,
  sin etiquetas sensibles ni logger de cuerpos detectados. Sin error fatal o
  de cierre detectado en chatbot. Sin publicar líneas crudas.

Reporte privado `logs/search-corrections-final.json` y resumen
`logs/search-corrections-final-summary.json`, ignorados. No dejó muestras pendientes
para sus casos; permanecen las históricas y los límites de la matriz. Se reutilizaron
los 100 checks previos sin repetirlos, sin sumarlos como casos únicos ni atribuirlos
al código corregido. No se repitieron controles/login al revisar esta evidencia.
PR #37 sigue en borrador hasta revisar las correcciones; sin merge/despliegue.

## Composición de local y rubro — `929d88e`

La revisión encontró que mezclar `previousInput` por cada resolutor reintroducía
IDs propuestos por el modelo sobre IDs ya validados. Ahora se recupera el contexto
una sola vez, prefiriendo los últimos argumentos ejecutados correctamente, y se
acumulan todas las identidades por separado para aplicarlas al final. Local y
rubro conservan su identidad independientemente del orden de las
búsquedas. Una selección confirmada solo cambia mediante otra selección válida
o un nuevo lookup resuelto; no por argumentos contradictorios del consumidor.
Las resoluciones previas se conservan en los seguimientos del contexto disponible.

El resultado se clona en profundidad: ni la función ni una modificación posterior
del resultado pueden alterar los argumentos guardados en el historial. Una nueva
búsqueda explícita cambia su dominio, conservando el otro; un cambio de período
puede actualizar fechas sin volver a elegir local/rubro, conservándolas también
en el siguiente «continúa».

**42/42 pruebas afectadas aprobadas en Node 22**, sin sesiones ni Oracle reales:
ambos órdenes local→rubro/rubro→local, propuestas contradictorias, selección
confirmada más nueva resolución del otro dominio, cambios de local/rubro/período,
historial congelado y copia de filtros anidados. La integración HTTP candidata
comprueba los argumentos finales y el prefijo previo del historial después de
cada petición. El modelo simulado entrega argumentos ya protegidos por PII,
conforme al contrato real; no se confunde esa normalización con una mutación del
guard. Se conservan también las regresiones de selección/«continúa» afectadas.

La paginación y el repositorio de promociones no cambian. Los 78 controles de
`2bfa637`, incluidos empates/paginación/denegación/cierre, se reutilizan con su
SHA y hash, sin atribuir la composición nueva a esa ejecución. No se repiten los
100 controles previos ni catálogos completos, ventas, compras o usos.

`scripts/run-search-composition-dev.mjs` prepara únicamente el contraste afectado:
lee perfiles reales de locales activos/rubros por SQL independiente, coteja sus
IDs con los lookups y ejecuta las conversaciones HTTP en ambos órdenes, cambios
explícitos, selección previa y denegación. Ruta/controller/chat, autenticación y
búsquedas Oracle son reales; modelo y consumidor de ventas son controlados para
inspeccionar argumentos, sin volver a consultar ventas. Se comprueba historial
previo, usuarios Oracle distintos y cierre. Lecturas acotadas a 10.000 filas y
60 s por llamada; las muestras inexistentes no se declaran aprobadas.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-composition-dev.ps1
```

Preflight aprobado con el comando HTTP sintético completo. Dos cuentas DEV en
cuatro entradas ocultas, login protegido existente para obtener sesiones nuevas,
credenciales/sesiones solo en memoria/stdin y logout de las creadas; helpers y
reportes ignorados. Reporte esperado: `logs/search-composition-final.json`.
**99/99 controles afectados aprobados sobre `d0bb3a6`**, 04/11/2026
18:27:47.119–18:27:49.933 UTC (**2,814 segundos**), helper COMPLETE/success=true,
salida 0. `d0bb3a6` solo documenta el código `929d88e`; los 167 archivos candidatos
preparados coincidieron por hash, sin diferencias.

- Ambos órdenes local→rubro y rubro→local, propuestas contradictorias, cambios
  explícitos de local/rubro/período y «continúa» posterior: **16 comprobaciones
  de argumentos finales** y conservación de las selecciones confirmadas.
- **79 checks HTTP / 19 peticiones** a la candidata de loopback, incluidos
  **19 checks del prefijo de historial sin cambios**. Estos conteos se solapan;
  no representan casos únicos acumulables. La autenticación y los lookups son
  reales Oracle DEV: 10 comprobaciones exactas de identidad contrastadas con los
  catálogos independientes y pertenencia de opciones ambiguas comprobada.
- Modelo con entradas PII protegidas y consumidor de ventas controlados para
  inspeccionar argumentos; no se consultaron ventas/compras ni se acredita toda
  interpretación libre. La inmutabilidad profunda del guard también conserva
  las pruebas de historial congelado y mutación posterior de su resultado.
- Identidades PG/proxy coincidentes, usuarios Oracle distintos, denegación HTTP
  sin datos/acciones y todos los proxies cerrados. **Dos logout propios aprobados
  aparte** de los 99 checks.
- Logs del intervalo: cuatro eventos ERP compactos, cero error/campos extra,
  sin etiquetas sensibles ni logger de cuerpos; sin error fatal/de cierre
  detectado en chatbot. No se publican líneas crudas ni resultados de vistas.

Se verificó por hash la evidencia de 78 checks `2bfa637` y se reutilizó sin repetir
paginación, CTE de promociones ni otros catálogos; sus resultados no se atribuyen
a esta ejecución. Reportes privados `logs/search-composition-final.json` y
`logs/search-composition-final-summary.json`, ignorados. No hubo pendientes propios
del perfil ejecutado; las muestras y limitaciones históricas permanecen abiertas.
No se repitieron controles/login al revisar los reportes. PR #37 en borrador para
revisión final, sin merge/despliegue ni cambios de datos, permisos o expiraciones.

## Retirada e incorporación explícita de filtros

Corrección `158b120`: omitir un argumento no equivale a retirar un filtro.
Las instrucciones explícitas de retirada invalidan únicamente la resolución
del dominio indicado y mantienen dos marcas técnicas por conversación, sin
valores de filtros, identidades ni conexiones. Se eliminan con el reset y
sobreviven al recorte del historial. Un cambio de período o una propuesta del
modelo no puede reactivar esas resoluciones. Una nueva petición explícita debe
resolver otra vez la identidad; una opción antigua o una mención negativa no basta.

**51/51 pruebas afectadas Node 22 aprobadas**; la aserción HTTP añadida después
para confirmar que el turno de retirada salió del historial también aprobó.
Guard, conversación y ruta/controller/chat cubren quitar rubro → cambiar período,
quitar local → cambiar período, retirar ambos → añadir solo uno, propuestas
contradictorias, ambigüedad → selección → retirada → nueva resolución, cambios
explícitos, doce seguimientos tras retirar ambos, aislamiento entre sesiones,
reset, argumentos finales, filtros restantes y ausencia de mutación del historial.
Modelo y repositorios/consumidores son controlados en estas pruebas.

El ejecutor Oracle/HTTP DEV contrasta las identidades de
local/rubro con catálogos independientes, usa auth y lookups reales y espías de
ventas para verificar argumentos; no consulta ventas/compras. Reutiliza los 99
checks `d0bb3a6` verificados por SHA-256, incluida su denegación, sin repetirlos.
Comprueba identidades Oracle distintas y cierre de proxies; lecturas limitadas a
10.000 filas y 60 s por llamada. Preflight completo sin credenciales aprobado,
incluida la secuencia HTTP sintética; 169 archivos del candidato iguales por hash.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-filter-lifecycle-dev.ps1
```

Introduce las dos cuentas DEV únicamente en sus cuatro entradas ocultas. El
login protegido existente obtiene sesiones nuevas en memoria/stdin y cierra las
creadas al terminar. Contraseñas y sesiones no se imprimen ni se guardan en
argumentos, archivos o reportes. Helper y reporte sanitizado esperado
`logs/search-filter-lifecycle-final.json` están ignorados por Git.
PR #37 continúa en borrador hasta revisar la corrección y su evidencia real.
Las muestras históricas faltantes permanecen documentadas; no se fabricaron datos.

### Resultado DEV y corrección del contexto recortado

Intento `9249d6f` (código `158b120`), 04/11/2026 19:09:55.228–19:09:59.265 UTC:
**272/275 checks aprobados; tres fallos de argumentos**, success=false/salida 1.
Los tres aparecen en los últimos seguimientos de la cadena de retirar ambos y
añadir solo local: al salir su nueva búsqueda del historial acotado, el guard ya
no tenía una resolución que prevaleciera sobre el ID contradictorio del modelo.
El rubro retirado no se reintrodujo. La cadena corta, los cambios de período,
ambigüedad/selección, reincorporación y los controles de identidad/cierre aprobaron;
estos resultados mantienen la atribución del intento y no acreditan el commit nuevo.

Todos los proxies cerrados y dos logout propios aprobados. Logs del intervalo:
cuatro eventos ERP compactos, cero eventos error/campos extra/líneas no compactas,
sin error fatal/de cierre detectado en chatbot. Solo se guardó resumen sanitizado;
no se imprimieron líneas crudas. El reporte fallido se conserva localmente como
`logs/search-filter-lifecycle-9249d6f-failed.json`, fuera de Git.

**Corregido en `aaf3b5f`; 53/53 pruebas afectadas Node 22 aprobadas.** Tras recortar
una resolución, las identidades de la última consulta ejecutada correctamente se
conservan ante propuestas no solicitadas. Una búsqueda nueva del otro dominio no
reemplaza esos IDs ni pierde período, métricas, desglose u otros filtros. Continúan
funcionando las retiradas y los cambios explícitos, con clon profundo del historial.
Las tres fixtures HTTP ahora acumulan fallos aunque el chat capture la excepción
de la aserción del consumidor. Se reprodujeron así los mismos tres fallos con datos
sintéticos antes de corregirlos; la secuencia completa y el modo acotado pasan.

**110/110 controles Oracle/HTTP DEV aprobados sobre `13e8ea8`**, 04/11/2026
20:35:12.821–20:35:14.507 UTC (**1,686 s**, tramo HTTP 903 ms), helper COMPLETE,
success=true/salida 0. `13e8ea8` solo modifica los dos documentos respecto a
`aaf3b5f`; fuentes, pruebas, ejecutores y dependencias iguales al código corregido.
**169 archivos candidatos idénticos por hash** y ningún pendiente propio del perfil.

Se recreó solo la cadena larga de **19 peticiones**, necesaria para llegar a los
tres argumentos antes fallidos y cruzar el límite de recorte. **19 comprobaciones
de argumentos finales y 19 de historial previo aprobadas**, más el control de que
el turno de retirada ya salió del historial y el filtro continúa retirado.
Cuatro comprobaciones exactas de IDs contra catálogos independientes de Oracle:
tres de locales y una de rubros. Ruta/controller/chat, auth y lookups reales;
modelo y consumidor de ventas controlados para inspeccionar argumentos. No se
consultaron ventas/compras ni se acredita interpretación libre exhaustiva.
Los conteos de HTTP/argumentos/historial se solapan; no se suman como casos únicos.

Los checks verificaron por hash el intento de 275 y la evidencia anterior de 99,
conservando sus SHA originales. No se repitieron los otros perfiles aprobados,
promociones, paginación ni suites completas; el intento fallido permanece fallido.
Usuarios Oracle distintos e identidades PG/proxy coincidentes, todos los proxies
cerrados y **dos logout propios aprobados aparte** de los 110 controles.
Logs del nuevo intervalo: cuatro eventos ERP compactos, cero error/campos extra/
líneas no compactas; sin error fatal/de cierre detectado en chatbot. No se
imprimieron líneas crudas, identidades ni secretos. Reportes privados
`logs/search-filter-lifecycle-final.json` y `logs/search-filter-lifecycle-retry-summary.json`,
helpers y `.env` fuera de Git. No se repitieron controles ni login al revisar
estos artefactos. PR #37 sigue en borrador para revisión final, sin merge, despliegue
ni cambios de datos, permisos o expiraciones. Se conservan las muestras reales
faltantes de superficie cero/cambiante, ventas registradas de suma cero y socios
con varias monedas, con su cobertura controlada y limitaciones originales.

## Resolución de local y rubro independiente del historial recortado

Hallazgo de revisión posterior: sin selección durante más de diez turnos, el
lookup ambiguo salía del historial y el guard dejaba de reconocer su estado
pendiente. No lo cubrían los 110 controles anteriores, que siguen aprobados para
su SHA/perfil. No se transforma esa evidencia en aprobación del código nuevo.

**Corregido en `003f740`; 60/60 pruebas afectadas Node 22 aprobadas.** Estado de
resolución por sesión para cada dominio: pendiente con sus opciones, seleccionado
con el ID validado, y retirado explícitamente. Las transiciones se procesan una
vez por mensaje y resultado de lookup; no se reconstruyen al reproducir el
historial. Se conservan opciones/inputs pseudonimizados, sin filas de negocio,
credenciales, identidades Oracle ni conexiones. Lecturas y escrituras del store
se clonan profundamente para aislar sesiones e historial; reset elimina el estado
y el diccionario PII. No se alteran expiraciones.

Si falta evidencia de resolución se pide seleccionar/buscar de nuevo antes de
consultar; ni IDs propuestos por el modelo ni los de argumentos históricos la
reemplazan. Cambiar período conserva el resto de filtros. Una nueva búsqueda
explícita invalida la selección anterior del dominio indicado, conservando el
otro. Un filtro retirado solo se reincorpora con petición explícita y resolución
nueva. Las menciones negativas no habilitan búsquedas, y una elección de otro
catálogo no selecciona accidentalmente un local/rubro pendiente.

Las pruebas unitarias y HTTP controladas atraviesan el límite real de diez turnos
para ambos buscadores: doce seguimientos pendientes, elección posterior, doce
seguimientos seleccionados, cambio, retirada, doce seguimientos retirados y nueva
búsqueda ambigua con selección después de otros doce. Incluyen ambos órdenes de
composición, dos pendientes simultáneos, tema ajeno, aislamiento entre sesiones,
denegación y reset por la ruta real. Se comprueban argumentos, período, métricas,
desglose e inmutabilidad del historial. Modelo/auth/repositorios/consumidores son
controlados en estas pruebas; no acreditan Oracle DEV del código nuevo.

**502/502 controles Oracle/HTTP DEV aprobados sobre `003f740`**, 05/11/2026
13:27:49.669–13:27:53.540 UTC (**3,871 s**, tramo HTTP 2.833 ms), helper COMPLETE,
success=true/salida 0. **170 archivos candidatos iguales por hash**, sin pendientes
propios del perfil. Preflight completo sin credenciales aprobado antes de las
entradas ocultas; candidato aislado en Docker, sin despliegue del backend.

- **120 peticiones de chat y dos resets**: ambas composiciones, doce turnos sin
  seleccionar por buscador, selección tras recorte, doce turnos seleccionados,
  cambio explícito, retirada, doce turnos retirados y nueva búsqueda ambigua con
  doce turnos antes de volver a seleccionar. No se admitieron IDs del modelo.
- **60 comprobaciones de argumentos exactos y 120 de historial previo**, más
  comprobación de que la búsqueda salió del historial, cambio de tema, aislamiento
  entre sesiones, reset y exigencia de resolución nueva después del reset.
- **Seis checks exactos de IDs** (tres por dominio) y **cuatro de pertenencia de
  opciones ambiguas** a catálogos independientes Oracle DEV; no se imprimen valores.
- Autenticación, ruta/controller/chat y lookups reales; modelo con PII protegida
  y consumidor de ventas controlados para inspeccionar argumentos. Sin consultar
  ventas/compras ni acreditar interpretación libre exhaustiva.
- Denegación sin datos ni acciones para ambos buscadores, identidades PG/proxy
  coincidentes, usuarios Oracle distintos y todos los proxies cerrados. **Dos
  logout propios aprobados aparte** de los 502 checks.
- Logs stdout/stderr del intervalo: cuatro eventos ERP compactos, cero error/
  campos o valores inválidos; sin error fatal/de cierre detectado en chatbot.
  Se inspeccionaron solo conteos técnicos, sin publicar líneas crudas o secretos.

Los conteos HTTP/argumentos/historial se solapan: no sumarlos como casos únicos.
Se verificaron por hash los 110 checks `13e8ea8`, conservando su SHA y sin
repetirlos como suite. Solo se recorrieron los flujos afectados por la persistencia;
sin repetir promociones, paginación, consultas de negocio o suites completas.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-resolution-state-dev.ps1
```

Helper NUEVO de persistencia (no usar el de retirada anterior): cuatro entradas
ocultas para las dos cuentas DEV, login protegido existente solo para obtener
sesiones nuevas y logout propios. Credenciales/sesiones exclusivamente en memoria
y stdin; nunca en argumentos, variables de entorno, reportes, temporales o Git.
Reportes sanitizados `logs/search-resolution-state-final.json` y
`logs/search-resolution-state-final-summary.json`, helpers y `.env` ignorados por
Git y no versionados. No se repitieron pruebas/login al revisar estos reportes;
esta actualización posterior solo documenta resultados. PR #37 en borrador para
revisión final, sin merge/despliegue ni cambios de datos, permisos o expiraciones.
Se conservan las muestras reales pendientes de superficie cero/cambiante,
ventas registradas de suma cero y socios con varias monedas, y las limitaciones
históricas de muestras/interpretación libre, sin fabricar datos de DEV.
