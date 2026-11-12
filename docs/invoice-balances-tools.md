# Saldos de facturas

Fuente exclusiva: `VW_BOT_FACTURAS_SALDOS`, con las nueve columnas suministradas. `VENCIMIENTO` es texto DD/MM/YYYY, confirmado por el usuario. No se consulta otra vista para completar datos o resolver clientes. Se conserva la arquitectura existente: ruta/controller de chat → ejecutor/service → repository → Oracle mediante sessionId PostgreSQL y usuario proxy, con cierre en finally. El frontend no elige la identidad Oracle.

## Herramientas

- `search_invoice_balance_customers`: busca por nombre, razón social, RUC o código entre los clientes visibles en la vista de saldos. Respuestas RESOLVED, AMBIGUOUS o NOT_FOUND; hasta 20 opciones y señal de truncamiento. Una selección ambigua no se sustituye por un código propuesto por el modelo.
- `get_invoice_balances`: detalle o resumen, paginados. Filtros por clientes, facturas exactas, sectores exactos, símbolos de moneda registrados, vencimientos inclusivos, signo/rango de saldo y días de atraso. Agrupaciones por cliente, factura, sector, mes de vencimiento, estado y tramo de antigüedad; siempre con moneda separada. Orden por saldo, vencimiento, atraso o conteo según el modo.

Los totales por moneda abarcan todo el filtro, independientemente de la página. Se incluyen saldo neto, positivo, negativo, vencido, que vence hoy, por vencer y sin vencimiento válido; conteos de registros y facturas distintas, saldos desconocidos y vencimientos no válidos. Los conteos distintos no se suman entre grupos. Los rankings monetarios se ordenan dentro de cada moneda; para un top N de una moneda se filtra su símbolo real. No se convierte moneda ni se elabora un ranking mezclando importes de monedas distintas.

`matchedCustomers` y `matchedInvoices` se calculan en Oracle sobre el filtro completo para contar identificadores distintos sin duplicarlos entre monedas o páginas. Los identificadores nulos no se cuentan como entidades identificadas; los registros se conservan en los conteos de filas.

Estados: overdue (anterior a la referencia), dueToday (igual), upcoming (posterior), undated (nula/inválida). Antigüedad: notDue, dueToday, 1–30, 31–60, 61–90, 91–180, 181+ y undated. Fechas de entrada inválidas se rechazan antes de consultar; los textos inválidos de la vista se clasifican con CASE anidados antes de TO_DATE, sin convertirlos a fechas inventadas. SALDO nulo permanece desconocido; cero y negativo conservan su significado registrado, sin inferir pagos.

`asOfDate` predetermina hoy en America/Asuncion y únicamente clasifica vencimientos sobre el saldo actual. **No reconstruye el saldo histórico.** El mes de vencimiento no es una serie histórica del saldo. La vista no permite consultar emisión, cobros/pagos, conceptos, matrícula ni PDF. No se crean enlaces ficticios.

Ejemplos de argumentos (identificadores y símbolos deben proceder de los resultados reales):

```json
{"mode":"summary","groupBy":[],"balanceStatus":"all"}
{"mode":"summary","groupBy":["customer"],"balanceStatus":"positive","currencies":["PYG"],"orderBy":"balanceDesc","rows":10}
{"mode":"detail","customerIds":["ID_RESUELTO"],"dueStatus":"overdue","balanceStatus":"positive"}
{"mode":"summary","groupBy":["agingBand"],"balanceStatus":"positive","asOfDate":"12/11/2026"}
{"mode":"detail","dueDateFrom":"01/12/2026","dueDateTo":"31/12/2026"}
{"mode":"detail","invoiceNumbers":["NUMERO_EXACTO"],"balanceStatus":"all"}
```

## PII y permisos

Nombres, razón social, RUC, identificadores de clientes y números de factura se pseudonimizan antes del modelo, incluidas las listas de argumentos y el contexto de paginación. Solo se restauran al ejecutar internamente o al entregar la respuesta al usuario de la misma sesión. Los importes y conteos permanecen numéricos, según la política PII existente. La presentación completa del detalle/resumen es determinista, conserva los tokens en el historial y no muestra códigos internos. La paginación reutiliza el contexto efectivo y la fecha de referencia. La selección de cliente se conserva con metadatos protegidos aunque se recorte el historial; una petición explícita de todos los clientes retira el alcance anterior.

Los logs de herramientas/modelo conservan únicamente metadatos y ocultan payloads incluso si están activadas las opciones de depuración; las transformaciones PII tampoco registran sus valores originales. No se registran saldos ni resultados sensibles de la vista.

Esta vista **no contiene USER_CAN_CONSULT**. No se copia el predicado de VW_BOT_FACTURAS ni se inventa un sondeo de permisos sobre columnas inexistentes. Oracle es la autoridad de visibilidad. Errores Oracle de acceso mantienen ACCESS_DENIED; cero filas significa ausencia visible, sin afirmar denegación ni ausencia global. No hay autenticación directa de usuarios finales, cambios de datos o permisos, conexiones persistidas ni consultas administrativas nuevas.

## Validación y límite

Pruebas enfocadas de repositorio/servicio, filtros y rangos inválidos, SQL enlazado, grupos, monedas, nulos, selección, PII y presentación. Flujo HTTP con SDK y Oracle simulados: resolución ambigua → selección → detalle → siguiente página → denegación; comprueba tokens frente al modelo y en el historial, restauración al usuario, identidad proxy resuelta desde sesión y cierres incluso con error. Se prueban logs con flags de depuración activados para descartar exposición accidental.

**53/53 pruebas enfocadas con Node 22.23.5**, en copia temporal aislada; 15 pruebas nuevas y 38 regresiones relacionadas. Archivos: invoiceBalances, invoiceBalancesHttp, searchSelection, invoices, toolErrors y oracleSessionClose. No se cambió /app ni se reinició el servicio. Salida local: `logs/invoice-balances-focused-node22.txt`.

No se invocó modelo/proveedor ni se consultó Oracle real. La sintaxis y el comportamiento contra la vista real, su granularidad por factura/sector y los permisos de la identidad afectada requieren contraste posterior autorizado. Los totales suman las filas entregadas por la vista; no se deduplican saldos iguales suponiendo que sean duplicados. No se desplegó esta funcionalidad ni se modificó la validación histórica de la PR #50 o sus reservas de ANX123 y muestra mixta.
