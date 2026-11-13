# Alcance y evidencia del backend del chatbot

## PR #53 fusionada y desplegada: e471261

Merge autorizado y rama local actualizada por avance rápido; solo chatbot Docker DEV reconstruido. Salud HTTP 200, PM2 online/cero reinicios, Node 22.23.5; 265 archivos y 15 módulos cargados coinciden con el merge. Código ejecutable igual al candidato 879dcf2 (118/118 pruebas afectadas anteriores); c7bd25e solo documenta.

**750 comprobaciones, cinco POST reales en 5400:** literal de Impacto con deuda cancelada y página 2; pendientes del mismo cliente; «ahora las canceladas» y su página 2 directamente después de recortar el historial propio. Catálogo de saldos y `get_invoice_balances`/`DEUDA = 0`, sin ANULADO ni filtro positivo heredado en settled. Resultados, orden, estado, deuda exacta, tabla y paginación conciliados con Oracle independiente. Sin contexto/cursor sembrado ni resultados simulados; cero intentos/llamadas/eventos Bedrock/proveedor.

Cierres proceso 6/6 e independiente 1/1, driver/SDK restaurados, inspector/pool/conversación/cursor propios limpiados y logout/logs sanitizados aprobados. Salud final 200/online/cero reinicios. No se repitieron suites completas ni se provocaron fallos Oracle; no hay cambios de negocio, permisos o expiraciones administrativas. [Detalle y reservas](invoice-settled-dev-live-e471261.md). No se recorrió la cohorte completa; ausencia/denegación/error siguen con cobertura simulada. Reservas y fallos históricos conservados.

## PR #52 fusionada y desplegada: 9fa4504

Merge autorizado, rama local actualizada por avance rápido y solo chatbot Docker DEV reconstruido. Salud 200 antes/después, PM2 online/cero reinicios, Node 22.23.5; 258 fuentes y 13 módulos cargados coinciden con el merge. Código de aplicación idéntico al candidato 36c72b7 (96/96 pruebas afectadas anteriores); 1112676 solo documenta.

**226 comprobaciones del proceso desplegado, tres POST en 5400:** facturas generales con cliente/concepto/emisión confirmados por Oracle y selección determinista; «solo las pendientes» pasa a `get_invoice_balances`/`DEUDA > 0`, conserva cliente y retira filtros de facturación; página 2 real desde la primera respuesta, sin nueva preparación. Deuda exacta, campos, orden, tabla completa y metadatos de paginación conciliados con SELECT independiente. Contexto preparado solo antes de la consulta general, sin modelo real ni resultados simulados; bloqueo preventivo del SDK, cero intentos/llamadas/eventos Bedrock/proveedor.

Cierres: proceso 3/3 e independiente 1/1, driver/SDK/inspector/pool y conversación propios limpiados; logout confirmado y logs sanitizados aprobados. Salud final 200/PM2 online/cero reinicios. Sin suites completas ni fallos Oracle provocados; datos de negocio, permisos y expiraciones sin cambios administrativos. [Detalle, evidencia y reservas](invoice-pending-dev-live-9fa4504.md). Los fallos globales históricos y todas las reservas de PR #50/#51 se conservan; los estados de borrador siguientes son históricos.

## PR #51 fusionada y desplegada: 6ac1556

Merge autorizado y actualización local por avance rápido; solo chatbot Docker DEV reconstruido/recreado. Salud 200 antes/después, PM2 online/cero reinicios al arrancar, sin errores detectados; 248 fuentes y siete módulos cargados coinciden con el merge, Node 22.23.5.

21 aserciones del control desplegado, cinco POST reales en 5400: detalle páginas 1/2, suma/conteo por moneda en alcance limpio, bloqueo por duplicados y detalle preservado con advertencia. Conciliación SQL independiente con los mismos pares/estados; sin deduplicar ni elegir una versión. Historial propio preparado para el flujo determinista de paginación y bloqueo preventivo del SDK, cero intentos/proveedor: no acredita interpretación de lenguaje natural.

Cierres: proceso 5/5, independiente 1/1, driver/SDK restaurados, inspector/pool propios cerrados, conversación limpiada y logout aprobado. Logs sanitizados de stdout/stderr conciliados tras añadir nombres explícitos al auditor, sin relanzar consultas; prueba local específica del auditor aprobada. Primer intento diagnóstico interrumpido sin conexiones/consultas, cerrado y con logout; consta en evidencia.

[Reporte y reservas del despliegue](invoice-balances-dev-live-6ac1556.md). Conservadas muestra Oracle de duplicados con deudas distintas, denegación real, dimensiones/casos temporales no ejercitados positivamente, colisión real de símbolos y pendientes independientes ANX123/muestra mixta de PR #50. Sin suites completas ni cambios de datos históricos, permisos o expiraciones. Los estados de borrador/lista siguientes son históricos.

## Estado vigente PR #51: integridad por alcance, 8420e82

Esta sección sustituye el bloqueo global de las entradas históricas siguientes; no declara única toda la vista.

| Capacidad | Control afectado | Reserva |
| --- | --- | --- |
| Duplicados | Versiones por par serie/número antes de filtros efectivos; deuda igual bloqueó summary real, sin elegir una fila | Sin muestra Oracle de deudas distintas; solo prueba local simulada |
| Perfiles limpios | Identidades limpias y cliente completo encontrados; sumas/conteos/orden por moneda y cliente conciliados con SQL independiente | No certifica todas las dimensiones/combinaciones |
| Cálculos inconsistentes | Sin data ni invoiceCount calculado; explicación de registros históricos inconsistentes/información incompleta | Bloqueo conservador del resumen completo, sin subtotal parcial silencioso |
| Detalle | Filas preservadas con advertencia y conteo de registros separado | No deduplicación ni conteo de facturas sobre identidad inconsistente |
| PII/HTTP | Tres POST efímeros: summary limpio/bloqueado y detalle advertido; SDK controlado | Texto del historial solo contrastado para identificadores de seis o más caracteres; denegación real pendiente |
| Cierre | 1/1 preparación, 4/4 validación, logout, logs sanitizados; imagen/arranque intactos | Sin despliegue ni datos históricos corregidos |

26 aserciones Oracle/HTTP y 34/34 pruebas locales afectadas, Node 22.23.5; cero proveedor/PDF, sin suite completa ni repetición de los 117 controles anteriores. [Contrato y evidencia actuales](invoice-balances-integrity-contract.md). PR en borrador; ANX123 y muestra mixta Oracle de PR #50 pendientes independientes. Sin merge, despliegue o cambios de datos, permisos o expiraciones.

## Actualización PR #51: series y estados de deuda

Esta sección prevalece sobre las entradas históricas de saldos/deudas de diez columnas. PR en borrador, sin desplegar.

| Capacidad | Evidencia actual 0c34985 | Reserva |
| --- | --- | --- |
| Serie y número | Once columnas; detalle/PII/filtros por parejas exactas; mismo número con series distintas conciliado en Oracle | Pares repetidos incluso con cliente/sector/moneda; no equivalen a facturas únicas, sin deduplicación |
| DEUDA | Pending >0 predeterminado, settled =0, all no negativas/nulos, unknown nulos; negativos siempre excluidos, también en buscador | Null desconocido, nunca cero/cancelada |
| Conteos y paginación | Filas, números, pares y clientes separados; SQL independiente y páginas conciliados | Conteo de entidades factura y agregaciones monetarias continúan bloqueados por granularidad |
| Monedas y orden | COD_MONEDA nativo para orden de registros; sin mezclar ni convertir monedas | Totales/rankings agregados bloqueados; colisión de símbolos solo local |
| Vencimiento/antigüedad | Asunción 12/11/2026; vencidos y 30 días con muestra | Sin positivos pending hoy/futuro/undated/próximos siete días; vacíos conciliados |
| PII/sessionId/HTTP | Serie incluida; SDK/historial protegidos, respuesta autorizada restaurada; sesión inválida rechazada | ORA-01031 inyectado sin datos; denegación real sigue sin muestra |
| Cierre | Perfil 1/1, validación 8/8 conexiones, logout y logs sanitizados aprobados; listener efímero cerrado | Imagen/arranque desplegados sin cambios |

117 aserciones Oracle/HTTP, siete POST, seis SDK controlados, cero proveedor/PDF; 25/25 pruebas locales afectadas en Node 22.23.5, sin suite completa. [Contrato y evidencia vigentes](invoice-balances-series-contract.md). ANX123 y muestra mixta Oracle de PR #50 pendientes independientes. Sin merge, despliegue o cambios de datos, permisos o expiraciones.

Corte actualizado: **06/11/2026**, base desplegada `059ac13` (PR #41 fusionada).

## Balance actual del cierre

El [balance final del backend](backend-scope-balance.md) clasifica **cada pendiente
por su efecto sobre el cierre**, separando variantes funcionales, muestras DEV,
trazabilidad y cotización real positiva. Es la referencia para priorizar trabajo;
las tablas inferiores conservan los perfiles y SHA históricos, no ejecuciones nuevas.

Las 25 herramientas originales están implementadas, 26 en el registro actual.
Se registra el **cierre de los perfiles acreditados sobre `059ac13`**, con sus
reservas y evidencia histórica reutilizada; no procede afirmar
cobertura integral de variantes financieras F3, extensiones condicionales
F4/F5 o conversión real E1 sin la evidencia correspondiente. Los positivos
específicos pendientes F1/F2 ya tienen contraste independiente en `6ac06bc`.
Las muestras ausentes con cobertura controlada no son implementación faltante.
La revisión posterior F3/F4 identificó dos hallazgos: suma monetaria de campaña
antes de separar monedas y etiqueta `$` indistinguible en compras individuales.
Las correcciones de la rama `test/backend-final-variants-dev` se fusionaron en
PR #41 y están desplegadas en `059ac13`. Pruebas controladas propias y consulta
de campaña Oracle aprobadas. La muestra multimoneda real F4 sigue
reservada, sin confundir su regresión controlada con Oracle.

### Cierre acreditado en el despliegue `059ac13`

Merge completo `059ac13c2fb7d84a8929dcd14b28219d440a09df`, base local actualizada
y Docker DEV reconstruido. La evidencia existente acredita **191 archivos
coincidentes con Git**, dependencias con lockfile, salud HTTP 5400 development,
PM2 online, cero reinicios y sin errores de arranque.

**17/17 verificaciones desplegadas**, 06/11/2026 17:29:16–17:29:23 UTC: un
perfil real PYG de campaña, tres períodos, importes y parejas monetarias,
registros/métrica de facturas, promedios diarios, diferencias, porcentajes y
presentación conciliados con SELECT Oracle independientes. Dispatch y
presentación desplegados en `/app`; **no es una nueva conversación HTTP**.
Cierre de conexiones por bloque/global y logout aprobados. Logs compactos
del helper: chatbot cero líneas, ERP dos, sin alertas técnicas o sensibles
detectadas. No hubo consultas al proveedor ni suites completas nuevas.

Reporte local ignorado `deployed-pr41-campaign-059ac13.json`, SHA-256
`87e63a1c476165349297774f45489b72e7742559b42ef2fd1704b05daf5c2614`;
salud/arranque en `deployed-pr41-startup.json` y cierre en `deployed-pr41-result.json`.
Las **18/18 pruebas controladas de `c0eabb6`** cubren moneda ausente, desconocida,
contradictoria, inversión de períodos, ausencia y compatibilidad: no son
muestras Oracle reales. `ff937d8` conserva código/pruebas y ajusta las siglas
admitidas por el control independiente; `58ba921` solo documenta resultados.
No se suman checks y pruebas
solapadas como variantes distintas ni se reatribuyen los SHA históricos al merge.

El cierre se limita a esos perfiles: **las seis reservas F3/F4/M7 siguen
abiertas**, al igual que F5, T1, las muestras históricas y E1 (cotización real
positiva sin acreditar). `coverageComplete=true` del ejecutor de campaña solo
describe ese perfil PYG. Integración frontend/ERP fuera del alcance. Esta
actualización documental no ejecuta pruebas, Oracle, login ni proveedor.

### Investigación posterior: librería 2023 y filtro de local

En la rama `fix/library-category-sales-2023`, el [diagnóstico](library-sales-context-investigation.md)
con modelo real y Oracle sobre `059ac13` confirma que la consulta nueva funciona
(9/9 controles, seis grupos mensuales); al reproducir cuatro preguntas previas,
un local confirmado se conserva y explica cero filas para local+rubro frente a
seis grupos del rubro sin local (7/7 diagnósticos). No es un fallo de tildes ni
de selección del rubro. La frase vacía no se reprodujo literalmente en ese
segundo caso, que usó una métrica escalar y una respuesta final del modelo.

Corrección de presentación preparada: mostrar filtros efectivos y explicar el
vacío de la combinación, sin retirarlos; «todos los locales» elimina únicamente
el local ante petición explícita. Métrica escalar reconocida coherente con el
servicio. **11/11 enfocadas Node 22.23.4** sobre `94808df`, preflight completo y
262 archivos coincidentes; pruebas controladas nuevas. **19/19 verificaciones
Oracle afectadas sobre `e5240d2`**, código/pruebas/ejecutor idénticos a `94808df`:
dos turnos con modelo/estado controlados y datos Oracle legítimos. Vacío con
ambos filtros explicado; retirada explícita solo del local, conservación de
rubro/año/mes y conciliación mensual completa por moneda con SELECT.
Identidad proxy, cierres/logout y logs compactos aprobados. Reporte ignorado
`library-sales-final-e5240d2.json`, SHA-256
`9a81aa7241107094969399e98c23bc85a2c1a22e05026ffeb284651e355407a3`.
Las 11 pruebas y las reproducciones con modelo real se reutilizan por hash,
sin repetirlas ni presentar este control final como modelo real/HTTP nuevo o
como el mismo local original. PR #42 en borrador para revisión del diff.
Los perfiles cerrados en `059ac13` y sus reservas no cambian; sin despliegue.

**P2 posterior en corrección:** el reporte 19/19 anterior no protege frente a
propuestas de otro año/agrupación al retirar el local. El guard ahora conserva
los argumentos efectivos de sesión para una retirada exclusiva, también tras
recortar el historial; fechas/agrupación adicionales reconocidas se derivan del
texto explícito del usuario. Nuevas regresiones comparan argumentos/SQL y
estado (2023/mes frente a propuesta 2024/año), cambios explícitos y ausencia de
contexto. **24/24 enfocadas Node 22.23.4** sobre `fb7516a`, preflight completo y
264 archivos coincidentes. El control final
nuevo es de modelo/historial controlados con
datos Oracle legítimos; no se repiten ni reatribuyen las reproducciones reales.
El primer intento DEV P2 quedó bloqueado en `ERP_LOGIN_REJECTED` (código
seguro `ORA-01017`), antes de iniciar el worker Oracle. No acredita ni invalida
la corrección ni prueba denegación de herramientas; sus 24/24 enfocadas siguen
vigentes. Diagnóstico local del helper corregido sin cambiar la aplicación.
**Control P2 posterior: 29/29 aprobado sobre `7f61efa`**, código/pruebas/ejecutor
idénticos a `fb7516a`: retirada ante propuestas contradictorias antes/después
del recorte real mantiene rubro/2023/mes y demás argumentos; cambio explícito
a 2024/año permitido. Argumentos/SQL/estado/presentación y totales por moneda
contra SELECT independientes. Modelo e historial controlados, no reproducciones
reales nuevas. 24 pruebas, reporte 19/19 y dos reproducciones reales reutilizados
por hash; cierres/logout aprobados, sin alertas técnicas/sensibles en logs compactos.
Reporte ignorado `library-sales-removal-7f61efa.json`, SHA-256
`e7b794a3fd82de62c2c48cd2b6a38006b5bd186a6fe599c2a0860edd483cc522`.
PR #42 permanece en borrador para revisar el diff; reservas conservadas.

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
añade cuatro regresiones propias: candidato **`61c5c9f`**, **15/15** enfocadas
en Node **22.23.4**, preflight completo y **257 archivos coincidentes** con Git.
Contraste Oracle **`6ac06bc`**, código idéntico: **26/26 checks**, cinco bloques
aprobados (cuatro positivos de buscadores y un perfil afectado de campaña),
cero fallos y seis reservas de muestra. No sumar esos checks a las 15 pruebas
como variantes únicas. `coverageComplete=false`; cierres y logout aprobados.

| Pendiente | Estado de esta ampliación | Reserva conservada |
| --- | --- | --- |
| F1 RUC/matrícula y fuzzy positivos | **Aprobados `6ac06bc`**: identidades y período contra SELECT; fuzzy positivo solo tras demostrar cero coincidencias fuertes, umbral y orden contra Oracle. | Cohorte de 20 filas, fuzzy hasta seis candidatos. Catálogo Oracle + errata controlada; no HTTP nuevo ni exhaustividad lingüística. |
| F2 fuzzy positivo | **Aprobado `6ac06bc`**: distancia independiente, cero coincidencias directas y catálogo Oracle real. | Hasta ocho tipos. No se repitieron alias/parcial; no acredita todas las erratas. |
| F3 ausencia/referencia cero/monedas distintas | Corrección y `sourceRows` cubiertos por pruebas propias; **un perfil real de tres períodos aprobado `6ac06bc`** por cambio de consulta. | Diez campañas de hasta 61 días sin las cuatro muestras excepcionales (ausencia, referencia cero, mezcla, suma cero registrada). Esas ramas **no** aprueban con Oracle. Suma de `CANTIDAD_FACTURAS` no significa facturas distintas. |
| F4 compras individuales multimoneda | Cobertura controlada propia de repositorio/DTO/presentación; dos descripciones con `$` separadas. Búsqueda real ejecutada. | No encontrado en 1.000 filas enero–mayo 2023. No hubo resumen/recorrido multimoneda real. No hereda CTE de R/G ni declara ausencia global. |
| M7 chapa activa compartida | Test histórico aprobado revisado sin SHA de código atribuible; búsqueda real ejecutada. | No encontrada entre 44 vehículos elegibles (tope 1.000, activos, sin placas vacías/espacios interiores). Ambigüedad real sigue reservada. |
| F5 formas de gráficos | [Contrato y evidencia por forma](chart-result-contract.md): arrays `data`/`results`, rutas de etiqueta/métrica, series y unidades. | Positivo específico de `dataPath` a array anidado mediante índice no identificado. No se ejecuta F5 ni proveedor en este bloque. |

T1 conserva S/P sin SHA propio: **no reconstruir hashes por fecha**. E1 sigue
pendiente separado; ningún control nuevo de esta ampliación consulta proveedor.
Reporte congelado local ignorado `backend-final-variants-6ac06bc.json`, SHA-256
`1d2cef95e077cc79eb912500b94a68b30739f1e88ae2ed6e61beda5b89d0532e`.
Dispatch real + SELECT independientes; no atribuir a HTTP estos contrastes.

**Seguimiento P2:** el hallazgo de moneda nula con registros no está
acreditado por el perfil real anterior. La corrección distingue período vacío
de `missing`/`unrecognized`/`contradictory`, sin asignar PYG, y valida cada pareja
por separado con motivo en resultado/presentación. Siete regresiones nuevas,
**18/18 enfocadas Node 22.23.4**, candidato `c0eabb6`, preflight completo y
**260 archivos coincidentes**. **17/17 verificaciones DEV sobre `ff937d8`**,
código y pruebas idénticos a `c0eabb6`: un perfil real PYG de campaña con tres
períodos, importes/porcentajes/promedios/presentación contra SELECT independientes.
Los casos de moneda inválida permanecen controlados; no son muestras Oracle.
F1/F2 y las seis reservas previas se reutilizan por hash, sin repetirlas.
`coverageComplete=true` solo para este perfil, no para las reservas/backend.
Reporte congelado local `campaign-currency-ff937d8.json`, SHA-256
`7a3a2eda0fd74fedad69e27508f7ddf971185b0fa4f5e4aadcc798e753fdb095`.
Cierres/logout y logs compactos aprobados; PR #41 revisada, fusionada y desplegada
en `059ac13`, según el cierre anterior.
Detalle y
contrato en [variantes finales](backend-final-variants-validation.md).

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
| `analyze_campaign_sales_performance` — antes/durante/después | `sales/campaignSalesPerformance.service.js` | `campaignSalesPerformance`, `campaignCurrency`, casos de campaña de `finalVariantGaps`; 18/18 enfocadas controladas en `c0eabb6` | H/N reutilizados; `ff937d8`: 17/17 de perfil PYG; `059ac13`: 17/17 desplegados, tres períodos, importes/porcentajes/promedios/presentación contra SELECT independientes, cierre/logout | `b315ff9` HTTP histórico; `7762f35` independiente; `c0eabb6` código; `ff937d8` control; `059ac13` desplegado | Perfil PYG cerrado; cuatro reservas excepcionales F3 conservadas. Moneda inválida/ausencia/inversión acreditadas con datos controlados, no muestras reales. Sin FX ni conversación HTTP nueva. |
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

## Ventas: consulta autónoma de rubro (09/11/2026)

Base `92c1ff0`, rama `fix/sales-autonomous-category-intent`.
[Diagnóstico, comandos y evidencia](sales-category-intent-investigation.md).

| Variante afectada | Argumentos y estado esperados | Evidencia actual |
| --- | --- | --- |
| Enero–mayo global → Nike enero–abril → librería anual mensual | Sin Nike; librería resuelta; 2023 completo/mes; local retirado y contexto nuevo | Regresión antes y después del recorte real aprobada |
| Mismos antecedentes → «filtra también por librería» | Conserva Nike/enero–abril/mes; añade librería; ambos dominios seleccionados | Regresión antes y después del recorte real aprobada |
| Nuevo rubro ambiguo → selección, con rubro/tipo de día anteriores | No reaparecen local/rubro/tipo de día anteriores; contexto nuevo conservado | Regresión antes y después del recorte aprobada |
| Nike ambiguo, sin propuesta de ventas → selección | Enero–abril persiste desde el texto, sin volver a enero–mayo | Regresiones antes/después del recorte y selección por chat aprobadas |
| Modelo real y Oracle independiente | Argumentos/SQL, todos los grupos/importes/monedas, estado, proxy, cierres y logout | **92/92 aprobados `fb913e2`**, 23 llamadas reales; secuencia literal con Nike pendiente y ocho ramas sobre ambos Nike legítimos, dos intenciones antes/después del recorte |

66/66 pruebas enfocadas Node 22.23.4 DEV en `fb913e2`, 271 archivos
verificados. Reporte real congelado y revisado:
SHA-256 `a5d0b2343730820c1572c8c3c45e76ff4827c81a2285bb6af3cadc0a1f285bd8`.
Login protegido, cierre de todas las conexiones y logout aprobados. Logs:
chatbot cero líneas, ERP dos, esquema sanitizado reconocido. Los dos controles
detenidos en catálogo y el parcial anterior se conservan con sus límites en la
investigación; no son aprobaciones globales. PR #43 en borrador. La evidencia previa de PR #42
se conserva con sus límites; no acredita esta intención nueva. Las reservas
históricas, muestras no disponibles y proveedor real pendiente siguen vigentes.
Sin suite completa, cambios de datos/permisos/expiraciones, merge o despliegue.

## Ventas: nombres del alcance y métricas predeterminadas

Base `d6ca3ae`; rama `feat/sales-resolved-scope-default-metrics`.
[Diseño y evidencia](sales-scope-metrics-investigation.md).

| Variante | Resultado requerido | Evidencia |
| --- | --- | --- |
| Local/rubro resueltos, antes/después del recorte | Nombres del catálogo asociados a los IDs efectivos; sin etiquetas del modelo | Regresiones y contraste Oracle aprobados sobre ambos Nike legítimos |
| Cambio, reselección o retirada | Solo nombres de los filtros efectivos; período, desglose y tipo de día conservados | Flujo completo y contraste independiente; sin etiquetas antiguas |
| Modelo propone solo importe | `totalAmount` y `totalInvoices` por defecto | Argumentos, columnas SQL y ambas magnitudes conciliadas |
| Usuario pide una métrica | Solo esa métrica; preferencia persiste tras recorte y permite volver a ambas | Importe/facturas por separado y restauración aprobados, también con Oracle |
| Oracle independiente | Importes/cantidades/monedas y nombres por ID, cierre y logout | **260/260 aprobados `43d7292`**, modelo controlado; cero Bedrock/proveedor; candidato aislado |

**82/82 pruebas enfocadas Node 22.23.4 en `3d31d63`**, reutilizadas por identidad
del código de aplicación/pruebas; los commits posteriores hasta `43d7292`
solo ajustan el ejecutor Oracle. 280 archivos verificados. Reporte final revisado:
SHA-256 `478fc660db60d8a96c565e84beb0b5c0853f11993c613ad855d1a75cb475a621`.
El parcial anterior falló una preparación del control de retirada y se conserva
con su límite; no es aprobación global. Cierres, logout y logs sanitizados
aprobados. Etiquetas ausentes/contradictorias tienen cobertura controlada; no se
afirma muestra Oracle real. La evidencia histórica de PR #43 y sus reservas se
conservan; no acredita estos cambios nuevos. Sin suite completa, proveedor,
cambios de datos/permisos/expiraciones, merge o despliegue de esta rama.

### Corrección P2 de «no solo» en PR #44

| Caso nuevo | Resultado requerido | Evidencia nueva |
| --- | --- | --- |
| Solo importe → «No solo enero, también febrero» | Conserva importe único y amplía a enero–febrero | Argumentos, preferencia persistente, contexto, SQL y presentación antes/después del recorte |
| Sobre enero–febrero → «No solo el importe, también las facturas» | Ambas métricas sin perder período, filtros, mes ni tipo de día | Los mismos perfiles antes/después del recorte; propuesta del modelo de solo importe |
| «No solo» referido a local, período o agrupación | No se interpreta como cambio de métricas | Regresión de intención; referencias explícitas a métricas siguen reconocidas |

**7/7 pruebas afectadas Node 22.23.4 en `300bec0`** (cinco regresiones nuevas y
dos checks existentes de política), 282 archivos verificados. Hash de salida
`218982f2408a131fa4c6589a9156a189e9a5dc04d8e5abdb95d09edd7bab2d5e`.
Chat/servicio/repositorios reales con modelo y Oracle controlados; sin nuevas
consultas Oracle, Bedrock o proveedor. Las 82 pruebas de `3d31d63` y los 260
controles de `43d7292` se mantienen como evidencia previa, no cubren el P2 ni se
repitieron. Reservas conservadas; PR #44 en borrador hasta revisión de la
corrección. Sin merge, despliegue o cambios de datos/permisos/expiraciones.

### Comparaciones mensuales autónomas y seguimiento explícito

| Caso | Resultado y evidencia nueva | Límite |
| --- | --- | --- |
| «Compara las ventas mensuales del rubro ropa femenina de 2022 con las de 2023» | Resuelve el catálogo autorizado y ejecuta ambos años completos por mes con importe y facturas. Oracle independiente confirma una coincidencia exacta, RESOLVED. Alcance por nombres asociados a IDs efectivos. | Ambigüedad, rubro no encontrado y rubro resuelto sin filas tienen regresiones sintéticas; no fueron los estados observados del rubro real. |
| Misma comparación sin local ni rubro | Todos los locales y rubros, sin pedir filtro adicional ni heredar los anteriores, también tras recorte. Argumentos, SQL, estado y presentación conciliados con Oracle. | Intención anclada a las frases documentadas y gramática anual existente; no exhaustividad lingüística. |
| «Compara ese mismo rubro con 2022» | Conserva filtros, ventana de meses y preferencia de métricas; agrupa por mes. Regresiones con local/rubro/tipo de día y métrica única antes/después del recorte. | Los dos perfiles Oracle del seguimiento parten del rubro resuelto sin local; conservación de local/tipo de día/métrica única verificada sintéticamente. |
| Mes sin registros frente a cero | Ausencia de filas se muestra como «Sin registros», nunca cero ni comparación inventada. | Ausencia observada con Oracle; valor cero real solo en fixtures sintéticos de esta entrega. |
| Modelo real y ruta del producto | Dos sondas Bedrock iniciales sin stubs: búsqueda del rubro y consulta general. Rutas literales deterministas verificadas contra Oracle independiente. | No se presenta como conversación HTTP ni como ciclo completo remoto de ambas consultas anuales. |

**44/44 pruebas afectadas Node 22.23.4 en `4a8ead7`**, incluidas 16 regresiones
nuevas; **227/227 aserciones DEV en `0d1f799`**, con 288 archivos verificados,
cierres/logout y logs sanitizados aprobados. `d11d0bd` y `0d1f799` solo corrigen el
 ejecutor; aplicación y pruebas idénticas al commit probado. Reporte SHA-256
`f95d4948ed0db574a2420b44123cf8ab3e7cf61eb22eb59d6d154946bf1dcb9e`.
El primer wrapper `d11d0bd` descartó el reporte por nombre de suite y no acredita
resultados; solo se conserva su logout. Detalles y hashes en
[sales-monthly-comparison-investigation.md](sales-monthly-comparison-investigation.md).

La evidencia de PR #44 sigue siendo previa y no se presenta como cobertura de
esta corrección. Las seis reservas F3/F4/M7, F5/T1, las muestras pendientes y los
límites del balance se conservan. Docker DEV sigue en `7d29892`, sin reconstruir
ni sustituir `/app`; PR en borrador, sin merge, despliegue o cambios de datos,
permisos o expiraciones. Los commits posteriores a `0d1f799` de esta entrega son
documentales.

### Facturas: diagnóstico de PR #46 y matrícula completa normalizada

| Caso | Evidencia vigente | Reserva/límite |
| --- | --- | --- |
| Espacios y guiones | Se conservan como diferencias de presentación según el ERP; igualdad completa normalizada en count/detail y binds. Oracle probó el predicado real con variantes equivalentes y casos de prefijo/sufijo/comodín. | No fuzzy, búsqueda parcial ni separación inventada de varias matrículas. La cohorte comercial no presentó una colisión por substring; los casos adversos son de solo lectura en `DUAL`. |
| Filtros, sesiones y paginación | Dos páginas de factura conciliadas con Oracle, mismos filtros y permisos por `sessionId`/proxy. Respuesta y `actions.invoicePagination` conservadas. | Modelo controlado; no se presenta como conversación con modelo remoto. |
| `PDF` → `/:cdc` | Parámetro igual al `PDF` autorizado, sin extensión en ambas muestras; el ERP añade una sola `.pdf`. Variable coincidente entre `.env`/bot/ERP y montaje de ruta verificado. | No se cambió URL base ni el valor Oracle para obtener un positivo. |
| Archivo ausente | Muestra reconstruida: 404 con «Archivo no encontrado», ruta reconocida; archivo también ausente en auditoría local. | No se retuvo identidad del archivo histórico: no atribuir el CDC reconstruido al intento antiguo. El destino configurado es remoto; auditoría local y HTTP remoto se distinguen. |
| Muestra legítima disponible | Misma base, fila Oracle autorizada y archivo existente; **HTTP 200, application/pdf y firma %PDF-**, con «Ver PDF» conciliado en HTTP conversacional. | Una muestra; no acredita todos los documentos ni resuelve el archivo ausente. Dos GETs efectuados, sin fabricar/copiar archivos. |

**15/15 pruebas afectadas Node 22.23.4 en `cfb5f50`** y **40/40 controles nuevos
Oracle/HTTP en `a7112a6`**, con 298 archivos verificados. Aplicación y pruebas
idénticas entre ambos; `c52a77e` solo delega ejecutores antiguos al diagnóstico
actual y pasó preflight sin repetir controles. Reporte SHA-256
`1a4045afba9a36d9dff26ac725e0dc1de44f8dbcf5f77a38add002f2638fdeff`.
Cierres, logout y logs sanitizados aprobados; cero Bedrock/proveedor. Referencias
ERP y cobertura por commit en
[invoice-plate-pdf-investigation.md](invoice-plate-pdf-investigation.md).

La evidencia 13/13, 23/24 y 17/18 de la versión previa se conserva como histórica;
no cubre el nuevo predicado ni se suma como cobertura única. El positivo descarga
una muestra real y mantiene la reserva del archivo ausente. Las seis reservas
F3/F4/M7, F5/T1, muestras pendientes y demás límites del balance se conservan.
PR #46 en borrador hasta revisar el diagnóstico; sin merge, despliegue o cambios
de datos, configuración, permisos o expiraciones.

### Facturas: concepto y cliente/local explícitos

| Caso | Evidencia | Límite |
| --- | --- | --- |
| «facturas de arrendamiento mínimo del 2023 del local impacto» | Concepto y cliente en resolvers separados, período 01/01/2023–31/12/2023 y ambos IDs efectivos en get_invoices. | Gramática acotada, sin IDs/nombres hardcodeados ni evaluación lingüística remota exhaustiva. |
| Tildes, ambigüedad y selección | 13 regresiones nuevas: descripción sin sensibilidad a tildes, código literal preservado, NOT_FOUND por dominio, selección válida/incorrecta y recorte del historial. | No se atribuyen las ambigüedades sintéticas a la muestra real, que fue RESOLVED en ambos dominios. |
| Oracle autorizado | **15/15 en 5816a8b**, mediante chatService, buscadores, servicios y repositorios. Facturas 2023 y detalle conciliados; cierres/logout aprobados. | **No incluye router/controller HTTP.** Modelo controlado que rechaza llamadas, cero Bedrock/proveedor. |
| Pregunta literal completa por HTTP | **Un POST, HTTP 200, 17/17 aserciones sobre e60df5d**. Router/controller/chat/resolvers/repositorios reales del candidato y Oracle independiente; argumentos finales, filas, paginación y enlaces PDF conciliados. | SDK controlado no invocado; no modelo real. HTTP loopback aislado, no DEV desplegado. Cero descargas PDF; 28/15 controles reutilizados sin repetir. |

**28/28 pruebas afectadas Node 22.23.4 sobre `5816a8b`**; resultado Oracle previo
congelado SHA-256 `b536329c7945f41ecc49e4447f0c73c79403565b390654af6553d33f4a9b77d2`.
No se suman pruebas y aserciones como cobertura única. Alcances y futura evidencia
HTTP en [invoice-named-request-investigation.md](invoice-named-request-investigation.md).
Permisos por sesión, paginación y enlaces PDF conservados. Reservas históricas
(incluido el archivo ausente con 404 y su muestra positiva separada) sin cambios.
PR en borrador; sin merge, despliegue ni cambios de datos/configuración/permisos/
expiraciones.

El único caso HTTP se completó en `e60df5d`: **HTTP 200, 17/17 aserciones**,
304 archivos verificados y reporte SHA-256
`94276b1d04100c5085dc843b0bc5ccea66db8f060d2642d0141164863f871287`.
Se verificaron los IDs de cliente/concepto y 2023 en argumentos/binds reales,
filas, conteos, respuesta, paginación, enlaces PDF y metadatos persistentes.
Conexiones, servidor efímero, logout y logs sanitizados aprobados. SDK controlado
no invocado: cero Bedrock/modelo real/proveedor; no se acredita lenguaje libre
remoto. El candidato sigue sin desplegarse; los cambios posteriores a `e60df5d`
solo documentan resultados. PR #47 en borrador con las reservas conservadas.


### Facturas: mensaje de autorizacion USER_CAN_CONSULT

| Caso | Evidencia | Limite |
| --- | --- | --- |
| Denegacion total y cliente restringido | 38/38 pruebas enfocadas Node 22 sobre 6b85edd, incluidos flujos de servicio/chat y HTTP sinteticos; sin datos/enlaces y mensaje de permisos. | No hubo muestra Oracle real en los alcances cliente/concepto/dia explorados; no se acredita este positivo real. |
| Solo permitidos | Detalle y resumen HTTP 200; filas, conteos, paginacion, enlaces y totales por moneda conciliados con SELECT independientes. | Primera pagina autorizada; no todas las paginas. |
| Mixto | Cobertura sintetica de aviso parcial, conteos/paginacion permitidos y enlaces autorizados. | No hubo anio con ambas clases en la busqueda DEV; pendiente Oracle real, incluida segunda pagina mixta. |
| Ausencia real | HTTP 200 vacio, SELECT confirma ausencia de ambas clases y no se muestra denegacion. | No equivale a denegacion; filtro sin datos, sin crear registros. |

**ea812b4: 25/25 aserciones, 3 POST HTTP**, aplicacion y pruebas identicas a **6b85edd**. Las 38 pruebas se reutilizaron por hash, sin repetir. Candidato aislado, sesion/proxy Oracle reales; **4 invocaciones SDK controladas, cero modelo real/Bedrock/proveedor y cero descargas PDF**. Cierres, logout y logs sanitizados aprobados. Reporte SHA-256 9605fcaa58da48138d39c318988488ed97633cdbea93f3ec5f93b4ae478a7097; alcance y muestras faltantes en [invoice-access-authorization.md](invoice-access-authorization.md). PR #48 en borrador, DEV sin cambios, reservas previas conservadas. No se suman aserciones y pruebas como cobertura unica; no se modificaron datos, configuracion, permisos o expiraciones.


### Facturas: consulta autonoma por matricula despues de otro alcance

| Caso | Evidencia | Limite |
| --- | --- | --- |
| Consulta autonoma por matricula | 73e1eef: 56/56 pruebas enfocadas y 6/6 de seleccion; 7d05971: Oracle/HTTP tras recorte confirma solo matricula/detalle/pagina, sin cliente, concepto o fechas heredados. | La matricula solicitada resulto ABSENT para esta sesion; no se acredita un positivo real. |
| Seguimiento explicito «filtra tambien» | Conserva cliente/concepto efectivos y 2023 tras recorte; estado y SELECT independientes coinciden. | Resultado real ABSENT dentro del alcance anterior, no permiso denegado. |
| Denegacion al resolver cliente | 5f94216: 20/20 controles afectados, cuatro regresiones HTTP nuevas antes/despues del recorte. No permite que el seguimiento consulte otros clientes sin resolver el anterior. | No hubo muestra inicialmente denegada en esta sesion; esta rama sigue con cobertura sintetica. |
| Denegacion al consultar facturas; nueva matricula permitida/restringida/ausente | Cobertura sintetica inicial, chat y HTTP, ambas intenciones y recorte. | Consulta inicial real AUTHORIZED; no se presenta como Oracle real denegacion seguida de matricula. |

**7d05971: 48/48 comprobaciones en cuatro POST HTTP 200**, aplicacion/pruebas identicas a 5f94216. Las 56/6 pruebas de 73e1eef se reutilizan para partes no modificadas; 20 controles cubren el ajuste adicional. SDK controlado no invocado: cero Bedrock/modelo real/proveedor y descargas PDF. Cierres, logout y logs sanitizados aprobados. Reporte SHA-256 5ce138983586a094e2f013308ab1d9c246b3eb3cab0e73d500fe99633708ff3f; 315 archivos, manifiesto 16d0fc86dfb5515563e68f89fabdbef1752a9a7fa352f946c82cb6b971824fde. [Alcance y muestras faltantes](invoice-plate-query-scope.md). PR #49 en borrador, DEV sin cambios. Reservas restringidas/mixtas/segunda pagina mixta y positivo PDF/404 separados conservadas. Sin merge, despliegue o cambios de datos, configuracion, permisos o expiraciones.


### Reapertura con usuario afectado sobre 22f4b02

| Evidencia real | Resultado | Reserva |
| --- | --- | --- |
| Codigo de 5400 | 319 archivos y diez modulos realmente cargados coinciden con 22f4b02. | No se sustituye por candidato ni por modelo controlado. |
| Denegacion inicial de cliente/concepto/2023 | Reproducida al resolver cliente: N recibido y ACCESS_DENIED, sin cliente confirmado. | Esta evidencia acredita la denegacion real para ese login; no cambia retroactivamente controles de cuentas autorizadas. |
| Matricula autonoma despues de denegacion | Argumentos y SQL reales sin cliente, concepto o periodo; autorizacion conservada, conteo cero y flag restringido falso. | No se demuestra la incorreccion reportada. |
| Oracle independiente y conversacion nueva | ABSENT para la misma identidad; respuesta coincide. | ANX123 literal, no positiva. Pendiente auditoria Unicode/proyeccion de vista; no hay correccion demostrada. |

Ejecutor caed886, tres preguntas HTTP reales y dos resets de conversacion propia; no SDK controlado, cero eventos Bedrock, conexiones/driver/inspector/logout cerrados y logs sanitizados. Reporte SHA-256 d97cb76388f15c9fd0162c4775ebed16a41adf56eca85b288bcbdd6cf4e60065. [Investigacion abierta](invoice-affected-user-investigation.md). PR #50 en borrador, sin merge, despliegue o cambios de datos/permisos/expiraciones. Reservas de facturas restringidas por esa matricula, mixtos, segunda pagina mixta y PDF positivo/404 separados conservadas.

### Proyeccion Oracle del usuario afectado: b014b94

| Caso | Evidencia | Limite |
| --- | --- | --- |
| Permiso de la vista | Expresion combina columna y USER; misma identidad con filas permitidas y N. | No es una denegacion global uniforme; no atribuir N a cualquier vacio. |
| MATRICULA | TRIM/UPPER y funciones anidadas, sin condicion explicita de permiso en la proyeccion. | Cuerpos de funciones, predicados y politicas no inspeccionados; ocultacion no descartada. |
| ANX123 tras denegacion y aislada | Se reutilizan HTTP caed886 y Unicode b96353a: ausencia de coincidencias visibles autorizadas/restringidas; sin filtros anteriores. | No demuestra ausencia global ni matricula oculta. Caso abierto. |

Aplicacion 22f4b02 reverificada tras reinicio de Docker, sin despliegue. Control actual solo Oracle/metadatos: cero HTTP repetido, cierres/logout/logs aprobados, cero Bedrock/PDF. Reporte SHA-256 1da5be7a957d9cd91379cc5c119f333e1c766f1176a9b7818c547155a2d35d18. [Diagnostico y consulta administrativa pendiente](invoice-affected-user-investigation.md). PR #50 en borrador, sin correccion especulativa.

### Dependencias y predicados: 948332d

| Caso | Evidencia accesible | Limite |
| --- | --- | --- |
| Funciones de MATRICULA | LOWER/REPLACE/UPPER/TRIM sobre columna; sin condicion de permiso ni funcion propia en esa expresion. | No prueba que la columna fuente tenga valor para ANX123. |
| Relaciones de la vista | Diez dependencias TABLE; varios INNER JOIN con igualdad. Pueden excluir filas sin relacion requerida antes de su clasificacion observable. | No demuestra que ANX123 exista ni que un join la excluya. |
| Politicas/dependencias no visibles | ALL_POLICIES sin filas en vista y diez tablas; consultas completadas sin errores/cortes. | Completitud ALL_* no certificada. Usuario confirma falta de acceso administrativo: inventario DBA_* preparado pero no ejecutado. Bloqueo vigente. |
| Secuencia y matricula aislada | HTTP caed886 y Unicode b96353a reutilizados sin repetirlos. | Cero coincidencias visibles no equivale a denegacion ni ausencia global. Caso abierto. |

Reporte SHA-256 c378792808e660ad20c02a68d8b6bda422bb330d97cd8275fdb141a15d260351. Cero POST/resets/filas de tablas base/funciones ejecutadas; conexiones, inspector, logout y logs sanitizados aprobados. Aplicacion 22f4b02 sin cambios. [Diagnostico y bloqueo](invoice-affected-user-investigation.md). PR #50 en borrador; reservas anteriores conservadas.

### Estado vigente PR #50: autorizacion por fila (12 de noviembre de 2026)

Reemplaza el bloqueo administrativo como orientacion del trabajo; las inspecciones anteriores son evidencia historica. Se conserva `NVL(USER_CAN_CONSULT, 'S') <> 'N'` para recuperar datos y se comparte una lista explicita de filtros normalizados con el sondeo independiente `EXISTS` de filas N, que devuelve solo un bit. El sondeo ya existia en 22f4b02; no se atribuye a este refactor una correccion demostrada de ANX123.

| Caso | Evidencia actual | Limite |
| --- | --- | --- |
| Solo restringidas / mixtas / ausentes | 71/71 pruebas enfocadas con Node 22.23.4; mensaje exacto, aviso parcial, filtros completos y binds identicos en detalle/resumen. | Oracle simulado; no acredita muestras restringidas reales. |
| Denegacion inicial → matricula autonoma | Regresion chat/HTTP, con/sin recorte, ahora tambien mixta; conteos y PDF solo autorizado. | Flujo determinista, sin modelo real ni descargas PDF. |
| Usuario afectado en Oracle/HTTP | Contraste con caed886 historico: inicial denegada, matricula autonoma sin alcance heredado y misma ausencia en secuencia/nueva conversacion conciliada con Oracle. | No reprodujo N para ANX123. No es una ejecucion del candidato nuevo. |
| Contraste nuevo be559ef con usuario afectado | Login protegido, identidad PostgreSQL/Oracle proxy coincidente; 28/28 comprobaciones en dos POST HTTP reales aislados. Impacto denegado en resolver; ANX123 ausente, sin filtros heredados, conciliado con conteo autorizado/EXISTS restringido independientes. Sondeo minimo SQL verificado. | Sin SDK/modelo invocado; no prueba el listener desplegado. No se observaron facturas restringidas/mixtas para ANX123; caso original pendiente. No se repitieron las 71 pruebas. |

Reporte [be559ef sanitizado](invoice-candidate-affected-be559ef.json), SHA-256 `625691ea1139638b24b205bab1272455aa2a4148d3e81fc7d4d51a9140b2d636`. Conexiones/driver/servidor temporal cerrados o restaurados, conversacion propia limpiada, logout aprobado; logs chatbot sin lineas nuevas y ERP solo dos metadatos de autenticacion. Contenedor habitual sin cambios de imagen/arranque; cero modelo/proveedor/PDF/inspector. La denegacion inicial real no alcanzo get_invoices: su rama de solo restringidas y la mixta siguen sin positivo Oracle real en este control.

[Detalle vigente y reservas](invoice-affected-user-investigation.md). PR en borrador. Sin nuevas inspecciones administrativas, merge, despliegue ni cambios de datos/permisos/expiraciones. Positivos Oracle restringidos/mixtos, segunda pagina mixta y PDF positivo/404 separados siguen pendientes.

### Revision final del preflight: 8535403

Se corrige el rechazo de los ejecutores introducidos en 6c395d9. Aplicacion/pruebas/configuracion y scripts no enumerados siguen fijados a be559ef; seis ejecutores/dependencias concretos y su prueba local se cotejan con el commit candidato HEAD que los contiene. Se comprueban commits, indice y copia de trabajo; no se excluye scripts/ en bloque. 17/17 pruebas locales Git aprobadas, incluidos cambios funcionales y ejecutores alterados; el preflight de fuentes de 8535403 pasa sin servicios externos. Revision del diff sin hallazgos pendientes dentro de ese alcance, preparada para marcar la PR lista para revision. Aplicacion, worker y evidencia Oracle/HTTP anteriores intactos; no se repiten las 71 pruebas ni los controles reales. **ANX123 y muestra mixta Oracle siguen pendientes**; lista para revision no significa caso original corregido. Sin merge ni despliegue.

### Estado vigente: PR #50 fusionada y desplegada en DEV, f2c2b2f

Merge autorizado f2c2b2fecf417dbbafd981e256c52520dba0b35b; rama local actualizada por avance rapido, solo chatbot Docker DEV reconstruido/recreado. 334 archivos y diez modulos cargados coinciden con el merge, Node 22.23.5; PM2 online/cero reinicios, arranque sin errores y salud 200 antes/despues. Los estados previos de borrador/lista para revision son historicos.

Dos POST reales en 5400 con login protegido del mismo usuario afectado; 17 comprobaciones del control desplegado aprobadas, sin suites completas ni repeticion de las pruebas previas. Impacto denegado en el resolver sin datos/enlaces/acciones, existencia restringida positiva y autorizada negativa en Oracle independiente con su alcance fuerte/2023. ANX123 autonomo solo plate/mode/page/rows; Oracle confirma ausencia autorizada/restringida, SQL y estado sin filtros heredados, conteos/pagina vacios conciliados, sin PDF. **Discrepancia original ANX123 y muestra mixta Oracle conservadas como pendientes; no se declara corregido el caso original.**

Traza temporal por identidad y bloqueo preventivo de Bedrock retirados/restaurados; cero intentos de proveedor y eventos Bedrock. Cierres: 3/3 conexiones trazadas y 4/4 independientes, pool del worker e inspector propio; conversacion propia limpiada y logout aprobado. Logs sanitizados aprobados, cero registros desconocidos. Sin cambios de datos de negocio, permisos o expiraciones. [Reporte desplegado](invoice-pr50-dev-live-f2c2b2f.json), SHA-256 `f5abf6e8021b99079d33da2769f96929e57a51ae1ef4c58db6470b244936bfed`; [detalle vigente](invoice-affected-user-investigation.md).

### Candidato de deudas de facturas — borrador, sin desplegar

Contrato actualizado por el usuario y confirmado en Oracle DEV: `COD_MONEDA VARCHAR2`, `DEUDA NUMBER(18,2)` reemplaza SALDO; diez columnas, sin USER_CAN_CONSULT. Perfil ad38d3a; aplicación/SQL/HTTP contrastados en **11a4316**. Código posterior de aplicación idéntico al contrastado. El estado desplegado de PR #50 descrito arriba no se modifica.

| Capacidad | Evidencia vigente | Reserva |
| --- | --- | --- |
| search_invoice_balance_customers | Búsqueda exacta y ausencia, HTTP real aislado, misma vista e identidad proxy; PII del resultado protegida para el SDK. | Ambigüedad/selección protegida en pruebas locales; no se acredita toda variante lingüística por modelo remoto. |
| get_invoice_balances: detalle | Dos páginas completas conciliadas contra SQL independiente; texto decimal exacto, filas/números/clientes contados por separado. | NRO_FACTURA se repite incluso en cliente/sector/COD_MONEDA; granularidad aditiva y clave única pendientes. |
| Signo DEUDA | Positivo, cero, negativo y nulo con muestras reales, sin convertir nulo a cero. | Cero no prueba pago y negativo no prueba crédito; definición contable pendiente. |
| Vencimientos/antigüedad | DD/MM/YYYY consistente en todos los valores observados; vencidos, futuros y atraso 30 días conciliados con cálculo independiente. Fecha Asuncion 12/11/2026. | Hoy/próximos siete días/undated sin positivo. Nulos, inválidos y bisiestos solo con SELECT sintético DUAL, sin modificar datos. |
| Identificación de divisa y orden | COD_MONEDA real, filtro nativo y ranking de registros en un único código conciliados. Símbolos no se usan como identidad ni se convierten importes. | No hubo colisión real símbolo→varios códigos; caso sintético local conserva ambas divisas sin colapsar. No es ranking de facturas/clientes. |
| Totales y rankings agregados | Bloqueados explícitamente, sin SUM(DEUDA) o agrupación por símbolo, hasta acreditar aditividad/clave de factura. | No se certifican ni sustituyen por cálculo del modelo o suma de páginas. |
| PII y respuesta final | Entrada, resultados del SDK controlado e historial protegidos; respuesta final mantiene identidades autorizadas. Logs sin payloads. | No es prueba de interpretación de un modelo real. |
| sessionId y denegación | PostgreSQL/USER/SESSION_USER/proxy coinciden; username frontend ignorado; sesión inexistente rechazada; ORA-01031 inyectado sin datos/acciones. | No hay identidad realmente denegada sobre la vista; esa denegación es cobertura sintética sobre conexión real. |

**104 aserciones Oracle/HTTP aprobadas** en control aislado, cuatro POST, tres llamadas SDK controladas y cero proveedor/PDF. **23/23 pruebas locales enfocadas** con Node 22.23.5; no se suman a las aserciones reales ni se repiten suites completas. Cierre 5/5 conexiones, driver restaurado, pool y servidor temporal cerrados, conversación propia limpiada, logout aprobado, logs sanitizados e imagen/arranque habitual sin cambios.

[Perfil vigente](invoice-balances-oracle-profile-ad38d3a.json) · [Evidencia vigente](invoice-balances-oracle-http-11a4316.json), SHA-256 `9fe4733b6b1bec61e937e927eaed4a9114213a26f21285bf6d4e841de049db85` · [Contrato, reservas e historia](invoice-balances-tools.md). Los reportes SALDO anteriores permanecen como historia y no certifican el esquema nuevo. PR en borrador; sin merge, despliegue o cambios de datos de negocio, permisos o expiraciones. ANX123 y muestra mixta de PR #50 conservadas como pendientes independientes.


### Candidato: pendientes globales → detalle USD, sin desplegar

Base 8e14c4d (PR #54 fusionada); rama separada `fix/global-pending-usd-detail`. Código inicial 50293c2, ajuste decimal 37ef45f y código final 6a7df59. Los estados anteriores se conservan como historia; este candidato no modifica el proceso habitual 5400. [Contrato, trazabilidad y reservas](global-pending-usd.md).

| Capacidad | Evidencia del candidato | Reserva |
| --- | --- | --- |
| Detalle global | Contrato ya admitía customerIds vacío/omitido; servicio/repo sin cliente obligatorio. Tres páginas HTTP/Oracle independiente en 37ef45f, sin consultas por cliente. | Todos los clientes significa todos los visibles para esa identidad Oracle. No se acredita una clave única nueva. |
| Resumen actual por moneda | Pregunta literal con pending/global/summary, sin vencimiento hasta hoy ni saldo histórico. OK_SUMMARY real. 6a7df59 añade solo etiquetas del catálogo autorizado; 18 controles diferenciales confirman USD/Gs. sin cambiar códigos, importes o grupos. | Los bloqueos INCONSISTENT_HISTORY permanecen; duplicados/ausencias de este candidato se prueban con entradas sintéticas, no se provocan en Oracle. |
| Seguimiento dólares | Código nativo resuelto de la vista visible, nunca por convención numérica ni $ aislado; []/pending/detail, página reiniciada y sin filtros de vencimiento heredados. | Un catálogo ambiguo/incompleto o sin identificación inequívoca no permite inventar USD ni afirmar ausencia de deuda. |
| Paginación/recorte | Página 2 antes y 3 después de recorte real; IDs, deuda positiva, código, conteo, orden y celda decimal conciliados independientemente. | Tres páginas, no todo el resultado. Cursor y nombres de moneda son metadatos por sesión, sin filas ni conexiones. |
| Exactitud/PII/salida | Fracciones Oracle sin entero (.01) y cifras grandes conservadas sin Number/≈/₮. Nombres e identificadores protegidos; filas y acciones conservadas. Razonamiento estructurado/etiquetado excluido de response. | Filtro de razonamiento probado con SDK controlado; no certifica detectar prosa interna sin marcas ni interpretación de un modelo real. |
| Identidad, cierre y despliegue | sessionId → PostgreSQL → USER/PROXY_USER coincidentes. 6/6 cierres en control principal y 2/2 en diferencial; logout/logs/expiración aprobados, sin cambio de imagen/arranque. | Principal: logout al segundo intento; diferencial: al primero. No se conserva la causa individual del primer intento del principal. |

50293c2: **227/227** pruebas Node 22.23.5. Su primer control Oracle falló en la representación decimal y se conserva expresamente como fallido. 37ef45f: **91/91** pruebas afectadas y **192 comprobaciones HTTP/Oracle independientes** aprobadas, cuatro POST, sin resultados/cursor sembrados. 6a7df59: **92/92** pruebas afectadas y **18 comprobaciones nuevas solo del resumen**, un POST adicional; no se repitió el detalle ya aprobado. Ejecuciones superpuestas, no casos únicos sumados. [Reportes por commit](global-pending-usd.md#pruebas-por-commit).

La secuencia real fue determinista: cero invocaciones de modelo/SDK controlado/proveedor. Las regresiones de razonamiento y errores usan entradas controladas y se distinguen de Oracle real. Reservas históricas y fallos globales de c6fcb4b separados (35 Node 22, 17 por falta de git; 18 Windows/Node 24 fuera de rango). No se repitieron suites completas ni se declara verde el estado global. PR en borrador; sin merge, despliegue o cambios de datos de negocio, permisos o expiraciones.


### Correcciones de revisión P2: alcance global y salida truncada, 0234b0d

Estado vigente del candidato de PR #55, todavía en borrador. Código **0234b0d071f111309ab74e9a8b87d1bcfec892e8**: **128/128 pruebas afectadas**, Node 22.23.5, desde git archive limpio; [reporte](global-usd-p2-tests-0234b0d.json). Solo guard de contexto y saneamiento de salida modificados; el commit posterior añade documentación/evidencia.

| Corrección | Cobertura nueva/diferencial | Reserva conservada |
| --- | --- | --- |
| Cliente antiguo no reduce alcance global | Historial protegido con resolución anterior; resumen global → USD → página 2 antes y página 3 después del recorte. Argumentos finales y estado conservan []/pending/código autorizado. Una variante recorta antes del detalle. | Cobertura HTTP con Oracle sintético, sin nueva sesión ni conciliación Oracle. |
| Omitido no equivale a todos seleccionados | Guard mantiene la resolución anterior cuando customerIds está ausente; solo [] confirmado prevalece frente a IDs reconstruidos o propuestos sin cambio validado. | La normalización de backend no se usa para inventar una selección global del usuario. |
| Cambio posterior a un cliente | Búsqueda validada puede sustituir []; consulta posterior confirma nuevo cliente y la paginación tras recorte lo conserva. La búsqueda sola no sobrescribe la consulta válida. | Sin cambios de consultas, permisos, PII o datos. |
| Razonamiento incompleto | HTTP con aperturas sin >, bloques sin cierre, cierres huérfanos, delimitadores de rol y prefijos partidos devuelve el mensaje seguro, sin texto dudoso, consultas, acciones de éxito o cambios del contexto válido. Bloques completos/nidados conservan solo texto público. | SDK controlado; no se induce razonamiento en un modelo real ni se certifica detectar prosa sin marcas. |

Los dos P2 se reproducían en 8a150e8 y no quedan acreditados por los controles anteriores. Esta ejecución conserva la distinción: 50293c2/227 pruebas precede al arreglo decimal y su control Oracle falló; 37ef45f/91 pruebas +192 controles Oracle es posterior al arreglo; 6a7df59/92 pruebas +18 controles valida etiquetas del resumen. 0234b0d conserva ese formateador y SQL exactamente: evidencia aplicable a partes intactas, no una ejecución Oracle nueva del SHA P2. Las ejecuciones se superponen y no se suman como casos únicos.

Reservas, ausencia/denegación/errores sintéticos y fallos globales históricos conservados y separados. Sin repetir Oracle ni suites completas, merge, despliegue o cambios de datos de negocio, permisos o expiraciones. [Detalle de las correcciones y trazabilidad](global-pending-usd.md#corrección-de-los-dos-p2-de-revisión).
