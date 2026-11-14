# PR #51: cálculos condicionados a integridad del alcance

> Estado posterior: [PR #51 fusionada y Docker DEV validado en 5400, 6ac1556](invoice-balances-dev-live-6ac1556.md). Las reservas se conservan. La indicación de borrador al final corresponde al estado de esta validación anterior.

Regla vigente que sustituye el bloqueo global del contrato de series anterior. La identidad examinada es el par exacto SERIE_FACTURA/NRO_FACTURA; no se declara única la vista completa. No se modifican registros históricos ni se escoge una versión representativa.

## Criterio de cálculo

El repositorio cuenta versiones de cada identidad mediante COUNT(*) OVER(PARTITION BY SERIE_FACTURA,NRO_FACTURA) en todas las filas elegibles autorizadas (DEUDA >= 0 o nula). Esa comprobación precede a los filtros de cliente, serie, número, sector, moneda, deuda, vencimiento y antigüedad. Por tanto, una versión histórica fuera del filtro efectivo puede impedir que una identidad seleccionada parezca única. Las filas negativas siguen fuera del contrato; no se consulta otra vista ni se atribuye USER_CAN_CONSULT a esta vista.

Si alguna identidad seleccionada está repetida, el resumen completo solicitado devuelve INCONSISTENT_HISTORY: data ausente, invoiceCount null y monetaryAggregationAvailable false. No hay subtotal parcial que parezca completo. Se bloquea conservadoramente todo ese resumen, aunque otras monedas/grupos del mismo alcance pudieran ser limpios; el usuario puede pedir un alcance limpio separado. También se bloquea ante identidad incompleta, moneda faltante o deuda nula, explicando información incompleta. No se equipara null con cero.

El detalle conserva las filas sin deduplicar y añade advertencia de registros históricos inconsistentes y duplicateRows; no presenta conteo de facturas si la identidad está repetida/incompleta. totalRows sigue contando registros y matchedInvoicePairs referencias distintas, sin confundirlos con facturas válidas. El orden monetario del detalle sigue siendo orden de registros, no ranking agregado.

En perfiles limpios y completos se habilita summary: SUM(DEUDA) y COUNT(*) por COD_MONEDA y dimensiones solicitadas. Las identidades distintas con importes iguales se suman ambas. Los rankings se ordenan y numeran dentro de cada código de moneda; no hay clasificación monetaria entre divisas ni conversión. Guardas, sumas y ranking comparten una sola sentencia/snapshot Oracle. No se usa SUM(DISTINCT DEUDA), MAX/MIN ni primera fila para resolver identidades duplicadas. Los rangos de importe exigen un código de moneda, también en summary.

Se conservan pending >0 predeterminado, settled =0 a pedido, all no negativas/nulas y unknown nulas. PII cubre serie/número en detalle y parejas, y los identificadores de dimensiones agregadas; la respuesta autorizada restaura los valores mediante la presentación protegida.

## Validación ejecutada

Candidato **8420e8201e4f3e824cda42646d77772b246148eb**, posterior a c8bdb50. Extracción limpia en directorio temporal, 340 fuentes cotejadas; manifiesto SHA-256 `9f1dd2ed1b555c4d24f8b1e0a0d3d1dd325b4de22df01a28af848dc9b86ddeba`. No es un despliegue. El commit posterior de esta actualización solo documenta resultados.

[Reporte Oracle/HTTP sanitizado](invoice-balances-integrity-8420e82.json), SHA-256 `10789229c05197df0d4db291aa2f547d1b61fa79bec4d67c879823a7117c55b2`. Control 12/11/2026 16:50:41–16:50:50 America/Asuncion (19:50:41–19:50:50 UTC).

- **26 aserciones afectadas**: identidades limpias, sumas/conteos y orden por moneda contra GROUP BY SQL independiente; dimensiones probadas realmente: totales por moneda y cliente/moneda. Un perfil de cliente completo también permitió summary. Esto no certifica todas las combinaciones de filtros/dimensiones.
- Hubo duplicados con deuda igual: resumen bloqueado y detalle conservado con advertencia. **No hubo muestra de identidades repetidas con deudas distintas** en el alcance autorizado elegible; esa muestra Oracle queda pendiente, no resuelta.
- Tres POST al listener efímero del candidato: resumen limpio, resumen inconsistente y detalle inconsistente, con router/controller/ejecutor/servicio/repositorio y proxy reales. SDK controlado, tres llamadas, cero proveedor/PDF. Identificadores estructurales protegidos; comparación textual de historial solo para valores de seis o más caracteres. No acredita interpretación de un modelo real ni ausencia exhaustiva de PII en toda variante textual.
- **34/34 pruebas locales afectadas con Node 22.23.5**: 25 del módulo adaptadas al contrato y nueve de integridad. Conexiones simuladas cubren duplicados con deudas iguales/distintas, pares con número igual y serie distinta, preservación de filas, bloqueo por información incompleta, separación monetaria, presentación/PII y página fuera de rango. Las pruebas simuladas inspeccionan SQL/binds y resultados; no sustituyen ejecución Oracle de las variantes sin muestra. No se ejecutó la suite completa.

No se repitieron las 117 aserciones anteriores, el recorrido de esquema/fechas ni inspecciones administrativas. Los controles anteriores de formato DD/MM/YYYY, permisos, estados y fechas permanecen como evidencia histórica de 0c34985, sin atribuirles la ejecución del nuevo candidato. La referencia de fecha del servicio sigue siendo Asunción; no cambió el cálculo de vencimiento.

## Cierre y reservas

Identidad sessionId → PostgreSQL → proxy verificada. Preparación 1/1 y validación 4/4 conexiones cerradas, driver restaurado, pool del worker cerrado, servidor efímero cerrado y conversación propia limpiada. Logout aprobado. Logs sanitizados: chatbot sin líneas nuevas, ERP dos metadatos de autenticación; cero eventos Bedrock. Imagen/arranque habitual sin cambios. Consola protegida cerrada al finalizar.

PR #51 permanece en borrador. Pendientes: muestra Oracle de duplicados con deudas diferentes, dimensiones/combinaciones no ejercitadas realmente, denegación real sin identidad/muestra, reservas temporales anteriores y colisión real de símbolos entre monedas. ANX123 y muestra mixta Oracle de PR #50 siguen pendientes independientes. Sin merge, despliegue ni modificaciones de datos de negocio, permisos o expiraciones.
