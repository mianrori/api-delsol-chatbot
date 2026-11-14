# PR #52 fusionada y desplegada en Docker DEV

Merge autorizado **9fa4504a83dc2b39354fa0084150d2c9191515be**, head revisado **1112676**. La rama local `feature/chat-sales-pilot` se actualizó por avance rápido. El código ejecutable del merge coincide con el candidato **36c72b7**, validado previamente con 96/96 pruebas afectadas; 1112676 solo añade documentación/evidencia. No se repitieron esas pruebas ni suites completas.

Solo chatbot fue reconstruido/recreado con `docker compose -f docker-compose.dev.yml up -d --build chatbot`. Imagen `sha256:608b4e43be90a8084591789c96dac49fe0c28a3a1306081c5d75a9e48aae6caf`, arranque 13/11/2026 **10:55:24 America/Asuncion** (13:55 UTC). Salud 200, development, PM2 online, cero reinicios, Node 22.23.5; sin errores de arranque detectados. Cuatro líneas de arranque reconocidas por sus patrones exactos de metadatos PM2/servidor; los restantes metadatos de inspector también pasaron el auditor estricto existente. ERP no se reconstruyó.

**258 archivos** desplegados de aplicación/configuración/ejecutores coinciden con el merge; manifiesto SHA-256 `b841e4a19a58b44526be94d478c6e7a5957106d15f3c1c39286bea19d59445d7`. Se cotejaron **13 módulos cargados** del proceso real, incluidos el clasificador de resultados, ambas rutas de pendientes, selección/contexto, PII, ejecutor, presentación, repositorios, servicios, sesiones y controller.

## Control en el endpoint habitual 5400

[Reporte sanitizado](invoice-pending-live-9fa4504.json), SHA-256 `f563c074c7635ff51d3fd208680bc0512f86b36f583610213a2e26377c43b820`. Control 13/11/2026 **11:05:06–11:05:49 America/Asuncion** (14:05 UTC). **226 comprobaciones correctas, tres POST en `5400/chatbot/api/bot/chat`**, sin listener alternativo ni respuestas de herramienta simuladas:

1. Consulta general real con `get_invoices`, cliente confirmado, concepto y período anual de emisión. La cohorte se obtuvo con SELECT de la misma identidad sobre vistas autorizadas y sin registros restringidos en ese alcance. Se preparó exclusivamente el contexto nominal de la conversación propia con esos IDs confirmados y se envió la elección determinista «1». El conteo y la presencia de filas se conciliaron con SQL independiente.
2. Seguimiento literal **«solo las pendientes»**, sin preparar otro contexto entre ambas consultas. Ejecutó únicamente `get_invoice_balances` sobre `VW_BOT_FACTURAS_SALDOS`, con **`DEUDA > 0`**, el mismo cliente y sin fechas de emisión, concepto, matrícula, período o estado de anulación heredados. Página 1, 20 registros por página.
3. **«Siguiente página»** real del resultado anterior, sin contexto/paginación sembrados entre las páginas. Se conservó el alcance de saldos y se consultó la página 2 con 20 registros por página. La muestra real tuvo segunda página; no se usó el mecanismo adicional preparado de una fila del ejecutor.

Se inspeccionaron herramienta, argumentos efectivos, SQL y binds del proceso. El SQL independiente de pendientes leyó la vista por cliente y deuda positiva, ordenó por vencimiento válido y los desempates contractuales y comparó cada página: total de registros, filas devueltas, número de página, tamaño, total de páginas, hasMore y nextPage. No se reutilizó IMPORTE de facturación para responder deuda.

Por registro se conciliaron serie, número, cliente, vencimiento, código de moneda y deuda decimal exacta; se comprobaron los valores presentados y todas las filas de la tabla. La respuesta de pendientes no contiene tokens PII internos, PDF ni acciones heredadas, explica que son importes actuales y que no se suman ni mezclan monedas. No se deduplicó ni se calculó un total monetario nuevo. No se publican identidades, filas, sesiones ni importes de negocio.

## Cero proveedor y cierre

La consulta general usa contexto confirmado preparado y elección determinista; el seguimiento y la página 2 usan las rutas reales del servicio. Se bloqueó preventivamente `send` del SDK en memoria durante el control. **Cero intentos/llamadas/eventos Bedrock o proveedor**, sin sustituir respuestas del SDK ni resultados de herramientas. No acredita interpretación libre de una consulta general por un modelo real. No hubo descargas PDF.

Identidad verificada: sessionId de login ERP → PostgreSQL → USER Oracle y PROXY_USER. **Proceso: 3/3 conexiones cerradas; Oracle independiente: 1/1**, sin errores de cierre. Driver y SDK restaurados, conversación y PII propios limpiados, inspector propio cerrado y pool PostgreSQL del worker cerrado. Expiración comprobada sin cambios durante las consultas. Logout ERP confirmado tras un reintento del transporte existente, sin modificar expiraciones ni otras sesiones.

Logs stdout/stderr del intervalo: chatbot **38 líneas**, tres llamadas y tres resultados con payload oculto y sesión enmascarada, cinco metadatos de inspector, cero registros desconocidos o eventos Bedrock. ERP: **dos metadatos protegidos de autenticación**, auditoría aprobada. No se relajó el auditor de payloads ni se publicaron logs crudos.

Salud final **11:06:58 America/Asuncion**: HTTP 200/development, PM2 online/cero reinicios, misma imagen y arranque. El primer preflight había cotejado fuentes/módulos y cerrado inspector/pool sin conexiones Oracle, pero su último sondeo de salud no quedó confirmado en el helper. Un sondeo posterior devolvió 200; la ejecución final y la salud posterior quedaron confirmadas. No fue un fallo Oracle ni se repitieron regresiones de errores.

## Reservas y evidencia histórica

No se provocaron fallos Oracle, denegaciones ni resultados ausentes para repetir las 16 regresiones HTTP de errores: su evidencia sigue siendo **36c72b7**, con sesiones/Oracle simulados. Este control desplegado acredita el recorrido positivo general→pendientes y su segunda página, no todas las ramas de error ni todas las combinaciones de filtros.

Se conservan la falta de muestra Oracle de duplicados con distinta deuda, denegación real sin muestra, dimensiones/temporalidad sin positivo, colisión real de símbolos y casos independientes ANX123/muestra mixta de PR #50. No se repitieron perfiles, rankings ni resúmenes de PR #51. Los controles Oracle previos se mantienen ligados a sus commits y a sus partes no modificadas, sin suponer inmovilidad de los datos entre ejecuciones.

Los fallos globales históricos siguen separados: c6fcb4b tuvo los mismos 35 fallos Node 22 que su base, 17 por falta de `git` en la imagen; Windows/Node 24 fuera de rango tuvo los mismos 18 previos. No se ejecutó ahora una suite global ni se afirma que esté verde. [Comparación histórica](invoice-pending-test-comparison.json).

Los ejecutores diagnósticos y esta documentación se guardan en un commit posterior; no cambian la aplicación desplegada en 9fa4504. Solo hubo SELECT Oracle y ciclo normal de login/actividad/logout ERP; sin cambios de datos de negocio, permisos o configuración de expiraciones.
