# Alcance y evidencia del backend del chatbot

Corte actualizado: **04/11/2026**, base desplegada `00a1acb` (PR #36 fusionada).
Segmentación: 50/50 Oracle/HTTP en `7c34c14`; corrección orderBy en `345827f`
(17/17 enfocadas, 5/5 controladas Docker DEV); despliegue `00a1acb`, 10/10
conciliaciones de una consulta real y cierre, salud correcta y 159 archivos idénticos.
Se reutilizan baseline/denegación con sus SHA originales, sin sumar conteos solapados.

Buscadores: candidato `c8525a6`, rama separada; **68/68 enfocadas controladas**.
**100/100 controles Oracle aprobados sobre `7ced8d9`**, nueve buscadores, ocho páginas
aproximadas de promociones, rechazo sin datos y cierre; dos logout propios aprobados.
162 archivos candidatos idénticos; 11,288 s. Selección/contexto: integración controlada,
no nueve conversaciones HTTP nuevas. PR #37 en borrador para revisión.
Ver [detalle](search-resolvers-validation.md). No se declaran muestras pendientes aprobadas.

Revisión posterior: tres P2 corregidos en `2094624`; **44/44 enfocadas aprobadas**.
Persistencia de selección pendiente, rubro en usos de soles y desempate completo del
fallback: **78/78 controles afectados sobre `2bfa637` aprobados**, 2,539 s. Incluye
10 checks CTE Oracle, ocho páginas reales y una petición final vacía; 31 checks HTTP
en 11 peticiones a candidata con auth/lookups Oracle reales, modelo/consumidores
controlados. Cierre y dos logout aprobados; PR #37 continúa en borrador.
Los 100 controles previos siguen atribuidos a `7ced8d9`; no acreditan esta corrección.

Composición local/rubro corregida en `929d88e`: **42/42 pruebas afectadas aprobadas**,
ambos órdenes, propuestas contradictorias, cambios explícitos e historial inmutable.
Nuevo contraste Oracle/HTTP de composición preparado, **pendiente de ejecución**;
78 controles `2bfa637` reutilizados sin repetir paginación ni consultas de negocio.

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
| G | `member-segmentation-final-summary.json`: 50/50 sobre `7c34c14`, 26 comprobaciones HTTP, 12 CTE Oracle, 144 archivos idénticos; 46/46 enfocadas Node 22. Reutiliza baseline 108 de `6b1303e` y parcial 40 de `82e72ba` con denegación real. | No sumar ejecuciones como casos únicos. HTTP con contexto preparado; muestra real de varias monedas pendiente. [Detalle](member-segmentation-validation.md). |

| L | `search-resolvers-final.json`: 100/100 Oracle sobre `7ced8d9`, nueve buscadores y ocho páginas de fallback, usuarios distintos, nueve denegaciones/cierre; dos logout aparte. 162 archivos idénticos; 68/68 enfocadas `c8525a6`. | Selección/contexto con modelo controlado; Oracle por dispatcher real, sin nueve diálogos HTTP nuevos. Variantes fuera de los perfiles ensayados conservadas. [Detalle](search-resolvers-validation.md). |
| C | `search-corrections-final.json`: 78/78 sobre `2bfa637` (código `2094624`), 2,539 s; 10 checks CTE, ocho páginas reales + final vacío, 31 checks HTTP/11 peticiones, denegación/cierre; dos logout aparte. 166 archivos candidatos idénticos; 44/44 enfocadas. | HTTP candidata: ruta/controller/chat, auth y lookups reales; modelo y consumidores de negocio controlados. No nueve catálogos/suites nuevos; L se reutiliza. [Detalle](search-resolvers-validation.md). |

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
| `search_customers` — locales | `customers/customer.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Composición `929d88e`: 42/42 afectadas, ambos órdenes e historial, con dependencias controladas. | L: exacta/parcial/ausencia; identidades/conteos activos, denegación/cierre. H/Q previos reutilizados. | `7ced8d9` Oracle; `c8525a6` controladas  `929d88e` código/controladas; contraste de composición pendiente | Históricos inactivos siguen excluidos por política. Empates exactos controlados; no muestra real de todos los empates ni lenguaje inicial exhaustivo. |
| `search_categories` — rubros | `categories/category.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Correcciones `2094624`: 44/44 enfocadas/HTTP controladas del bloque (solapadas).  Composición `929d88e`: 42/42 afectadas, ambos órdenes e historial, con dependencias controladas. | L: exacta/parcial/ausencia; identidades/conteos, denegación/cierre. H/Q previos reutilizados. | `7ced8d9` Oracle; `c8525a6` controladas  `2094624` código; `2bfa637` contraste afectado aprobado  `929d88e` código/controladas; contraste de composición pendiente | Empates exactos y opciones truncadas controlados; interpretación libre y todos los empates reales no acreditados. |
| `get_sales` — ventas | `sales/sales.service.js` | `salesHistory`, `salesSeriesPresentation`, `salesYearComparison`, `salesExportFollowup`, `chatLifecycle` | H; lectura independiente de ventas dentro de Q/I para esos perfiles | `b315ff9`; Q/I para perfiles específicos | No todas las combinaciones de dimensiones/días/monedas; no repetir ventas generales ya aprobadas. |
| `get_sales_per_sqm` — ventas por m² (adicional) | `sales/salesPerSqm.service.js` | `salesPerSqm`, `chatLifecycle` | Q: historia contractual, superficies inválidas/ambiguas, filtros, FX y cierre | `e317a8f`; desplegado `68847db` | **Muestras DEV:** superficie cero y cambiante. Límites y cálculo ya controlados; lenguaje inicial no exhaustivo. |
| `search_members` — localizar socio | `members/member.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Correcciones `2094624`: 44/44 enfocadas/HTTP controladas del bloque (solapadas). | L: documento, pertenencia de identidades de nombre parcial y ausencia; rechazo/cierre. Selección: controlada. | `7ced8d9` Oracle; `c8525a6` controladas  `2094624` código; `2bfa637` contraste afectado aprobado | No completitud nominal ni ranking fuera de la cohorte acotada. Identificador compartido/empates: controlados; no atribuir una muestra real no registrada. |
| `get_member` — ficha de socio | `members/member.service.js` | Cobertura PII transversal; sin suite dedicada identificada del servicio | Sin evidencia específica de ficha real contrastada | Sin acreditar | Perfil encontrado/ausente, campos nulos y mínima exposición autorizada. |
| `get_member_purchases` — compras individuales | `members/member.service.js` → repositorio `members/memberPurchase.repository.js` | `memberPurchasesPagination`, `memberPurchasesPresentation`, `apiMemberPurchases`, `chatLifecycle` | P: detalle completo/resumen, filtros y fin real; no lectura SQL independiente acreditada | Fase `b315ff9`; traza sin SHA propio | Contraste SQL independiente del socio/período; segunda muestra positiva y variantes monetarias no acreditadas. |
| `search_promotions` — promoción/campaña | `promotions/promotion.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados)  Correcciones `2094624`: 44/44 enfocadas/HTTP controladas del bloque (solapadas). | R textual/paginación reutilizados; L: fallback aproximado independiente, ocho páginas completas, total/hasMore/nextPage, denegación/cierre. | `7ced8d9` fallback; `89a4e59` R; `6b1303e` despliegue R  `2094624` código; `2bfa637` contraste afectado aprobado | Fallback real ensayado aprobado; no exhaustivo de todos los errores de escritura. Muestra multimoneda de compras continúa pendiente en su propia fila. |
| `get_member_promo_purchases` — compras promocionales | `members/memberPromoPurchase.service.js` | `memberPromoPurchases`, `promotionHardeningHarness`, `chatLifecycle` | R: siete páginas reales, multiconjunto y resumen, filtros/selección/seguimientos; denegación/cierre | `89a4e59`; desplegado `6b1303e` | **Muestra DEV:** socio con varias monedas; grupos ambiguos ya controlados en Oracle CTE. Segundo socio positivo no acreditado. |
| `get_member_vehicles` — vehículos del socio/chapa | `members/memberVehicle.service.js` | `vehicleRegistrations`, PII y ciclo | H comprueba registros agregados, no la búsqueda real de dueño por chapa | Sin validación DEV dedicada acreditada | Chapa única/múltiples socios, documento, débito/activo y ausencia: contraste real dirigido. |
| `analyze_members` — segmentación/ranking | `members/memberAnalysis.service.js` | Suites existentes de segmentación; 46/46 previas. Corrección del contrato orderBy: 17/17 enfocadas (5 nuevas; conteos solapados) | G: 50/50 finales Oracle/HTTP y cierre reutilizados; baseline y 40 controles/denegación previos. Null rechazado antes de SQL: 5/5 nuevos tests controlados en Docker DEV, sin nuevas lecturas Oracle | `345827f` validación orderBy; `7c34c14` Oracle/HTTP; `6b1303e` baseline; `82e72ba` parcial | Muestra real con varias monedas pendiente; CTE multimoneda aprobadas. Lenguaje inicial y carga general no exhaustivos. P2 orderBy:null corregido conforme al esquema no nullable; PR #36 fusionada y desplegada `00a1acb` (10/10 controles puntuales). |
| `compare_member_purchases_vs_sales` — canjes/ventas | `members/memberPurchasesVsSales.service.js` | `memberPurchasesVsSales`, `chatLifecycle` | H: meses/total/cambio de período; coherencia HTTP | `b315ff9` | SQL independiente de ambos universos con mismos filtros; otras monedas/denominador cero ya controlados, no muestra real acreditada de cada variante. |
| `generate_chart` — gráficos | `charts/chart.service.js` | `charts`, `chatLifecycle` | H: barras/líneas de ventas, SVG y fuente | `b315ff9` | HTTP de barras horizontales/circular, varias series/fuentes y datos de otras herramientas no acreditado; no exige Oracle al graficar. Revisión frontend excluida. |
| `analyze_campaign_sales_performance` — antes/durante/después | `sales/campaignSalesPerformance.service.js` | `campaignSalesPerformance`, `chatLifecycle` | H: selección y comparación temporal | `b315ff9` | Control SQL independiente de tres períodos con filtros; variantes reales de ausencia/base cero/monedas diferentes no acreditadas. |
| `search_invoice_concepts` — conceptos facturados | `invoices/searchInvoiceConcepts.service.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia y límite; denegación/cierre. Selección/contexto: controlados. | `7ced8d9` Oracle; `c8525a6` controladas | Sin paginación en contrato: opciones limitadas y refinamiento. Conversación inicial libre no exhaustiva. |
| `search_invoice_customers` — clientes facturados | `invoices/searchInvoiceCustomers.service.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia, clientes distintos, período aislado y denegación/cierre; selección con período controlada. | `7ced8d9` Oracle; `c8525a6` controladas | Fallback fuzzy positivo y otras coincidencias de RUC/matrícula no acreditados individualmente. Opciones limitadas; no prometer catálogo completo. |
| `get_invoices` — facturación | `invoices/invoices.service.js` | `invoices`, `chatLifecycle` | B: monedas, meses, conteos y dos páginas; D: denegación | `b315ff9` | HTTP positivo dedicado y control SQL independiente; variantes número/período/chapa/anuladas y todas las páginas no acreditadas en DEV. |
| `get_contract_conditions` — condiciones | `contracts/contractConditions.service.js` | `contracts`, `chatLifecycle` | B: selección exacta, cliente ajeno, conceptos/vigencia; D rechazo | `b315ff9` | HTTP positivo dedicado; variantes de conceptos/último facturado y todos los casos de ausencia/ambigüedad en este endpoint, no inferir de I. |
| `get_contract_cost_per_sqm` — costo por m² | `contracts/contractCostPerSqm.service.js` | `contracts`, `chatLifecycle` | B: cálculo real sin IVA y misma moneda | `b315ff9` | HTTP positivo y contraste independiente; USD/tasa inválida y área/facturación inválidas tienen controladas, no muestra real específica acreditada. |
| `analyze_contract_cost_incidence` — incidencia | `contracts/contractCostIncidence.service.js` | `contractIncidence`, `contracts`, `chatLifecycle` | I: resumen/mes, SQL independiente, límites de vigencia, empates invertidos, FX y seguimientos | `dcd9530`; desplegado `8e80887` | **Muestra DEV:** ventas registradas cuya suma sea cero; no confundir con ausencia real ya verificada. |
| `search_soles_types` — tipos de soles | `soles/searchSolesTypes.service.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia y alias normales obtenido de Oracle; rechazo/cierre. | `7ced8d9` Oracle; `c8525a6` controladas | Descripciones/alias duplicados controlados; no muestra real acreditada de cada empate o positivo fuzzy. S no se repite. |
| `get_member_soles` — saldo/vencimiento | `soles/memberSoles.service.js` | `memberSoles`, `chatLifecycle` | S: saldo por tipo, vencimiento y vuelta desde usos | S sin SHA | Recuperar trazabilidad; SQL independiente; vencidos/generación y referencia temporal, según variantes no cubiertas por S. |
| `get_soles_usage` — usos | `soles/solesUsage.service.js` | `solesUsage`, `chatLifecycle`  Guard de rubros: nuevas conversaciones HTTP controladas `2094624`. | S: resumen/tipos, detalle y varias páginas, cantidades faltantes detectadas | S sin SHA | SQL independiente y filtros de movimiento/destino/transacción/importes/ranking no acreditados individualmente. Soles son cantidades, no monedas.  Oracle/HTTP candidato del guard aprobado en `2bfa637`; consumidor de usos controlado, no reconsultado. |
| `search_soles_usage_destinations` — destinos | `soles/solesUsageDestination.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia, pareja tipo/código y conteo/hasMore con límite; rechazo/cierre. | `7ced8d9` Oracle; `c8525a6` controladas | Pareja SOCIO/LOCAL con igual código: controlada; muestra real conjunta no acreditada. No hay contrato page. |
| `search_soles_usage_movement_types` — movimientos | `soles/solesUsageMovementType.resolver.js` | Nuevas: searchResolvers/searchSelection y chatLifecycle; 68/68 enfocadas del bloque (conteos solapados) | L: exacta/parcial/ausencia y listado limitado; conteo real/hasMore, denegación/cierre. Selección: controlada. | `7ced8d9` Oracle; `c8525a6` controladas | No se revalida el signo/importe de los usos como parte del catálogo. Interpretación libre no exhaustiva. |
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
2. `analyze_members`: bloque dedicado completado para los perfiles/variantes
   declarados en G, con contraste independiente, segmentos, ranking, filtros,
   períodos, monedas controladas, seguimientos y permiso/cierre. Revisar la PR
   y conservar la muestra multimoneda real como limitación; no repetir lo aprobado.
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
