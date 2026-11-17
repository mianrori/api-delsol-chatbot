# Consulta autónoma de rubro frente a seguimiento aditivo

Base `92c1ff0` (PR #42 integrada); rama `fix/sales-autonomous-category-intent`.

Secuencia solicitada:

1. «¿Cuánto vendieron los locales de enero a mayo de 2023, por mes?»
2. «Ventas de Nike de enero a abril de 2023».
3. «Ventas del rubro librería durante 2023, por mes».

El diagnóstico anterior acreditó que el guard imponía el local confirmado
aunque el modelo lo omitiera. La corrección de presentación de PR #42 hacía
visible esa intersección, pero no distinguía esta nueva consulta de un
seguimiento. Su regresión usaba erróneamente la tercera pregunta como
seguimiento: ahora usa «Filtra también por librería».

La interpretación explícita de una consulta de ventas con rubro y año propios
inicia un alcance autónomo. Marca el local como retirado, exige resolver el
rubro solicitado y sustituye el contexto de ventas por el período y desglose
del texto. No interpreta omisiones del modelo como órdenes de retirar filtros.
El seguimiento aditivo conserva local, período, desglose y demás filtros.
La regla determinista admite ventas del rubro con año completo (`durante`,
`en`, `para`) y desglose opcional por mes/año/día/local/rubro; otras formas
siguen el intérprete existente. No se afirma cobertura lingüística exhaustiva.

El guard descarta una propuesta contradictoria de local, fechas o tipo de día
en la consulta autónoma. El contexto pendiente también se sanea antes de
persistirlo: una selección posterior del catálogo ambiguo no puede recuperar
el local o tipo de día previos, incluso tras el recorte real del historial.
La selección numérica de ventas conserva el contexto persistido completo,
incluyendo claves ausentes, frente a claves nuevas propuestas por el modelo.

| Intención | Local final | Rubro final | Período final | Desglose | Estado |
| --- | --- | --- | --- | --- | --- |
| Autónoma | Todos | Librería resuelta | Enero–diciembre 2023 | Mes | Local `cleared`, rubro `selected`, contexto nuevo |
| «Filtra también por librería» | Nike confirmado | Librería resuelta | Enero–abril 2023 | Mes heredado | Local y rubro `selected`, contexto compuesto |

`salesAutonomousCategory` ejecuta ambos antecedentes por el ciclo real de
turno/guard/estado, luego cada intención antes/después de `trimConversation`.
Verifica argumentos completos, SQL/binds, estado final e inmutabilidad. Añade
selección ambigua con rubro/tipo de día antiguos y propuestas contradictorias.
Los datos son sintéticos; no se atribuyen a Oracle ni a un modelo real.

**66/66 pruebas enfocadas aprobadas en Node 22.23.4 del DEV aislado**
en `fb913e226ab5bb4ec5b7e19dfa996dd273364c13`, con 271 archivos de código,
pruebas y ejecutores verificados contra Git. SHA-256 de la salida enfocada:
`2a3b24ba7f6971d87eeb0bb2a0533e7b7a0a0f817173cfed93dfba7775787adc`.
Se verificaron:
`salesAutonomousCategory`, `salesCategoryIntentChat`, `salesLocalRemoval`, `librarySalesContext`,
`searchResolutionState`, `searchFilterLifecycle`, `searchSelection`,
`searchResolutionStateHttp`, `searchFilterLifecycleHttp`.
No se ejecutó la suite completa.

El flujo completo `salesCategoryIntentChat` comprueba las dos intenciones y
el estado protegido que recibe el modelo después del recorte. El prompt
incluye únicamente las resoluciones y argumentos protegidos de ventas de
esa sesión, nunca filas de negocio ni identidad Oracle.

Las dos regresiones adicionales cubren la búsqueda de Nike ambigua sin
propuesta de `get_sales`: enero–abril se guarda desde el turno del usuario
antes de la búsqueda. La selección posterior conserva ese período, también
después del recorte. La gramática acotada reconoce `Ventas … de <mes> a <mes>
de <año>` (mismo año, desglose opcional), valida el orden y deriva el último
día del mes en UTC. No depende de fechas supuestas por el modelo ni retira
filtros omitidos.

El ejecutor `scripts/run-sales-category-intent-dev.ps1` reutiliza el transporte
de login DEV protegido existente, ahora versionado como
`scripts/dev-protected-login.mjs`. Verifica development, guard de logs ERP,
identidad de fuentes entre ambos servicios, copia del commit limpio aislada en
`/tmp`, hashes de código y Node 22. Solo ejecuta las pruebas afectadas y las
herramientas `search_customers`, `search_categories`, `get_sales`.

Para el contraste real utiliza Bedrock sin dobles, login autorizado mediante
entradas ocultas, identidad proxy derivada de `sessionId` en PostgreSQL,
catálogos y SELECT mensuales independientes. DEV contiene dos candidatos Nike
legítimos entre cinco opciones del buscador. Se prueban ambos mediante
elecciones numéricas de prueba, interpretadas por el modelo real; no se elige
un local arbitrario. Se restaura el estado/historial de cada selección para
las cuatro ramas finales (dos intenciones, antes/después del recorte).
También se ejecuta la tercera pregunta literal desde Nike pendiente, sin
selección intermedia. No se atribuyen las ocho ramas de local seleccionado
a la secuencia literal sin aclaración de catálogo.
Comprueba argumentos, SQL efectivo, todos los grupos/importes/facturas/monedas,
estado persistente y cierres; el helper hace logout solo de su propia sesión.
No cambia datos de negocio, permisos, expiraciones ni el servicio publicado.

Comandos desde PowerShell en la raíz del proyecto:

```powershell
.\scripts\run-sales-category-intent-dev.ps1 -Preflight
.\scripts\run-sales-category-intent-dev.ps1
```

El segundo pide usuario y contraseña mediante entradas ocultas. No introducir
credenciales en el chat. Reportes ignorados:
`logs/sales-category-intent-preflight.json` y
`logs/sales-category-intent-real.json`. Solo códigos, conteos, hashes y fechas;
sin identidades, sesiones, argumentos, binds, resultados ni respuestas completas.
La auditoría de stdout/stderr de los contenedores usa el intervalo completo
del helper y publica solo conteos y reconocimiento del esquema sanitizado.

**Contraste real aprobado y reporte sanitizado revisado: 92/92 verificaciones**
en `fb913e226ab5bb4ec5b7e19dfa996dd273364c13`, 09/11/2026,
12:20:50–12:23:05 (Asunción), con **23 llamadas reales a Bedrock** y 271
archivos verificados contra Git. Los 92 checks cubren los antecedentes, la
tercera pregunta desde Nike pendiente, las dos selecciones legítimas y ocho
ramas finales; no son 92 conversaciones independientes ni se suman a pruebas
unitarias como cobertura única.

Se verificaron argumentos finales, SQL efectivo/binds y todos los grupos,
importes, facturas y monedas frente a SELECT escritos por separado. La
consulta autónoma usa librería, todos los locales, enero–diciembre de 2023 y
mes; el seguimiento conserva cada Nike y enero–abril/mes. Estado persistente
concordante, recorte real acreditado, identidad proxy por sesión, todas las
conexiones cerradas y logout aprobado. Sin doble de modelo ni proveedor de
conversión. Se usa la vista autorizada vigente; no se vuelve a auditar su
definición interna ni se cambia la regla de ventas auditadas/fallback.

Reporte congelado ignorado `logs/sales-category-intent-real-fb913e2.json`,
SHA-256 `a5d0b2343730820c1572c8c3c45e76ff4827c81a2285bb6af3cadc0a1f285bd8`.
Esquema revisado sin claves sensibles ni UUID de sesión. Logs de stdout/stderr
del intervalo completo: chatbot cero líneas, ERP dos, reconocidas por el
esquema sanitizado. Los reportes de PR #42 son históricos y no acreditan esta
nueva intención; se conservan con sus límites y las reservas de la matriz.

Primer intento DEV en `4b3d2f1`, 09/11/2026, 12:00:51–12:01:55 (Asunción):
login, identidad proxy, cierres y logout aprobados; el control se detuvo en la
precondición de catálogo literal. **Cero llamadas al modelo**, sin evidencia
nueva sobre la intención. Logs del intervalo completo: chatbot cero líneas,
ERP dos, ambas reconocidas por el esquema sanitizado. Reporte congelado
ignorado `sales-category-intent-catalog-precondition-4b3d2f1.json`, SHA-256
`174411e4cfad47edb68a1526618792ee06144e2a65e36890e8b9f60973ea9214`.
Segundo intento en `09bdf8a`, 12:05:51–12:06:58: cero llamadas al modelo;
una librería exacta y dos candidatos Nike sin exacto. Se preserva el reporte
`sales-category-intent-catalog-ambiguity-09bdf8a.json`, SHA-256
`606262392e42bd42d29895abe2f50d883095160bf6d4b73cb83bfc289b324843`.
No acredita intención. Ambos intentos cerraron sus conexiones y su sesión.

Control parcial en `579da69`, 12:13:55–12:15:19: seis llamadas reales, la
tercera pregunta literal y su conciliación Oracle aprobaron, pero el control
global falló al repetir la pregunta Nike después de una selección aplicada
por el helper sin pasar el mensaje numérico al chat. No acredita los perfiles
de Nike seleccionado ni la corrección posterior del período pendiente.
Reporte `sales-category-intent-partial-579da69.json`, SHA-256
`f8c19fcdc89cb8a91ce0fb3e8cbe61d775883c6fbfe5d98201eba16e0c3163ad`.
La ejecución final pasa las selecciones numéricas por el modelo real y verifica
su período. Los tres intentos previos no se cuentan como aprobados globales ni
se sustituyen por el resultado final; sus cierres/logout/logs aprobaron.

PR [#43](https://github.com/mianrori/api-delsol-chatbot/pull/43) en borrador.
