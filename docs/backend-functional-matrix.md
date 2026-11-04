# Alcance y evidencia del backend del chatbot

Corte: **03/11/2026**, código `6b1303e` (PR #35 fusionada y desplegada en DEV).
Esta revisión solo lee código y evidencia existente; no ejecuta suites ni consultas
de negocio, no modifica datos o expiraciones y no incluye integración frontend/ERP.

Actualización de segmentación, 04/11/2026: PR #36 en borrador. Baseline Oracle
`6b1303e`, 108/108 comprobaciones ejecutadas aprobadas; ejecución incompleta por
sesión inactiva antes de la denegación, sin HTTP. Correcciones con 37/37 pruebas
en Node 22; etapa Oracle/HTTP acotada pendiente sobre el commit corregido.

## Comparación con el chat original

Se compararon los registros `src/tools/index.js` y los nombres de sus herramientas:

- Original: [api-delsol-erp/main](https://github.com/mianrori/api-delsol-erp/blob/main/src/tools/index.js),
  leído también por el conector GitHub el 03/11/2026; blob
  `5fe00368fdb4075e371a9b1c8c87a17dbe02d284`. Coincide con el registro de la
  referencia local `main`, commit `5ee554ddf3cd58ed553630ccb652147ae616cc39`.
  No se usa como referencia la rama de trabajo local del ERP.
- Actual: [registro](../src/tools/index.js) y
  [dispatcher](../src/services/ai/toolExecutor.service.js) de `6b1303e`.
- **25 herramientas originales, 26 actuales, ninguna original ausente.**
  La adicional es `get_sales_per_sqm`. Las 26 tienen handler; gráficos usa una
  fuente ya consultada y las operaciones Oracle usan el proxy del `sessionId`.
  Esto confirma registro e implementación enlazada, no equivalencia exhaustiva
  de resultados, parámetros ni todas las formas de conversación.

Hay adaptaciones deliberadas del contrato de herramientas, no módulos sin migrar:

| Cambio respecto al original | Comportamiento actual |
| --- | --- |
| `get_member_purchases`, `get_member_promo_purchases`: `limit` | Sustituido por `page`/`rows`; no prometer compatibilidad literal con el antiguo parámetro. Compras individuales todavía expone `knownTotalRows`; su recorrido está probado, pero no extrapolarle la eliminación del parámetro hecha en promociones. |
| `generate_chart`: `labels`, prefijos/sufijos y valores suministrados | Etiquetas/series extraídas de resultados con `sourceToolUseId`, `dataPath`, `labelPaths`, `valuePath`; no acepta reconstruir datos arbitrarios del modelo. Las unidades se determinan desde la fuente. |
| `search_promotions` | Añade `page`/`rows` y total real del catálogo. |
| `search_invoice_customers` | Añade fechas para buscar clientes facturados del período. |
| `get_vehicle_registrations` | Añade filtros demográficos/vehiculares y referencia de edad. |
| `analyze_contract_cost_incidence` | Añade selección contractual exacta y local. |
| `get_soles_usage` | Añade alias `rows` para tamaño de página. |

No se identificó una capacidad original sin implementar a partir del registro y
dispatcher. Sí faltan verificaciones delimitadas abajo. No se propone reintroducir
contratos inseguros ni crear herramientas nuevas para declarar paridad nominal.

## Cómo leer la evidencia

**Controlada** significa pruebas con dobles/filas sintéticas; **HTTP** comprueba
respuestas reales; **Oracle independiente** agrega/selecciona por un camino de
control distinto del repositorio. La coherencia entre respuestas o servicios no
equivale a contraste SQL independiente. Un paso HTTP aprobado no demuestra que
se haya invocado cada resolutor que podría intervenir en ese diálogo.

Los reportes privados están en `logs/`, ignorado por Git/Docker. Solo se publican
conteos, códigos y commits. No se copian sesiones, documentos, identidades, filas
ni importes del socio. Las letras siguientes identifican evidencia ya ejecutada:

| Ref. | Evidencia y commit validado | Límite de la atribución |
| --- | --- | --- |
| H | `review-b315ff9-http.json`: 24/24 pasos HTTP sobre `b315ff9`; ventas, filtros, comparaciones entre años, vehículos/género, barras/líneas, canjes/ventas y campaña antes/durante/después. | Validación HTTP con controles de esa suite; no auditoría independiente de todas las vistas o todos los resolutores. |
| B | `review-b315ff9-business.json`: 22/22 controles Oracle de facturación/condiciones/costo por m²; `coverage.costPerSqmCalculated=true`; `b315ff9`. | Conciliaciones entre consultas/servicios, no una reconstrucción independiente de todo el ERP; no pasa por chat. |
| D | `review-b315ff9-denied.json`: 21/21; dos usuarios reales distintos, rechazos Oracle/HTTP sin datos; `b315ff9`. | Las vistas/consultas ensayadas, no una enumeración de todos los permisos Oracle. |
| S | `chatbot-api-tests-soles.json`: 6/6 pasos; saldo por tipo/vencimiento, usos, varias páginas y vuelta al saldo. | Reporte sin SHA: **commit no acreditado**. HTTP/coherencia; sin control SQL independiente documentado. No marcar como nunca ejecutado ni atribuirlo al head. |
| P | `purchase-pagination-final.json`: 6/6 pasos, recorrido completo, conciliación y fin real; fase final de la corrección revisada como `b315ff9`. | La traza no incorpora SHA propio; conservar esta salvedad de trazabilidad. Conciliación detalle/resumen HTTP, no SQL independiente. La muestra usada tuvo 170 registros. |
| Q | `sales-per-sqm-final.json`: 114/114 Oracle/HTTP; código revisado `e317a8f`; despliegue `68847db`, 15/15 (`deployed-pr33-sqm.json`). | Tres seguimientos con contexto previo preparado; dos muestras DEV faltantes. Véase [detalle](sales-per-sqm-validation.md). |
| I | `contract-incidence-ties-final-summary.json`: 309/309 sobre `dcd9530`, incluidos 96 controles Oracle de empates; despliegue `8e80887`, 17/17. | Un caso DEV faltante; CTE de empates son controladas. Véase [detalle](contract-incidence-validation.md). |
| R | `promotion-purchases-final-summary.json`: 138/138 sobre `89a4e59`, 38 controles HTTP, 140 archivos candidatos idénticos; `3344728` solo documentación. Despliegue `6b1303e`, 13/13. | Once grupos monetarios y fallos de cierre son controlados; falta muestra real con varias monedas. Véase [detalle](promotion-purchases-validation.md). |
| X | `deployed-pr32-xlsx.json`: exportación real XLSX, 21/21 sobre `13e69ef`. | Evidencia específica de la exportación desplegada tras PR #32, no una nueva ejecución sobre `6b1303e`. |

Las validaciones históricas conservan su SHA: no se declaran recién ejecutadas
en la base actual. Las suites controladas de aquellas etapas incluyen 251 pruebas
en Q, 263 antes de la corrección I, 29 enfocadas de empates, y 23 enfocadas de R
más una del adaptador. Son ejecuciones diferentes, no un total acumulable de pruebas
únicas ni un número de casos de cada herramienta. No se repitieron en esta revisión.

## Matriz de herramientas

Todas están implementadas y registradas. La columna de implementación señala el
servicio/función llamado por el dispatcher; los nombres de tests son archivos
dentro de `test/`. **Sin acreditar** indica falta de evidencia, no fallo probado.

| Herramienta / funcionalidad | Implementación | Pruebas automatizadas existentes | Oracle / HTTP existente | Commit validado | Pendientes y variantes no verificadas |
| --- | --- | --- | --- | --- | --- |
| `search_customers` — locales | `customers/customer.resolver.js` | Ciclo/PII compartidos; sin suite dedicada del resolutor | H usa locales/filtros; Q usa lookup para seguimientos; no control independiente del catálogo completo | `b315ff9`, `e317a8f` indirectos | Exacta/parcial/ambigua/sin coincidencias y locales históricos: validación dirigida del resolutor. |
| `search_categories` — rubros | `categories/category.resolver.js` | Ciclo/PII compartidos; sin suite dedicada | H y Q ejercitan filtros de rubro; no contraste dedicado del catálogo | `b315ff9`, `e317a8f` indirectos | Ambigüedad, ausencia y selección inicial, sin extrapolar el filtro probado. |
| `get_sales` — ventas | `sales/sales.service.js` | `salesHistory`, `salesSeriesPresentation`, `salesYearComparison`, `salesExportFollowup`, `chatLifecycle` | H; lectura independiente de ventas dentro de Q/I para esos perfiles | `b315ff9`; Q/I para perfiles específicos | No todas las combinaciones de dimensiones/días/monedas; no repetir ventas generales ya aprobadas. |
| `get_sales_per_sqm` — ventas por m² (adicional) | `sales/salesPerSqm.service.js` | `salesPerSqm`, `chatLifecycle` | Q: historia contractual, superficies inválidas/ambiguas, filtros, FX y cierre | `e317a8f`; desplegado `68847db` | **Muestras DEV:** superficie cero y cambiante. Límites y cálculo ya controlados; lenguaje inicial no exhaustivo. |
| `search_members` — localizar socio | `members/member.resolver.js` | PII/ciclo; búsqueda simulada en `chatLifecycle`, sin suite dedicada del resolutor real | S/P/R usan documentos directos; no acreditan búsqueda nominal independiente | Sin SHA de validación dedicada | Nombre/documento, múltiples coincidencias y no encontrado con consulta independiente y privacidad. |
| `get_member` — ficha de socio | `members/member.service.js` | Cobertura PII transversal; sin suite dedicada identificada del servicio | Sin evidencia específica de ficha real contrastada | Sin acreditar | Perfil encontrado/ausente, campos nulos y mínima exposición autorizada. |
| `get_member_purchases` — compras individuales | `members/member.service.js` → repositorio `members/memberPurchase.repository.js` | `memberPurchasesPagination`, `memberPurchasesPresentation`, `apiMemberPurchases`, `chatLifecycle` | P: detalle completo/resumen, filtros y fin real; no lectura SQL independiente acreditada | Fase `b315ff9`; traza sin SHA propio | Contraste SQL independiente del socio/período; segunda muestra positiva y variantes monetarias no acreditadas. |
| `search_promotions` — promoción/campaña | `promotions/promotion.resolver.js` | `promotionSearch`, `memberPromoPurchases`, `chatLifecycle` | R: conteo/catálogo paginado independiente, ambigüedad y opción explícita; H búsqueda previa | `89a4e59`; desplegado `6b1303e` | Fallback aproximado controlado, sin muestra real independiente de todas sus coincidencias; redacción inicial no exhaustiva. |
| `get_member_promo_purchases` — compras promocionales | `members/memberPromoPurchase.service.js` | `memberPromoPurchases`, `promotionHardeningHarness`, `chatLifecycle` | R: siete páginas reales, multiconjunto y resumen, filtros/selección/seguimientos; denegación/cierre | `89a4e59`; desplegado `6b1303e` | **Muestra DEV:** socio con varias monedas; grupos ambiguos ya controlados en Oracle CTE. Segundo socio positivo no acreditado. |
| `get_member_vehicles` — vehículos del socio/chapa | `members/memberVehicle.service.js` | `vehicleRegistrations`, PII y ciclo | H comprueba registros agregados, no la búsqueda real de dueño por chapa | Sin validación DEV dedicada acreditada | Chapa única/múltiples socios, documento, débito/activo y ausencia: contraste real dirigido. |
| `analyze_members` — segmentación/ranking | `members/memberAnalysis.service.js` | `memberSummary`, `memberGroupedSummary`, `memberSummaryFollowup`, `memberSummaryPresentation`, `memberRankingPresentation`, `memberAnalysisFollowup`; nuevos `memberSegmentation`/`memberSegmentationControl`; 37/37 enfocadas de la candidata | [Baseline](member-segmentation-validation.md): 108/108 comprobaciones ejecutadas; nulos demográficos reales; etapa acotada Oracle/HTTP pendiente | Baseline `6b1303e`; no atribuirlo al código corregido | Conservar evidencia de conteos/importes/rankings/ALL-ANY ya contrastados. Faltan correcciones en CTE Oracle, rutas acotadas afectadas, contexto HTTP y denegación con sesiones vigentes. Muestra real de segmentación con varias monedas no encontrada en perfiles ensayados. |
| `compare_member_purchases_vs_sales` — canjes/ventas | `members/memberPurchasesVsSales.service.js` | `memberPurchasesVsSales`, `chatLifecycle` | H: meses/total/cambio de período; coherencia HTTP | `b315ff9` | SQL independiente de ambos universos con mismos filtros; otras monedas/denominador cero ya controlados, no muestra real acreditada de cada variante. |
| `generate_chart` — gráficos | `charts/chart.service.js` | `charts`, `chatLifecycle` | H: barras/líneas de ventas, SVG y fuente | `b315ff9` | HTTP de barras horizontales/circular, varias series/fuentes y datos de otras herramientas no acreditado; no exige Oracle al graficar. Revisión frontend excluida. |
| `analyze_campaign_sales_performance` — antes/durante/después | `sales/campaignSalesPerformance.service.js` | `campaignSalesPerformance`, `chatLifecycle` | H: selección y comparación temporal | `b315ff9` | Control SQL independiente de tres períodos con filtros; variantes reales de ausencia/base cero/monedas diferentes no acreditadas. |
| `search_invoice_concepts` — conceptos facturados | `invoices/searchInvoiceConcepts.service.js` | Sin suite dedicada identificada del buscador | B prueba facturas/conceptos contractuales, no este buscador HTTP | Sin acreditar | Catálogo autorizado exacto/parcial/ambiguo/vacío y selección en chat. |
| `search_invoice_customers` — clientes facturados | `invoices/searchInvoiceCustomers.service.js` | Sin suite dedicada identificada | B usa un cliente obtenido por control; no valida este buscador | Sin acreditar | Nombre, período histórico y ausencia/ambigüedad; continuidad hacia facturas. |
| `get_invoices` — facturación | `invoices/invoices.service.js` | `invoices`, `chatLifecycle` | B: monedas, meses, conteos y dos páginas; D: denegación | `b315ff9` | HTTP positivo dedicado y control SQL independiente; variantes número/período/chapa/anuladas y todas las páginas no acreditadas en DEV. |
| `get_contract_conditions` — condiciones | `contracts/contractConditions.service.js` | `contracts`, `chatLifecycle` | B: selección exacta, cliente ajeno, conceptos/vigencia; D rechazo | `b315ff9` | HTTP positivo dedicado; variantes de conceptos/último facturado y todos los casos de ausencia/ambigüedad en este endpoint, no inferir de I. |
| `get_contract_cost_per_sqm` — costo por m² | `contracts/contractCostPerSqm.service.js` | `contracts`, `chatLifecycle` | B: cálculo real sin IVA y misma moneda | `b315ff9` | HTTP positivo y contraste independiente; USD/tasa inválida y área/facturación inválidas tienen controladas, no muestra real específica acreditada. |
| `analyze_contract_cost_incidence` — incidencia | `contracts/contractCostIncidence.service.js` | `contractIncidence`, `contracts`, `chatLifecycle` | I: resumen/mes, SQL independiente, límites de vigencia, empates invertidos, FX y seguimientos | `dcd9530`; desplegado `8e80887` | **Muestra DEV:** ventas registradas cuya suma sea cero; no confundir con ausencia real ya verificada. |
| `search_soles_types` — tipos de soles | `soles/searchSolesTypes.service.js` | `memberSoles`, `chatLifecycle` | S: saldo por tipos; no acredita buscador real con todas sus variantes | S sin SHA; buscador dedicado sin acreditar | Catálogo exacto/ambiguo/ausente y alias reales; no volver a probar el saldo como sustituto. |
| `get_member_soles` — saldo/vencimiento | `soles/memberSoles.service.js` | `memberSoles`, `chatLifecycle` | S: saldo por tipo, vencimiento y vuelta desde usos | S sin SHA | Recuperar trazabilidad; SQL independiente; vencidos/generación y referencia temporal, según variantes no cubiertas por S. |
| `get_soles_usage` — usos | `soles/solesUsage.service.js` | `solesUsage`, `chatLifecycle` | S: resumen/tipos, detalle y varias páginas, cantidades faltantes detectadas | S sin SHA | SQL independiente y filtros de movimiento/destino/transacción/importes/ranking no acreditados individualmente. Soles son cantidades, no monedas. |
| `search_soles_usage_destinations` — destinos | `soles/solesUsageDestination.resolver.js` | `solesUsage` | Sin contraste dedicado Oracle/HTTP acreditado | Sin acreditar | Pareja tipo/código, mismo código de SOCIO/LOCAL, límite y ambigüedad real. |
| `search_soles_usage_movement_types` — movimientos | `soles/solesUsageMovementType.resolver.js` | `solesUsage` | Sin contraste dedicado Oracle/HTTP acreditado | Sin acreditar | Catálogo real, signos y selección; ausencia/límite sin declarar coincidencia única falsa. |
| `get_vehicle_registrations` — altas de vehículos | `vehicles/vehicleRegistrations.service.js` | `vehicleRegistrations`, `chatLifecycle` | H: total y género con seguimiento | `b315ff9` | SQL independiente de únicos/ACTIVO; edad actual/al registro, límites relativos y demás filtros/detalle no acreditados en DEV. |

## Capacidades del backend fuera del registro de herramientas

| Función | Implementación/pruebas | Evidencia existente y pendientes |
| --- | --- | --- |
| Exportación XLSX de ventas | Rutas de exportación, `salesExportFollowup`, `salesHistory`, `chatLifecycle`, `dependencySecurity` | H + X. Archivo real ZIP/ExcelJS y conciliación aprobados; no es herramienta faltante ni obliga a repetir exportación. |
| Chat/reset, historial y PII | Rutas/controladores, store por sesión; `chatLifecycle`, `requestCancellation`, `conversationClarification`, `piiAnalysisSubjects` | H/D y seguimientos Q/I/R. Historial y exclusión son de proceso; distribución entre réplicas no se incluye en este cierre de backend. |
| Autorización/cierre/logs | PostgreSQL → proxy Oracle; `oracleSessionClose`, dispatcher/ciclo | D/Q/I/R: usuarios distintos, rechazo sin datos y cierre. R: fallos simulados después del cierre real y códigos seguros; no equivale a fallo real de driver observado. No autentica al usuario ni modifica expiraciones. |

## Pendientes clasificados y trabajo mínimo de cierre

**Implementación ausente:** ninguna herramienta del registro original identificada.
No hay base para planificar una nueva migración completa. Un comportamiento no
verificado no es automáticamente un bug ni justifica cambiar código.

**Muestras DEV faltantes con cobertura controlada aprobada** (conservar abiertas
como limitación, sin bloquearlas como si faltara implementar el cálculo):

| Código / caso | Cobertura existente | Qué falta |
| --- | --- | --- |
| `ZERO_AREA_DEV_FIXTURE_NOT_FOUND` | Ventas por m²: superficie cero → no calculable, motivo, sin división | Contrastar una muestra real autorizada de superficie cero. |
| `CHANGED_AREA_DEV_FIXTURE_NOT_FOUND` | Ventas por m²: selección histórica y superficie cambiante, límites y resultados no calculables cuando corresponda | Muestra real con cambio dentro del período. |
| `ZERO_SALES_DEV_FIXTURE_NOT_FOUND` | Incidencia: ventas sin filas, filas con suma cero y otros no calculables se distinguen; empates/monedas controlados | Filas reales de ventas cuya suma sea cero, no otra muestra sin registros. |
| `MIXED_CURRENCY_REAL_MEMBER_FIXTURE_NOT_FOUND` | Compras promocionales: grupos de monedas reconocidas/ambiguas separados, sin USD por `$`; unitarias y CTE Oracle | Socio real con participaciones en varias monedas. No extrapolar esa evidencia a compras individuales/segmentación. |

No alterar contratos, ventas ni socios para obtenerlas. Si DEV no contiene esas
muestras, cerrar la implementación con la limitación explícita y conservar el
pendiente de evidencia; no declararlas aprobadas como casos reales.

**Verificación backend restante**, en orden de aprovechamiento de evidencia:

1. Completar trazabilidad de S/P usando artefactos/manifiestos ya existentes.
   Si no permiten anclar SHA, conservar «sin acreditar»; no inventar un commit
   por fecha ni repetir suites completas para subsanar un dato documental.
2. Validar `analyze_members` en un bloque dedicado: control SQL independiente
   del resumen materializado y fuente, ranking, segmentos/filtros, períodos,
   monedas, seguimientos y permiso/cierre. Reutilizar pruebas controladas; añadir
   únicamente casos que falten o fallos reproducidos.
3. Cubrir resolutores/ficha y variantes de soles/vehículos sin evidencia directa:
   pruebas enfocadas de buscadores donde no existen y consultas DEV mínimas de
   exacta/ambigua/vacía, selección, aislamiento del socio y únicos. Reutilizar S/H
   para no repetir saldo, usos paginados y total/género ya aprobados.
4. Añadir solo el contraste independiente que falta para compras individuales,
   canjes/ventas y campañas; en facturación/condiciones/costo por m², una consulta
   HTTP positiva y controles de los filtros aún no acreditados. No repetir B/H
   ni los bloques Q/I/R aprobados. Un caso nuevo puede cubrir varios pendientes.
5. Cerrar variantes HTTP de gráficos horizontal/circular/multiserie solo si se
   incluyen en la aceptación backend; verificar contrato/series/fuente sin UI.
   Recoger las cuatro muestras anteriores solo cuando existan legítimamente.

El criterio de cierre es: registro completo, cálculo y filtros con evidencia
atribuida, aislamiento/denegación/cierre cubiertos en cada nuevo flujo, sin bugs
abiertos; variantes y muestras no disponibles registradas con límites explícitos.
No se incluyen conexión del frontend al servicio, login ERP, cambios de permisos,
expiraciones, sincronización de datos ni despliegues adicionales.
