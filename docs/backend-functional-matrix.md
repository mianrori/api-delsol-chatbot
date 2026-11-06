# Alcance y evidencia del backend del chatbot

Corte actualizado: **06/11/2026**, base desplegada `84fd67c` (PR #40 fusionada).

## Balance actual del cierre

El [balance final del backend](backend-scope-balance.md) clasifica **cada pendiente
por su efecto sobre el cierre**, separando variantes funcionales, muestras DEV,
trazabilidad y cotización real positiva. Es la referencia para priorizar trabajo;
las tablas inferiores conservan los perfiles y SHA históricos, no ejecuciones nuevas.

Las 25 herramientas originales están implementadas, 26 en el registro actual.
Los perfiles acreditados pueden cerrarse con sus reservas; no procede afirmar
cobertura integral de las ramas F1/F2, variantes financieras F3, extensiones
condicionales F4/F5 o conversión real E1 sin la evidencia correspondiente.
Las muestras ausentes con cobertura controlada no son implementación faltante.
La revisión posterior F3/F4 identificó dos hallazgos: suma monetaria de campaña
antes de separar monedas y etiqueta `$` indistinguible en compras individuales.
Las correcciones están en la rama `test/backend-final-variants-dev`, pendientes
de contraste Oracle; no forman parte del despliegue `84fd67c`.

PR #39: despliegue `4428874`, resumen real 11/11 contra Oracle independiente.
PR #40: despliegue `84fd67c`, gráfico HTTP horizontal multiserie **21/21** contra
SELECT independientes, etiqueta/serie/valor/moneda/período; 187 archivos
coincidentes, salud/arranque, cierre/logout y cero reinicios aprobados. Modelo e
historial preparados. **Proveedor no consultado**; cotización real positiva y
fecha de publicación no acreditadas, muestras DEV ausentes conservadas.
La revisión documental inicial no ejecutó pruebas ni llamadas externas.
El seguimiento acotado F1/F2/F3/F4/M7 se distingue a continuación.

### Seguimiento acotado de variantes finales

El [registro de variantes](backend-final-variants-validation.md) conserva la
auditoría previa y los hashes de los logs históricos: aprobaciones controladas
de F3/F4/M7, sin atribuirles un SHA de código por fecha. La corrección candidata
añade cuatro regresiones propias y pasa 15/15 pruebas enfocadas locales;
preflight Node 22 y contrastes Oracle aún pendientes de ejecución/revisión.

| Pendiente | Estado de esta ampliación | Reserva conservada |
| --- | --- | --- |
| F1 RUC/matrícula y fuzzy positivos | Ejecutor preparado: identidades y período contra SELECT; fuzzy solo tras demostrar cero coincidencias fuertes. | Sin aprobación nueva hasta revisar reporte. Hasta 20 filas/seis candidatos. |
| F2 fuzzy positivo | Ejecutor preparado con distancia independiente y catálogo real. | Hasta ocho tipos; alias/parcial aprobado no sustituye ese positivo. |
| F3 ausencia/referencia cero/monedas distintas | Aprobación controlada histórica revisada; corrección por moneda dentro del período y `sourceRows`, pruebas afectadas. Oracle excepcional preparado. | Hasta diez campañas de hasta 61 días; cada variante sin muestra queda reservada. Suma de `CANTIDAD_FACTURAS` no significa facturas distintas. |
| F4 compras individuales multimoneda | Cobertura controlada propia nueva de repositorio/DTO/presentación; dos descripciones con `$` siguen separadas. | Cohorte real de hasta 1.000 filas enero–mayo 2023; recorrido condicionado a muestra legítima y presupuesto de 100 detalles. No hereda CTE de R/G. |
| M7 chapa activa compartida | Test histórico aprobado revisado, sin nuevo SHA de ejecución atribuible. Solo búsqueda/contraste real pendiente. | Hasta 1.000 vehículos; si no hay placa compartida, reserva sin ausencia global. |
| F5 formas de gráficos | [Contrato y evidencia por forma](chart-result-contract.md): arrays `data`/`results`, rutas de etiqueta/métrica, series y unidades. | Positivo específico de `dataPath` a array anidado mediante índice no identificado. No se ejecuta F5 ni proveedor en este bloque. |

T1 conserva S/P sin SHA propio: **no reconstruir hashes por fecha**. E1 sigue
pendiente separado; ningún control nuevo de esta ampliación consulta proveedor.

### Trazabilidad histórica de las ampliaciones

PR #38 — corrección monetaria `8ee5b14`: identificación inequívoca PYG/USD/CAD,
contradicción/ambigüedad y compatibilidad de contraparte comprobadas antes del
porcentaje; motivos por fila, parejas exactas separadas, sin conversión ni unión
de alias. **15/15 enfocadas** y **2/2 del nuevo ejecutor** aprobadas en Node 22.
**86/86 checks Oracle/HTTP afectados aprobados sobre `7bebb3d`**, código idéntico
a `8ee5b14`, 177 archivos coincidentes, cierre/logout aprobados. Reutiliza diez
bloques no afectados y tres peticiones financieras por hash; los contrastes
monetarios se renovaron, sin repetir otros perfiles. `ade722f` solo documentó
resultados. PR #38 fusionada y desplegada; ver [detalle](backend-independent-validation.md).

La comprobación posterior al despliegue de PR #37 aprobó 30/30 controles puntuales: siete
peticiones HTTP con modelo controlado, selección/reelección y lecturas Oracle
reales, conciliación independiente y cierre. El perfil seleccionado no tenía
ventas en enero de 2023: acredita ausencia, no importes positivos ni suma cero.
En `30ffab4`, el despliegue de PR #38 acredita **26/26** controles de una consulta
HTTP mensual real de canjes/ventas contra SELECT independientes: importes PYG,
monedas, cantidades, porcentaje y presentación. Modelo/resolución preparados;
no es una muestra multimoneda ni una nueva CTE. Salud/arranque y 179 archivos
coincidentes aprobados. No se repiten estas comprobaciones.

Evidencia previa a `8ee5b14`, rama `test/backend-independent-controls-dev`: corregida la colisión por
símbolo monetario en canjes/ventas (`222d761`), con 10/10 enfocadas y contraste
Oracle/HTTP `7762f35`. Los trece bloques de esta tanda quedan acreditados para sus
perfiles: ocho en N, usos/ranking en O, compras/edades en T y saldo en V.
Las ejecuciones fallidas conservan su estado; no sumar checks entre ejecuciones.

Saldo: **19/19 sobre `a709b35`**, seis variantes, documento exacto y conciliación
SQL independiente, cierre y logout aprobados; doce bloques reutilizados por hash.
Hay filas reales sin ventanas para todos/vigentes/vencidos; las tres ventanas
combinadas están vacías para el socio seleccionado y no son muestras positivas.
La discrepancia era del control (documento con espacios frente al `.trim()` del
contrato); no se modificó el servicio ni se relajó identidad o igualdad en SQL.

No se declara verificación exhaustiva del backend: las variantes funcionales
sin contraste específico siguen separadas de las muestras DEV ausentes ya
cubiertas de forma controlada. La nueva tanda de variantes está en la rama
`test/backend-pending-variants-dev`, sin cambios de aplicación ni despliegue.
Sobre `cafc5f1`, cinco de ocho variantes aprueban y el recorrido de facturas
queda parcial por un error del control; aquella ejecución sigue global fallida.
El resumen exclusivo corregido aprueba **6/6 sobre `255fd53`**, contra SELECT
independiente por moneda/facturas distintas; cierre/logout y 179 archivos
coincidentes. Se reutilizan por hash los cinco bloques y el recorrido aprobados,
sin sumarlos como checks únicos ni afirmar que ambas cohortes sean idénticas.
Al cerrar esa tanda quedaron conversión bloqueada por timeout, ambigüedad
contractual sin muestra y gráficos HTTP. La tanda siguiente acredita el perfil
de gráficos; la cotización real positiva y las muestras ausentes siguen pendientes.
Ver [resultados acotados](backend-pending-variants-validation.md).
Pendientes de conversión/gráficos abordados desde `4428874` en rama separada
`fix/conversion-provider-chart-http`: moneda `$` ambigua en costo, fecha de
consulta de tasa y período perdido en gráficos corregidos como candidato.
`e5868ea`: seis archivos de pruebas enfocados y preflight Node 22/Docker
aprobados; HTTP de gráficos con fuente/auth controlados. Llamada pública real:
`EXCHANGE_PROVIDER_QUOTE_UNAVAILABLE`, no hay tasa válida acreditada; se recibió
página pero no se eligió arbitrariamente un número/moneda. **32/32 controles
Oracle/HTTP sobre `92b5e11`**, código idéntico a `e5868ea`: neto/área Oracle con
tasa y fallo de proveedor controlados; tres gráficos HTTP con fuente PYG y
autenticación reales, modelo planificado, etiquetas/valores/moneda/período
conciliados. 184 archivos coinciden, cierre/logout aprobados; unitarias previas
reutilizadas por hash. Cotización real positiva sigue pendiente. No se confunden
pruebas controladas con tasa real ni muestra Oracle. Ver
[alcance y validación](conversion-chart-validation.md).
Revisión P2: los 32 controles anteriores no cubrían tasas hexadecimales ni la
asociación estricta etiqueta/serie/valor. Se corrige el formato decimal completo
y el comprobador de puntos/leyendas en `ad0ef01`: **13/13 pruebas afectadas y
preflight Node 22/Docker aprobados**, con regresiones negativas de intercambios
y ejes. **27/27 controles sobre `d59d1f2`** (código de `ad0ef01`) acreditan el
nuevo comprobador en los tres gráficos HTTP con autenticación y fuente Oracle
reales; 185 archivos coinciden, cierre/logout aprobados. Costos Oracle/controlados
y 13 pruebas reutilizados por hash, sin proveedor real ni suites repetidas.
PR #40 fusionada y desplegada en `84fd67c`; cotización real positiva y muestras
ausentes pendientes, sin convertir los controles de tasas sintéticas en reales.
Los 27 y los 32 controles conservan su alcance y no se suman como casos únicos.
Ver [resultados y límites](backend-independent-validation.md).

### Evidencia histórica reutilizada

Los estados de borrador que aparecen a continuación describen cada revisión
histórica; las PR #37–#40 ya están fusionadas. Sus controles no se repiten ni se suman
como casos únicos.

Segmentación: 50/50 Oracle/HTTP en `7c34c14`; corrección orderBy en `345827f`
(17/17 enfocadas, 5/5 controladas Docker DEV); despliegue `00a1acb`, 10/10
conciliaciones de una consulta real y cierre, salud correcta y 159 archivos idénticos.
Se reutilizan baseline/denegación con sus SHA originales, sin sumar conteos solapados.

Buscadores: candidato `c8525a6`, rama separada; **68/68 enfocadas controladas**.
**100/100 controles Oracle aprobados sobre `7ced8d9`**, nueve buscadores, ocho páginas
aproximadas de promociones, rechazo sin datos y cierre; dos logout propios aprobados.
162 archivos candidatos idénticos; 11,288 s. Selección/contexto: integración controlada,
no nueve conversaciones HTTP nuevas. PR #37 en borrador para revisión.
Ver [detalle](search-resolvers-validation.md). No se declaran muestras pendientes aprobadas.

Revisión posterior: tres P2 corregidos en `2094624`; **44/44 enfocadas aprobadas**.
Persistencia de selección pendiente, rubro en usos de soles y desempate completo del
fallback: **78/78 controles afectados sobre `2bfa637` aprobados**, 2,539 s. Incluye
10 checks CTE Oracle, ocho páginas reales y una petición final vacía; 31 checks HTTP
en 11 peticiones a candidata con auth/lookups Oracle reales, modelo/consumidores
controlados. Cierre y dos logout aprobados; PR #37 continúa en borrador.
Los 100 controles previos siguen atribuidos a `7ced8d9`; no acreditan esta corrección.

Composición local/rubro corregida en `929d88e`: **42/42 pruebas afectadas aprobadas**,
ambos órdenes, propuestas contradictorias, cambios explícitos e historial inmutable.
**99/99 controles Oracle/HTTP de composición aprobados sobre `d0bb3a6`**, 2,814 s:
79 checks HTTP/19 peticiones, 16 comprobaciones de argumentos y 19 de historial;
auth/lookups Oracle reales, modelo y ventas controlados. 167 archivos idénticos.
78 controles `2bfa637` reutilizados sin repetir paginación ni consultas de negocio.

Retirada explícita corregida en `158b120`: **51/51 pruebas afectadas aprobadas**
en Node 22, más la aserción HTTP posterior de recorte de historial aprobada.
Quitar local/rubro invalida su resolución; cambiar período o continuar no lo
restaura. Volver a añadir requiere petición explícita y resolución nueva;
propuestas del modelo, opciones antiguas y menciones negativas no bastan.
Las selecciones del otro dominio y los demás filtros se conservan sin mutar
historial. **Oracle/HTTP DEV ejecutado sobre `9249d6f`: 272/275 aprobados, tres
fallos de argumentos tras recortar la búsqueda del local recién añadido**.
La retirada del rubro siguió vigente; no se declara aprobado el bloque completo.
Preflight completo sin credenciales aprobado y 169 archivos candidatos idénticos.
Ejecutor privado: `logs/run-search-filter-lifecycle-dev.ps1`. Reutiliza por hash
los 99 checks anteriores y su denegación; solo recorre el ciclo afectado.
El hallazgo de implementación se distingue de las muestras DEV faltantes de
superficie cero/cambiante, ventas registradas de suma cero y socios multimoneda,
que conservan su cobertura controlada y sus limitaciones originales.
PR #37 permanece en borrador; sin merge ni cambios de datos/permisos/expiraciones.

Hallazgo del recorte corregido en **`aaf3b5f`**, **53/53 pruebas afectadas aprobadas**:
los IDs de la última consulta ejecutada correctamente prevalecen ante propuestas
no solicitadas del modelo si la resolución salió del historial. Una resolución
nueva del otro dominio conserva esos IDs y el resto de contexto. Las fixtures
HTTP acumulan las aserciones capturadas por el chat para impedir falsos positivos;
reproducen los tres fallos antes de la corrección y pasan después.
**110/110 controles Oracle/HTTP aprobados sobre `13e8ea8`**, 04/11/2026
20:35:12.821–20:35:14.507 UTC (1,686 s), salida 0; solo la cadena larga de
19 peticiones. `13e8ea8` solo documenta el código de `aaf3b5f`; 169 archivos
candidatos idénticos. Los 19 argumentos finales y los 19 historiales previos
aprobaron, incluidos los tres seguimientos antes fallidos y el límite de recorte.
Cuatro comprobaciones exactas de IDs contra Oracle independiente; auth/lookups
reales, modelo y consumidor de ventas controlados, sin consultar ventas/compras.
El ejecutor verifica por hash el intento de 275
checks y conserva sus 272 aprobados con su SHA, sin atribuirlos al código nuevo;
también reutiliza los 99 controles anteriores y su denegación. Proxies cerrados,
dos logout propios y cuatro eventos ERP compactos sin campos extra/error en el
intento fallido y en el retry aprobado. Los dos logout propios no forman parte
de los 110 checks. No sumar conteos solapados; no se repitieron otros perfiles.
Sin pendientes propios del retry ejecutado; las muestras reales faltantes siguen
abiertas. PR #37 en borrador para revisión final de la corrección, sin merge.

Actualización 05/11/2026 — **estado de resolución por sesión, código `003f740`**:
el hallazgo de selección pendiente tras recorte está corregido y validado en DEV.
Local y rubro conservan estados independientes pendiente/seleccionado/retirado,
opciones e inputs protegidos; reset limpia estos estados junto con el historial
y PII. Sin evidencia de resolución no se admiten IDs del modelo, aunque aparezcan
en argumentos anteriores. **60/60 pruebas afectadas Node 22 aprobadas**: recorte
real, selección posterior, cambios explícitos, retiradas/reincorporación, ambos
órdenes, temas, aislamiento y reset HTTP; búsquedas negadas y opciones de otro
catálogo no cambian una identidad confirmada. Preflight completo sin credenciales
aprobado. **502/502 controles Oracle/HTTP DEV de `003f740` aprobados**, 05/11/2026
13:27:49.669–13:27:53.540 UTC (3,871 s), helper COMPLETE/success=true/salida 0.
170 archivos candidatos idénticos; 120 peticiones de chat y dos resets, 60 checks
de argumentos y 120 de historial (conteos solapados). Seis checks de coincidencia
exacta y cuatro de pertenencia de opciones contra catálogos independientes,
denegación/aislamiento para ambos buscadores y proxies cerrados. Dos logout
propios aprobados aparte. Auth y lookups Oracle reales; modelo/consumidor de ventas
controlados, sin consultar ventas/compras. Los 110 checks `13e8ea8` se verificaron
por hash y mantienen su SHA; no se atribuyen al código nuevo ni se suman.
Cuatro eventos ERP compactos, sin errores/campos extra; sin error fatal/de cierre
detectado en stdout/stderr de chatbot. Sin pendientes propios del perfil ejecutado.
PR #37 en borrador para revisión final, sin merge. Muestras históricas de superficie
cero/cambiante, ventas registradas de suma cero y socios con varias monedas
conservadas sin cambios; no se fabricaron datos.

Transiciones posteriores — **código `0668b1b`, 66/66 pruebas afectadas aprobadas**
y **452/452 controles Oracle/HTTP DEV aprobados**, 05/11/2026
14:29:22.561–14:29:26.058 UTC (3,497 s), helper COMPLETE/success=true/salida 0.
Las opciones ajenas/incorrectas y las búsquedas rechazadas conservan el estado
completo anterior (dominios, opciones, contexto y foco), también después de
recortar el historial. Una selección válida cambia solo su catálogo. Se separan
las instrucciones efímeras del turno del estado duradero por sesión; pedir una
búsqueda no invalida por adelantado una selección o retirada. Solo un resultado
válido puede aplicar esa transición. Reset limpia ambos almacenes.
Preflight completo sin credenciales aprobado; helper nuevo
`logs/run-search-state-transitions-dev.ps1`. Los 502 checks `003f740` se conservan
por hash y SHA: no validan estas variantes nuevas. El control acotado usa Oracle
real para lookups/denegaciones de local-rubro; catálogo ajeno y fallos del ejecutor
son controlados y se identifican como tales. Sin repetir suites completas ni
consultas de negocio. 171 archivos candidatos idénticos; 104 peticiones HTTP,
64 checks de argumentos y 104 de historial (conteos solapados), 24 comparaciones
del estado completo ante errores/rechazos y cuatro de selección válida limitada
a su catálogo. Ocho checks de IDs exactos y cuatro de pertenencia de opciones
contra catálogos independientes; cuatro denegaciones Oracle reales conservan
el estado retirado. Proxies cerrados y dos logout propios aprobados aparte de los
452 checks. Cuatro eventos ERP compactos, sin error/campos inválidos; sin error
fatal/de cierre detectado en stdout/stderr de chatbot. Sin pendientes propios
del perfil; muestras reales faltantes conservadas. PR en borrador para revisión.

Reelección enfocada — **código `047c361`, 75/75 pruebas afectadas aprobadas**.
Con local y rubro confirmados, una opción mostrada del catálogo enfocado puede
elegirse de nuevo sin alterar el otro. Se valida catálogo/ordinal/ID; dos catálogos
aún pendientes siguen requiriendo aclaración. Pruebas de ambos buscadores antes/
después del recorte, reelección repetida `1 → 2 → 1`, listas con los mismos números
de opción, argumentos finales y estado completo ante opciones inválidas/ajenas.
**370/370 controles Oracle/HTTP DEV aprobados sobre `047c361`**, 05/11/2026
15:06:49.108–15:06:51.287 UTC (2,179 s), helper COMPLETE/success=true/salida 0.
172 archivos candidatos idénticos; 88 peticiones HTTP, 44 checks de argumentos
y 88 de historial (conteos solapados). Doce comparaciones del estado confirman
que una reelección válida cambia solo su catálogo; opciones inválidas/ajenas e
aislamiento conservan el estado completo. Ocho checks de pertenencia de opciones
a catálogos Oracle independientes; auth/lookups reales, catálogo ajeno/modelo/
ventas controlados. Proxies cerrados, dos logout propios aprobados aparte y
cuatro eventos ERP compactos sin error/campos inválidos; sin error fatal/de cierre
detectado en stdout/stderr de chatbot. Los 452 checks `0668b1b` se verificaron por
hash, conservan su SHA y no se suman. Sin pendientes propios del perfil; PR #37
en borrador para revisión final. Muestras históricas faltantes conservadas.

## Comparación con el chat original

Se compararon los registros `src/tools/index.js` y los nombres de sus herramientas:

- Original: [api-delsol-erp/main](https://github.com/mianrori/api-delsol-erp/blob/main/src/tools/index.js),
  leído también por el conector GitHub el 03/11/2026; blob
  `5fe00368fdb4075e371a9b1c8c87a17dbe02d284`. Coincide con el registro de la
  referencia local `main`, commit `5ee554ddf3cd58ed553630ccb652147ae616cc39`.
  No se usa como referencia la rama de trabajo local del ERP.
- Actual: [registro](../src/tools/index.js) y
  [dispatcher](../src/services/ai/toolExecutor.service.js) de `6b1303e`.
- **25 herramientas originales, 26 actuales, ninguna original ausente.**
  La adicional es `get_sales_per_sqm`. Las 26 tienen handler; gráficos usa una
  fuente ya consultada y las operaciones Oracle usan el proxy del `sessionId`.
  Esto confirma registro e implementación enlazada, no equivalencia exhaustiva
  de resultados, parámetros ni todas las formas de conversación.

Hay adaptaciones deliberadas del contrato de herramientas, no módulos sin migrar:

| Cambio respecto al original | Comportamiento actual |
| --- | --- |
| `get_member_purchases`, `get_member_promo_purchases`: `limit` | Sustituido por `page`/`rows`; no prometer compatibilidad literal con el antiguo parámetro. Compras individuales todavía expone `knownTotalRows`; su recorrido está probado, pero no extrapolarle la eliminación del parámetro hecha en promociones. |
| `generate_chart`: `labels`, prefijos/sufijos y valores suministrados | Etiquetas/series extraídas de resultados con `sourceToolUseId`, `dataPath`, `labelPaths`, `valuePath`; no acepta reconstruir datos arbitrarios del modelo. Las unidades se determinan desde la fuente. |
| `search_promotions` | Añade `page`/`rows` y total real del catálogo. |
| `search_invoice_customers` | Añade fechas para buscar clientes facturados del período. |
| `get_vehicle_registrations` | Añade filtros demográficos/vehiculares y referencia de edad. |
| `analyze_contract_cost_incidence` | Añade selección contractual exacta y local. |
| `get_soles_usage` | Añade alias `rows` para tamaño de página. |

No se identificó una capacidad original sin implementar a partir del registro y
dispatcher. Sí faltan verificaciones delimitadas abajo. No se propone reintroducir
contratos inseguros ni crear herramientas nuevas para declarar paridad nominal.

## Cómo leer la evidencia

**Controlada** significa pruebas con dobles/filas sintéticas; **HTTP** comprueba
respuestas reales; **Oracle independiente** agrega/selecciona por un camino de
control distinto del repositorio. La coherencia entre respuestas o servicios no
equivale a contraste SQL independiente. Un paso HTTP aprobado no demuestra que
se haya invocado cada resolutor que podría intervenir en ese diálogo.

Los reportes privados están en `logs/`, ignorado por Git/Docker. Solo se publican
conteos, códigos y commits. No se copian sesiones, documentos, identidades, filas
ni importes del socio. Las letras siguientes identifican evidencia ya ejecutada:

| Ref. | Evidencia y commit validado | Límite de la atribución |
| --- | --- | --- |
| H | `review-b315ff9-http.json`: 24/24 pasos HTTP sobre `b315ff9`; ventas, filtros, comparaciones entre años, vehículos/género, barras/líneas, canjes/ventas y campaña antes/durante/después. | Validación HTTP con controles de esa suite; no auditoría independiente de todas las vistas o todos los resolutores. |
| B | `review-b315ff9-business.json`: 22/22 controles Oracle de facturación/condiciones/costo por m²; `coverage.costPerSqmCalculated=true`; `b315ff9`. | Conciliaciones entre consultas/servicios, no una reconstrucción independiente de todo el ERP; no pasa por chat. |
| D | `review-b315ff9-denied.json`: 21/21; dos usuarios reales distintos, rechazos Oracle/HTTP sin datos; `b315ff9`. | Las vistas/consultas ensayadas, no una enumeración de todos los permisos Oracle. |
| S | `chatbot-api-tests-soles.json`: 6/6 pasos; saldo por tipo/vencimiento, usos, varias páginas y vuelta al saldo. | Reporte sin SHA: **commit no acreditado**. HTTP/coherencia; sin control SQL independiente documentado. No marcar como nunca ejecutado ni atribuirlo al head. |
| P | `purchase-pagination-final.json`: 6/6 pasos, recorrido completo, conciliación y fin real; fase final de la corrección revisada como `b315ff9`. | La traza no incorpora SHA propio; conservar esta salvedad de trazabilidad. Conciliación detalle/resumen HTTP, no SQL independiente. La muestra usada tuvo 170 registros. |
| Q | `sales-per-sqm-final.json`: 114/114 Oracle/HTTP; código revisado `e317a8f`; despliegue `68847db`, 15/15 (`deployed-pr33-sqm.json`). | Tres seguimientos con contexto previo preparado; dos muestras DEV faltantes. Véase [detalle](sales-per-sqm-validation.md). |
| I | `contract-incidence-ties-final-summary.json`: 309/309 sobre `dcd9530`, incluidos 96 controles Oracle de empates; despliegue `8e80887`, 17/17. | Un caso DEV faltante; CTE de empates son controladas. Véase [detalle](contract-incidence-validation.md). |
| R | `promotion-purchases-final-summary.json`: 138/138 sobre `89a4e59`, 38 controles HTTP, 140 archivos candidatos idénticos; `3344728` solo documentación. Despliegue `6b1303e`, 13/13. | Once grupos monetarios y fallos de cierre son controlados; falta muestra real con varias monedas. Véase [detalle](promotion-purchases-validation.md). |
| X | `deployed-pr32-xlsx.json`: exportación real XLSX, 21/21 sobre `13e69ef`. | Evidencia específica de la exportación desplegada tras PR #32, no una nueva ejecución sobre `6b1303e`. |
| G | `member-segmentation-final-summary.json`: 50/50 sobre `7c34c14`, 26 comprobaciones HTTP, 12 CTE Oracle, 144 archivos idénticos; 46/46 enfocadas Node 22. Reutiliza baseline 108 de `6b1303e` y parcial 40 de `82e72ba` con denegación real. | No sumar ejecuciones como casos únicos. HTTP con contexto preparado; muestra real de varias monedas pendiente. [Detalle](member-segmentation-validation.md). |

| L | `search-resolvers-final.json`: 100/100 Oracle sobre `7ced8d9`, nueve buscadores y ocho páginas de fallback, usuarios distintos, nueve denegaciones/cierre; dos logout aparte. 162 archivos idénticos; 68/68 enfocadas `c8525a6`. | Selección/contexto con modelo controlado; Oracle por dispatcher real, sin nueve diálogos HTTP nuevos. Variantes fuera de los perfiles ensayados conservadas. [Detalle](search-resolvers-validation.md). |
| C | `search-corrections-final.json`: 78/78 sobre `2bfa637` (código `2094624`), 2,539 s; 10 checks CTE, ocho páginas reales + final vacío, 31 checks HTTP/11 peticiones, denegación/cierre; dos logout aparte. 166 archivos candidatos idénticos; 44/44 enfocadas. | HTTP candidata: ruta/controller/chat, auth y lookups reales; modelo y consumidores de negocio controlados. No nueve catálogos/suites nuevos; L se reutiliza. [Detalle](search-resolvers-validation.md). |
| M | `search-composition-final.json`: 99/99 sobre `d0bb3a6` (código `929d88e`), 2,814 s; 79 checks HTTP/19 peticiones, 16 de argumentos y 19 de historial (solapados), IDs Oracle independientes/denegación/cierre; dos logout aparte. 167 archivos idénticos; 42/42 enfocadas. | Ruta/controller/chat, autenticación y lookups reales; modelo/consumidor de ventas controlados, sin consultar ventas/compras. C se reutiliza sin rerun. [Detalle](search-resolvers-validation.md). |
| N | `backend-independent-7762f35.json`: ocho bloques aprobados, dos fallidos y tres sin muestra; global fallida. Ficha, vehículos por documento/débito, canjes/ventas, campaña, facturas, condiciones/costo, CTE `$` y cuatro HTTP positivos. 175 archivos coinciden; cierre y logout aprobados. | 69/70 checks verdaderos no equivalen a una suite aprobada. Oracle independiente real excepto filas monetarias de CTE; modelo/contexto HTTP preparados. Compras y soles no aprobados; tres ausencias limitadas al período inicial. [Detalle](backend-independent-validation.md). |
| O | `backend-independent-6e6c423.json`: cinco bloques pendientes exclusivamente; usos combinados y ranking aprobados con Oracle independiente en octubre de 2023. Tres fallidos, global 18/20; 176 archivos idénticos, cierre/logout aprobados; N reutilizado por hash. | Compras vuelve a NJS-123 en descubrimiento de pareja; saldo difiere en grupos/totales, no solo formato; edades falla con muestra de julio de 2025. No marcar ninguno como aprobado ni como muestra ausente global. [Detalle](backend-independent-validation.md). |
| T | `backend-independent-d529cfd.json`: tres bloques exclusivamente; compras y edades aprobados. 8,247 s, 176 archivos idénticos, cierre/logout aprobados; N/O conservados por hash. | Global fallida por NJS-005 del adaptador de traza de soles, aunque los 18 checks registrados sean verdaderos. Edades: censo Oracle independiente coincide con el servicio; el control JS discrepa. Saldo no aprobado; no confundir arreglar la sobrecarga del driver con conciliar saldo. [Detalle](backend-independent-validation.md). |
| U | `backend-independent-ef27c48.json`: saldo exclusivo; traza completa en una misma conexión, 0,754 s, cierre/logout aprobados, 176 archivos idénticos; global fallida (5/6). | Causa confirmada: control y servicio recibían documentos distintos por espacios exteriores. Mapeo/SQL y dispatcher/servicio coinciden. Se corrige la entrada del control; U no se reclasifica como aprobado. [Detalle](backend-independent-validation.md). |
| V | `backend-independent-a709b35.json`: saldo exclusivo, 19/19, seis variantes, 1,818 s total, 176 archivos idénticos, cierre/logout aprobados; N/O/T reutilizados por hashes verificados. | Tres variantes sin ventanas tienen filas reales; las tres ventanas combinadas no tienen filas para ese socio. Igualdad exacta del documento y SQL independiente conciliados. `coverageComplete` del caso no equivale a cobertura global del backend; U sigue siendo investigación fallida. [Detalle](backend-independent-validation.md). |
| W | `pr38-currency-7bebb3d.json`: 86/86 en tres bloques afectados, 18,815 s, 177 archivos idénticos, cierre/logout aprobados. Código monetario `8ee5b14`; `7bebb3d` solo documentación. | PYG real total/mes y filtros contra Oracle independiente; CTE monetarias en dos órdenes con adaptador controlado y presentación; una petición HTTP real con modelo/resolución preparados. Diez bloques y tres peticiones financieras reutilizados por hash, sin sumar checks. CTE USD/CAD/ambiguas no son socio real multimoneda. [Detalle](backend-independent-validation.md). |

Las validaciones históricas conservan su SHA: no se declaran recién ejecutadas
en la base actual. Las suites controladas de aquellas etapas incluyen 251 pruebas
en Q, 263 antes de la corrección I, 29 enfocadas de empates, y 23 enfocadas de R
más una del adaptador. Son ejecuciones diferentes, no un total acumulable de pruebas
únicas ni un número de casos de cada herramienta. No se repitieron en esta revisión.

## Matriz de herramientas

Todas están implementadas y registradas. La columna de implementación señala el
servicio/función llamado por el dispatcher; los nombres de tests son archivos
dentro de `test/`. **Sin acreditar** indica falta de evidencia, no fallo probado.

| Herramienta / funcionalidad | Implementación | Pruebas automatizadas existentes | Oracle / HTTP existente | Commit validado | Pendientes y variantes no verificadas |
| --- | --- | --- | --- | --- | --- |
| `search_customers` — locales | `customers/customer.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Composición `929d88e`: 42/42 afectadas, ambos órdenes e historial, con dependencias controladas. | L: exacta/parcial/ausencia; identidades/conteos activos, denegación/cierre. H/Q previos reutilizados. | `7ced8d9` Oracle; `c8525a6` controladas  `929d88e` código; `d0bb3a6` composición aprobada | Históricos inactivos siguen excluidos por política. Empates exactos controlados; no muestra real de todos los empates ni lenguaje inicial exhaustivo. |
| `search_categories` — rubros | `categories/category.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Correcciones `2094624`: 44/44 enfocadas/HTTP controladas del bloque (solapadas).  Composición `929d88e`: 42/42 afectadas, ambos órdenes e historial, con dependencias controladas. | L: exacta/parcial/ausencia; identidades/conteos, denegación/cierre. H/Q previos reutilizados. | `7ced8d9` Oracle; `c8525a6` controladas  `2094624` código; `2bfa637` contraste afectado aprobado  `929d88e` código; `d0bb3a6` composición aprobada | Empates exactos y opciones truncadas controlados; interpretación libre y todos los empates reales no acreditados. |
| `get_sales` — ventas | `sales/sales.service.js` | `salesHistory`, `salesSeriesPresentation`, `salesYearComparison`, `salesExportFollowup`, `chatLifecycle` | H; lectura independiente de ventas dentro de Q/I para esos perfiles | `b315ff9`; Q/I para perfiles específicos | No todas las combinaciones de dimensiones/días/monedas; no repetir ventas generales ya aprobadas. |
| `get_sales_per_sqm` — ventas por m² (adicional) | `sales/salesPerSqm.service.js` | `salesPerSqm`, `chatLifecycle` | Q: historia contractual, superficies inválidas/ambiguas, filtros, FX y cierre | `e317a8f`; desplegado `68847db` | **Muestras DEV:** superficie cero y cambiante. Límites y cálculo ya controlados; lenguaje inicial no exhaustivo. |
| `search_members` — localizar socio | `members/member.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Correcciones `2094624`: 44/44 enfocadas/HTTP controladas del bloque (solapadas). | L: documento, pertenencia de identidades de nombre parcial y ausencia; rechazo/cierre. Selección: controlada. | `7ced8d9` Oracle; `c8525a6` controladas  `2094624` código; `2bfa637` contraste afectado aprobado | No completitud nominal ni ranking fuera de la cohorte acotada. Identificador compartido/empates: controlados; no atribuir una muestra real no registrada. |
| `get_member` — ficha de socio | `members/member.service.js` | Cobertura PII transversal; control N de todos los campos | N: ficha real encontrada y documento ausente, SELECT independiente | `7762f35` | Perfil ensayado aprobado; no todos los patrones de campos nulos ni ficha de usuario ajeno. |
| `get_member_purchases` — compras individuales | `members/member.service.js` → repositorio `members/memberPurchase.repository.js` | `memberPurchasesPagination`, `memberPurchasesPresentation`, `apiMemberPurchases`, `chatLifecycle` | T: dos socios, resumen mensual por moneda, filtros combinados y conteo inicial contra SQL independiente; P reutilizado para recorrido HTTP | `d529cfd` independiente; P histórico sin SHA propio | Muestra real multimoneda aún no buscada exhaustivamente. Timeout del descubrimiento eliminado al llevar pareja local/rubro en la muestra; servicio sin cambios. No atribuir SHA retrospectivo a P. |
| `search_promotions` — promoción/campaña | `promotions/promotion.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Correcciones `2094624`: 44/44 enfocadas/HTTP controladas del bloque (solapadas). | R textual/paginación reutilizados; L: fallback aproximado independiente, ocho páginas completas, total/hasMore/nextPage, denegación/cierre. | `7ced8d9` fallback; `89a4e59` R; `6b1303e` despliegue R  `2094624` código; `2bfa637` contraste afectado aprobado | Fallback real ensayado aprobado; no exhaustivo de todos los errores de escritura. Muestra multimoneda de compras continúa pendiente en su propia fila. |
| `get_member_promo_purchases` — compras promocionales | `members/memberPromoPurchase.service.js` | `memberPromoPurchases`, `promotionHardeningHarness`, `chatLifecycle` | R: siete páginas reales, multiconjunto y resumen, filtros/selección/seguimientos; denegación/cierre. `cafc5f1`: dos socios positivos distintos, resumen por moneda contra SELECT | `89a4e59`; desplegado `6b1303e`; `cafc5f1` independiente | **Muestra DEV:** socio con varias monedas; grupos ambiguos ya controlados en Oracle CTE. Los dos socios nuevos no acreditan multimoneda. |
| `get_member_vehicles` — vehículos del socio/chapa | `members/memberVehicle.service.js` | `vehicleRegistrations`, PII y ciclo | N: documento, activos y débito sí/no contra Oracle independiente; `cafc5f1`: chapa única/ausente, dueño/vehículo contra SELECT | `7762f35`; `cafc5f1` | Chapa activa compartida no encontrada; única/ausencia acreditadas. No confundir H de altas agregadas con búsqueda de dueño. |
| `analyze_members` — segmentación/ranking | `members/memberAnalysis.service.js` | Suites existentes de segmentación; 46/46 previas. Corrección del contrato orderBy: 17/17 enfocadas (5 nuevas; conteos solapados) | G: 50/50 finales Oracle/HTTP y cierre reutilizados; baseline y 40 controles/denegación previos. Null rechazado antes de SQL: 5/5 nuevos tests controlados en Docker DEV, sin nuevas lecturas Oracle | `345827f` validación orderBy; `7c34c14` Oracle/HTTP; `6b1303e` baseline; `82e72ba` parcial | Muestra real con varias monedas pendiente; CTE multimoneda aprobadas. Lenguaje inicial y carga general no exhaustivos. P2 orderBy:null corregido conforme al esquema no nullable; PR #36 fusionada y desplegada `00a1acb` (10/10 controles puntuales). |
| `compare_member_purchases_vs_sales` — canjes/ventas | `members/memberPurchasesVsSales.service.js` | `memberPurchasesVsSales`, `chatLifecycle`; corrección P2 con 15/15 enfocadas y 2/2 del ejecutor monetario | W: 86/86 en Oracle independiente PYG real total/mes/filtros; CTE monetarias y presentación en ambos órdenes; un HTTP afectado. N conserva su SHA histórico | `8ee5b14` código; `7bebb3d` Oracle/HTTP, sin cambios de código | Porcentaje solo con identificación inequívoca y contraparte compatible por pareja exacta. Ambigüedad, contradicción, incompatibilidad y alias distintos producen nulo con motivo. No convierte ni suma distintos. CTE no acredita socio real multimoneda; pendientes anteriores conservados. |
| `generate_chart` — gráficos | `charts/chart.service.js` | `charts`, `chatLifecycle`, `chartHttpVariants`, `chartValueAssociation`; negativos de etiquetas/series/ejes | H y `92b5e11` históricos; `d59d1f2`: 27/27 de tres variantes con fuente Oracle; despliegue `84fd67c`: 21/21 de un horizontal multiserie con etiqueta/serie/valor/moneda/período contra SELECT independientes | `ad0ef01` comprobador; `d59d1f2` Oracle/HTTP; `84fd67c` desplegado | Fuente única y perfil PYG; no todas las herramientas, divisas o fuentes combinadas (F5 del balance). No muestra multimoneda ni frontend; proveedor no consultado. |
| `analyze_campaign_sales_performance` — antes/durante/después | `sales/campaignSalesPerformance.service.js` | `campaignSalesPerformance`, `chatLifecycle` | H reutilizado; N: SQL independiente de tres períodos, límites, filtros local/rubro, importes/facturas/moneda | `b315ff9` HTTP histórico; `7762f35` independiente | Perfil ensayado aprobado; ausencia/base cero/monedas diferentes en otras campañas no acreditadas individualmente. |
| `search_invoice_concepts` — conceptos facturados | `invoices/searchInvoiceConcepts.service.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia y límite; denegación/cierre. Selección/contexto: controlados. | `7ced8d9` Oracle; `c8525a6` controladas | Sin paginación en contrato: opciones limitadas y refinamiento. Conversación inicial libre no exhaustiva. |
| `search_invoice_customers` — clientes facturados | `invoices/searchInvoiceCustomers.service.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia, clientes distintos, período aislado y denegación/cierre; selección con período controlada. | `7ced8d9` Oracle; `c8525a6` controladas | Fallback fuzzy positivo y otras coincidencias de RUC/matrícula no acreditados individualmente. Opciones limitadas; no prometer catálogo completo. |
| `get_invoices` — facturación | `invoices/invoices.service.js` | `invoices`, `chatLifecycle`; dos regresiones del control de resumen escalar/lista | B/D/N reutilizados; `cafc5f1`: chapa y recorrido completo, metadatos y multiconjunto contra SQL; `255fd53`: resumen por moneda/importe/facturas distintas contra SELECT, 6/6 | `b315ff9` histórico; `7762f35` independiente/HTTP; `cafc5f1` recorrido; `255fd53` resumen | El recorrido y el resumen acreditan sus respectivas cohortes, no identidad entre ellas. La ejecución inicial fallida conserva su estado. HTTP previo con modelo/contexto preparados. |
| `get_contract_conditions` — condiciones | `contracts/contractConditions.service.js` | `contracts`, `chatLifecycle` | B/D/N reutilizados: identidad, conceptos, último importe/vigencia/neto/IVA y HTTP positivo; `cafc5f1`: ausencia adicional contra SELECT | `b315ff9`; `7762f35`; `cafc5f1` ausencia | Sin cohorte real de 2–20 CNT activos por cliente en la consulta; no acredita toda ambigüedad ni cada empate real de este endpoint. No inferirlos de I. |
| `get_contract_cost_per_sqm` — costo por m² | `contracts/contractCostPerSqm.service.js` | `contracts`, `conversionProvider`; PYG/USD en ambos sentidos controlados y rechazo de moneda ambigua/contradictoria | B/N reutilizados; `92b5e11`: neto/superficie contra SQL con tasa y fallo de proveedor controlados, fecha aplicada y cierre | `7762f35` histórico; `e5868ea` código; `92b5e11` Oracle/controlado | Tasa real positiva pendiente: timeout anterior `cafc5f1`; llamada actual `EXCHANGE_PROVIDER_QUOTE_UNAVAILABLE`. No convertir prueba controlada en tasa real ni fecha de publicación/histórica. |
| `analyze_contract_cost_incidence` — incidencia | `contracts/contractCostIncidence.service.js` | `contractIncidence`, `contracts`, `chatLifecycle` | I: resumen/mes, SQL independiente, límites de vigencia, empates invertidos, FX y seguimientos | `dcd9530`; desplegado `8e80887` | **Muestra DEV:** ventas registradas cuya suma sea cero; no confundir con ausencia real ya verificada. |
| `search_soles_types` — tipos de soles | `soles/searchSolesTypes.service.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia y alias normales obtenido de Oracle; rechazo/cierre. | `7ced8d9` Oracle; `c8525a6` controladas | Descripciones/alias duplicados controlados; no muestra real acreditada de cada empate o positivo fuzzy. S no se repite. |
| `get_member_soles` — saldo/vencimiento | `soles/memberSoles.service.js` | `memberSoles`, `chatLifecycle`; driver real y 2/2 regresiones de documento canónico | V: 19/19, seis variantes, documento exacto y SQL independiente; `cafc5f1`: otras ventanas combinadas positivas en tres estados, contra SELECT; cierre/logout | `a709b35`; `cafc5f1`; S histórico sin SHA propio | V conserva sus tres ventanas históricas vacías. Las nuevas fechas se descubren en Oracle, no reemplazan V ni prueban ausencia global. `.trim()` solo al documento de entrada; igualdad SQL sin cambios. |
| `get_soles_usage` — usos | `soles/solesUsage.service.js` | `solesUsage`, `chatLifecycle`; guard de rubros `2094624` | O: filtros combinados, sumas/conteos/distintos y detalle; ranking de socios/orden/desglose por tipo contra SQL independiente en octubre de 2023 | `6e6c423` Oracle real; guard `2bfa637`; S sin SHA histórico | Perfil ensayado aprobado; no todas las combinaciones individuales de filtros. Muestra de ranking devuelve cuatro socios, no cinco inventados. Soles son cantidades, no monedas. S se reutiliza sin repetir la conversación/paginación. |
| `search_soles_usage_destinations` — destinos | `soles/solesUsageDestination.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia, pareja tipo/código y conteo/hasMore con límite; rechazo/cierre. | `7ced8d9` Oracle; `c8525a6` controladas | Pareja SOCIO/LOCAL con igual código: controlada; muestra real conjunta no acreditada. No hay contrato page. |
| `search_soles_usage_movement_types` — movimientos | `soles/solesUsageMovementType.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia y listado limitado; conteo real/hasMore, denegación/cierre. Selección: controlada. | `7ced8d9` Oracle; `c8525a6` controladas | No se revalida el signo/importe de los usos como parte del catálogo. Interpretación libre no exhaustiva. |
| `get_vehicle_registrations` — altas de vehículos | `vehicles/vehicleRegistrations.service.js` | `vehicleRegistrations`, `chatLifecycle` | T: julio de 2025, edades y distintos/filtros/detalle; `cafc5f1`: cinco períodos relativos, límites Asunción y distintos globales contra SQL | `d529cfd`; H `b315ff9`; `cafc5f1` relativos | Hoy/ayer/semana/mes vacíos; año positivo. No sumar distintos entre grupos ni períodos. T conserva su censo aprobado. |

## Capacidades del backend fuera del registro de herramientas

| Función | Implementación/pruebas | Evidencia existente y pendientes |
| --- | --- | --- |
| Exportación XLSX de ventas | Rutas de exportación, `salesExportFollowup`, `salesHistory`, `chatLifecycle`, `dependencySecurity` | H + X. Archivo real ZIP/ExcelJS y conciliación aprobados; no es herramienta faltante ni obliga a repetir exportación. |
| Chat/reset, historial y PII | Rutas/controladores, store por sesión; `chatLifecycle`, `requestCancellation`, `conversationClarification`, `piiAnalysisSubjects` | H/D y seguimientos Q/I/R. Historial y exclusión son de proceso; distribución entre réplicas no se incluye en este cierre de backend. |
| Autorización/cierre/logs | PostgreSQL → proxy Oracle; `oracleSessionClose`, dispatcher/ciclo | D/Q/I/R: usuarios distintos, rechazo sin datos y cierre. R: fallos simulados después del cierre real y códigos seguros; no equivale a fallo real de driver observado. No autentica al usuario ni modifica expiraciones. |

## Pendientes clasificados y trabajo mínimo de cierre

El [balance final](backend-scope-balance.md) contiene el dictamen de bloqueo por
pendiente: E1/E2 proveedor, F1–F7 variantes, M1–M10 muestras y T1–T4 trazabilidad/
límites. Esta sección conserva el inventario y su evidencia. No se deben ejecutar
de nuevo los perfiles aprobados por aparecer en la tabla histórica.

**Implementación ausente:** ninguna herramienta del registro original identificada.
No hay base para planificar una nueva migración completa. Un comportamiento no
verificado no es automáticamente un bug ni justifica cambiar código.

**Muestras DEV faltantes con cobertura controlada aprobada** (conservar abiertas
como limitación, sin bloquearlas como si faltara implementar el cálculo):

| Código / caso | Cobertura existente | Qué falta |
| --- | --- | --- |
| `ZERO_AREA_DEV_FIXTURE_NOT_FOUND` | Ventas por m²: superficie cero → no calculable, motivo, sin división | Contrastar una muestra real autorizada de superficie cero. |
| `CHANGED_AREA_DEV_FIXTURE_NOT_FOUND` | Ventas por m²: selección histórica y superficie cambiante, límites y resultados no calculables cuando corresponda | Muestra real con cambio dentro del período. |
| `ZERO_SALES_DEV_FIXTURE_NOT_FOUND` | Incidencia: ventas sin filas, filas con suma cero y otros no calculables se distinguen; empates/monedas controlados | Filas reales de ventas cuya suma sea cero, no otra muestra sin registros. |
| `MIXED_CURRENCY_REAL_MEMBER_FIXTURE_NOT_FOUND` | Compras promocionales: grupos de monedas reconocidas/ambiguas separados, sin USD por `$`; unitarias y CTE Oracle | Socio real con participaciones en varias monedas. No extrapolar esa evidencia a compras individuales/segmentación. |

No alterar contratos, ventas ni socios para obtenerlas. Si DEV no contiene esas
muestras, cerrar la implementación con la limitación explícita y conservar el
pendiente de evidencia; no declararlas aprobadas como casos reales.

**Verificación backend restante**, priorizada por efecto sobre resultados/permisos:

1. Completar trazabilidad de S/P usando artefactos/manifiestos ya existentes.
   Si no permiten anclar SHA, conservar «sin acreditar»; no inventar un commit
   por fecha ni repetir suites completas para subsanar un dato documental.
2. Segmentación G y buscadores L/C/M, persistencia, transiciones, reelección y
   despliegue de PR #37 están aprobados para sus perfiles. No quedan pendientes
   de implementación ni corresponde volver a ejecutar esos controles.
3. Ficha/vehículos por documento aprobados en N; usos/ranking en O, compras/
   edades en T y saldo en V. Tanda de trece bloques cerrada para sus perfiles,
   sin repetir bloques aprobados ni conversaciones/paginación históricas.
   V conserva tres ventanas históricas vacías para su socio/período; `cafc5f1`
   acredita otras ventanas combinadas positivas, sin reemplazar esa limitación.
4. Conservar el estado de los ocho contrastes enumerados abajo; ejecutar solo
   los pendientes cuando estén disponibles sus dependencias/muestras. N/T/W y el
   despliegue de PR #38 ya acreditan los perfiles de compras individuales,
   canjes/ventas, campañas y los tres endpoints financieros: no repetirlos.
5. Gráficos horizontal/circular/multiserie: asociación estricta del perfil mensual
   PYG acreditada por HTTP en `d59d1f2`, contra su fuente Oracle, sin UI ni repetir
   auditoría de negocio. `92b5e11` conserva el control histórico de presencia.
   Otras fuentes/divisas no exhaustivas siguen como limitación; no reabrir este
   perfil. Proveedor: acreditar una cotización real válida cuando esté disponible,
   sin confundir el dato controlado del nuevo contraste con tasa pública.

| Prioridad | Variante ejecutable con DEV | Evidencia adicional mínima / estado |
| --- | --- | --- |
| P1 | Vehículos por chapa única y ausente | **Aprobado `cafc5f1`**: dueño/vehículo contra SELECT; ausencia sin propietario. Chapa compartida sigue dependiendo de muestra real. |
| P1 | Facturas por chapa y todas las páginas de una cohorte completa acotada | **Componentes acreditados**: `cafc5f1` recorrido completo/fin vacío/metadatos/multiconjunto; `255fd53` resumen por moneda/importe/facturas distintas, 6/6. No se afirma identidad entre cohortes ni se reescribe la ejecución inicial fallida. |
| P1 | Condiciones sin contrato | **Aprobado `cafc5f1`**: ausencia independiente y respuesta sin conceptos/importes. |
| P1 | Condiciones ambiguas | **Sin muestra `cafc5f1`**: no hay cohorte de 2–20 CNT activos por cliente en la consulta realizada. No inferir cobertura de este endpoint desde incidencia. |
| P1 | Costo por m² con conversión real | **Proveedor real pendiente**: timeout anterior `cafc5f1`; llamada actual sin cotización válida. `92b5e11` acredita neto/área Oracle y aritmética con tasa/fallo controlados, no tasa pública real ni histórica. No elegir una moneda/número arbitrariamente. |
| P2 | Ventanas positivas combinadas de generación/vencimiento de soles | **Aprobado `cafc5f1`**: filas reales para todos/vigentes al vencimiento/vencidos al día siguiente, saldo/cantidad por tipo. Fechas descubiertas. No reemplaza las tres ventanas históricas vacías de V. |
| P2 | Otro socio con compras promocionales | **Aprobado `cafc5f1`**: dos documentos distintos positivos, resumen por pareja monetaria exacta y período contra SELECT. No acredita socio multimoneda. |
| P2 | Fechas relativas de altas de vehículos | **Aprobado `cafc5f1`**: cinco límites Asunción y distintos globales contra SQL. Hoy/ayer/semana/mes vacíos; año con filas. No acredita positivos en los cuatro rangos vacíos. |

La denegación D y el aislamiento por `sessionId` se reutilizan: estos contrastes
no cambian rutas, servicios de sesión, dispatcher ni permisos. Cada operación
nueva comprueba cierre real; no se pide otra cuenta sin permisos para repetir D.
Las variantes no exhaustivas de lenguaje/dimensiones no constituyen tareas de
implementación. La trazabilidad S/P permanece sin SHA acreditado y no se corrige
por fecha. Las muestras de segmentación multimoneda mantienen su cobertura G;
compras individuales multimoneda sigue sin búsqueda exhaustiva y no hereda R/G.

El criterio de cierre es: registro completo, cálculo y filtros con evidencia
atribuida, aislamiento/denegación/cierre cubiertos en cada nuevo flujo, sin bugs
abiertos; variantes y muestras no disponibles registradas con límites explícitos.
No se incluyen conexión del frontend al servicio, login ERP, cambios de permisos,
expiraciones, sincronización de datos ni despliegues adicionales.
