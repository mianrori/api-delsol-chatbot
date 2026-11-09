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

**64/64 pruebas enfocadas aprobadas localmente en Node 24.21.0**:
`salesAutonomousCategory`, `salesCategoryIntentChat`, `salesLocalRemoval`, `librarySalesContext`,
`searchResolutionState`, `searchFilterLifecycle`, `searchSelection`,
`searchResolutionStateHttp`, `searchFilterLifecycleHttp`.
No se ejecutó la suite completa.

El ejecutor `scripts/run-sales-category-intent-dev.ps1` reutiliza el transporte
de login DEV protegido existente, ahora versionado como
`scripts/dev-protected-login.mjs`. Verifica development, guard de logs ERP,
identidad de fuentes entre ambos servicios, copia del commit limpio aislada en
`/tmp`, hashes de código y Node 22. Solo ejecuta las pruebas afectadas y las
herramientas `search_customers`, `search_categories`, `get_sales`.

Para el contraste real utiliza Bedrock sin dobles, login autorizado mediante
entradas ocultas, identidad proxy derivada de `sessionId` en PostgreSQL,
catálogos y SELECT mensuales independientes. Ejecuta los antecedentes una vez
y restaura su estado e historial en memoria para las cuatro ramas finales.
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

**Contraste real pendiente de ejecución y revisión del reporte sanitizado.**
Los reportes de PR #42 son históricos y no acreditan esta nueva intención.
Se mantienen las reservas anteriores de la matriz, sin merge ni despliegue.
