# PR #53 fusionada y desplegada en Docker DEV

Merge autorizado **e4712614a1504eba46744da957c490b430206e5e**, head revisado **c7bd25e**. Rama local `feature/chat-sales-pilot` actualizada por avance rápido. El código ejecutable coincide con **879dcf2**, que tenía 118/118 pruebas afectadas; c7bd25e solo documenta. No se repitieron esas pruebas ni suites completas.

Solo chatbot se reconstruyó/recreó con `docker compose -f docker-compose.dev.yml up -d --build chatbot`; ERP no se reconstruyó. Imagen `sha256:89be5711d0841150ef2dd98620420e91aea5bead59737f21a1b30af145084bae`, arranque **13/11/2026 11:54:42 America/Asuncion** (14:54 UTC). Salud HTTP 200/development, PM2 online/cero reinicios, Node 22.23.5 y sin errores de arranque. Los metadatos de arranque e inspector pasaron los patrones estrictos, sin aceptar payloads arbitrarios.

**265 archivos** desplegados coinciden con el merge, manifiesto SHA-256 `68365c9a35db4d2f7d8fb38a61bb30588120a7658f5313450cb066ffa4ef7450`. Se cotejaron **15 módulos cargados** del proceso real, incluidos intención/clasificación/contexto, PII, presentación/paginación, estado de conversación, ejecutor, servicios/repositorios, sesiones y controller.

## Control positivo del proceso habitual

[Reporte sanitizado](invoice-settled-live-e471261.json), SHA-256 `5c389b8256515b5b526ce59437d42820f80e391a85afc9512436531a052436c2`. Control **13/11/2026 11:59:30–12:00:19 America/Asuncion** (14:59–15:00 UTC). **750 comprobaciones correctas, cinco POST en `5400/chatbot/api/bot/chat`**, sin listener alternativo, contexto/cursor sembrado ni resultados de herramientas simulados:

1. **«Mostrame las facturas de Impacto cuya deuda ya está cancelada»**: catálogo `search_invoice_balance_customers`, cliente resuelto y `get_invoice_balances`, `debtStatus="settled"`, **`DEUDA = 0`**, página 1/20. No `get_invoices`, `cancelled=true`, ANULADO ni filtro positivo.
2. **«Siguiente página»**: página 2/20 real del alcance settled anterior.
3. **«facturas pendientes»**: mismo cliente confirmado, `get_invoice_balances`, `debtStatus="pending"`, `DEUDA > 0`, página 1/20. La muestra tuvo registros positivos.
4. **«ahora las canceladas»**: mismo cliente, sustitución del estado pending por settled, **`DEUDA = 0`**, página 1/20, sin filtros incompatibles de facturación.
5. Se recortó realmente el historial de la conversación propia con la función de producción tras introducir doce pares de mensajes de prueba. Se verificó que ya no quedaran referencias de herramientas y que el cursor protegido conservase settled/nextPage=2. **«Siguiente página»** consultó directamente la página 2/20 real, sin reemitir la consulta ni fabricar contexto o resultados.

En cada página se inspeccionaron herramienta, argumentos efectivos, SQL y binds del proceso. SQL independiente de la misma identidad filtró la vista por cliente y estado (`=0` o `>0`), calculó el conteo y ordenó por vencimiento válido y desempates contractuales. Se conciliaron filas, serie, número, cliente, vencimiento, código de moneda, deuda decimal exacta y estado; también totalRows, returnedRows, page, rows, totalPages, hasMore y nextPage. No se usó IMPORTE de facturación como deuda.

Se comprobaron todas las filas de cada tabla mostrada, valores restaurados sin tokens PII internos, ausencia de acciones generales y la aclaración de que deuda cancelada no significa factura anulada. Hubo filas reales de deuda cero y las páginas 1 y 2 tuvieron resultados; **el conjunto tiene más páginas y no se recorrió íntegro**. La ausencia sigue cubierta por simulación, no se fabricó una ausencia Oracle real. Los conteos son de registros, no una declaración nueva de unicidad de facturas ni una suma monetaria.

## Proveedor, cierres y logs

No se invocó un modelo real ni un SDK simulado: las frases y la paginación siguieron las rutas deterministas del proceso desplegado. Se bloqueó preventivamente `send` del SDK en memoria durante el control, con **cero intentos/llamadas/eventos Bedrock o proveedor**. No se descargaron PDF. Esto no certifica interpretación de un modelo real fuera de la gramática acotada.

Identidad sessionId → PostgreSQL → USER Oracle/PROXY_USER verificada. **Proceso: 6/6 conexiones cerradas; independiente: 1/1**, sin errores de cierre. Driver y SDK restaurados; conversación, PII y cursor propios eliminados; inspector propio y pool PostgreSQL del worker cerrados. Expiración comprobada sin cambios durante consultas. Logout ERP confirmado con el reintento de transporte previsto, sin modificar otras sesiones ni expiraciones.

Auditoría de stdout/stderr del intervalo aprobada: chatbot **71 líneas**, seis llamadas/seis resultados con payload oculto y sesión enmascarada, cinco metadatos de inspector; cero errores de permisos, registros desconocidos o eventos Bedrock. ERP: dos metadatos protegidos de autenticación. No se publican filas, nombres obtenidos de vistas, identidades, sesiones, credenciales ni importes de negocio.

Salud final **12:01:06 America/Asuncion** (15:01 UTC): HTTP 200/development, PM2 online/cero reinicios, misma imagen y arranque. El preflight también pasó sin conexiones Oracle ni consultas de negocio.

## Reservas y cobertura conservada

Esta ejecución añade evidencia Oracle real del literal, el cambio pendientes→settled y las páginas 1/2, incluida la continuación tras recorte. No sustituye las 118 pruebas enfocadas de 879dcf2 ni las 143 comprobaciones originales de la API candidata. No se provocaron errores, denegaciones, ambigüedades o ausencias para repetir regresiones; esas ramas mantienen su evidencia simulada. No se repitieron perfiles, resúmenes, rankings, inspecciones administrativas ni suites completas.

Se conservan duplicados con deuda distinta sin muestra Oracle, denegación real sin muestra, dimensiones/casos temporales no ejercitados, colisión real de símbolos y los casos independientes ANX123/muestra mixta de PR #50. No se deduplicó ni se habilitó ningún cálculo nuevo. Los fallos globales históricos de c6fcb4b siguen separados (35 Node 22, incluidos 17 por falta de git; 18 Windows/Node 24 fuera de rango); no se afirma que la suite global esté verde.

Los ejecutores diagnósticos y la evidencia se guardan después del merge; no cambian la aplicación desplegada en e471261. Solo hubo SELECT Oracle y el ciclo normal de login/actividad/logout ERP, sin cambios de datos de negocio, permisos o configuración de expiraciones.
