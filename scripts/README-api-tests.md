# Pruebas automáticas del endpoint DEV

Ejecuta las secuencias que antes se enviaban manualmente en Insomnia. Utiliza
únicamente el contrato HTTP y un `sessionId` válido; no inicia sesión ni necesita
credenciales Oracle, PostgreSQL o Bedrock. No modifica la expiración de sesiones.

Al comenzar reinicia **la conversación de la sesión indicada**, por lo que debes
usar una sesión de pruebas. Las consultas son secuenciales; al primer fallo se
detiene la secuencia y marca los pasos dependientes como omitidos. El tiempo
límite predeterminado es de 90 segundos por petición y también cubre la descarga.

## Ejecutar desde PowerShell con el contenedor de desarrollo

Después de actualizar el código y reconstruir el contenedor:

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
docker exec -e BOT_TEST_SESSION_ID api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$testExit = $LASTEXITCODE
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID
Write-Host "Código de salida: $testExit"
```

Usa el `sessionId` que ya obtienes para Insomnia. No hace falta enviarlo por chat.
La URL predeterminada es `http://localhost:5400/chatbot/api/bot`, accesible desde
el propio contenedor. No necesitas instalar Node ni dependencias en Windows.

El programa muestra el paso que está ejecutando y su resultado. Al terminar,
comparte **chatbot-api-tests.json**, copiado al Escritorio (también si está en
OneDrive). No hace falta copiar cada respuesta ni enviar
los Excel: se abren y verifican en memoria, sin guardarlos. El reporte contiene
códigos de comprobación, estados HTTP y duraciones; omite sesiones, identificadores
de exportación, usuarios Oracle, nombres comerciales, filas de Excel y respuestas
completas ni imágenes SVG. Tampoco incluye documentos, nombres de socios, tipos,
destinos ni cantidades de soles. No incluye los logs del servidor; si hace falta investigar una consulta
concreta, el reporte identifica su paso y horario.

## Suites y configuración

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `BOT_TEST_SESSION_ID` | Obligatorio | Sesión válida con permisos de consulta. |
| `BOT_TEST_BASE_URL` | `http://localhost:5400/chatbot/api/bot` | URL sin credenciales ni parámetros. |
| `BOT_TEST_SUITE` | `all` | `quick`, `sales`, `charts`, `comparisons`, `soles`, `purchases`, `campaigns`, `member-purchases` o `all`. |
| `BOT_TEST_TIMEOUT_MS` | `90000` | Límite por petición; máximo 600000. |
| `BOT_TEST_REPORT` | Directorio temporal + `chatbot-api-tests.json` | Ruta del reporte; la carpeta debe existir. |
| `BOT_TEST_MEMBER_DOCUMENT` | Solo obligatorio en `soles` | Documento local del socio de prueba; activa también soles en `all`. |
| `BOT_TEST_SOLES_REFERENCE_DATE` | `30/06/2023` | Fecha explícita para clasificar vigencia en la copia DEV. |
| `BOT_TEST_SOLES_FROM` | `01/01/2023` | Inicio inclusivo del período de usos, DD/MM/YYYY. |
| `BOT_TEST_SOLES_TO` | `31/05/2023` | Fin inclusivo del período de usos. |
| `BOT_TEST_SOLES_PAGE_SIZE` | `5` | Movimientos por página, de 1 a 200. |
| `BOT_TEST_SOLES_MAX_PAGES` | `10` | Máximo de páginas a recorrer, de 1 a 100. |

Con Docker, pasa las opciones adicionales mediante `-e`, por ejemplo:

```powershell
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_SUITE=quick api-delsol-chatbot-dev node scripts/run-api-tests.mjs
```

- `quick`: 6 pasos. Reinicio, sesión obligatoria, exportación inexistente, ventas
  de enero, pregunta equivalente y cambio a febrero. Descarga los tres Excel.
- `sales`: 10 pasos. Añade cambio a rubro, filtro DEPORTES, desglose por local y
  eliminación del filtro, con validación de las exportaciones correspondientes.
- `charts`: 5 pasos. Reinicio, serie de ventas enero–mayo de 2023 con ambas métricas,
  gráfico de barras solo del importe, cambio a líneas y gráfico de enero–febrero.
- `comparisons`: 4 pasos. Reinicio, comparación mensual 2023 contra 2024,
  seguimiento limitado a enero–mayo y seguimiento limitado a agosto.
- `soles`: 6 pasos. Reinicio, saldo vigente por tipo, vencimientos, resumen de
  usos por socio/tipo, detalle paginado de usos y vuelta al saldo por tipo.
- `purchases`: 4 pasos. Reinicio, canjes de facturas de socios frente a ventas
  por mes (enero–mayo de 2023), conciliación con el total del mismo período y
  cambio a enero. Verifica ventas de control, porcentajes y límites coherentes
  para socios distintos; no suma personas que reaparecen en distintos meses.
- `campaigns`: 3 pasos. Reinicio, búsqueda parcial de Navidad y selección de
  «TU LUZ HACE LA MAGIA DE LA NAVIDAD» (15/11/2018–06/01/2019) para comparar
  antes/durante/después. Busca hasta diez páginas si es necesario y usa el número
  de opción devuelto, sin asumir su posición. Valida fechas, importes/facturas de
  control, promedios diarios, variaciones y la advertencia de no atribuir causalidad.
- `all`: 24 pasos. Incluye `sales`, vehículos de 2025 y seguimiento por género,
  gráficos, comparaciones entre años, canjes frente a ventas y campañas. Si se
  configura `BOT_TEST_MEMBER_DOCUMENT`, añade cinco casos de soles y tiene
  **29 pasos**. Sin documento, indica `optionalSuites.soles=not_configured` y
  omite las consultas personales de saldo/usos; los canjes son agregados globales.

Para ejecutar únicamente el nuevo bloque de gráficos:

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_SUITE=charts api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID
```

Para ejecutar únicamente las comparaciones entre años:

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_SUITE=comparisons api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID
```

## Pruebas de soles con un documento local

Elige un socio que tenga **saldo registrado positivo con vencimiento vigente
respecto del 30/06/2023** y usos registrados entre enero y mayo de 2023, o ajusta
la referencia y el período de usos. Ingresa el número de documento
sin puntos, solo en tu entorno; no hace falta enviarlo por chat ni versionarlo.

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
$env:BOT_TEST_MEMBER_DOCUMENT = Read-Host "Documento del socio de prueba, sin puntos"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_MEMBER_DOCUMENT -e BOT_TEST_SUITE=soles -e BOT_TEST_SOLES_REFERENCE_DATE=30/06/2023 api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID, Env:BOT_TEST_MEMBER_DOCUMENT
```

Para otro período, añade al comando Docker, por ejemplo,
`-e BOT_TEST_SOLES_FROM=01/01/2024 -e BOT_TEST_SOLES_TO=31/12/2024`.
Estas fechas filtran **usos**. La suite solicita explícitamente la fecha
`BOT_TEST_SOLES_REFERENCE_DATE` para saldo y vuelta al saldo, y comprueba que el
backend la aplique también al seguimiento por vencimiento. El reporte incluye
la referencia en `profile.solesReferenceDate`. El valor predeterminado corresponde
al corte de junio de 2023 de la copia DEV; puede cambiarse mediante `-e`.

Esto no cambia el reloj del servidor ni de Oracle, la fecha global del chat,
la vigencia real de sesiones ni la expiración de exportaciones. La referencia
clasifica vencimientos sobre el **saldo almacenado en DEV**; no reconstruye un
saldo histórico ni revierte consumos posteriores. Si el registro almacenado ya
tiene saldo cero, cambiar la referencia no lo convierte en un saldo positivo.

La suite comprueba que cada tipo tenga saldo numérico sin símbolo monetario,
que se ofrezca el detalle por vencimiento y que los vencimientos sumen el saldo
de cada tipo. Los usos deben conservar el socio y el período, agruparse por tipo
y distinguirse del saldo. El detalle recorre todas las páginas permitidas,
valida sus fechas y su cantidad de movimientos y suma los usos **por tipo** para
compararlos con el resumen, incluyendo fracciones y movimientos con signo.
Finalmente pide otra vez el saldo para comprobar que no se sustituya por el uso.

Si falta saldo o uso, fallará con un código `SOLES_*FIXTURE*`: elige otro socio
o ajusta el rango. Si supera el límite de páginas, reduce el período o ajusta
`BOT_TEST_SOLES_PAGE_SIZE` / `BOT_TEST_SOLES_MAX_PAGES`. El reporte indica en
`coverage.solesUsageMultiplePages` si se ejercitaron varias páginas; con cinco
usos o menos, el tamaño predeterminado solo permite probar una página y su fin.
Para forzar varias páginas con pocos usos, baja el tamaño a 1 o 2.

El nombre, documento, tipos y cantidades se comparan solo en memoria. El reporte
guarda códigos de comprobación, tiempos y ese indicador de cobertura. Estas son
comprobaciones de coherencia entre respuestas; no un control independiente del
saldo o de la relación documento/nombre contra Oracle. La prueba termina ante
el primer fallo, con los mismos límites y códigos de salida de las otras suites.

El código de salida es `0` si todo pasó, `1` si falló una comprobación y `2` si
la configuración es inválida o no se pudo guardar el reporte. Las respuestas
deben indicar `env=development`. Una sesión inválida o vencida requiere obtener
otra mediante el flujo habitual y volver a ejecutar el programa.

## Controles de datos

Los controles corresponden a la base DEV validada durante la migración:

| Período/consulta | Importe ₲ | Facturas | Registros |
| --- | ---: | ---: | ---: |
| Enero 2023, todos los locales | 58.706.137.966 | 366.427 | 180 |
| Febrero 2023, todos los locales | 63.255.876.492 | 358.354 | Según exportación |
| Enero 2023, DEPORTES por local | 2.994.866.457 | 7.049 | 5 |

Enero por rubro debe contener 34 registros. Vehículos de 2025: 23 registros,
23 matrículas y 7 socios; por género, 2 registros F y 21 M. Si los datos DEV
cambian legítimamente, revisar estos controles antes de interpretar un fallo como
regresión. Las constantes de ventas se encuentran al inicio del ejecutor; los
controles de rubros y vehículos están en sus casos correspondientes.
La serie mensual de enero a mayo de 2023 para gráficos está en `controls.monthly`:
cada mes tiene sus propios controles de importe y facturas.
Los datos mensuales de las comparaciones se encuentran en `comparisonControls`.
En esta copia DEV, 2023 tiene filas de enero a agosto y 2024 en agosto, octubre
y noviembre. Los demás meses se representan con `null` en los controles porque
no tienen filas, no porque sus ventas sean cero.

Agosto compara ₲ 100.004 y 228 facturas (2023) con ₲ 5.000.000 y 1 factura (2024):
la diferencia de ventas es ₲ 4.899.996 y la de facturas es -227. En enero–mayo no
hay pares de valores para comparar. La suite comprueba las fechas de ambos años,
el orden y la cantidad de meses, cada importe/cantidad, la moneda, las celdas
«Sin registros», los meses admitidos en las observaciones y el signo/valor de
sus diferencias. Rechaza sustituir ausencias por cero, atribuirles ausencia de
ventas o mantener el rango anual después de pedir un rango menor. No guarda
tablas ni observaciones completas en el reporte. Si cambia la base DEV, deben
revisarse también los controles de meses con y sin filas.

Para cada Excel, se comprueba HTTP 200, MIME, firma ZIP, apertura con ExcelJS,
hojas, columnas, métricas numéricas, moneda PYG, cantidad completa de filas,
totales de control, coincidencia de las 12 filas de muestra, fechas, agrupación
e identificador interno de la exportación. Estas verificaciones validan las
respuestas y archivos; no inspeccionan el SQL ni prueban por sí solas todos los
permisos o el filtro de borrado lógico. La expiración por tiempo, la cancelación
y otro usuario sin permisos conservan sus pruebas específicas.

Para gráficos se comprueban el contrato `actions.chart`, tipo, moneda, puntos,
cantidad de series, URL base64, UTF-8, raíz/cierre SVG, dimensiones/viewBox, ausencia
de contenido activo o referencias externas, etiquetas mensuales y un importe
visible exacto por punto. Las anclas de esos importes deben estar dentro del
viewBox; esto no sustituye la revisión visual de texto recortado o superpuesto.
El cambio a líneas debe conservar los cinco meses y el nuevo período debe
contener únicamente enero y febrero. No se guardan el SVG ni la respuesta en el
reporte. Estas pruebas HTTP verifican el contenido final; no demuestran por sí
solas que un seguimiento haya evitado una nueva consulta Oracle.

Si ya tienes Node y las dependencias del proyecto instaladas, también puedes
ejecutar `node scripts/run-api-tests.mjs` desde Windows con las mismas variables.
La ruta del reporte se imprime al terminar.

El detalle admite cantidades ausentes únicamente con el marcador `—`, distinto
de cero. Todos los movimientos cuentan en la conciliación; se suman las cantidades
informadas, conforme a `COUNT(*)` y `SUM(NVL(SOLES_UTILIZADOS, 0))` del resumen.
`coverage.solesUsageMissingQuantities` indica si se encontraron cantidades ausentes,
sin registrar sus valores. Otros textos no numéricos siguen haciendo fallar la prueba.


## Canjes de socios y campañas históricas

Ejecuta las dos suites por separado antes de la regresión completa:

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_SUITE=purchases api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests-purchases.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_SUITE=campaigns api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests-campaigns.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID
```

No requieren documento de socio ni cambian el reloj. `purchases` comprueba los
**canjes agregados frente a ventas**, no el detalle individual de compras de un
socio. Requiere canjes registrados en enero–mayo de 2023. Compara los importes y
conteos de canjes entre respuestas mensual/total/enero y calcula el porcentaje;
la columna Moneda admite `PYG` o `₲`, y rechaza monedas distintas;
los socios distintos del total deben estar entre el máximo mensual y la suma
mensual. Esta coherencia no sustituye una conciliación independiente con Oracle.

`campaigns` usa una campaña histórica ya validada en DEV y los siguientes
controles, en períodos consecutivos de 53 días:

| Período | Desde | Hasta | Ventas (PYG) | Facturas |
| --- | --- | --- | ---: | ---: |
| Antes | 23/09/2018 | 14/11/2018 | 81.975.498.634 | 651.507 |
| Durante | 15/11/2018 | 06/01/2019 | 120.490.114.653 | 857.905 |
| Después | 07/01/2019 | 28/02/2019 | 79.632.388.020 | 854.475 |

La búsqueda exige al menos diez coincidencias de Navidad y la campaña de control.
Si la copia DEV cambia o falta esa campaña, falla con un código `CAMPAIGNS_*`;
no elige otra silenciosamente. `coverage.campaignSearchMultiplePages` indica si
necesitó varias páginas para encontrarla; no implica que recorriera todo el catálogo.
Los nombres y valores de las respuestas se usan en memoria y no se incluyen en
el reporte. Ambas suites comprueban que no se arrastren gráficos ni exportaciones.


El seguimiento simple «Ahora por género» de registros de vehículos se resuelve
con una consulta nueva que conserva las fechas y filtros de la consulta anterior,
sin depender de que el modelo emita otra llamada. Se limita al turno inmediatamente
anterior con una consulta de vehículos exitosa. Los seguimientos con fechas o
filtros adicionales siguen el flujo habitual. La prueba acepta las etiquetas
`Femenino`/`Masculino` o `F`/`M`, valida los conteos de las tres métricas y exige
una tabla; unos argumentos JSON escritos como respuesta no constituyen un resultado.


## Compras individuales de un socio

`BOT_TEST_SUITE=member-purchases` ejecuta seis casos: reinicio, total del socio,
compras mensuales, por local, por rubro y detalle completo paginado. Es una suite
separada; `all` conserva sus 29 casos cuando se configura soles.

Elige un socio con compras en el período y configura el documento solo en tu
entorno. Se prioriza `BOT_TEST_PURCHASES_DOCUMENT`; si falta, usa
`BOT_TEST_MEMBER_DOCUMENT`. Esta suite no necesita saldo ni usos de soles.

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
$env:BOT_TEST_PURCHASES_DOCUMENT = Read-Host "Documento del socio con compras en DEV"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_PURCHASES_DOCUMENT -e BOT_TEST_SUITE=member-purchases api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests-member-purchases.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID, Env:BOT_TEST_PURCHASES_DOCUMENT
```

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| BOT_TEST_PURCHASES_FROM | 01/01/2023 | Inicio inclusivo |
| BOT_TEST_PURCHASES_TO | 31/05/2023 | Fin inclusivo |
| BOT_TEST_PURCHASES_PAGE_SIZE | 20 | De 1 a 100 compras por página |
| BOT_TEST_PURCHASES_MAX_PAGES | 20 | Límite de páginas entre 1 y 100 |

Pasa opciones mediante `docker exec -e`, como en las otras suites. Si hay más
páginas que el límite, reduce el período o configura el límite/tamaño. Con cero
compras falla la precondición; no se considera cobertura exitosa.

Las preguntas solicitan tablas con columnas definidas para comprobar importes y
conteos. Se validan documento y período visibles, moneda PYG, meses dentro del
rango, conciliación de cada desglose con el total y todas las filas del detalle
hasta agotar las páginas previstas por el conteo. No se suministran al modelo
los importes, conteos ni metadatos esperados de página. Se conservan signos y
fracciones. Una etiqueta compartida por dos locales/rubros no se considera una
identidad única; los meses sí deben ser únicos.

El reporte contiene solo fechas del perfil, códigos de comprobación, tiempos y
`coverage.memberPurchasesMultiplePages`, sin documento, locales, rubros, importes
ni filas. Son controles de coherencia de respuestas HTTP; no prueban por sí
solos la correspondencia documento/persona ni sustituyen un control independiente
contra Oracle. No modifica el backend, sesiones ni reloj. Pendiente validar el
formato solicitado contra DEV; los tests locales usan respuestas simuladas.
