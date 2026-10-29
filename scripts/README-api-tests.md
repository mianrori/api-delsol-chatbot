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
docker cp api-delsol-chatbot-dev:/tmp/chatbot-api-tests.json .\chatbot-api-tests.json
Remove-Item Env:BOT_TEST_SESSION_ID
Write-Host "Código de salida: $testExit"
```

Usa el `sessionId` que ya obtienes para Insomnia. No hace falta enviarlo por chat.
La URL predeterminada es `http://localhost:5400/chatbot/api/bot`, accesible desde
el propio contenedor. No necesitas instalar Node ni dependencias en Windows.

El programa muestra el paso que está ejecutando y su resultado. Al terminar,
comparte **chatbot-api-tests.json**. No hace falta copiar cada respuesta ni enviar
los Excel: se abren y verifican en memoria, sin guardarlos. El reporte contiene
códigos de comprobación, estados HTTP y duraciones; omite sesiones, identificadores
de exportación, usuarios Oracle, nombres comerciales, filas de Excel y respuestas
completas. No incluye los logs del servidor; si hace falta investigar una consulta
concreta, el reporte identifica su paso y horario.

## Suites y configuración

| Variable | Predeterminado | Uso |
| --- | --- | --- |
| `BOT_TEST_SESSION_ID` | Obligatorio | Sesión válida con permisos de consulta. |
| `BOT_TEST_BASE_URL` | `http://localhost:5400/chatbot/api/bot` | URL sin credenciales ni parámetros. |
| `BOT_TEST_SUITE` | `all` | `quick`, `sales` o `all`. |
| `BOT_TEST_TIMEOUT_MS` | `90000` | Límite por petición; máximo 600000. |
| `BOT_TEST_REPORT` | Directorio temporal + `chatbot-api-tests.json` | Ruta del reporte; la carpeta debe existir. |

Con Docker, pasa las opciones adicionales mediante `-e`, por ejemplo:

```powershell
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_SUITE=quick api-delsol-chatbot-dev node scripts/run-api-tests.mjs
```

- `quick`: 6 pasos. Reinicio, sesión obligatoria, exportación inexistente, ventas
  de enero, pregunta equivalente y cambio a febrero. Descarga los tres Excel.
- `sales`: 10 pasos. Añade cambio a rubro, filtro DEPORTES, desglose por local y
  eliminación del filtro, con validación de las exportaciones correspondientes.
- `all`: 12 pasos. Añade cambio de tema a vehículos de 2025 y seguimiento por género,
  comprobando que no se arrastre una exportación de ventas.

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

Para cada Excel, se comprueba HTTP 200, MIME, firma ZIP, apertura con ExcelJS,
hojas, columnas, métricas numéricas, moneda PYG, cantidad completa de filas,
totales de control, coincidencia de las 12 filas de muestra, fechas, agrupación
e identificador interno de la exportación. Estas verificaciones validan las
respuestas y archivos; no inspeccionan el SQL ni prueban por sí solas todos los
permisos o el filtro de borrado lógico. La expiración por tiempo, la cancelación,
otro usuario sin permisos y los gráficos conservan sus pruebas específicas.

Si ya tienes Node y las dependencias del proyecto instaladas, también puedes
ejecutar `node scripts/run-api-tests.mjs` desde Windows con las mismas variables.
La ruta del reporte se imprime al terminar.
