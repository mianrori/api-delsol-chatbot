# PR #51: contrato vigente de series y deuda

Este documento sustituye las reglas anteriores de signo y granularidad de invoice-balances-tools.md. Los JSON anteriores se conservan como historia. PR en borrador, sin merge ni despliegue.

## Contrato

Oracle DEV confirmó once columnas, incluidas SERIE_FACTURA VARCHAR2, COD_MONEDA VARCHAR2 y DEUDA NUMBER(18,2), sin SALDO ni USER_CAN_CONSULT. La aplicación usa DEUDA y Oracle determina permisos mediante proxy; PostgreSQL resuelve sessionId a username, sin aceptar la identidad del frontend.

El perfil independiente **91e24c4b6484af6ca40e2cce4b66424fa8df5fb9** encontró números iguales con series distintas, pares SERIE_FACTURA/NRO_FACTURA repetidos y repetición incluso al añadir COD_CLIENTE/SECTOR/COD_MONEDA. Alcance: filas autorizadas no negativas o de deuda desconocida, en ese momento. No hubo series/números nulos/blancos ni moneda faltante en ese alcance observado. **No hay clave única ni aditividad demostradas**: resumen, totales por moneda, conteos de entidades factura y rankings agregados siguen bloqueados. No se deduplica ni se suman páginas/modelo.

Detalle y presentación incluyen serie y número. `invoices: [{invoiceSeries,invoiceNumber}]` enlaza parejas exactas mediante OR, sin cruzar series y números de facturas distintas. invoiceSeries e invoiceNumbers permiten filtros independientes explícitos. Valores siempre enlazados por binds. totalRows cuenta registros, matchedInvoiceNumbers números distintos, matchedInvoicePairs pares completos distintos, matchedCustomers códigos de cliente distintos. No se anuncian pares como facturas de negocio; componentes nulos no identifican un par, pero sus filas cuentan.

| debtStatus | Predicado | Contrato confirmado |
| --- | --- | --- |
| pending, predeterminado | DEUDA > 0 | Pendiente |
| settled, a pedido | DEUDA = 0 | Deuda cancelada |
| all | DEUDA >= 0 OR DEUDA IS NULL | Incluye cero y desconocidas |
| unknown | DEUDA IS NULL | Desconocida |

DEUDA < 0 siempre se excluye, también del buscador. El buscador admite cero/nulos para resolver canceladas/todas; el detalle aplica el estado solicitado. Null no equivale a cero/cancelada: se conserva como null y unknownDebtRows. Pending/settled y comparaciones de rango lo excluyen. Los filtros se combinan por AND, sin ampliar consultas contradictorias.

Importes como texto decimal exacto. debtDesc/debtAsc y minDebt/maxDebt requieren exactamente un currencyCodes explícito: ordenan registros, no facturas/clientes. currencies solo filtra símbolos, sin identificarlos como divisa. No se convierten ni suman monedas diferentes. Se mantiene route/controller → ejecutor → service → repository → Oracle.

## Evidencia afectada

Aplicación, pruebas y ejecutor ejecutados en **0c34985c7699f1b43106233af67362b0fef77436**, candidato limpio extraído del commit y cotejado por manifiesto en directorio temporal, sin reemplazar el listener desplegado. Los cambios posteriores son documentación/evidencia.

- [Perfil](invoice-balances-oracle-profile-91e24c4.json), SHA-256 `b27667788765b543c658ed7caeaad5c974f642fc4a65fee32c58d17579163fc4`.
- [Oracle/HTTP sanitizado](invoice-balances-oracle-http-0c34985.json), SHA-256 `67a150e2d19d469a8f45fcf08ceb1fe87b1c3bf9458f3bb62bce52a9e9c687e9`.
- **117 aserciones aprobadas**, no escenarios distintos: SQL independiente compara registros completos, serie, estado, deuda exacta y paginación; cuenta pares mediante GROUP BY independiente de la codificación del repositorio. Estados pending/settled/all/unknown y mismo número con series distintas tienen muestras reales. El perfil también confirma negativos excluidos.
- Siete POST efímeros: sesión inválida antes del SDK, búsqueda/detalle, página siguiente sin modelo, settled/all/unknown y denegación inyectada. Router/controller/ejecutor/servicio/repositorio reales, Oracle proxy, SDK controlado. Seis llamadas SDK, cero proveedor/PDF.
- **25/25 pruebas locales afectadas**, Node 22.23.5 (también pasan en Node 24 local): estados, mismo número/distintas series, parejas exactas, duplicados preservados, PII, presentación, selección, paginación y cierres HTTP. Sin suite completa.

Referencia 12/11/2026 America/Asuncion; contraste 19:34:26–19:34:49 UTC (16:34:26–16:34:49 local). DD/MM/YYYY confirmado en el perfil anterior, cuyo recorrido no se repitió. CASE del repositorio sin cambios; SQL independiente usa VALIDATE_CONVERSION y antigüedad calculada aparte en JavaScript. Fechas nulas/inválidas quedan undated. asOfDate clasifica deuda actual, sin reconstruir historia.

Con pending faltaron positivos de hoy, futuros, undated, hoy inclusivo y próximos siete días: vacíos conciliados, sin cobertura positiva. Vencidos y antigüedad de 30 días sí tuvieron muestras. Conversiones DUAL anteriores conservadas como historia, sin repetición.

## Seguridad y reservas

SERIE_FACTURA usa INVOICE_SERIES con las reglas de seudonimización/restauración de identificadores de factura: campos, arrays, parejas estructuradas y patrón textual «serie de factura …». Entrada, resultados ante SDK e historial protegidos; respuesta final restituye datos autorizados y escapa Markdown, incluida la serie. Reportes sin filas ni identificadores reales.

PostgreSQL/USER/SESSION_USER y proxy conciliados; username no confiable de HTTP ignorado. Sesión inexistente: 404 antes del SDK. **Denegación real pendiente por falta de muestra/identidad**: ORA-01031 inyectado en conexión real solo acredita manejo del error sin datos/acciones, no una cuenta realmente denegada.

Cierres: perfil 1/1, validación 8/8 conexiones, sin errores; driver restaurado, pool del worker y servidor efímero cerrados, conversación propia limpiada, logout aprobado. Logs sanitizados: chatbot sin nuevas líneas, ERP solo dos metadatos de autenticación. Imagen/arranque habitual intactos. Sin modificaciones de datos de negocio, permisos o expiraciones.

Pendientes: granularidad/aditividad, denegación real, muestras temporales indicadas y colisión real de símbolo entre monedas (solo cobertura local). ANX123 y muestra mixta Oracle de PR #50 conservan sus reservas independientes.
