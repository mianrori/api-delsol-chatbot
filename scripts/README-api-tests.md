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
| `BOT_TEST_SUITE` | `all` | `quick`, `sales`, `charts`, `comparisons`, `soles` o `all`. |
| `BOT_TEST_TIMEOUT_MS` | `90000` | Límite por petición; máximo 600000. |
| `BOT_TEST_REPORT` | Directorio temporal + `chatbot-api-tests.json` | Ruta del reporte; la carpeta debe existir. |
| `BOT_TEST_MEMBER_DOCUMENT` | Solo obligatorio en `soles` | Documento local del socio de prueba; activa también soles en `all`. |
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
- `all`: 19 pasos. Incluye `sales`, cambio de tema a vehículos de 2025 y seguimiento
  por género (sin arrastrar exportaciones), las cuatro comprobaciones de gráficos
  y las tres comparaciones entre años. Si se configura `BOT_TEST_MEMBER_DOCUMENT`,
  añade los cinco casos de soles y tiene 24 pasos. Sin documento, el reporte
  indica `optionalSuites.soles=not_configured`; no ejecuta consultas globales de
  socios como sustitución de la prueba personal.

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

Elige un socio que tenga **saldo vigente positivo y usos registrados** entre
enero y mayo de 2023, o ajusta el período de usos. Ingresa el número de documento
sin puntos, solo en tu entorno; no hace falta enviarlo por chat ni versionarlo.

```powershell
$env:BOT_TEST_SESSION_ID = Read-Host "Pega un sessionId vigente de DEV"
$env:BOT_TEST_MEMBER_DOCUMENT = Read-Host "Documento del socio de prueba, sin puntos"
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_MEMBER_DOCUMENT -e BOT_TEST_SUITE=soles api-delsol-chatbot-dev node scripts/run-api-tests.mjs
$report = Join-Path ([Environment]::GetFolderPath("Desktop")) "chatbot-api-tests.json"
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json "$report"
Remove-Item Env:BOT_TEST_SESSION_ID, Env:BOT_TEST_MEMBER_DOCUMENT
```

Para otro período, añade al comando Docker, por ejemplo,
`-e BOT_TEST_SOLES_FROM=01/01/2024 -e BOT_TEST_SOLES_TO=31/12/2024`.
Estas fechas filtran **usos**, no reconstruyen un saldo histórico. El saldo
vigente utiliza la referencia del backend; el seguimiento por vencimiento debe
conservar esa referencia y el mismo nombre del socio.

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
