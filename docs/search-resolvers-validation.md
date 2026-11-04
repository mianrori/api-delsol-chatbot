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
