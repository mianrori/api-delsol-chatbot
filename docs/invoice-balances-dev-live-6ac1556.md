# PR #51 fusionada y desplegada en Docker DEV

Merge autorizado **6ac1556fbb916ab09f266303f396c76a98681db3** de PR #51, head revisado 470fc91. Rama local feature/chat-sales-pilot actualizada por avance rápido. El merge no altera la aplicación respecto al candidato 8420e82. Solo chatbot reconstruido/recreado mediante `docker compose -f docker-compose.dev.yml up -d --build chatbot`; ERP no se reconstruye.

Imagen `sha256:645cde618118f18b1d2bca8874d0e0f398c732684470c99d4ad5a694e18222fd`, arranque 12/11/2026 16:58:25 America/Asuncion. Salud 200 antes/después del control, development, PM2 online/cero reinicios al comprobar arranque, Node 22.23.5, sin errores de arranque detectados. 248 fuentes de aplicación/configuración/ejecutores de /app coinciden con el merge; manifiesto SHA-256 `0f681a05fa220199d0ad7ba69ee632c6701ba5c2f3e6104cbca69ee0d6db71d5`. Siete módulos cargados cotejados por inspector loopback, incluido repositorio, servicio, chat, presentación y PII.

[Reporte sanitizado](invoice-balances-live-6ac1556.json), SHA-256 `8277910c4c7a3c1cae5079d47c753492d4d12d24482723e9bc320d3171590d1e`. Control HTTP/Oracle: **17:05:00–17:05:07 America/Asuncion**, referencia 12/11/2026 Asunción.

## Comprobaciones del proceso desplegado

**21 aserciones aprobadas**, cinco POST al endpoint habitual `5400/chatbot/api/bot/chat`, sin listener alternativo ni SDK simulado:

1. Detalle pendiente, primera página de dos registros; total y filas contrastados con SQL independiente sobre el mismo conjunto de pares exactos.
2. Segunda página real del mismo alcance, sin nueva preparación de contexto; comparados serie, número, deuda exacta y paginación, sin tokens PII residuales en la respuesta.
3. Agregación sobre identidades limpias y completas: suma decimal y conteo por COD_MONEDA conciliados con GROUP BY independiente, sin mezclar monedas.
4. Alcance con identidades repetidas: INCONSISTENT_HISTORY, cálculos ausentes e invoiceCount null, con explicación de históricos inconsistentes.
5. Detalle del mismo alcance repetido: número de registros conciliado con COUNT(*) independiente, filas conservadas, conteo de facturas no calculado y advertencia visible.

Se verificó sessionId → PostgreSQL → usuario Oracle/proxy. El SQL independiente lee solo la vista autorizada y DUAL, sin catálogos administrativos ni tablas base. Las identidades limpias se seleccionan comprobando todas sus versiones elegibles, no solo su página; las negativas permanecen excluidas. No se modificaron datos históricos, permisos o expiraciones.

Para garantizar cero proveedor se preparó exclusivamente el historial temporal de la sesión propia con argumentos protegidos para el flujo determinista «Siguiente página». Ese flujo ejecutó router/controller/servicio/repositorio del proceso desplegado y Oracle real. Se bloqueó preventivamente send del SDK en memoria; **cero intentos, llamadas y eventos Bedrock/proveedor**, sin sustituir respuestas del SDK ni resultados de herramientas. **No acredita interpretación de lenguaje natural ni uso de un modelo real**. La siguiente página se consultó desde el historial producido por la primera respuesta.

## Limpieza, diagnóstico y logs

Conexiones del proceso 5/5 y Oracle independiente 1/1 cerradas, sin errores. Driver y método SDK restaurados, conversación propia limpiada, pool PostgreSQL del worker cerrado, inspector propio cerrado y logout aprobado. Consolas protegidas propias cerradas.

Un primer intento falló en el cargador diagnóstico del inspector antes de abrir conexiones Oracle o hacer las consultas HTTP. Se corrigió el cargador sin cambiar la aplicación; ese intento cerró inspector/pool e hizo logout, por lo que el control posterior requirió nuevo login protegido. Su cierre y auditoría se conservan en interruptedAttempt del reporte.

El auditor anterior cargado por el helper no reconocía los nombres de las herramientas nuevas. Se añadieron solo esos nombres explícitos, conservando los esquemas estrictos: payload oculto, sesión enmascarada, sin campos extra; una prueba local específica confirma aceptación de metadatos y rechazo de payload sensible/campos extra/nombres desconocidos. Se reauditaron stdout y stderr de las mismas ventanas, **sin repetir HTTP ni Oracle**. initialLogAudit conserva el rechazo original; logAudit documenta la conciliación correcta y auditorSha256 identifica el auditor utilizado.

Auditoría final: chatbot 60 líneas, cinco llamadas/cinco resultados con payload oculto, cinco líneas de metadatos del inspector, cero registros desconocidos y cero eventos Bedrock. ERP: dos metadatos protegidos de autenticación. El intento interrumpido tuvo solo cinco líneas de inspector y dos metadatos ERP, sin datos sensibles. No se publican filas, identidades, credenciales, sesiones ni importes de negocio. Cero PDF.

## Reservas conservadas

No se repitieron suites completas, las 117/26 aserciones anteriores ni inspecciones administrativas; solo este control desplegado y una prueba local del auditor. Siguen pendientes la muestra Oracle de duplicados con deudas distintas, dimensiones/combinaciones no ejercitadas realmente, denegación real sin muestra, casos temporales sin positivo y colisión real de símbolos entre monedas. La prueba actual de resumen solo cubre totales por moneda; no se presenta como nueva validación de todos los rankings. ANX123 y muestra mixta Oracle de PR #50 siguen pendientes independientes.

Los documentos que indican borrador/lista para revisión describen estados anteriores de PR #51. Está fusionada y desplegada por instrucción posterior, sin que eso resuelva las reservas. El commit de evidencia posterior añade ejecutores diagnósticos/documentación y la ampliación estricta del auditor; no cambia la aplicación desplegada.
