# Variantes finales: F1/F2/F3/F4/M7

Base: `84fd67c` desplegada. Rama: `test/backend-final-variants-dev`.
Solo se completan ramas sin evidencia suficiente; no se consulta al proveedor,
no se despliega y no se cambian datos, permisos ni expiraciones.

## Revisión previa de la evidencia

Los logs locales históricos contienen aprobaciones controladas de referencia
cero/ausencia y monedas distintas de campañas, presentación de compras con
monedas separadas y chapa con varios socios. Se verificaron los títulos y el
resumen del ejecutor, no solamente la existencia de los archivos de test:

| Reporte local ignorado | Resultado histórico | SHA-256 de los bytes del log |
| --- | --- | --- |
| `contract-incidence-unit-tests.txt` | 263/263, sin fallos ni omitidos | `6455b4101cb704220be9c1708559b0e2f4cd653cb6aaf55c4a4a79655f5e56b5` |
| `promotion-purchases-unit-tests.txt` | 277/277, sin fallos ni omitidos | `40ccdbfcbcd2e8daebd49011865f3565a6b51a9b92bb294a1a91ba93022b2397` |

Estos hashes identifican **los logs, no el código ejecutado**. Los logs no
incluyen un SHA de código y los manifiestos revisados no enlazan sus bytes de
forma suficiente. No se reconstruye ese vínculo por fecha o proximidad a otro
reporte. M7 conserva esa reserva; no se repite el control aprobado para crear
artificialmente una atribución histórica.

F4 tiene evidencia T `d529cfd` de dos socios y SQL por moneda. La presentación
controlada anterior no acredita por sí sola el repositorio multimoneda de
compras individuales; tampoco hereda CTE de promociones o segmentación.

## Hallazgos y correcciones candidatas

1. **F3:** la consulta de campaña agregaba importes antes de adjuntar
   `MAX(moneda)`. Ahora agrupa por la pareja exacta descripción/abreviatura en
   cada período. Conserva cada importe; si hay varios grupos, total/promedio
   monetario y comparaciones quedan sin calcular con motivo. No hay FX.
   `sourceRows` distingue falta de filas de filas que suman cero; la cantidad
   de facturas sigue siendo la suma de la métrica de la vista, **no** un
   `COUNT(DISTINCT factura)` ni una suma de distintos entre grupos.
2. **F4:** dos descripciones que compartían `$` se distinguían en el DTO pero
   podían aparecer con la misma etiqueta. La presentación conserva la
   descripción junto al símbolo; no infiere USD ni convierte importes.

Cuatro regresiones nuevas en `finalVariantGaps`, junto con las pruebas de
campaña y presentación afectadas: **15/15 locales** y **15/15 en Node 22.23.4**
del contenedor DEV, candidato `61c5c9fa9066f31010cb757fef2129abb95b2314`.
Preflight completo aprobado: **257 archivos** src/scripts/test/config/packages
del archivo Git coinciden. No hubo sesión, consulta Oracle ni proveedor.
Reporte local ignorado `backend-final-variants-focused.json`; SHA-256 de la
salida de las pruebas:
`c2b62a886ee336b17b20976d5a7e48658ac0bab72a300aff1d5c3d0ebaf111b3`.
El hash de salida identifica esas pruebas, no un reporte Oracle.

## Alcance del contraste independiente

`scripts/final-variant-controls.mjs` no importa SQL ni resolutores de producción.
El ejecutor llama al dispatch real con `sessionId`, conexión proxy y SELECT de
control por separado. No ejecuta HTTP conversacional ni presenta eso como HTTP.

| Rama | Búsqueda/contraste acotado | Reserva si no hay muestra |
| --- | --- | --- |
| F1 RUC y matrícula positivos | Hasta 20 filas autorizadas de facturas; período de un día obtenido de Oracle. SELECT de identidades exactas; resolución o ambigüedad sin elegir la primera. | No encontrada en esas 20 filas; no ausencia global. |
| F1 fuzzy positivo | Hasta seis nombres de esa cohorte, con un error de escritura controlado; primero demostrar cero coincidencias fuertes. Jaro-Winkler Oracle independiente, IDs distintos y orden. | Rama no acreditada si no se obtiene candidato positivo. La errata es controlada; catálogo/identidades son Oracle. |
| F2 fuzzy positivo | Hasta ocho tipos autorizados; errata controlada, cero coincidencias directas y distancia calculada mediante implementación independiente. | No sustituir por alias o coincidencia parcial ya aprobados. |
| F3 excepcionales | Hasta diez campañas reales de hasta 61 días; tres ventanas equivalentes, SELECT por moneda, registros y métrica de facturas. Un perfil afectado por el cambio de repositorio; después solo campañas que aporten ausencia, referencia cero, filas con suma cero o monedas distintas no cubiertas. | Cada variante no encontrada conserva su código de reserva. No prueba ausencia exhaustiva ni sustituye la muestra de incidencia M3. |
| F4 socio multimoneda | Hasta 1.000 filas enero–mayo 2023. Si hay socio con varias parejas monetarias y hasta 100 filas de detalle, resumen y recorrido completo con páginas de hasta tres filas, dentro del límite configurado, contra multiconjunto SQL. | No extender el período ni seleccionar dos socios monomoneda como sustituto. Si excede el presupuesto, queda pendiente. |
| M7 chapa compartida | Hasta 1.000 vehículos activos, placas no vacías sin espacios interiores; si hay dos socios, SELECT completo de esa placa contra todas las inscripciones sin dueño arbitrario. | Muestra no encontrada en esa cohorte; aprobación controlada histórica conserva su límite de SHA. |

El reporte `logs/backend-final-variants.json` contiene únicamente códigos,
booleanos, tiempos, tamaños de búsqueda y SHA. Documentos, nombres, placas,
credenciales, sesiones, importes y resultados de vistas permanecen en memoria.
Cada operación comprueba cierre de conexiones; límite de 60 s por llamada
Oracle y presupuesto de ocho minutos entre operaciones. Un caso reservado no
es un caso aprobado, aunque el ejecutor termine correctamente.

La entrada se realiza en `logs/run-backend-final-variants-dev.ps1`: sesión vigente
oculta o, dejándola vacía, usuario y contraseña ocultos de una cuenta DEV
autorizada. Solo se cierra la sesión creada por el helper. Preflight protegido
antes de pedir entradas. No hay credenciales en argumentos, archivos ni Git.

## Resultado revisado

Ejecución del **06/11/2026, 14:55:37–14:56:19 UTC**, sobre
`6ac06bc0f76c7bdfedabf58d2939484ce4f1c184`. Su diff desde `61c5c9f` solo cambia
tres documentos: código, pruebas y ejecutor idénticos. **26/26 checks**
aprobados, cero casos fallidos. Son cuatro positivos nuevos de buscadores y
un perfil afectado de campaña, más verificaciones técnicas/cierre; **no**
26 variantes de negocio distintas. Los 15 tests enfocados se reutilizaron por
su SHA de salida, sin repetirlos. 257 archivos candidatos coincidentes.

| Rama | Resultado real de esta ejecución | Alcance y reserva |
| --- | --- | --- |
| F1 RUC/matrícula positivos | Ambos aprobados: identidades distintas, período y seguridad contra SELECT independiente. | Cohorte de 20 facturas autorizadas. No certifica todos los identificadores compartidos. |
| F1 fuzzy positivo | Aprobado tras demostrar cero coincidencias fuertes; IDs distintos/orden y umbral contra Jaro-Winkler Oracle independiente. | Errata controlada sobre nombre de catálogo real, no conversación HTTP nueva ni exhaustividad lingüística. |
| F2 fuzzy positivo | Aprobado tras cero coincidencias directas; resultado contra catálogo Oracle y distancia independiente. | Errata controlada; no sustituye ni repite alias/parcial aprobados. |
| F3 consulta modificada | Un perfil real de tres períodos conciliado por pareja monetaria, registros, importes y métrica de facturas. | El padre `F3_CAMPAIGN_EXCEPTIONAL_PERIODS=passed` acredita este perfil afectado, **no** las cuatro ramas excepcionales. |
| F3 excepcionales | Diez campañas de hasta 61 días inspeccionadas. No aparecieron ausencia, referencia cero, grupos con monedas diferentes ni filas cuya suma fuera cero. | Cuatro `sample_missing`, no aprobados. Conservan cobertura controlada propia y reserva real; no prueban ausencia global ni la muestra M3 de incidencia. |
| F4 socio multimoneda | No encontrado en las 1.000 filas inspeccionadas enero–mayo 2023. | `F4_MULTICURRENCY_NOT_FOUND_IN_1000_ROWS_JAN_MAY_2023`. **No se ejecutaron** resumen/detalle ni paginación de una muestra multimoneda real. La nueva regresión propia de repositorio/DTO/presentación permanece controlada. |
| M7 chapa compartida | No encontrada entre 44 vehículos activos elegibles retornados, con tope 1.000 y exclusión de placas vacías o con espacios interiores. | `M7_SHARED_ACTIVE_PLATE_NOT_FOUND_IN_1000_ROWS`. No aprueba ambigüedad real ni elimina la reserva de atribución del test histórico. |

`success=true` confirma ausencia de fallos; **`coverageComplete=false`** conserva
las seis reservas anteriores. La búsqueda acotada fue ejecutada y revisada;
no requiere repetirla para documentar su limitación.

Identidad Oracle proxy por sesión, cierres después de cada bloque y cierre
global aprobados. Se creó una sesión por login DEV protegido porque no se
proporcionó una vigente; logout de esa sesión aprobado. Proveedor/HTTP externo:
cero intentos. Esta ampliación es dispatch real + SELECT Oracle independiente,
**no HTTP conversacional nuevo**. Los doce bloques no afectados se reutilizan;
el bloque de campaña sí se revalida por el cambio de consulta.

Reporte congelado local ignorado `logs/backend-final-variants-6ac06bc.json`,
SHA-256:
`1d2cef95e077cc79eb912500b94a68b30739f1e88ae2ed6e61beda5b89d0532e`.
Esquema revisado: sin campos de credenciales, sesiones, documentos o nombres;
sin UUID de sesión. Logs compactos del intervalo completo del helper
14:54:03–14:56:50 UTC: chatbot cero líneas, ERP cuatro, sin códigos
Oracle/driver, marcadores sensibles o fatales detectados. No se publicaron
líneas crudas ni resultados de vistas.

PR #41 permanece **en borrador** para revisar las dos correcciones. F5 se
delimita en [formas de gráficos](chart-result-contract.md); T1 continúa sin
atribución por fecha. E1, cotización real positiva, permanece separado; no se
consultó al proveedor, hizo merge ni desplegó.

## Corrección P2: moneda ausente con registros

La revisión final detectó que `filter(Boolean)` descartaba un período con
registros y moneda nula antes de decidir la compatibilidad. Se reproducía una
comparación monetaria frente a PYG sin motivo de invalidez. Es un hallazgo
controlado de código, no una muestra Oracle nueva ni una séptima reserva DEV.

La corrección candidata distingue:

- **Sin registros:** `sourceRows=0`, moneda `empty` sin código asignado. Puede
  compararse el cero con un período identificado; la moneda de esa comparación
  procede únicamente del período con registros. Dos períodos vacíos no tienen
  comparación monetaria (`NO_RECORDS`), sin inferir PYG.
- **Con registros y moneda inválida:** estados `missing`, `unrecognized` o
  `contradictory`; total/promedio monetario del período sin calcular. El importe
  de cada grupo y los metadatos originales se conservan por separado. Los
  símbolos de presentación ya no se infieren en el repositorio.
- **Moneda identificada:** alias explícitos de PYG/USD/CAD. `$` es neutral y
  nunca identifica USD; un campo no vacío desconocido no queda compensado por
  otro campo conocido. Descripción/abreviatura contradictorias invalidan el
  grupo. Se conservan los grupos exactos de la fuente, sin fusionar alias dentro
  de un período ni convertir importes.
- **Comparaciones por pareja:** solo se invalidan las que contienen un período
  inválido/mixto o dos monedas identificadas incompatibles. Las otras parejas
  mantienen importes/porcentajes. `reasonCode` y `calculationReason` aparecen en
  resultado y el motivo se presenta junto a la comparación y el desglose.
  Los conteos de facturas conservan su contrato independiente de moneda.

Siete pruebas nuevas en `campaignCurrency` cubren el caso en las tres posiciones,
ausencia real de filas, campos desconocidos/contradictorios, `$` solo y monedas
reconocidas compatibles/incompatibles. Las expectativas anteriores se ajustan
al bloqueo **por pareja**, sin eliminar cobertura de filtros, fechas, identidad
o cancelación. **18/18 enfocadas locales**; se excluye la regresión F4 no
afectada. **18/18 en Node 22.23.4 de Docker DEV** sobre
`c0eabb603f858d3f8d4789d7254c753737ca6872`, preflight completo aprobado y
**260 archivos** src/scripts/test/config/packages coincidentes con Git. No
sesión, Oracle ni proveedor en ese preflight. Reporte local ignorado
`campaign-currency-focused.json`, SHA-256 de la salida enfocada:
`f5d4dbe9b9a4ac9c6d1c54129e9ccc7649445a36de4842a237233074d7f84d1c`.
El preflight no se atribuye a una muestra Oracle con moneda inválida; el
contraste real posterior se delimita abajo.

El ejecutor nuevo `scripts/check-campaign-currency-dev.mjs` solo revalida **un
perfil real PYG de campaña** contra SELECT independientes, incluidas diferencias,
porcentajes, promedio diario y presentación. Los casos de moneda inválida siguen
siendo controlados; no se fabrican en Oracle. Reutiliza por hash los positivos
F1/F2 y las seis reservas del reporte `6ac06bc`; no los repite ni vuelve a buscar
las muestras. F5/T1 y E1 permanecen sin cambios.

Entrada oculta local: `logs/run-campaign-currency-dev.ps1`, sesión vigente o
login DEV protegido si se deja vacía. Reporte sanitizado:
`logs/campaign-currency.json`. PR #41 continúa en borrador hasta revisar la
corrección y la evidencia nueva; no merge ni despliegue.

### Resultado DEV de la corrección P2

**17/17 verificaciones aprobadas**, 06/11/2026 **17:10:16–17:10:24 UTC**, sobre
`ff937d8888694bf945176f16f9737291b8ce7cb1`, con **260 archivos coincidentes**.
Desde `c0eabb6` solo cambian tres documentos y la admisión explícita de siglas
PYG/GS en el control independiente; `src`, pruebas, config y dependencias son
idénticos. Las **18/18 enfocadas** se reutilizaron por hash, sin repetirlas.

Una campaña legítima identificada en el primer candidato: sus tres períodos
con registros PYG, parejas monetarias exactas, cantidades de facturas, totales,
promedios diarios, diferencias y porcentajes conciliados con SELECT
independientes. La presentación conserva valores, moneda y fechas del resultado
fuente. No son 17 variantes distintas, sino un perfil y sus verificaciones.
Dispatch y presentación reales, **sin conversación HTTP nueva**.

Moneda faltante/no reconocida/contradictoria, ausencia y divisas incompatibles
siguen siendo **casos controlados** de las pruebas nuevas, no muestras Oracle
reales. `coverageComplete=true` del reporte se limita a este único perfil;
**no elimina las seis reservas** preservadas en `reusedEvidence` ni amplía la
búsqueda acotada previa. F1/F2 y el reporte `6ac06bc` se reutilizan con su hash
verificado; no se ejecutaron otra vez.

Identidad proxy por sesión, cierres por bloque/global y logout de la sesión
creada por login DEV protegido aprobados. Sin proveedor/HTTP externo. Reporte
congelado ignorado `logs/campaign-currency-ff937d8.json`, SHA-256:
`7a3a2eda0fd74fedad69e27508f7ddf971185b0fa4f5e4aadcc798e753fdb095`.
Esquema sanitizado revisado, sin claves sensibles ni UUID de sesión. Logs
compactos del intervalo completo del helper 15:32:25–17:10:50 UTC: chatbot cero
líneas, ERP dos; sin códigos Oracle/driver, marcadores sensibles o fatales
detectados. No se publicaron líneas crudas, importes o identidades.

La evidencia pendiente de este P2 ya fue revisada; queda la revisión final del
diff y su correspondencia antes de sacar la PR #41 de borrador. F5/T1, E1 y
las seis reservas se conservan. Sin nuevas pruebas, proveedor, merge o despliegue
durante esta revisión del reporte.
