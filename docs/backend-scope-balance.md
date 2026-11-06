# Balance del alcance del backend

Fecha: **06/11/2026**. Base revisada y último despliegue acreditado:
`84fd67c9465cf6a21916c687a184597a3ba9c252` (PR #40 fusionada).
El balance inicial utilizó exclusivamente documentación y reportes existentes.
El seguimiento F1/F2/F3/F4/M7 está en una rama separada y se registra abajo;
no altera la base desplegada ni convierte evidencia histórica en una ejecución nueva.

## Dictamen y criterio de cierre

Las **25 herramientas originales están implementadas**; el chatbot registra
**26**, incluida ventas por m². No se identificó herramienta pendiente de migrar
tras las correcciones de PR #40.
La revisión posterior identificó dos fallos F3/F4; sus correcciones en `61c5c9f`
pasan 15/15 enfocadas Node 22.23.4 y preflight (257 archivos). La ejecución
Oracle `6ac06bc`, con código idéntico, aprueba 26/26 checks: cuatro positivos
F1/F2 y un perfil afectado F3. Conserva seis reservas reales F3/F4/M7;
la separación de compras multimoneda F4 tiene cobertura propia controlada,
sin afirmar una muestra real que no apareció. PR #41 permanece en borrador.
La revisión final abrió un P2 adicional de código: moneda nula con registros
permitía comparación frente a PYG. Su corrección por pareja está preparada,
en `c0eabb6`, con 18/18 enfocadas Node 22.23.4, preflight completo y 260 archivos
coincidentes; **17/17 verificaciones DEV sobre `ff937d8`**, código/pruebas
idénticos, concilian un perfil real PYG y sus diferencias/porcentajes/presentación
con SELECT independientes. Cierres/logout aprobados, sin proveedor. No
se presenta como otra muestra DEV ausente ni sustituye las seis reservas.
Eso no equivale a acreditar todas las variantes de cada herramienta.

Puede cerrarse el alcance de **los perfiles acreditados**, manteniendo sus
limitaciones. **No procede declarar cierre integral sin reservas** de la
conversión real ni de las variantes concretas aún sin evidencia señaladas abajo.
No se presume autorización para excluirlas de la aceptación.

La columna «bloquea» se interpreta así:

- **Sí, esa variante/capacidad:** falta evidencia de un camino identificable
  del contrato; no reabre los perfiles aprobados de otras herramientas.
- **Condicional:** solo impide prometer una cobertura más amplia que la
  acreditada; no exige probar un producto cartesiano de datos o lenguaje.
- **No, implementación:** la limitación es una muestra/atribución faltante,
  no una funcionalidad ausente. Sigue prohibido presentarla como caso real
  aprobado. La existencia de un test no demuestra por sí sola su ejecución.

## Funcionalidades acreditadas

Los códigos de evidencia H/B/D/Q/I/R/G/L/N/O/T/V/W conservan las definiciones,
reportes y SHA de la [matriz](backend-functional-matrix.md). Los conteos de
ejecuciones distintas y checks solapados no se suman como casos únicos.

| Familia / perfiles acreditados | Evidencia y commits | Límite de la afirmación |
| --- | --- | --- |
| Nueve buscadores: locales, rubros, socios, promociones, clientes/conceptos facturados y tipos/destinos/movimientos de soles | L: `7ced8d9`; selección, filtros independientes, retirada/reincorporación, estado por sesión tras recorte, reset/aislamiento y reelección hasta `047c361`; despliegue PR #37 `ef9bff4` | Catálogos autorizados y cohortes ensayadas; no todas las coincidencias lingüísticas ni empates reales. |
| Ventas, comparaciones temporales y campañas | H `b315ff9`; N `7762f35`: tres períodos de campaña, límites, filtros y SQL independiente; Q/I para sus perfiles de ventas | No todas las combinaciones ni campañas excepcionales. |
| Ventas por m² | Q `e317a8f`, despliegue `68847db`: superficie histórica, límites, ambigüedad y cálculo/filtros | Superficie cero/cambiante real ausente; FX real positivo no se acredita mediante tasas controladas. |
| Ficha y vehículos del socio | N `7762f35`: ficha/ausencia, vehículos por documento y débito; `cafc5f1`: chapa única/ausente contra SELECT | Chapa compartida y todos los patrones de campos nulos no acreditados en muestras reales. |
| Compras individuales | T `d529cfd`: dos socios, importes mensuales por moneda, local/rubro y conteo inicial contra SQL; P: recorrido HTTP completo histórico | P no tiene SHA propio; no afirmar recorrido atribuido al head ni socio real multimoneda. |
| Compras promocionales | R `89a4e59`, despliegue `6b1303e`: selección/contexto, siete páginas, detalle/resumen; `cafc5f1`: dos socios positivos distintos y SQL por moneda | Pruebas monetarias controladas no son socio real multimoneda. |
| Segmentación/rankings | G `7c34c14`, baseline/denegación con sus SHA; `345827f`: `orderBy:null` rechazado antes de SQL; despliegue `00a1acb` | Distintos globales separados de los grupos; muestra real multimoneda pendiente. |
| Canjes frente a ventas | W: código `8ee5b14`, ejecución `7bebb3d`, 86/86; despliegue `30ffab4`, 26/26 | PYG real y monedas/contradicciones controladas; CTE USD/CAD no es socio multimoneda real. |
| Facturación | B/D/N; `cafc5f1`: chapa, recorrido completo y multiconjunto SQL; `255fd53`: resumen 6/6; despliegue `4428874`, 11/11 | Recorrido y resumen acreditan sus respectivas cohortes, no su identidad; el fallo inicial del control permanece registrado. |
| Condiciones, costo contractual e incidencia | B/N; `cafc5f1`: ausencia; I `dcd9530`, despliegue `8e80887`: resumen/mes, vigencias, empates, sin ventas/no calculable | Ambigüedad real de condiciones y suma cero real conservan sus propios límites; no extrapolar I a otro endpoint. |
| Saldo y usos de soles | V `a709b35`, 19/19; O `6e6c423`: filtros/ranking SQL; `cafc5f1`: ventanas combinadas positivas en los tres estados | V mantiene sus tres ventanas históricas vacías; las nuevas fechas no las reemplazan. Ranking devuelve cuatro socios disponibles, no un quinto inventado. |
| Altas de vehículos | T `d529cfd`: julio 2025, edades/distintos/filtros/detalle; `cafc5f1`: cinco períodos relativos y límites de Asunción | Cuatro rangos relativos vacíos; año positivo. No sumar distintos entre grupos o períodos. |
| Gráficos HTTP | `ad0ef01`: negativos etiqueta/serie/ejes; `d59d1f2`, 27/27: horizontal/circular/multiserie con fuente Oracle; despliegue `84fd67c`, 21/21 | Modelo/historial preparados; un perfil mensual PYG. Puntos/leyendas por serie, moneda y período conciliados; no todas las fuentes/divisas. |
| Seguridad, ciclo y exportación | D `b315ff9`: 21/21, usuarios Oracle distintos, rechazo sin datos/cierre; Q/I/R y seguimientos PR #37; XLSX real X `13e69ef` | Identidad resuelta por `sessionId`, Oracle autoridad de permisos. Estado conversacional de proceso; sin promesa de ejecución distribuida. |

El despliegue `84fd67c` acredita 187 archivos coincidentes, salud/arranque,
dependencias según lockfile, cero reinicios y el gráfico HTTP anterior contra
SELECT independientes. No hubo petición al proveedor; cierre/logout aprobados.
Reportes locales ignorados `deployed-pr40-startup.json`, `deployed-pr40-chart.json`
y `deployed-pr40-result.json`. SHA-256 del reporte del gráfico:
`bfbd551d3af1f5584775e274efd204e9e7f22582931797f2ce1f43a1feaba71d`.

## Cotización real positiva: pendiente externo separado

| ID / pendiente | ¿Bloquea el cierre? / por qué | Evidencia existente y mínimo restante |
| --- | --- | --- |
| E1. Obtener y aplicar una cotización pública real inequívoca | **Sí, la conversión positiva real** de costo/ventas por m²/incidencia. No bloquea datos nativos, aritmética controlada ni gráficos sin FX. No se declara indisponibilidad permanente. | La llamada del 05/11/2026 del candidato `e5868ea` devolvió `EXCHANGE_PROVIDER_QUOTE_UNAVAILABLE`; antes hubo timeout. `ad0ef01`: formatos/tasas inválidas, HTTP/red/timeout y PYG/USD controlados; `92b5e11`: neto/área Oracle con tasa y fallo controlados. Falta una respuesta real válida, identificación independiente de venta y fecha de consulta, y una aplicación a neto/área Oracle con esa misma tasa. Solo cuando haya respuesta reconocible; no aumentar expiraciones ni elegir otro número/moneda. |
| E2. Fecha de publicación del proveedor o cotización histórica | **No para el contrato actual**, que declara tasa de venta actual, `retrievedAt` y `quotedAt=null`. **Sí** impediría afirmar una fecha publicada o conversión histórica. | No hay tal evidencia ni contrato histórico acreditado. Conservar desconocido y distinguir fecha de factura/período de fecha de consulta; no añadir un proveedor histórico para cerrar este alcance. |

## Variantes funcionales revisadas y reservas restantes

Aquí «sin evidencia» no significa «muestra DEV inexistente». La auditoría
posterior y sus resultados están en
[variantes finales](backend-final-variants-validation.md). F1/F2 ya están
acreditados para sus positivos específicos; las búsquedas acotadas ejecutadas
de F3/F4/M7 conservan reservas de muestra, no verificaciones olvidadas.

| ID / variante | ¿Bloquea el cierre? / por qué | Evidencia actual y trabajo mínimo propuesto |
| --- | --- | --- |
| F1. `search_invoice_customers`: fuzzy positivo y coincidencias específicas por RUC/matrícula | **No, positivos específicos acreditados**; no exige todas las erratas o identificadores compartidos. | `6ac06bc`: tres positivos aprobados contra SELECT independiente; RUC/matrícula con identidades/período/seguridad, fuzzy con cero coincidencias fuertes y orden/umbral Oracle. Cohorte de 20 filas, hasta seis candidatos fuzzy. La errata es controlada sobre catálogo real, no nuevo HTTP. L y selección anteriores se reutilizan. |
| F2. `search_soles_types`: positivo fuzzy específico | **No, positivo específico acreditado**; no exhaustividad lingüística. | `6ac06bc`: cero directas, coincidencia positiva contra catálogo Oracle y distancia independiente. Hasta ocho tipos. L exacta/parcial/alias no se repite. |
| F3. Campañas sin registros, referencia cero o monedas diferentes en otras campañas | **Condicional para las muestras reales**, no implementación faltante; revisión de corrección PR #41 pendiente. | `61c5c9f`: separación por pareja y registros, controles propios; `6ac06bc`: un perfil afectado de tres períodos conciliado contra SQL. Diez campañas de hasta 61 días inspeccionadas sin las cuatro muestras: ausencia, referencia cero, monedas distintas o suma cero registrada. Todas siguen `sample_missing`, con cobertura controlada propia. No ausencia global ni aprobación Oracle de esas ramas. |
| F4. Compras individuales de un socio real con varias monedas | **Condicional** para la muestra real; no impide cerrar los perfiles T. Revisión de corrección PR #41 pendiente. | `61c5c9f`: cobertura propia SQL/DTO/presentación, `$` compartido conserva descripción e importes separados. `6ac06bc`: no apareció socio multimoneda en 1.000 filas enero–mayo 2023; no se ejecutó resumen/recorrido de esa muestra. T `d529cfd` se conserva, sin heredar CTE de R/G ni declarar ausencia global. |
| F5. Gráficos con otras formas/fuentes, métricas o monedas | **Condicional**: falta un positivo específico de ruta de filas a un array anidado mediante índice; no bloquea los perfiles HTTP aprobados ni exige todas las fuentes. | [Contrato documentado](chart-result-contract.md). `data`, `results`, etiquetas y métricas anidadas tienen evidencia; `groups.0.rows` es forma contratada sin positivo específico identificado. Mínimo futuro: un positivo controlado de esa forma. No hay contrato de pivote de objetos o unión arbitraria de fuentes. |
| F6. Todos los patrones de nulos de ficha o lectura de otro registro de socio | **No para el perfil de ficha N**; sí impide afirmar cobertura de cada patrón/registro. No inventar una regla usuario=socio. | N encontrado/ausente y campos de su muestra; D y proxy por `sessionId` cubren autorización según Oracle. D no enumera cada fila autorizada. Conservar límite, ampliar únicamente ante una política concreta o muestra relevante. |
| F7. Todas las combinaciones de ventas/usos, lenguaje libre, ranking fuera de cohortes y cada alias/error ortográfico | **No**: es falta de exhaustividad, no un camino nuevo identificado ni una herramienta ausente. | H/Q/I/O/G/L y ciclo PR #37 cubren sus perfiles/filtros combinados. No repetirlos ni abrir campañas generales de combinaciones para declarar cierre. Un defecto reproducible nuevo sí requeriría corrección y evidencia afectada. |

## Muestras reales ausentes o no acreditadas

Solo las cuatro primeras filas tienen códigos históricos de muestra DEV
faltante. Los límites de una búsqueda acotada no prueban ausencia global.

| ID / muestra | ¿Bloquea implementación? / evidencia | Qué queda sin afirmar |
| --- | --- | --- |
| M1. Superficie cero — `ZERO_AREA_DEV_FIXTURE_NOT_FOUND` | **No**: Q `e317a8f`, superficie inválida/no calculable y límites con datos controlados. | Un contrato DEV real de superficie cero; no fabricar ni modificarlo. |
| M2. Superficie cambiante — `CHANGED_AREA_DEV_FIXTURE_NOT_FOUND` | **No**: selección histórica/cambio/límites controlados Q. | Cambio real dentro del período con conciliación histórica. |
| M3. Ventas registradas cuya suma es cero — `ZERO_SALES_DEV_FIXTURE_NOT_FOUND` | **No**: I `dcd9530` distingue ausencia, suma cero y no calculable. | Filas reales que sumen cero; una consulta sin filas no sustituye la muestra. |
| M4. Socio promocional multimoneda — `MIXED_CURRENCY_REAL_MEMBER_FIXTURE_NOT_FOUND` | **No**: R `89a4e59`, grupos reconocidos/ambiguos controlados, sin USD por `$`; dos socios positivos en `cafc5f1`. | Socio real multimoneda, no dos socios monomoneda ni CTE. |
| M5. Segmentación multimoneda real | **No**: G tiene cobertura controlada propia y perfiles Oracle aprobados. | Cohorte real; no extrapolarla a compras individuales F4. |
| M6. Condiciones con contratos activos ambiguos | **No como implementación faltante**: tests de `contracts` cubren ausencia/ambigüedad; condiciones se incluyó en las pruebas enfocadas Node 22 de `e5868ea`. `cafc5f1` no halló cohorte de 2–20 CNT activos por cliente. | Resultado real de ese endpoint con todas sus opciones; no inferirlo de incidencia ni declarar inexistencia global. |
| M7. Chapa activa compartida | **No para chapa única/ausente acreditadas**; test controlado histórico aprobado confirmado en los logs 263/277, sin vínculo suficiente al SHA del código. | `6ac06bc`: no encontrada entre 44 vehículos activos elegibles (tope 1.000, sin placas vacías/espacios interiores). Búsqueda acotada revisada; contraste de ambigüedad real reservado. No inventar atribución histórica ni ausencia global. |
| M8. Empates exactos de catálogos, identificador compartido, tipos duplicados o destino SOCIO/LOCAL con igual código | **No**: L y pruebas controladas de resolución/selección, incluida conservación de ambigüedad. | Cada empate real y pareja real; los casos controlados no son muestras Oracle de negocio. F1/F2 separan los positivos funcionales que aún faltan. |
| M9. Tres ventanas históricas vacías de soles en V | **No**: V `a709b35` acredita ausencia para su socio/fechas y `cafc5f1` otras ventanas positivas en los tres estados. | No afirmar filas en las ventanas vacías ni ausencia global. Este pendiente no requiere otra ejecución para cerrar el mecanismo de ventanas. |
| M10. Hoy/ayer/semana/mes vacíos en altas de vehículos | **No**: `cafc5f1` concilia límites/distintos, año positivo; T `d529cfd` aporta mes histórico con filas. | Positivos en cada rango relativo vacío. No cambiar fechas del sistema ni datos para obtenerlos. |

## Trazabilidad y exclusiones

| ID / límite | ¿Bloquea? / decisión mínima |
| --- | --- |
| T1. Reportes históricos S/P sin SHA propio | **No el código ni los perfiles V/T; sí atribuir esos HTTP al head.** Manifiestos ya revisados no permiten anclaje fiable. Conservar la salvedad; no reconstruir SHA por fecha. Si la aceptación exige recorrido HTTP individual atribuido, solo ese recorrido acotado requerirá futura evidencia nueva, no una suite completa. |
| T2. Modelo/historial preparados en parte de los HTTP | **No el contrato backend probado; sí afirmar conversación libre con modelo remoto.** No se ha pedido cerrar una evaluación lingüística exhaustiva; no transformar el balance en integración o benchmark. |
| T3. Estado conversacional de proceso / múltiples réplicas | **No este alcance.** La matriz limita el estado y guard al proceso. No prometer sesión distribuida ni proponer migración Redis como condición de cierre actual. |
| T4. Históricos inactivos excluidos, catálogos limitados o sin `page`, cambios de nombres/parámetros del ERP | **No**: son contratos/políticas explícitos, no herramientas ausentes. No prometer catálogo completo, restaurar filas inactivas ni reintroducir parámetros inseguros. |

## Trabajo mínimo restante

1. Revisar las dos correcciones PR #41 y su evidencia, sin repetir los controles
   aprobados. F1/F2 ya no requieren ejecución adicional para los positivos
   identificados. Mantener las reservas por ID, sin «backend totalmente validado».
   Incluir el P2 de moneda ausente/no reconocida: 18/18 pruebas controladas y
   17/17 verificaciones de un perfil real PYG en `ff937d8` ya revisadas; falta la
   revisión final del diff. Los casos inválidos son controlados, no muestras
   Oracle. El control no reabre F1/F2, F5/T1 ni las búsquedas; su cobertura
   completa se refiere solo al perfil, sin eliminar las seis reservas.
2. La revisión de atribución F3/F4/M7 ya se realizó, conservando sus salvedades.
   El contraste `6ac06bc` ya se revisó: 26/26 checks sin fallos, cuatro positivos
   F1/F2 y un perfil afectado F3; seis reservas de muestra, cierre/logout
   aprobados. Conservar las búsquedas F3/F4/M7 como límites, sin repetirlas para
   pretender ausencia exhaustiva. F5 queda concretado en un positivo controlado
   de ruta de filas anidada; no se ejecutó en este bloque.
3. E1 es una pista independiente: cuando exista respuesta pública reconocible,
   un contraste de venta/fecha y una aplicación a datos Oracle bastan para su
   perfil; mantener E2 desconocido. No sustituirlo con tasa fija, otro proveedor
   o datos fabricados para declarar aprobación.
4. Recoger M1–M8 solo si aparecen legítimamente; M9/M10 no reabren mecanismos
   ya probados. Las limitaciones de muestras con control propio permiten cerrar
   implementación con reserva, nunca certificar un caso real no ejecutado.

No se proponen herramientas nuevas, despliegues ni suites completas.
Las dos correcciones F3/F4 se mantienen en rama separada, PR #41 en borrador.
Integración frontend/ERP, sincronización, cambios de datos,
permisos, contraseñas o expiraciones están fuera de este balance.
