# Deudas de facturas: candidato en borrador

> **Regla más reciente:** [cálculos condicionados a integridad del alcance](invoice-balances-integrity-contract.md), candidato 8420e82. Sustituye el bloqueo global de agregaciones de los documentos anteriores. PR en borrador.

> **Contrato vigente:** [SERIE_FACTURA y estados confirmados de DEUDA](invoice-balances-series-contract.md). Las secciones siguientes son historia de la validación de diez columnas en 11a4316. Se sustituyeron sus reglas de signos y nombres de argumentos: negativos siempre excluidos, pending predeterminado, settled cero y all/unknown con nulos explícitos. Serie/número sigue sin demostrar unicidad; agregaciones bloqueadas. Evidencia actual: 0c34985, 117 aserciones Oracle/HTTP y 25 pruebas locales.

## Contrato vigente y alcance

El usuario cambió la vista durante la validación: añadió COD_MONEDA y renombró SALDO a DEUDA. Oracle DEV confirmó diez columnas en VW_BOT_FACTURAS_SALDOS; COD_MONEDA es VARCHAR2 y DEUDA es NUMBER(18,2). No existe USER_CAN_CONSULT. El candidato actual usa exclusivamente DEUDA y el código nativo de moneda; no aplica un predicado de permisos inventado ni consulta otra vista de negocio.

Arquitectura: ruta/controller de chat → ejecutor → servicio → repositorio → Oracle. La identidad Oracle se resuelve desde sessionId en PostgreSQL y se conecta mediante proxy. El frontend no elige username. Todas las conexiones se cierran y no se persisten.

Herramientas:
- search_invoice_balance_customers: búsqueda acotada por nombre, razón social, RUC o código, sobre esta misma vista. Resuelve o devuelve opciones; no elige una coincidencia ambigua.
- get_invoice_balances: registros individuales paginados, filtros por cliente, número exacto, sector, etiqueta de símbolo, COD_MONEDA, signo de DEUDA, vencimiento y días de atraso. Devuelve deuda como texto decimal exacto, incluso fuera de la precisión de Number; no redondea centavos mediante conversión binaria.

currencyCodes filtra COD_MONEDA, de tipo VARCHAR2; currencies solo filtra etiquetas SIMBOLO_MONEDA y nunca identifica divisas. Los importes individuales pueden ordenarse con balanceDesc/balanceAsc o filtrarse por minBalance/maxBalance únicamente con un código nativo explícito. Ese orden clasifica registros, no facturas o clientes. No se convierte moneda ni se interpreta el código nativo como código ISO.

**Resumen, totales monetarios y rankings agregados por cliente permanecen bloqueados con REQUIRES_SOURCE_IDENTITY.** Añadir COD_MONEDA resuelve la identificación de divisa, pero no demuestra que cada fila sea aditiva ni la clave única de factura. No se sustituyen esas funciones por sumas del modelo, símbolos, páginas ni deduplicaciones arbitrarias.

matchedInvoiceNumbers cuenta cadenas NRO_FACTURA distintas, no entidades factura. totalRows cuenta registros. matchedCustomers cuenta COD_CLIENTE distintos. Un identificador nulo no se cuenta como identificado; su fila permanece en el conteo de registros. La presentación conserva estas diferencias y muestra el código de moneda junto al símbolo, sin normalizar etiquetas ni mezclar importes.

## Evidencia Oracle y significado de los datos

Perfil vigente: **ad38d3a832561dded027e8e6fb0a54e72be2e6d1**. Contraste SQL/servicios/HTTP: **11a4316035466bbd4b17a337cd0250629e097ef7**, Node 22.23.5, candidato aislado de 339 archivos cotejados por hash. Manifiesto SHA-256: c339f7988fe8c814a6b86948e13daa4ffd6af2eeaa3c6d6a6d3dec3eb3c8235c.

- Los valores distintos de VENCIMIENTO observados se recorrieron completos: todos los no vacíos admiten DD/MM/YYYY; no hubo formato ISO, nulos, blancos ni inválidos. Esto es evidencia de la vista visible con esa identidad y en ese momento, no una garantía de todos los datos futuros.
- Hay DEUDA positiva, cero, negativa y nula. Se confirmó el valor/signo técnico, no una regla contable de cancelación, crédito, devolución o pago. El cambio de nombre no establece por sí solo esas reglas; siguen pendientes de definición funcional.
- NRO_FACTURA se repite por cliente, sector, símbolo y COD_MONEDA. También se repite la combinación NRO_FACTURA/COD_CLIENTE/SECTOR/COD_MONEDA. No se observaron filas idénticas de los diez campos entre registros con número no nulo; esa comprobación no abarca números nulos ni prueba una clave de negocio. **La granularidad funcional/aditividad de cada fila sigue sin estar acreditada.**
- En la muestra no apareció un mismo símbolo con varios códigos ni un código con varios símbolos. La ausencia observada de esa colisión no autoriza usar el símbolo como clave. Una prueba sintética local conserva dos códigos con el mismo símbolo sin colapsar registros ni sumar importes.

La definición de esta vista fue legible, pero no acreditó el significado funcional de signos o la clave aditiva. No se publican propietarios, definiciones, filas, nombres, códigos de clientes, RUC, importes ni números reales de factura. No se recorren catálogos administrativos ni tablas base para completar información fuera del contrato.

## Contraste independiente y fecha

Control vigente: **104 aserciones aprobadas**, no 104 escenarios únicos, con SQL independiente y lectura real de Oracle DEV. Ejecución: 12 de noviembre de 2026, **16:01:18–16:01:51 America/Asuncion** (19:01:18–19:01:51 UTC).

Se extrajo 12/11/2026 mediante Intl con America/Asuncion; la aritmética posterior usa días calendario UTC para evitar depender de la zona de la sesión Oracle. No se usa SYSDATE como sustituto. asOfDate clasifica vencimientos del importe actual; no reconstruye deuda histórica.

Se conciliaron:
- primera y segunda página, filas completas, centavos exactos, códigos de moneda y conteos separados de registros/números/clientes;
- vencidos y próximos vencimientos con muestras positivas;
- DEUDA positiva, cero, negativa y nula con muestras positivas;
- antigüedad por tramos y atraso mínimo de 30 días, calculados independientemente en JavaScript;
- filtros inclusivos de hoy y mañana–siete días, con resultados vacíos conciliados;
- búsqueda exacta y ausencia; el alcance HTTP se volvió a conciliar sin presuponer inmutabilidad de datos;
- ranking de registros con un COD_MONEDA real y orden numérico Oracle independiente, sin comparar divisas;
- bloqueo de sumas, resumen, ranking de clientes y orden monetario sin código de moneda.

El SQL independiente usa VALIDATE_CONVERSION en DEV y el repositorio CASE anidados antes de TO_DATE. Fechas nulas, blancas, inválidas y bisiestos se contrastaron con SELECT sobre DUAL y la expresión real del repositorio, sin crear ni modificar registros. El servicio rechaza fechas de entrada inválidas antes de consultar. En los datos, una fecha no válida queda undated; no se inventa una fecha ni se trata como vencida. DEUDA nula permanece desconocida, no cero.

## PII, permisos y cierres

Cuatro POST al listener HTTP temporal del candidato, con router/controller/servicios/repositorios reales y Oracle proxy:
1. sessionId inexistente: 404 antes del modelo y sin acceso a datos;
2. búsqueda y detalle autorizado: identidades protegidas en la entrada y en las respuestas de herramientas que ve el SDK controlado;
3. siguiente página: filtros y referencia preservados, sin otra llamada al modelo;
4. error ORA-01031 inyectado únicamente en execute de una conexión de prueba: respuesta exacta de denegación, sin datos ni acciones.

La identidad de PostgreSQL coincide con USER/SESSION_USER Oracle y hay PROXY_USER. El username enviado en el cuerpo HTTP se ignora. **No se suministró una identidad realmente denegada sobre la vista**: el cuarto POST prueba el manejo de errores, no una muestra real de permisos revocados. No se conceden ni revocan permisos para generar positivos.

PII estructural de nombres, razón social, RUC, cliente y número de factura protegida; comprobaciones del intercambio con el SDK y del historial sin esos valores en claro; respuesta final conserva los datos autorizados y escapa Markdown. Los códigos de moneda clasifican divisas y no se tratan como identidad personal. El modelo real/proveedor no se invocó: tres llamadas a SDK controlado, cero proveedor y cero PDF.

Cierre vigente: **5/5 conexiones**, driver restaurado, pool PostgreSQL del worker cerrado, servidor temporal cerrado, conversación propia limpiada y logout ERP confirmado. El worker suprime sus payloads en consola; logs de servicios auditados: chatbot sin líneas nuevas, ERP dos líneas exclusivamente de metadatos protegidos, cero registros desconocidos o eventos Bedrock. Imagen y arranque del contenedor habitual permanecieron iguales. No es una validación del listener desplegado 5400 ni de interpretación por modelo remoto.

Los logs del producto conservan metadatos, ocultan payloads incluso con flags de depuración y no registran valores originales de transformaciones PII. Las conexiones no se almacenan en PostgreSQL/Redis. Solo hubo SELECT y el ciclo normal de login/actividad/logout; el agente no hizo DDL, cambios de datos de negocio, permisos ni expiraciones.

## Reservas y trazabilidad

| Reserva | Estado |
| --- | --- |
| Clave única de factura y aditividad de filas | Pendiente; resumen y sumas/rankings agregados bloqueados. |
| Significado contable de cero/negativo | Pendiente; solo signo técnico confirmado. |
| Vencimiento hoy y próximos siete días | Sin muestra positiva; vacío conciliado. |
| Vencimiento nulo/inválido | Ausente en la vista observada; SQL sintético DUAL aprobado. |
| Colisión de símbolos entre códigos nativos | Sin muestra real; prueba sintética local aprobada. |
| Identidad realmente denegada sobre esta vista | No disponible; sessionId inválido real y error inyectado comprobados. |
| Generalidad fuera de esta identidad/momento | No acreditada; no se presume visibilidad global o datos inmutables. |

[Perfil vigente](invoice-balances-oracle-profile-ad38d3a.json), SHA-256 **b6746c5951b21785849eaa99d9e5d2165bfa3980dc01a5e6c69e7bd9427eefe4**.
[Control vigente](invoice-balances-oracle-http-11a4316.json), SHA-256 **9fe4733b6b1bec61e937e927eaed4a9114213a26f21285bf6d4e841de049db85**.

Se conservan como **historia del esquema anterior**, sin presentarlos como prueba de COD_MONEDA/DEUDA:
- perfil 1a28511 y control parcial c2541f4, que se detuvo por ORA-01036 en el SQL independiente de undated (bind sobrante), con cierres y logout;
- continuación b6a08c3, 80 aserciones aprobadas sobre SALDO, antes del cambio de esquema confirmado/aplicado por el usuario.

El defecto del ejecutor se corrigió antes del contraste vigente; este completó todos los casos de la nueva versión. Los dos logins anteriores terminaron con logout. No se mezclan las aserciones históricas con las 104 vigentes como si fueran escenarios independientes.

Pruebas enfocadas finales: **23/23 con Node 22.23.5**, Oracle y SDK simulados, incluida colisión de símbolos y conservación de centavos grandes. No se repitieron suites completas. Las 53 pruebas del primer candidato son evidencia histórica, no el conteo de la versión actual. Las últimas modificaciones posteriores a 11a4316 son de pruebas/documentación; el código de aplicación contrastado permanece idéntico.

**PR en borrador, sin merge ni despliegue.** Las reservas históricas de ANX123 y muestra mixta de la PR #50 permanecen separadas e intactas.
