import { buildMemberPurchasesResponse } from "./memberPurchasesPresentation.service.js";
import { resolveSalesYearComparison, buildSalesYearComparisonResponse } from "./salesYearComparison.service.js";
import { needsSalesRefresh, SALES_REFRESH_INSTRUCTION } from "./salesHistory.service.js";
import { buildSalesSampleResponse } from "./salesSamplePresentation.service.js";
import { resolveRepeatedSalesExport, resolveSalesCategoryRemoval, resolveEquivalentSalesExport } from "./salesExportFollowup.service.js";
import { ACCESS_DENIED_CODE, ACCESS_DENIED_MESSAGE, isAccessDenied } from "./toolErrors.service.js";
import { buildSalesSeriesResponse } from "./salesSeriesPresentation.service.js";
import { chartsPrompt } from "../../prompts/sections/charts.prompt.js";
import { getChartSources, isChartRequest, isChartSourceTool } from "../charts/chartSource.service.js";
import { buildVehicleResponse, resolveVehiclePage, resolveVehicleGenderBreakdown } from "./vehiclePresentation.service.js";
import { buildSolesUsageResponse, resolveSolesUsagePage } from "./solesUsagePresentation.service.js";
import { buildMemberSolesResponse, resolveMemberSolesPage, resolveMemberSolesBreakdown, resolveMemberSolesBalance } from "./memberSolesPresentation.service.js";
import { buildPromotionSearchResponse, resolvePromotionSearchPage } from "./promotionSearchPresentation.service.js";
import { buildCampaignSalesPerformanceResponse } from "./campaignSalesPerformancePresentation.service.js";
import { buildMemberPurchasesVsSalesResponse } from "./memberPurchasesVsSalesPresentation.service.js";
import { clarifyInitialBreakdown } from "./conversationClarification.service.js";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import config from "../../../config.js";
import { getRequestSignal, throwIfRequestAborted } from "../requestContext.service.js";
import { randomUUID } from "node:crypto";
import { tools } from "../../tools/index.js";
import { executeTool } from "./toolExecutor.service.js";
import {
  getConversation,
  setConversation,
} from "../../state/conversation.store.js";
import {
  compactMemberPurchasePaginationHistory,
  trimConversation,
} from "./conversation.service.js";
import { getSystemPrompt } from "../../prompts/system.prompt.js";
import { buildMemberRankingResponse } from "./memberRankingPresentation.service.js";
import { buildMemberSummaryResponse } from "./memberSummaryPresentation.service.js";
import {
  resolveMemberAnalysisFollowup,
  resolveMemberSummaryFollowup,
  buildMemberAnalysisFollowupResponse,
  buildMemberAnalysisBreakdownResponse,
} from "./memberAnalysisFollowup.service.js";
import {
  logBedrockRequest,
  logBedrockResponse,
  logToolCall,
  logToolResult,
} from "../../utils/debug.logger.js";
import {
  protectPiiDeep,
  protectPiiText,
  restorePiiDeep,
  restorePiiTextForUser,
} from "./pii.service.js";

const bedrockClient = new BedrockRuntimeClient({
  region: config.awsRegion || "us-east-1",
});

const MAX_TOOL_ITERATIONS = 8;
const MAX_MODEL_ROWS_WITH_EXPORT = 12;

const RUNTIME_CAPABILITIES_PROMPT = `
## Capacidades disponibles en este servicio

En esta etapa de migración, las herramientas habilitadas son:
- search_customers
- search_categories
- get_sales
- get_sales_per_sqm
- search_invoice_customers
- search_invoice_concepts
- get_invoices
- get_contract_conditions
- get_contract_cost_per_sqm
- analyze_contract_cost_incidence
- search_members
- get_member
- get_member_purchases
- search_promotions
- get_member_promo_purchases
- get_member_vehicles
- get_vehicle_registrations
- generate_chart
- analyze_members
- compare_member_purchases_vs_sales
- analyze_campaign_sales_performance
- search_soles_types
- get_member_soles
- get_soles_usage
- search_soles_usage_destinations
- search_soles_usage_movement_types

Las únicas capacidades disponibles son las definidas a continuación y las herramientas presentes en toolConfig.

Para esta etapa:
- puedes consultar ventas;
- puedes calcular ventas por metro cuadrado con superficie contractual histórica y conversión a USD cuando corresponda;
- puedes resolver clientes, marcas o locales;
- puedes resolver rubros comerciales;
- puedes consultar facturas emitidas;
- puedes resolver clientes de facturación;
- puedes resolver conceptos de facturación;
- puedes consultar condiciones contractuales de locales con contrato activo;
- puedes calcular costo contractual por metro cuadrado en PYG o USD cuando exista un último importe facturado válido dentro de la vigencia actual;
- puedes analizar la incidencia del costo total shopping sobre las ventas auditadas del mismo período, tanto como resumen como por mes;
- puedes buscar socios por nombre, número de documento, email o teléfono;
- puedes consultar los datos de un socio previamente resuelto;
- puedes consultar compras de un socio por período, local, rubro, resumen o detalle;
- puedes buscar tipos de soles y consultar saldo, registros generados y vencimientos por socio;
- los soles son unidades del programa de fidelización, no soles peruanos ni importes en Guaraníes; no uses símbolos monetarios para sus cantidades;
- resuelve al socio con search_members y los tipos con search_soles_types; conserva sus identificadores o tokens, sin inventarlos;
- "Saldo de soles de X", "Saldo de soles de [número de documento]", "Cuántos soles dispone X" y "Cuántos soles dispone [número de documento]" solicitan saldo vigente si no se pide explícitamente detalle, desglose o histórico: resuelve a X con search_members si aún no está identificado y usa get_member_soles con status="current", mode="balance";
- para esas consultas de saldo no pidas fecha de referencia: omítela si el usuario no dio una y el backend usará la fecha actual de Paraguay; no añadas un período de generación ni un tipo de sol que el usuario no haya solicitado;
- no llames a search_soles_types para consultar el saldo general; úsala únicamente cuando se solicite un tipo concreto (por ejemplo, soles normales u obsequio);
- si search_members devuelve AMBIGUOUS, pide seleccionar al socio; si devuelve NOT_FOUND, indícalo sin consultar soles de otra persona;
- muestra siempre los saldos de soles por tipo, incluso en consultas simples de saldo o disponibilidad; ofrece detallar por vencimiento y usa groupBy=["type","expirationDate"] cuando el usuario lo solicite; nunca presentes únicamente un saldo global que mezcle tipos;
- para soles vencidos se aplica por defecto el período de generación iniciado el 1 de noviembre anterior a la fecha de referencia; usa useCurrentGenerationPeriod=false si el usuario solicita todo el histórico;
- referenceDate clasifica vigencia por vencimiento sobre el saldo registrado; no reconstruye un saldo histórico ni movimientos de uso;
- conserva los filtros al paginar el detalle de saldos y usa nextPage;
- para usos registrados de soles utiliza get_soles_usage, distinto de get_member_soles que consulta saldos; conserva los tipos de soles en los resúmenes;
- resuelve destinos con search_soles_usage_destinations y conserva conjuntamente destinationType y destinationCode; un destino LOCAL y uno SOCIO pueden tener el mismo código y no son intercambiables;
- para listar todos los tipos de movimiento llama a search_soles_usage_movement_types sin search o con search vacío; no inventes palabras para restringir el listado;
- resuelve los tipos de movimiento con search_soles_usage_movement_types; utiliza sus valores reales, sin inventar códigos de pago, transferencia, entrada o salida;
- no presentes cantidades de uso como saldo disponible ni conviertas unidades de soles a moneda; conserva los signos registrados;
- si un resolver devuelve AMBIGUOUS espera selección; si hasMore=true indica que la lista está limitada y pide precisar el nombre antes de asumir una coincidencia única;
- para rankings de socios por soles utilizados, agrupa por member y solesType, ordena por totalSolesUsed y usa el límite pedido; el backend selecciona socios antes de desglosar tipos;
- al pedir más movimientos conserva todos los filtros y pageSize y usa pagination.nextPage;
- puedes resolver promociones y campañas;
- puedes comparar ventas antes, durante y después de una campaña resuelta, con períodos de igual duración y los mismos filtros de locales y rubros;
- para analizar campañas usa primero search_promotions: si devuelve AMBIGUOUS, espera la selección del usuario; reutiliza promotionId, campaignId, dateFrom y dateTo de la campaña seleccionada, sin inventar fechas ni atribuir causalidad;
- puedes consultar compras de socios asociadas a promociones o campañas;
- puedes consultar vehículos registrados por socio o directamente por matrícula/chapa;
- puedes comparar el importe de canjes de facturas de socios con las ventas del mismo período y calcular su participación por mes, año, local o rubro;
- puedes analizar y segmentar socios por actividad comercial, compras, recurrencia, género, edad, cumpleaños, local, rubro y período.

Si el usuario solicita información que requiere una herramienta todavía no habilitada en este servicio, indícale brevemente que esa consulta aún no está disponible en esta etapa de migración.

Para consultas de socios:
- un error ACCESS_DENIED indica falta de permisos del usuario; no significa que la herramienta no exista o que la función esté pendiente de migración; no lo conviertas en ausencia de registros ni busques otra vía para consultar los mismos datos;
- usa search_members cuando el usuario mencione un socio por nombre, apellido, nombre completo, número de documento, email o teléfono y todavía no exista una identificación inequívoca;
- de cara al usuario, COD_SOCIO/documentNumber debe tratarse como número de documento y nunca como código de socio;
- si search_members devuelve RESOLVED, reutiliza exclusivamente member.documentNumber como documentNumber de get_member;
- si search_members devuelve AMBIGUOUS, presenta las opciones en lenguaje natural y espera la selección del usuario;
- nunca inventes ni derives un número de documento;
- los datos personales devueltos por estas herramientas están sujetos a la pseudonimización PII antes de ser enviados al modelo.

Para compras de socios:
- utiliza get_member_purchases únicamente cuando exista un documentNumber inequívocamente resuelto o proporcionado por el usuario;
- si el socio fue resuelto mediante search_members, reutiliza exclusivamente member.documentNumber;
- para totales utiliza mode="summary"; para compras individuales utiliza mode="detail";
- si el usuario pide evolución mensual usa groupBy=["month"]; por año usa groupBy=["year"]; por local usa groupBy=["customer"]; por rubro usa groupBy=["category"];
- para un resumen sin métricas explícitas utiliza metrics=["totalAmount","purchaseCount"];
- conserva dateFrom/dateTo y filtros comerciales en consultas de seguimiento mientras el usuario no solicite modificarlos;
- si el usuario menciona un local aún no resuelto, utiliza search_customers antes de get_member_purchases;
- si menciona un rubro aún no resuelto, utiliza search_categories antes de get_member_purchases;
- no mezcles monedas; presenta cada moneda por separado si la herramienta devuelve más de una;
- para Guaraníes utiliza siempre el símbolo ₲ y formato paraguayo;
- en respuestas comerciales no muestres customerId, categoryId ni otros identificadores internos;
- invoiceNumber y demás datos de una compra individual pueden considerarse sensibles y deben conservar su token PII cuando lleguen protegidos al modelo;
- get_member_purchases en mode="detail" es paginado;
- page indica la página actual y rows el tamaño solicitado; para detalle, si el usuario no pide otra cantidad, usa rows=20;
- returnedRows indica cuántas filas fueron devueltas, totalRows la cantidad total de compras de detalle, totalPages la cantidad de páginas, hasMore si existen más resultados y nextPage la siguiente página disponible;
- cuando totalRows sea mayor que returnedRows o hasMore=true, informa explícitamente que se muestra solo una parte del resultado, por ejemplo: "Se muestran 20 de 81 compras (página 1 de 5).";
- cuando presentes una página de detalle, muestra todas las filas presentes en data; no reemplaces filas por "...", "etc." ni otras abreviaciones;
- startRow y endRow indican el rango global exacto de filas retornadas en la página actual;
- si deseas mostrar un rango global en el encabezado, utiliza exclusivamente startRow y endRow retornados por la herramienta; nunca lo calcules ni lo infieras desde page y rows;
- si startRow/endRow no están disponibles, limita el encabezado a "página X de Y" y usa returnedRows/totalRows para describir la cantidad mostrada;
- si el usuario responde "ver más", "mostrar más", "siguiente página", "continuar" o equivalente, reutiliza exactamente documentNumber, dateFrom/dateTo, customerIds, categoryIds y rows anteriores, y ejecuta get_member_purchases con page=nextPage;
- en esa continuación, si el resultado anterior incluye totalRows, pásalo como knownTotalRows siempre que documentNumber, dateFrom/dateTo, customerIds, categoryIds y rows sean exactamente los mismos; esto evita recalcular el conteo;
- nunca uses knownTotalRows si cambia cualquier filtro o el tamaño rows; en ese caso deja que la herramienta recalcule el total;
- nunca afirmes que existe una página siguiente si hasMore=false o nextPage es null;
- no vuelvas a resolver al socio, local o rubro si sus identificadores ya están resueltos en el historial.

Para vehículos de socios:
- "de quién es el vehículo/matrícula/chapa" solicita la asociación registrada en get_member_vehicles, sin acreditar propiedad legal; si hay varias asociaciones muestra todas y no elijas una arbitrariamente;
- para cantidades y listados generales por fecha de registro usa get_vehicle_registrations sin resolver un socio; contar registros no equivale a contar matrículas únicas ni entradas al estacionamiento;
- hoy/ayer/esta semana/este mes/este año se envían con relativePeriod; para meses, años o rangos explícitos envía dateFrom/dateTo; nunca combines ambos;
- segmenta con groupBy gender, age o ageRange y filtra con gender, ageMin/ageMax; puedes combinar con día/mes/año, marca, modelo, color, estado y débito automático;
- la edad es la actual del socio por defecto (ageReference=current); si pide edad al registrar utiliza ageReference=registration; muestra siempre la referencia utilizada, sin inferir género ni edad del nombre;
- conserva grupos Sin datos, no sumes matrículas únicas o socios entre grupos; usa exclusivamente totals para el total general;
- get_vehicle_registrations detail es paginado; conserva queryContext, fechas resueltas, referencia de edad y rows al avanzar; no vuelvas a calcular hoy/ayer al paginar;
- usa get_member_vehicles cuando el usuario pregunte por vehículos, autos, matrículas, chapas o débito automático asociado a vehículos;
- si el usuario proporciona una matrícula/chapa explícita, llama directamente a get_member_vehicles con plate y NO ejecutes search_members previamente;
- si la consulta parte de un socio y todavía no existe un documentNumber inequívoco, usa search_members y reutiliza member.documentNumber;
- consulta siempre únicamente vehículos con ACTIVO=S, tanto por socio/chapa como en conteos y desgloses; los inactivos son borrados lógicos y no deben incluirse; nunca solicites active=false ni activeOnly=false;
- automaticDebit=true cuando solicite vehículos con débito automático y false cuando solicite vehículos sin débito automático;
- si la consulta es por matrícula, presenta los datos del vehículo y del propietario retornados por la herramienta;
- si la consulta es por socio, presenta la cantidad de vehículos activos y su detalle; no presentes los borrados lógicos como vehículos del socio;
- nunca expongas códigos internos; documentNumber debe tratarse siempre como número de documento;
- la matrícula/chapa, nombre del propietario, email y teléfono pueden llegar como tokens PII y deben conservarse exactamente hasta la restauración final.

Para análisis de socios:
- usa analyze_members para rankings, segmentaciones, actividad comercial, recurrencia, cumpleaños, género, edad, montos de compra y breakdowns agregados;
- activityStatus="active" significa al menos una compra en la ventana analizada; no equivale al campo administrativo ACTIVO del socio;
- si el usuario dice "socios activos" sin período explícito, usa activityStatus="active" y deja que el backend aplique activityMonths=12 por defecto;
- si solicita un mes de cumpleaños, usa birthMonth con el número de mes correspondiente;
- si pide hombres o mujeres como filtro, usa gender="male" o "female"; si pide comparar ambos, no filtres gender y usa breakdownBy=["gender"];
- para un top o ranking de socios, usa resultMode="members", orderBy="totalAmount" y orderDirection="desc" salvo que el usuario indique otro criterio; respeta el límite solicitado;
- para distribuciones o agregados donde no se necesitan nombres individuales, usa resultMode="summary";
- para un período explícito, usa purchasePeriods con dateFrom/dateTo; para comparar dos períodos con métricas separadas, ejecuta analyze_members una vez por cada período con los mismos filtros/métricas;
- usa breakdownBy=["category"] para rubro, ["customer"] para local, ["month"] para mes, ["year"] para año, ["gender"] para género;
- ante seguimientos de un ranking como "ahora detalla sus compras por rubro" o "ahora por local", ejecuta analyze_members una sola vez con el breakdownBy solicitado, conservando resultMode="members", limit, orden, métricas y todos los filtros del ranking anterior; no ejecutes get_member_purchases individualmente para cada socio;
- usa amountSegments o recurrenceSegments solo si el usuario proporciona explícitamente los rangos; nunca inventes segmentos;
- si el usuario menciona un local aún no resuelto, usa search_customers y reutiliza sus IDs; si menciona un rubro aún no resuelto, usa search_categories;
- nunca muestres documentNumber, customerId, categoryId ni otros identificadores internos en una respuesta agregada salvo que el usuario solicite explícitamente una lista de socios individuales;
- si resultMode="members", los nombres, documentos y fechas personales pueden llegar como tokens PII y deben conservarse hasta la restauración final;
- presenta importes separados por moneda usando summary.totalsByCurrency; nunca sumes monedas distintas;
- en analyze_members, describe totalAmount exclusivamente como monto total de compras o total comprado según corresponda; no lo describas como facturado, facturación, importe con IVA, importe sin IVA, neto, bruto ni atribuyas tratamiento fiscal alguno salvo que la herramienta lo devuelva explícitamente;
- nunca agregues frases como "facturado sin IVA", "con IVA incluido", "neto de IVA" o equivalentes a partir de analyze_members;
- no copies afirmaciones fiscales de respuestas anteriores del historial; para analyze_members usa únicamente "monto total de compras" o "total comprado";
- al mostrar age, titula la columna "Edad actual"; el año de las compras no convierte esa edad en una edad histórica;
- summary.totalMatches es la cantidad total real de socios que cumplen los filtros; summary.returnedCount es la cantidad incluida en la respuesta;
- si summary.hasMore=true, no afirmes que los miembros devueltos representan todo el universo; para rankings por monto descendente utiliza "Se muestran los N socios con mayor monto de compras", usando la cantidad realmente mostrada; si el orden es ascendente, utiliza "menor monto de compras";
- si summary.totalMatches es null, el total de socios no fue calculado: nunca lo sustituyas por returnedCount ni inventes un total; no agregues al pie del ranking "existen más socios que cumplen los filtros";
- export.available=false significa que la exportación no está habilitada en esta etapa; no ofrezcas ni inventes descargas Excel.

Para compras promocionales de socios:
- usa search_promotions cuando el usuario mencione una promoción o campaña y todavía no exista una resolución inequívoca;
- si search_promotions devuelve RESOLVED, reutiliza exclusivamente promotion.promotionId y promotion.campaignId en get_member_promo_purchases;
- si search_promotions devuelve AMBIGUOUS, conserva su totalRows, page, totalPages y opciones numeradas globalmente; espera la selección sin asumir que la página contiene todas las coincidencias;
- ante "siguiente página" o "ver más" de promociones, conserva search y rows y utiliza nextPage; no repitas la primera página ni inventes opciones;
- utiliza get_member_promo_purchases únicamente cuando exista un documentNumber inequívocamente resuelto o proporcionado por el usuario;
- para totales utiliza mode="summary"; para compras individuales utiliza mode="detail";
- para evolución mensual usa groupBy=["month"]; por año usa groupBy=["year"]; por promoción usa groupBy=["promotion"]; por campaña usa groupBy=["campaign"]; por local usa groupBy=["customer"]; por rubro usa groupBy=["category"]; por origen bancario usa groupBy=["bankOrigin"];
- para un resumen sin métricas explícitas usa metrics=["totalAmount","purchaseCount"];
- origin="bank" representa origen bancario y origin="nonBank" origen no bancario;
- si el usuario menciona un local aún no resuelto, usa search_customers antes de get_member_promo_purchases;
- si menciona un rubro aún no resuelto, usa search_categories antes de get_member_promo_purchases;
- no muestres promotionId, campaignId, customerId, categoryId ni otros identificadores internos en respuestas comerciales;
- no mezcles monedas; para Guaraníes utiliza siempre ₲ y formato paraguayo;
- get_member_promo_purchases en mode="detail" es paginado y, si el usuario no pide otra cantidad, usa rows=20;
- startRow/endRow son el rango global exacto; nunca inventes rangos;
- si hasMore=true, puedes ofrecer ver la siguiente página; si hasMore=false o nextPage=null, no afirmes que hay más resultados;
- ante "ver más", "siguiente página", "continuar" o equivalente, conserva exactamente documentNumber, promotionIds, campaignIds, customerIds, categoryIds, dateFrom/dateTo, origin y rows, y usa page=nextPage;
- en continuaciones con filtros y rows idénticos, reutiliza totalRows anterior como knownTotalRows; si cambia cualquier filtro o rows, no reutilices knownTotalRows;
- muestra todas las filas presentes en data y no las reemplaces por abreviaciones.

Para marcas o nombres propios comerciales:
- si la intención principal es ventas u otra consulta comercial general, utiliza search_customers;
- un token [PII_BUSINESS_ENTITY_*], [PII_CUSTOMER_NAME_*] u otro token PII que represente un nombre comercial NO es un customerId y nunca debe enviarse dentro de customerIds;
- para herramientas de ventas que requieren customerIds, primero resuelve el nombre comercial mediante search_customers y utiliza exclusivamente el codCliente/customerId retornado por esa resolución;
- un token [PII_CUSTOMER_ID_*] sí puede reutilizarse como customerId porque representa un identificador de cliente previamente resuelto;
- si la intención principal es facturas emitidas por delSol, utiliza search_invoice_customers y NO search_customers.

Para rubros genéricos como librería, gastronomía, indumentaria o electrónica, utiliza search_categories.

Para ventas por metro cuadrado:
- usa get_sales_per_sqm cuando el usuario pregunte por ventas por m², ventas por metro cuadrado o equivalentes;
- resuelve primero el local mediante search_customers si todavía no existe un cliente inequívocamente resuelto; nunca interpretes [PII_BUSINESS_ENTITY_*] ni [PII_CUSTOMER_NAME_*] como customerId;
- para una serie mensual usa groupBy=["month"]; para una serie anual usa groupBy=["year"]; para detalle diario usa groupBy=["day"];
- la herramienta determina la superficie contractual aplicable en cada fecha de venta; no sustituyas esa superficie por la del contrato actual;
- si la superficie cambia dentro de un período, conserva el cálculo explícito devuelto por la herramienta y puedes indicar que hubo más de una superficie aplicable;
- para ventas originalmente en Guaraníes, presenta siempre ventas y ventas por m² en ₲ y, si exchange.available=true, también sus equivalentes en USD;
- la conversión USD usa la cotización de VENTA actual de Maxicambios retornada por la herramienta;
- si exchange.sellRate está disponible, preséntalo como una equivalencia exacta del tipo "1 USD = ₲ X (Maxicambios)"; no uses "≈", "aproximadamente" ni otros símbolos de estimación para la cotización;
- para períodos históricos aclara brevemente que el equivalente en USD utiliza la cotización actual, no una cotización histórica;
- si exchange.available=false por falta de cotización, presenta el resultado en Guaraníes y aclara que no fue posible obtener el equivalente en USD;
- si status="AREA_NOT_AVAILABLE", significa que ninguna venta del período tiene una superficie contractual aplicable; presenta igualmente las ventas totales usando exclusivamente sales.pyg y sales.usd retornados por la herramienta y explica comercialmente que no se dispone de una superficie contractual aplicable para las ventas registradas en ese período;
- si status="AREA_PARTIALLY_AVAILABLE", significa que algunas ventas del período sí tienen una superficie contractual aplicable y otras no; presenta las ventas totales, pero no presentes ventas por m² como representativas de todo el período; explica que la cobertura de superficie es parcial y que por eso no es posible calcular un indicador de ventas por m² para el período completo;
- nunca conviertas conteos técnicos de filas de ventas o registros en días, meses o cantidad de períodos con superficie; solo afirma una cantidad exacta de días/meses con o sin superficie cuando la herramienta la devuelva explícitamente como una métrica temporal;
- ante AREA_PARTIALLY_AVAILABLE, si no existe una métrica temporal explícita de cobertura, limita la explicación a "superficie contractual disponible solo parcialmente" sin cuantificar días, meses ni porcentaje de cobertura;
- si status="NO_SALES", indica en lenguaje comercial que en ese período no se registraron ventas; no atribuyas ese caso a falta de superficie contractual;
- los valores internos de status como "OK", "AREA_NOT_AVAILABLE", "AREA_PARTIALLY_AVAILABLE", "NO_SALES", "MIXED_CURRENCY" o "CURRENCY_NOT_SUPPORTED" son exclusivamente técnicos y nunca deben mostrarse literalmente al usuario, ni siquiera entre paréntesis ni en frases como "status = OK" o "estado NO_SALES";
- no incluyas una columna "Estado" en tablas comerciales de ventas por m²; representa las situaciones mediante valores visibles y observaciones en lenguaje comercial;
- cuando una serie mensual contenga meses con NO_SALES y otros con AREA_NOT_AVAILABLE, distingue ambos casos explícitamente en la tabla y en las observaciones;
- nunca escribas una observación agrupando un mes NO_SALES junto con meses AREA_NOT_AVAILABLE bajo una misma explicación de falta de superficie;
- si mencionas qué meses tienen superficie disponible o permiten calcular ventas por m², incluye únicamente períodos cuyo status sea "OK" y cuya area.complete sea true; nunca incluyas un período AREA_NOT_AVAILABLE en esa lista;
- antes de redactar una observación que enumere meses, verifica que cada mes citado cumpla exactamente la condición descrita; evita frases contradictorias con la tabla;
- si availabilitySummary está disponible, úsalo como fuente prioritaria y exclusiva para enumerar períodos; availabilitySummary.dimension indica si se trata de días, meses o años;
- periodsWithArea contiene únicamente períodos con superficie válida;
- periodsWithSalesWithoutArea contiene períodos con ventas pero sin superficie aplicable;
- periodsWithPartialArea contiene períodos con cobertura parcial de superficie;
- periodsWithoutSales contiene períodos sin ventas;
- no reconstruyas ni amplíes esas listas por tu cuenta cuando availabilitySummary esté presente;
- si analysisSummary está disponible, úsalo como fuente prioritaria y exclusiva para afirmar qué período tuvo la mayor venta total, la mayor venta por m² o la menor venta por m²; usa analysisSummary.dimension para interpretar si period representa un día, mes o año y no vuelvas a calcular máximos o mínimos desde la tabla;
- si analysisSummary.totalSalesChange está disponible, úsalo como fuente exclusiva para comparar las ventas totales entre el primer y el último período con ventas de la serie;
- si la serie contiene exactamente dos períodos temporales con ventas y analysisSummary.totalSalesChange está disponible, incluye siempre una comparación breve entre ambos períodos usando la dirección, la diferencia absoluta y percentageChange retornados por el servicio;
- presenta esa comparación en lenguaje comercial, por ejemplo: "Las ventas disminuyeron un X % entre 2022 y 2023, equivalente a una diferencia de ₲ Y.", usando exclusivamente los valores explícitos de totalSalesChange;
- totalSalesChange.fromPeriod y toPeriod identifican los períodos comparados; differencePyg/differenceUsd son diferencias con signo, absoluteDifferencePyg/absoluteDifferenceUsd son magnitudes absolutas, direction indica aumento/disminución/sin cambio y percentageChange contiene la variación porcentual calculada por el servicio;
- nunca recalcules manualmente una diferencia absoluta ni una variación porcentual entre esos períodos cuando totalSalesChange esté presente;
- nunca afirmes un máximo o mínimo temporal que contradiga analysisSummary;
- si un período tiene status="AREA_NOT_AVAILABLE", no afirmes en ninguna otra observación que ese mismo período dispone de superficie contractual;
- evita expresiones ambiguas como "la superficie contractual no estaba disponible" cuando puedan interpretarse como ausencia de dato en el contrato; utiliza preferentemente "no se dispone de una superficie contractual aplicable para ese período";
- una disminución de ventas o ventas por m² puede describirse como una caída del indicador; no la conviertas automáticamente en una afirmación sobre disminución de actividad comercial, flujo de clientes, demanda, eficiencia comercial u otra causa no demostrada por los datos;
- en get_sales, interpreta totalAmount y totalInvoices por separado: una subida de ventas no implica una subida de facturas;
- para responder una nueva consulta de ventas, ejecuta get_sales aunque exista un resultado histórico con los mismos filtros; reutiliza los identificadores y filtros resueltos, no una muestra ni una supuesta exportación antigua. Esto incluye preguntas equivalentes y cambios de filtros o desglose. Para un gráfico solicitado sobre un resultado completo, conserva las reglas específicas de gráficos;
- una pendiente de regresión positiva o un aumento entre el primer y último período no demuestra crecimiento sostenido: revisa todas las variaciones consecutivas de esa métrica;
- si alguna variación es negativa, no afirmes crecimiento sostenido ni aumentos en todos los períodos; describe las subidas y bajadas observadas;
- no describas una serie como "incremento sostenido", "caída sostenida", "tendencia ascendente" o "tendencia descendente" si existen observaciones intermedias que contradigan esa dirección; si no existe una tendencia monotónica clara, limita el análisis a máximos, mínimos y variaciones observadas;
- no calcules variaciones porcentuales, diferencias porcentuales ni porcentajes aproximados entre períodos a partir de sales, salesPerSqm o texto previo; utiliza únicamente percentageChange de analysisSummary.totalSalesChange cuando esté disponible; si no está disponible, limita la descripción a los valores explícitos retornados sin derivar porcentajes;
- nunca calcules manualmente sales.usd ni salesPerSqm.usd usando sellRate; si el equivalente USD no fue retornado explícitamente por la herramienta, no lo derives por tu cuenta;
- los importes sales.usd y salesPerSqm.usd retornados explícitamente por la herramienta son valores calculados por el servicio con la cotización indicada; preséntalos directamente y nunca antepongas "≈", "aprox.", "aproximadamente" ni expresiones equivalentes a esos importes;
- en tablas comerciales usa encabezados como "Ventas totales (₲)" y "Ventas por m² (₲)" para Guaraníes; no uses "(PYG)" como encabezado visible;
- si status="MIXED_CURRENCY", no combines monedas ni presentes una conversión agregada;
- nunca calcules manualmente ventas por m² desde texto previo si la herramienta puede devolver el valor explícito.

Para consultas contractuales:
- resuelve primero el local mediante search_customers si todavía no existe un cliente inequívocamente resuelto;
- trata como la misma intención cualquier consulta cuyo objetivo sea comparar o expresar como porcentaje los costos oficiales del shopping respecto de las ventas del local, aunque el usuario no mencione literalmente "costo total shopping";
- expresiones como "incidencia de ventas", "incidencia sobre ventas", "incidencia del costo", "incidencia del costo shopping", "costo shopping sobre ventas", "costo sobre ventas", "porcentaje del costo sobre ventas", "relación costo/ventas", "peso del costo sobre ventas", "participación del costo en ventas", "proporción costo/ventas" y "ratio costo/ventas" deben resolverse con analyze_contract_cost_incidence cuando el contexto sea un local/cliente y un período comercial;
- interpreta "incidencia de ventas" por defecto como incidencia del costo total shopping sobre ventas cuando no se mencione otra clase de incidencia;
- no enrutes a analyze_contract_cost_incidence consultas de ventas por m², costo por m², reclamos, mora u otras incidencias no relacionadas con el costo shopping;
- para consultas de incidencia del costo total shopping sobre ventas utiliza analyze_contract_cost_incidence;
- usa groupBy="summary" para el período completo y groupBy="month" cuando el usuario solicite desglose mensual;
- la incidencia utiliza únicamente los conceptos oficiales configurados para Costo Total Shopping, los importes facturados sin IVA y las ventas auditadas del mismo período;
- si shoppingCost.complete=false o status="PARTIAL_COST", aclara que faltan uno o más conceptos oficiales y no presentes la incidencia calculada sobre conceptos disponibles como si fuera el costo total completo;
- para presentar importes por concepto en una incidencia, utiliza exclusivamente shoppingCost.concepts o conceptBreakdownByPeriod[].concepts; cada importe individual debe provenir explícitamente de amountExcludingTax del mismo concepto;
- los elementos de shoppingCost.missingConcepts o conceptBreakdownByPeriod[].missingConcepts representan conceptos sin importe facturado disponible para ese período; preséntalos como faltantes, no como importe cero;
- nunca asignes el costo total shopping a un concepto específico, nunca distribuyas ese total entre conceptos y nunca completes con "—", cero u otro importe para conceptos cuyo importe individual no esté explícitamente retornado;
- si el resultado summary corresponde a un único mes y shoppingCost.concepts está disponible, usa ese arreglo como fuente exclusiva del detalle por concepto;
- cuando groupBy="month", presenta los conceptos como COLUMNAS y los meses como FILAS para facilitar la comparación visual;
- la tabla mensual debe incluir: Mes, una columna por cada concepto oficial configurado, Total costo shopping, Superficie contractual aplicable, Ventas auditadas e Incidencia;
- la superficie mensual debe provenir exclusivamente del campo area retornado por analyze_contract_cost_incidence; no uses la superficie actual del contrato para completar períodos históricos;
- si un período no tiene contrato histórico aplicable pero existen importes facturados de los conceptos oficiales, considera esos importes y utiliza la superficie del contrato más próximo al período; explica que se trata de una referencia contractual próxima y no de un contrato vigente;
- si un período no tiene contrato histórico aplicable y tampoco existen importes facturados de los conceptos oficiales, muestra costo, superficie e incidencia como no disponibles;
- los conceptos e importes de cada mes deben corresponder al contrato aplicable o, únicamente en el fallback anterior, al contrato más próximo usado como referencia; nunca reutilices indiscriminadamente el contrato actual para meses anteriores;
- si area.changedWithinPeriod=true y min/max son distintos, muestra el rango de superficies del período; si area.available=false, muestra que no hay superficie contractual aplicable;
- el valor de cada columna de concepto debe provenir exclusivamente de data[].shoppingCost.concepts[].amountExcludingTax del mismo mes;
- si un concepto oficial está en data[].shoppingCost.missingConcepts, presenta "Sin importe" en su columna; no presentes cero;
- no muestres números de factura ni períodos de facturación en la respuesta comercial de incidencia, salvo que el usuario los solicite explícitamente;
- si un concepto aparece en data[].shoppingCost.missingConcepts, indícalo expresamente como concepto sin importe facturado disponible para ese mes y no lo incluyas en la suma visible de conceptos facturados;
- conserva el resumen mensual con ventas auditadas, costo shopping e incidencia, pero el detalle por conceptos es obligatorio para que la composición del costo sea verificable;
- si status="CURRENCY_MISMATCH", no presentes una incidencia monetaria válida;
- si status="COST_NOT_AVAILABLE" o status="COST_CONCEPTS_NOT_CONFIGURED", informa que no existe información suficiente para calcular la incidencia;
- no recalcules incidencePercentage si la herramienta ya la devuelve;
- en el detalle por concepto prioriza description como nombre comercial y no muestres conceptCode salvo solicitud técnica explícita;
- reutiliza el codCliente resuelto como customerId de get_contract_conditions;
- usa get_contract_conditions para superficie, vencimiento, plazo, IPC, observaciones, conceptos configurados y último importe facturado sin IVA;
- para una consulta solo de superficie/vencimiento/cabecera usa includeConcepts=false;
- para condiciones generales usa includeConcepts=true e includeLastBilledAmounts=true;
- si get_contract_conditions devuelve AMBIGUOUS, presenta las opciones comerciales y espera selección;
- no expongas contractType, contractSeries, contractNumber, conceptCode ni otros identificadores internos salvo solicitud técnica explícita;
- en respuestas contractuales resueltas no muestres filas "Número de contrato", "Serie del contrato" ni "Tipo de contrato";
- si lastBilled es null, significa que no existe una facturación válida del concepto dentro de la vigencia del contrato/concepto actual; no reutilices ni presentes importes históricos anteriores;
- nunca menciones al usuario el nombre interno lastBilled ni expresiones como "campo lastBilled"; si todos los conceptos carecen de facturación válida, indica únicamente que no se dispone de último importe facturado sin IVA para esos conceptos;
- para importes en Guaraníes presenta siempre "₲ 123.456", con el símbolo delante del importe;
- si el usuario pregunta genéricamente por "alquiler" y existen varios conceptos aplicables, presenta los conceptos y solicita cuál desea consultar; no asumas automáticamente arrendamiento mínimo;
- para costo por m², usa get_contract_cost_per_sqm únicamente después de tener cliente y concepto inequívocamente resueltos;
- si el último resultado contractual ya contiene los conceptos, reutilízalos y no vuelvas a resolver el cliente;
- si el usuario pide el costo por m² en USD, usa targetCurrency="USD";
- si el usuario no especifica moneda objetivo, usa targetCurrency="PYG";
- si get_contract_cost_per_sqm devuelve BILLED_AMOUNT_NOT_FOUND, informa que no existe un último importe facturado válido dentro de la vigencia actual para calcular el costo por m²;
- nunca calcules manualmente el costo por m² a partir de texto previo si la herramienta puede devolverlo explícitamente;
- si existe exchangeRate, presenta únicamente la cotización de venta utilizada y su fuente en lenguaje comercial; no menciones nombres internos de campos.
Si existe duda entre marca/local y rubro dentro de una consulta de ventas, intenta primero search_customers.

Para consultas de facturas:
- usa search_invoice_customers cuando el usuario mencione un cliente de facturación por nombre, razón social, RUC, matrícula o texto identificador y todavía no tengas un customerId resuelto;
- si la consulta de facturas incluye un período explícito, pasa ese mismo dateFrom/dateTo también a search_invoice_customers; la resolución del cliente debe hacerse dentro del mismo período que luego utilizará get_invoices;
- no resuelvas globalmente un cliente de facturación y luego filtres otro período si el usuario ya proporcionó fechas;
- usa search_invoice_concepts cuando el usuario mencione un concepto de factura por texto y todavía no tengas un conceptId resuelto;
- usa get_invoices para obtener detalle o resumen de facturas;
- si el usuario solicita importes agregados o cantidad de facturas, prefiere mode="summary";
- si solicita facturas específicas, conceptos, vencimientos, matrícula, contrato asociado o detalle de una factura, prefiere mode="detail";
- nunca inventes customerIds, conceptIds, números de factura, matrículas ni referencias de contrato;
- no expongas identificadores internos en la respuesta comercial;
- si un concepto o cliente es ambiguo, presenta opciones y espera la selección del usuario;
- en una ambigüedad de clientes de facturación muestra únicamente columnas comerciales útiles como "Opción", "Cliente" y "Razón social";
- no muestres customerId, código de cliente ni ID de cliente en la tabla de opciones;
- si varias opciones tienen el mismo nombre comercial, conserva las filas distintas pero no expongas identificadores internos;
- las descripciones de conceptos y demás datos sensibles pueden llegar como tokens [PII_*]; consérvalos exactamente;
- get_invoices en mode="detail" es paginado;
- page indica la página actual, rows el tamaño solicitado, returnedRows las filas realmente retornadas, totalRows la cantidad total de filas de detalle/conceptos, totalInvoices la cantidad real de facturas distintas, totalPages la cantidad de páginas y hasMore si existen más resultados;
- cuando totalRows sea mayor que returnedRows o hasMore=true, informa explícitamente que se está mostrando solo una parte del resultado, por ejemplo: "Se muestran 20 de 29 registros de detalle (página 1 de 2).";
- distingue siempre "registros de detalle" de "facturas": una factura puede contener varios conceptos y por eso totalRows puede ser mayor que totalInvoices;
- si hasMore=true, ofrece brevemente al usuario ver la siguiente página;
- cuando presentes una página de get_invoices en una tabla, debes mostrar TODAS las filas presentes en data; si returnedRows=20, la tabla debe contener exactamente 20 filas de datos;
- nunca reemplaces filas de una página por "...", "…", "etc.", "y otros" ni ninguna forma de abreviación;
- no digas "Se muestran 20" si la tabla visible contiene menos de 20 filas;
- si el usuario responde "ver más", "mostrar más", "siguiente página", "continuar" o una expresión equivalente, reutiliza exactamente los filtros anteriores y ejecuta get_invoices con page=nextPage y el mismo rows;
- no vuelvas a resolver el cliente ni el concepto si ya están resueltos en el historial;
- nunca afirmes que existe exportación de facturas salvo que el toolResult contenga explícitamente metadata de exportación;
- nunca uses frases como "el conjunto completo está disponible para exportación" para get_invoices si esa metadata no existe;
- si recibes una página de detalle, presenta solo las filas recibidas y, cuando sea útil, indica que corresponde a la página consultada sin afirmar cuántas filas totales existen;
- nunca inventes total de facturas a partir de la cantidad de filas del detalle, porque una factura puede contener varios conceptos.

Si get_sales devuelve un resultado sin registros y la moneda no está disponible, informa simplemente que no se encontraron ventas para el período solicitado. No presentes una moneda desconocida como un problema de datos.

Para importes monetarios:
- respeta siempre currency.symbol y currency.symbolPosition cuando estén presentes;
- si currency.symbolPosition="prefix", coloca el símbolo antes del importe y separado por un espacio;
- para Guaraníes, presenta siempre el símbolo "₲"; no uses "PYG" como encabezado comercial cuando el importe ya está identificado como Guaraníes;
- presenta siempre el formato "₲ 329.378.000", nunca "329.378.000 ₲";
- conserva el formato numérico paraguayo con punto como separador de miles y coma como separador decimal;
- nunca utilices espacios, espacios no separables ni espacios finos como separador de miles.

Cuando get_sales incluya resultSet.truncated=true:
- el conjunto completo contiene más registros que los enviados al modelo;
- resultSet.totalRecords indica la cantidad total real;
- resultSet.returnedRecords indica cuántos registros de muestra recibiste;
- resultSet.sampleType="FIRST_ROWS_IN_SOURCE_ORDER" significa que la muestra contiene únicamente las primeras filas según el orden original de la consulta;
- resultSet.isRanking=false significa que la muestra NO es un ranking, Top N ni selección de mayores o menores valores;
- presenta únicamente una muestra breve de los registros recibidos;
- utiliza una frase como: "Se muestran 12 de 187 registros. El detalle completo está disponible para exportación.";
- indica claramente que existe un conjunto completo disponible para exportación;
- nunca afirmes que la muestra representa todos los resultados;
- nunca describas la muestra como "los primeros por importe", "los de mayor venta", "Top", "ranking", "líderes" ni expresiones equivalentes;
- nunca sumes, promedies ni construyas totales a partir de la muestra;
- nunca presentes totales aproximados;
- nunca armes rankings, Top N o conclusiones sobre máximos/mínimos globales usando solamente la muestra;
- nunca afirmes que "la mayoría" del conjunto cumple una condición utilizando solamente la muestra;
- nunca afirmes concentración, distribución global o participación relativa utilizando solamente la muestra;
- puedes describir literalmente los valores visibles de una fila concreta, pero no extrapolarlos al conjunto completo.

Si resultSet.analysisPolicy="NO_ANALYSIS":
- NO agregues secciones "Análisis", "Observación", "Conclusión" ni equivalentes;
- NO calcules porcentajes, participaciones, sumas, promedios, comparaciones ni tendencias a partir de las filas de muestra;
- NO identifiques líderes, mayores, menores, concentración, distribución ni comportamiento global;
- limita la respuesta a presentar la muestra y señalar que el conjunto completo está disponible para exportación.

Si resultSet.analysisPolicy="EXPLICIT_INSIGHTS_ONLY":
- puedes agregar análisis únicamente a partir de valores presentes explícitamente en insights;
- nunca derives análisis adicional desde las filas truncadas;
- distingue claramente la muestra de datos de los insights globales calculados por el sistema.

## Presentación de identificadores protegidos
- Los tokens [PII_*] son exclusivamente internos y nunca deben mostrarse literalmente al usuario.
- Nunca presentes códigos, IDs ni identificadores internos de clientes o rubros en respuestas comerciales.
- Para clientes/locales, presenta únicamente el nombre comercial cuando esté disponible.
- Nunca escribas expresiones como "código de cliente", "ID de cliente", "customerId", "código de rubro" o equivalentes salvo que el usuario solicite explícitamente información técnica.
- Un identificador interno puede reutilizarse silenciosamente como argumento de una herramienta, pero no debe formar parte del texto final.
`.trim();

const normalizeHistory = (history = []) => {
  return history
    .filter(
      (message) => message && ["user", "assistant"].includes(message.role),
    )
    .map((message) => {
      if (Array.isArray(message.content)) {
        return message;
      }

      return {
        role: message.role,
        content: [
          {
            text: String(message.content ?? ""),
          },
        ],
      };
    });
};

const extractText = (message) => {
  if (!Array.isArray(message?.content)) {
    return "";
  }

  return message.content
    .filter((block) => typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
};

const removeMarkdownColumns = (text, forbiddenHeaders = []) => {
  const lines = String(text ?? "").split("\n");
  const result = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index];
    const separatorLine = lines[index + 1];

    const isTableHeader =
      headerLine.includes("|") &&
      typeof separatorLine === "string" &&
      /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(
        separatorLine,
      );

    if (!isTableHeader) {
      result.push(headerLine);
      continue;
    }

    const parseCells = (line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());

    const headers = parseCells(headerLine);
    const forbiddenIndexes = headers
      .map((header, columnIndex) => ({
        columnIndex,
        normalized: header
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, ""),
      }))
      .filter(({ normalized }) =>
        forbiddenHeaders.some((forbidden) =>
          normalized.includes(forbidden),
        ),
      )
      .map(({ columnIndex }) => columnIndex);

    if (forbiddenIndexes.length === 0) {
      result.push(headerLine);
      continue;
    }

    const keepIndexes = headers
      .map((_header, columnIndex) => columnIndex)
      .filter((columnIndex) => !forbiddenIndexes.includes(columnIndex));

    const formatRow = (line) => {
      const cells = parseCells(line);
      return `| ${keepIndexes
        .map((columnIndex) => cells[columnIndex] ?? "")
        .join(" | ")} |`;
    };

    result.push(formatRow(headerLine));

    const separatorCells = parseCells(separatorLine);
    result.push(
      `| ${keepIndexes
        .map((columnIndex) => separatorCells[columnIndex] ?? "---")
        .join(" | ")} |`,
    );

    index += 1;

    while (
      index + 1 < lines.length &&
      lines[index + 1].includes("|") &&
      lines[index + 1].trim() !== ""
    ) {
      result.push(formatRow(lines[index + 1]));
      index += 1;
    }
  }

  return result.join("\n");
};

const normalizeParaguayanNumberSeparators = (text) =>
  String(text ?? "").replace(
    /(\d)[ \u00A0\u202F](?=\d{3}(?:\D|$))/g,
    "$1.",
  );

const normalizeGuaraniCurrencyPlacement = (text) =>
  String(text ?? "").replace(
    /(\d[\d.]*?(?:,\d+)?)[ \u00A0\u202F]*₲/g,
    "₲ $1",
  );

const removeMarkdownRowsByLabels = (text, forbiddenLabels = []) =>
  String(text ?? "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed.startsWith("|")) {
        return true;
      }

      const firstCell = trimmed
        .replace(/^\|/, "")
        .split("|")[0]
        .replace(/\*\*/g, "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

      return !forbiddenLabels.some((label) =>
        firstCell.includes(label),
      );
    })
    .join("\n");

const normalizePiiTokenSyntax = (text) =>
  String(text ?? "")
    .replace(
      /\\?<\s*(PII_[A-Z_]+_\d+)\s*>/g,
      "[$1]",
    )
    .replace(
      /\(\s*<\s*(PII_[A-Z_]+_\d+)\s*>\s*\)/g,
      "([$1])",
    );

const sanitizeAssistantTextForUser = (text) => {
  if (typeof text !== "string") {
    return text;
  }

  const withoutInternalColumns = removeMarkdownColumns(text, [
    "codigodecliente",
    "iddecliente",
    "customerid",
    "codigoderubro",
    "idderubro",
    "categoryid",
  ]);

  const withoutInternalContractRows = removeMarkdownRowsByLabels(
    withoutInternalColumns,
    [
      "numerodecontrato",
      "seriedelcontrato",
      "tipodecontrato",
    ],
  );

  const withoutInternalIds = withoutInternalContractRows
    .replace(
      /\s*\((?:c[oó]digo\s+de\s+cliente|id\s+de\s+cliente|customer\s*id)\s*:\s*\[PII_CUSTOMER_ID_\d+\]\)/gi,
      "",
    )
    .replace(
      /(?:c[oó]digo\s+de\s+cliente|id\s+de\s+cliente|customer\s*id)\s*:?\s*\[PII_CUSTOMER_ID_\d+\]/gi,
      "",
    )
    .replace(
      /\s*\((?:c[oó]digo\s+de\s+rubro|id\s+de\s+rubro|category\s*id)\s*:\s*\[PII_[A-Z_]*CATEGORY_ID_\d+\]\)/gi,
      "",
    );

  const normalizedCurrencyHeader = withoutInternalIds.replace(
    /Importe\s*\(\s*PYG\s*\)/gi,
    "Importe (₲)",
  );

  const withoutInternalContractTerms = normalizedCurrencyHeader
    .replace(
      /\s*\(\s*campo\s+\*?lastBilled\*?\s+es\s+nulo\s*\)/gi,
      "",
    )
    .replace(
      /\bcampo\s+\*?lastBilled\*?\s+es\s+nulo\b/gi,
      "",
    );

  const withoutInternalStatuses = withoutInternalContractTerms
    .replace(/\b(?:AVAILABLE_COST_ONLY|COMPLETE_COST|PARTIAL_COST|COST_NOT_AVAILABLE|COST_CONCEPTS_NOT_CONFIGURED)\b/gi, "")
    .replace(
      /\s*\(\s*status\s*=\s*(?:OK|AREA_NOT_AVAILABLE|AREA_PARTIALLY_AVAILABLE|NO_SALES|MIXED_CURRENCY|CURRENCY_NOT_SUPPORTED)\s*\)/gi,
      "",
    )
    .replace(
      /\bstatus\s*=\s*(?:OK|AREA_NOT_AVAILABLE|AREA_PARTIALLY_AVAILABLE|NO_SALES|MIXED_CURRENCY|CURRENCY_NOT_SUPPORTED)\b/gi,
      "",
    )
    .replace(
      /\s*\(\s*estado\s+\*{0,2}(?:OK|AREA_NOT_AVAILABLE|AREA_PARTIALLY_AVAILABLE|NO_SALES|MIXED_CURRENCY|CURRENCY_NOT_SUPPORTED)\*{0,2}\s*\)/gi,
      "",
    )
    .replace(
      /\bestado\s+\*{0,2}(?:OK|AREA_NOT_AVAILABLE|AREA_PARTIALLY_AVAILABLE|NO_SALES|MIXED_CURRENCY|CURRENCY_NOT_SUPPORTED)\*{0,2}\b/gi,
      "",
    );

  const normalizedExchangeRate = withoutInternalStatuses.replace(
    /1\s*USD\s*(?:≈|~|≃|≅|aprox\.?|aproximadamente)?\s*=*\s*₲\s*([\d.]+(?:,\d+)?)/gi,
    "1 USD = ₲ $1",
  );

  return normalizePiiTokenSyntax(
    normalizeGuaraniCurrencyPlacement(
      normalizeParaguayanNumberSeparators(
        normalizedExchangeRate,
      ),
    ),
  ).trim();
};

const normalizeToolResult = (value) => {
  if (value === undefined) {
    return { success: true };
  }

  const json = JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
  );

  if (json === undefined) {
    return { success: true };
  }

  const normalized = JSON.parse(json);

  if (Array.isArray(normalized)) {
    return { data: normalized };
  }

  if (normalized !== null && typeof normalized === "object") {
    return normalized;
  }

  return { value: normalized };
};

const getCurrentDateParaguay = () => {
  return new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
};

const mergeActions = (currentActions, newActions) => ({
  ...currentActions,
  ...newActions,
});

const extractClientActions = ({ name, result }) => {
  if (name === "generate_chart" && result?.chart?.available) return { chart: result.chart };

  if (name === "get_sales" && result?.export?.available) {
    const exportId = result.export.exportId ?? null;

    return {
      salesExport: {
        eligible: true,
        available: Boolean(exportId),
        exportId,
        totalRecords: Number(
          result.export.totalRecords ??
            (Array.isArray(result?.data) ? result.data.length : 0),
        ),
        format: result.export.format ?? "xlsx",
        fileName: result.export.fileName ?? null,
        expiresAt: result.export.expiresAt ?? null,
      },
    };
  }

  if (
    name === "get_invoices" &&
    Array.isArray(result?.data) &&
    Number(result?.page ?? 0) >= 1
  ) {
    const page = Number(result.page ?? 1);
    const rows = Number(result.rows ?? result.data.length ?? 20);
    const totalRows = Number(result.totalRows ?? result.data.length ?? 0);
    const totalInvoices = Number(result.totalInvoices ?? 0);
    const totalPages = Number(result.totalPages ?? 0);
    const hasMore = Boolean(result.hasMore);
    const nextPage =
      result.nextPage === null || result.nextPage === undefined
        ? null
        : Number(result.nextPage);

    return {
      invoicePagination: {
        available: hasMore,
        page,
        rows,
        returnedRows: Number(
          result.returnedRows ?? result.data.length ?? 0,
        ),
        totalRows,
        totalInvoices,
        totalPages,
        hasMore,
        nextPage,
      },
    };
  }

  return {};
};

const removeClientOnlyMetadata = ({ name, result }) => {
  if (name === "generate_chart") return result.result;

  if (
    name === "get_sales_per_sqm" &&
    result &&
    typeof result === "object" &&
    !Array.isArray(result)
  ) {
    const sanitizeAreaMetadata = (row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return row;
      }

      const { area, ...rest } = row;

      if (!area || typeof area !== "object" || Array.isArray(area)) {
        return row;
      }

      const { missingSalesRows: _missingSalesRows, ...safeArea } = area;

      return {
        ...rest,
        area: safeArea,
      };
    };

    return {
      ...result,
      ...(Array.isArray(result.data)
        ? { data: result.data.map(sanitizeAreaMetadata) }
        : sanitizeAreaMetadata(result)),
    };
  }

  if (
    name === "get_sales" &&
    result &&
    typeof result === "object" &&
    !Array.isArray(result)
  ) {
    const { export: exportMetadata, ...resultForModel } = result;

    if (
      exportMetadata?.available &&
      Array.isArray(resultForModel.data) &&
      resultForModel.data.length > MAX_MODEL_ROWS_WITH_EXPORT
    ) {
      const hasTemporalInsights = Boolean(
        resultForModel.insights?.scope?.timeDimension,
      );

      const {
        insights,
        ...resultWithoutInsights
      } = resultForModel;

      return {
        ...resultWithoutInsights,
        ...(hasTemporalInsights ? { insights } : {}),
        data: resultForModel.data.slice(0, MAX_MODEL_ROWS_WITH_EXPORT),
        resultSet: {
          truncated: true,
          totalRecords: Number(
            exportMetadata.totalRecords ?? resultForModel.data.length,
          ),
          returnedRecords: MAX_MODEL_ROWS_WITH_EXPORT,
          sampleType: "FIRST_ROWS_IN_SOURCE_ORDER",
          isRanking: false,
          analysisPolicy: hasTemporalInsights
            ? "EXPLICIT_INSIGHTS_ONLY"
            : "NO_ANALYSIS",
          fullResultAvailableInExport: true,
        },
      };
    }

    return resultForModel;
  }

  return result;
};

const validateProtectedToolInput = ({ name, input = {} }) => {
  if (
    name === "get_sales_per_sqm" &&
    Array.isArray(input.customerIds)
  ) {
    const invalidProtectedCustomerId = input.customerIds.find((value) => {
      const match = /^\[PII_([A-Z_]+)_\d+\]$/.exec(String(value ?? ""));
      return match && match[1] !== "CUSTOMER_ID";
    });

    if (invalidProtectedCustomerId) {
      throw new Error(
        "CUSTOMER_NOT_RESOLVED: customerIds debe contener únicamente identificadores de cliente previamente resueltos mediante search_customers. Resuelve primero el nombre comercial y vuelve a ejecutar get_sales_per_sqm con el customerId retornado.",
      );
    }
  }

  if (
    [
      "get_contract_conditions",
      "get_contract_cost_per_sqm",
      "analyze_contract_cost_incidence",
    ].includes(name) &&
    input.customerId
  ) {
    const match = /^\[PII_([A-Z_]+)_\d+\]$/.exec(
      String(input.customerId ?? ""),
    );

    if (match && match[1] !== "CUSTOMER_ID") {
      throw new Error(
        "CUSTOMER_NOT_RESOLVED: customerId debe ser un identificador de cliente previamente resuelto mediante search_customers. Resuelve primero el nombre comercial y vuelve a ejecutar la herramienta con el customerId retornado.",
      );
    }
  }
};

const formatPygInteger = (value) =>
  new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
  }).format(Math.abs(Number(value ?? 0)));

const containsNumericValue = (text, value) => {
  const numericValue = Math.abs(Number(value ?? 0));

  if (!Number.isFinite(numericValue)) {
    return false;
  }

  const compactText = String(text ?? "").replace(
    /[.\s\u00A0\u202F]/g,
    "",
  );
  const compactValue = String(Math.round(numericValue));

  return compactValue.length > 0 && compactText.includes(compactValue);
};

const formatPercentage = (value) =>
  new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(value ?? 0)));

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizePercentagePrecision = (text, value) => {
  const numericValue = Math.abs(Number(value ?? 0));

  if (!Number.isFinite(numericValue)) {
    return String(text ?? "");
  }

  const exactValue = formatPercentage(numericValue);
  const approximateValues = Array.from(
    new Set([
      numericValue.toFixed(1).replace(".", ","),
      String(Math.round(numericValue)),
      numericValue.toFixed(1),
    ]),
  ).filter((candidate) => candidate !== exactValue);

  let normalizedText = String(text ?? "");

  for (const candidate of approximateValues) {
    const pattern = new RegExp(
      `(^|[^\\d])${escapeRegex(candidate)}\\s*%`,
      "g",
    );

    normalizedText = normalizedText.replace(
      pattern,
      (_match, prefix) => `${prefix}${exactValue} %`,
    );
  }

  return normalizedText;
};

const containsPercentageValue = (text, value) => {
  const numericValue = Math.abs(Number(value ?? 0));

  if (!Number.isFinite(numericValue)) {
    return false;
  }

  const exactValue = formatPercentage(numericValue);
  const exactDotValue = exactValue.replace(",", ".");
  const normalizedText = String(text ?? "").replace(
    /[\u00A0\u202F]/g,
    " ",
  );

  return (
    normalizedText.includes(`${exactValue} %`) ||
    normalizedText.includes(`${exactValue}%`) ||
    normalizedText.includes(`${exactDotValue} %`) ||
    normalizedText.includes(`${exactDotValue}%`)
  );
};

const getTemporalSortValue = (dimension, period) => {
  const value = String(period ?? "");

  if (dimension === "year") {
    return Number(value) || 0;
  }

  if (dimension === "month") {
    const [month, year] = value.split("/").map(Number);
    return (year || 0) * 100 + (month || 0);
  }

  if (dimension === "day") {
    const [day, month, year] = value.split("/").map(Number);
    return (year || 0) * 10000 + (month || 0) * 100 + (day || 0);
  }

  return 0;
};

const buildSqmTwoPeriodComparison = (internalContext) => {
  const periods = Array.isArray(internalContext?.salesPerSqmPeriods)
    ? internalContext.salesPerSqmPeriods
    : [];

  const uniquePeriods = Array.from(
    new Map(
      periods
        .filter(
          (item) =>
            item?.dimension &&
            item?.period &&
            Number(item?.pyg ?? 0) > 0,
        )
        .map((item) => [
          `${item.dimension}:${item.period}`,
          item,
        ]),
    ).values(),
  );

  if (
    uniquePeriods.length !== 2 ||
    uniquePeriods[0].dimension !== uniquePeriods[1].dimension
  ) {
    return null;
  }

  const ordered = [...uniquePeriods].sort(
    (a, b) =>
      getTemporalSortValue(a.dimension, a.period) -
      getTemporalSortValue(b.dimension, b.period),
  );

  const [from, to] = ordered;
  const fromPyg = Number(from.pyg ?? 0);
  const toPyg = Number(to.pyg ?? 0);
  const differencePyg = toPyg - fromPyg;
  const percentageChange =
    fromPyg !== 0
      ? Number(((differencePyg / fromPyg) * 100).toFixed(2))
      : null;

  return {
    fromPeriod: from.period,
    toPeriod: to.period,
    absoluteDifferencePyg: Math.abs(differencePyg),
    percentageChange,
    direction:
      differencePyg > 0
        ? "INCREASE"
        : differencePyg < 0
          ? "DECREASE"
          : "UNCHANGED",
  };
};

const ensureSqmTwoPeriodComparison = ({
  text,
  internalContext,
}) => {
  const comparison = buildSqmTwoPeriodComparison(internalContext);

  if (!comparison) {
    return text;
  }

  const absoluteDifferencePyg = Number(
    comparison.absoluteDifferencePyg ?? 0,
  );
  const percentageChange =
    comparison.percentageChange === null ||
    comparison.percentageChange === undefined
      ? null
      : Number(comparison.percentageChange);

  const normalizedText =
    percentageChange === null
      ? String(text ?? "")
      : normalizePercentagePrecision(text, percentageChange);

  const hasAbsoluteDifference = containsNumericValue(
    normalizedText,
    absoluteDifferencePyg,
  );
  const hasPercentage =
    percentageChange === null
      ? true
      : containsPercentageValue(normalizedText, percentageChange);

  if (hasAbsoluteDifference && hasPercentage) {
    return normalizedText;
  }

  const fromPeriod = comparison.fromPeriod ?? null;
  const toPeriod = comparison.toPeriod ?? null;
  const periodLabel =
    fromPeriod && toPeriod
      ? ` entre ${fromPeriod} y ${toPeriod}`
      : "";

  const directionText =
    comparison.direction === "INCREASE"
      ? "aumentaron"
      : comparison.direction === "DECREASE"
        ? "disminuyeron"
        : "no variaron";

  if (!hasAbsoluteDifference && !hasPercentage && percentageChange !== null) {
    return `${String(normalizedText ?? "").trim()}\n\n**Comparación de ventas:** las ventas ${directionText} ${formatPercentage(
      percentageChange,
    )} %${periodLabel}, con una diferencia absoluta de ₲ ${formatPygInteger(
      absoluteDifferencePyg,
    )}.`;
  }

  if (!hasAbsoluteDifference) {
    return `${String(normalizedText ?? "").trim()}\n\n**Diferencia absoluta de ventas:** ₲ ${formatPygInteger(
      absoluteDifferencePyg,
    )}${periodLabel}.`;
  }

  return `${String(normalizedText ?? "").trim()}\n\n**Variación de ventas:** las ventas ${directionText} ${formatPercentage(
    percentageChange,
  )} %${periodLabel}.`;
};

const formatIncidencePercentage = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(numericValue);
};

const formatIncidenceArea = (area = {}) => {
  if (!area?.available || area?.min === null || area?.min === undefined) {
    return "—";
  }

  const formatAreaValue = (value) =>
    new Intl.NumberFormat("es-PY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value));

  if (
    area?.changedWithinPeriod &&
    area?.max !== null &&
    area?.max !== undefined &&
    Number(area.max) !== Number(area.min)
  ) {
    return `${formatAreaValue(area.min)}–${formatAreaValue(area.max)} m²`;
  }

  return `${formatAreaValue(area.min)} m²`;
};

const formatIncidenceMoney = (amount, currency = {}) => {
  const numericAmount = Number(amount ?? 0);
  const formatted = new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 2,
  }).format(numericAmount);
  const symbol = currency?.symbol ?? currency?.code ?? "";

  return symbol ? `${symbol} ${formatted}` : formatted;
};

const buildMonthlyIncidenceResponse = (result) => {
  if (
    result?.groupBy !== "month" ||
    !Array.isArray(result?.data) ||
    result.data.length === 0
  ) {
    return null;
  }

  const customerName =
    result?.customer?.name ??
    result?.customer?.businessName ??
    "local seleccionado";

  const configuredConcepts = Array.isArray(result?.configuredCostConcepts)
    ? result.configuredCostConcepts
    : [];

  const conceptColumns = configuredConcepts.length > 0
    ? configuredConcepts
    : Array.from(
        new Map(
          result.data
            .flatMap((period) => period?.shoppingCost?.concepts ?? [])
            .map((concept) => [
              String(concept?.conceptCode ?? concept?.description ?? ""),
              {
                conceptCode: concept?.conceptCode ?? null,
                description:
                  concept?.description ?? "Concepto no identificado",
              },
            ]),
        ).values(),
      );

  const lines = [
    `**Incidencia del costo total shopping de ${customerName}**`,
    "",
    `**Período:** ${result.dateFrom} al ${result.dateTo}`,
    "",
    "## Composición mensual del costo shopping",
    "",
  ];

  const headers = [
    "Mes",
    ...conceptColumns.map(
      (concept) => concept?.description ?? "Concepto no identificado",
    ),
    "Total costo shopping",
    "Superficie",
    "Ventas auditadas",
    "Incidencia",
  ];

  lines.push(
    `| ${headers.join(" | ")} |`,
    `|${headers
      .map((_, index) => (index === 0 ? "---" : "---:"))
      .join("|")}|`,
  );

  for (const period of result.data) {
    const concepts = Array.isArray(period?.shoppingCost?.concepts)
      ? period.shoppingCost.concepts
      : [];
    const missingConcepts = Array.isArray(
      period?.shoppingCost?.missingConcepts,
    )
      ? period.shoppingCost.missingConcepts
      : [];

    const conceptByCode = new Map(
      concepts.map((concept) => [
        String(concept?.conceptCode ?? ""),
        concept,
      ]),
    );
    const missingCodes = new Set(
      missingConcepts.map((concept) =>
        String(concept?.conceptCode ?? ""),
      ),
    );

    const conceptValues = conceptColumns.map((configuredConcept) => {
      const code = String(configuredConcept?.conceptCode ?? "");
      const concept = conceptByCode.get(code);

      if (concept) {
        return formatIncidenceMoney(
          concept?.amountExcludingTax,
          concept?.currency,
        );
      }

      if (missingCodes.has(code)) {
        return "Sin importe";
      }

      return "—";
    });

    const incidence = formatIncidencePercentage(
      period?.incidencePercentage,
    );

    lines.push(
      `| ${[
        period?.month ?? "—",
        ...conceptValues,
        period?.status === "COST_NOT_AVAILABLE"
          ? "—"
          : formatIncidenceMoney(
              period?.shoppingCost?.amount,
              period?.shoppingCost?.currency,
            ),
        formatIncidenceArea(period?.area),
        formatIncidenceMoney(
          Number(period?.sales?.amount ?? 0),
          period?.sales?.currency,
        ),
        incidence === null ? "—" : `**${incidence} %**`,
      ].join(" | ")} |`,
    );
  }

  lines.push(
    "",
    "**Observaciones:**",
  );

  for (const period of result.data) {
    const missingConcepts = Array.isArray(
      period?.shoppingCost?.missingConcepts,
    )
      ? period.shoppingCost.missingConcepts
      : [];

    if (missingConcepts.length > 0) {
      lines.push(
        `- **${period?.month ?? "Período"} — sin importe facturado:** ${missingConcepts
          .map(
            (concept) =>
              concept?.description ?? "Concepto no identificado",
          )
          .join(", ")}.`,
      );
    }

    if (!period?.contract) {
      lines.push(
        `- **${period?.month ?? "Período"}:** no existe un contrato aplicable ni facturación de conceptos oficiales que justifique utilizar un contrato próximo como referencia.`,
      );
    } else if (period?.contract?.resolution === "NEAREST_BILLED_FALLBACK") {
      lines.push(
        `- **${period?.month ?? "Período"}:** no había un contrato vigente en el período; como existen conceptos oficiales facturados, la superficie se obtuvo del contrato más próximo al período.`,
      );
    } else if (period?.status === "COST_NOT_AVAILABLE") {
      lines.push(
        `- **${period?.month ?? "Período"}:** existe un contrato aplicable, pero no se dispone de importes facturados de los conceptos oficiales para calcular la incidencia.`,
      );
    } else if (Number(period?.sales?.amount ?? 0) === 0) {
      lines.push(
        `- **${period?.month ?? "Período"}:** no se registraron ventas auditadas, por lo que no corresponde calcular una incidencia.`,
      );
    } else if (period?.shoppingCost?.complete === false) {
      lines.push(
        `- **${period?.month ?? "Período"}:** la incidencia corresponde al costo disponible porque faltan uno o más conceptos oficiales con importe facturado.`,
      );
    }
  }

  return lines.join("\n");
};

const executeToolRequests = async ({ content, sessionId, sourceMessages = [], chartRequested = false }) => {
  const toolResults = [];
  let actions = {};
  let internalContext = { presentationCalls: [] };
  const toolUses = content.filter((block) => block.toolUse);

  for (const block of toolUses) {
    throwIfRequestAborted();
    const { toolUseId, name, input = {} } = block.toolUse;
    const presentationCall = { name, input };
    internalContext.presentationCalls.push(presentationCall);

    logToolCall({
      name,
      input,
      sessionId,
    });

    if (internalContext.accessDenied) {
      // Complete the tool protocol without running the remaining batch after denial.
      toolResults.push({ toolResult: { toolUseId, status: "error", content: [{ json: {
        success: false, error: "REQUEST_STOPPED", message: ACCESS_DENIED_MESSAGE,
      } }] } });
      continue;
    }

    try {
      validateProtectedToolInput({ name, input });

      if (name === "generate_chart" && !chartRequested) throw new Error("El usuario debe solicitar el gráfico antes de generarlo.");
      const restoredInput = name === "generate_chart" ? input : restorePiiDeep(sessionId, input);

      const result = await executeTool({
        name,
        arguments: restoredInput,
        context: {
          sessionId,
          ...(name === "generate_chart" ? {
            chartSources: getChartSources([...sourceMessages, { role: "user", content: toolResults }]),
            restoreChartText: (value) => restorePiiTextForUser(sessionId, value),
          } : {}),
        },
      });
      throwIfRequestAborted();

      actions = mergeActions(
        actions,
        extractClientActions({ name, result }),
      );

      if (
        name === "get_sales_per_sqm" &&
        Array.isArray(result?.data)
      ) {
        const dimension =
          result?.analysisSummary?.dimension ??
          result?.availabilitySummary?.dimension ??
          null;
        const periodField = {
          day: "date",
          month: "month",
          year: "year",
        }[dimension];

        if (periodField) {
          const periodsWithSales = result.data
            .filter(
              (row) =>
                row?.[periodField] &&
                Number(row?.sales?.pyg ?? row?.totalSales ?? 0) > 0,
            )
            .map((row) => ({
              dimension,
              period: row[periodField],
              pyg: Number(row?.sales?.pyg ?? row?.totalSales ?? 0),
            }));

          internalContext = {
            ...internalContext,
            salesPerSqmPeriods: [
              ...(internalContext.salesPerSqmPeriods ?? []),
              ...periodsWithSales,
            ],
          };
        }
      }

      const resultForModel = removeClientOnlyMetadata({
        name,
        result,
      });

      const protectedResultForModel = protectPiiDeep(
        sessionId,
        resultForModel,
        null,
        [name],
      );
      if (isChartSourceTool(name) && protectedResultForModel && typeof protectedResultForModel === "object" && !Array.isArray(protectedResultForModel)) {
        protectedResultForModel.chartSourceId = toolUseId;
      }
      if (["get_member_purchases", "get_sales", "analyze_members", "compare_member_purchases_vs_sales", "analyze_campaign_sales_performance", "search_promotions", "get_member_soles", "get_soles_usage", "search_soles_usage_destinations", "search_soles_usage_movement_types", "get_vehicle_registrations", "get_member_vehicles"].includes(name)) {
        presentationCall.result = protectedResultForModel;
      }

      if (
        name === "analyze_contract_cost_incidence" &&
        protectedResultForModel?.groupBy === "month" &&
        Array.isArray(protectedResultForModel?.data)
      ) {
        internalContext = {
          ...internalContext,
          monthlyIncidenceResult: protectedResultForModel,
        };
      }

      logToolResult({
        name,
        result: protectedResultForModel,
      });

      toolResults.push({
        toolResult: {
          toolUseId,
          status: "success",
          content: [
            {
              json: normalizeToolResult(protectedResultForModel),
            },
          ],
        },
      });
    } catch (error) {
      throwIfRequestAborted();
      const denied = isAccessDenied(error);
      if (denied) {
        internalContext.accessDenied = true;
        actions = {};
      }
      const protectedErrorMessage = denied ? ACCESS_DENIED_MESSAGE : protectPiiText(
        sessionId,
        error?.message || "Error ejecutando la herramienta.",
      );

      logToolResult({
        name,
        error: {
          ...error,
          message: protectedErrorMessage,
        },
      });

      console.error(
        `Error ejecutando tool "${name}":`,
        protectedErrorMessage,
      );

      toolResults.push({
        toolResult: {
          toolUseId,
          status: "error",
          content: [
            {
              json: {
                success: false,
                error: denied ? ACCESS_DENIED_CODE : "TOOL_EXECUTION_ERROR",
                message: protectedErrorMessage,
              },
            },
          ],
        },
      });
    }
  }

  return {
    toolResults,
    actions,
    internalContext,
  };
};

export const chatService = async ({ message, sessionId }) => {
  throwIfRequestAborted();
  if (!message?.trim()) {
    throw new Error("El mensaje del usuario es obligatorio.");
  }

  if (!sessionId) {
    throw new Error("El sessionId es obligatorio.");
  }

  const history = getConversation(sessionId) ?? [];

  const protectedHistory = protectPiiDeep(
    sessionId,
    normalizeHistory(history),
  );

  const messages = [
    ...protectedHistory,
    {
      role: "user",
      content: [
        {
          text: protectPiiText(sessionId, message.trim()),
        },
      ],
    },
  ];

  const systemPrompt = getSystemPrompt({
    currentDate: getCurrentDateParaguay(),
  }) + "\n" + chartsPrompt;
  const chartRequested = isChartRequest(message);

  let toolIterations = 0;
  let bedrockIteration = 0;
  let conversationActions = {};
  let conversationInternalContext = {};
  let salesRefreshRetried = false;
  let followupAnswer = clarifyInitialBreakdown({ message, history: protectedHistory });

  const followupInput = resolveMemberAnalysisFollowup({
    message,
    history: protectedHistory,
  });
  const summaryFollowupInputs = resolveMemberSummaryFollowup({
    message,
    history: protectedHistory,
  });
  const salesYearComparison = resolveSalesYearComparison({ message, history: protectedHistory });
  const salesRefreshRequest = { message: messages.at(-1).content[0].text, history: protectedHistory };
  const salesRefreshInput = resolveSalesCategoryRemoval(salesRefreshRequest)
    ?? resolveEquivalentSalesExport(salesRefreshRequest)
    ?? resolveRepeatedSalesExport(salesRefreshRequest);
  const promotionPage = resolvePromotionSearchPage({ message, history: protectedHistory });
  const solesPage = resolveVehiclePage({ message, history: protectedHistory })
    ?? resolveVehicleGenderBreakdown({ message, history: protectedHistory })
    ?? resolveSolesUsagePage({ message, history: protectedHistory })
    ?? resolveMemberSolesPage({ message, history: protectedHistory })
    ?? resolveMemberSolesBreakdown({ message, history: protectedHistory })
    ?? resolveMemberSolesBalance({ message: messages.at(-1).content[0].text });
  if (salesYearComparison) {
    const content = salesYearComparison.inputs.map((input) => ({ toolUse: {
      toolUseId: `sales_comparison_${randomUUID()}`, name: "get_sales", input,
    } }));
    messages.push({ role: "assistant", content });
    const executed = await executeToolRequests({ content, sessionId });
    messages.push({ role: "user", content: executed.toolResults });
    conversationActions = executed.actions;
    conversationInternalContext = executed.internalContext;
    toolIterations = 1;
    followupAnswer = buildSalesYearComparisonResponse(executed.internalContext.presentationCalls)
      ?? "No fue posible completar la comparación de ambos años. Vuelve a intentarlo.";
  } else if (salesRefreshInput) {
    const content = [{ toolUse: {
      toolUseId: `sales_export_refresh_${randomUUID()}`, name: "get_sales", input: salesRefreshInput,
    } }];
    messages.push({ role: "assistant", content });
    const executed = await executeToolRequests({ content, sessionId });
    messages.push({ role: "user", content: executed.toolResults });
    conversationActions = executed.actions;
    conversationInternalContext = executed.internalContext;
    toolIterations = 1;
    // The fresh tool result, rather than the previous narrative/sample, is the
    // source for the answer. The standard executor rechecks Oracle permissions.
    followupAnswer = buildSalesSampleResponse(executed.internalContext.presentationCalls, { exportAvailable: Boolean(conversationActions.salesExport?.available) });
  } else if (solesPage) {
    if (solesPage.answer) followupAnswer = solesPage.answer;
    else {
      const content = [{ toolUse: { toolUseId: `soles_page_${randomUUID()}`, name: solesPage.toolName ?? "get_member_soles", input: solesPage.input } }];
      messages.push({ role: "assistant", content });
      const executed = await executeToolRequests({ content, sessionId });
      messages.push({ role: "user", content: executed.toolResults });
      conversationActions = executed.actions;
      conversationInternalContext = executed.internalContext;
      toolIterations = 1;
      followupAnswer = buildVehicleResponse(executed.internalContext.presentationCalls)
        ?? buildSolesUsageResponse(executed.internalContext.presentationCalls)
        ?? buildMemberSolesResponse(executed.internalContext.presentationCalls)
        ?? "No fue posible consultar la página de soles. Vuelve a intentarlo.";
    }
  } else if (promotionPage) {
    if (promotionPage.answer) followupAnswer = promotionPage.answer;
    else {
      const content = [{ toolUse: { toolUseId: `promotion_page_${randomUUID()}`, name: "search_promotions", input: promotionPage.input } }];
      messages.push({ role: "assistant", content });
      const executed = await executeToolRequests({ content, sessionId });
      messages.push({ role: "user", content: executed.toolResults });
      conversationActions = executed.actions;
      conversationInternalContext = executed.internalContext;
      toolIterations = 1;
      followupAnswer = buildPromotionSearchResponse(executed.internalContext.presentationCalls)
        ?? "No fue posible recuperar la página de campañas. Vuelve a intentarlo.";
    }
  } else if (summaryFollowupInputs) {
    const content = summaryFollowupInputs.map((input, index) => ({ toolUse: {
      toolUseId: `summary_followup_${index}_${randomUUID()}`,
      name: "analyze_members",
      input,
    } }));
    messages.push({ role: "assistant", content });
    const executed = await executeToolRequests({ content, sessionId });
    messages.push({ role: "user", content: executed.toolResults });
    conversationActions = executed.actions;
    conversationInternalContext = executed.internalContext;
    toolIterations = 1;
    followupAnswer = buildMemberSummaryResponse(executed.internalContext.presentationCalls)
      ?? "No fue posible completar el desglose de todos los períodos. Vuelve a intentarlo.";
  } else if (followupInput) {
    const content = [{ toolUse: {
      toolUseId: `ranking_followup_${randomUUID()}`,
      name: "analyze_members",
      input: followupInput,
    } }];
    messages.push({ role: "assistant", content });
    const executed = await executeToolRequests({ content, sessionId });
    messages.push({ role: "user", content: executed.toolResults });
    conversationActions = executed.actions;
    conversationInternalContext = executed.internalContext;
    toolIterations = 1;
    const result = executed.internalContext.presentationCalls[0]?.result;
    followupAnswer = result
      ? buildMemberAnalysisFollowupResponse({ input: followupInput, result })
      : executed.toolResults[0]?.toolResult?.content?.[0]?.json?.message ||
        "No fue posible consultar el desglose solicitado.";
  }

  if (conversationInternalContext.accessDenied) {
    followupAnswer = ACCESS_DENIED_MESSAGE;
    conversationActions = {};
  }

  while (true) {
    throwIfRequestAborted();
    bedrockIteration += 1;

    const commandInput = {
        modelId: config.awsBedrockModelId,
        system: [
          {
            text: systemPrompt,
          },
          {
            text: RUNTIME_CAPABILITIES_PROMPT,
          },
          ...(salesRefreshRetried ? [{ text: SALES_REFRESH_INSTRUCTION }] : []),
        ],
        messages,
        toolConfig: {
          tools,
        },
        inferenceConfig: {
          maxTokens: Number(config.awsBedrockMaxTokens || 8192),
          temperature: Number(config.awsBedrockTemperature || 0.1),
        },
      };

    if (!followupAnswer) logBedrockRequest({
      iteration: bedrockIteration,
      modelId: config.awsBedrockModelId,
      input: commandInput,
    });

    // These follow-ups already have their result. Render all rows directly,
    // avoiding further model/tool calls and preserving protected identifiers.
    const response = followupAnswer
      ? { output: { message: { role: "assistant", content: [{ text: followupAnswer }] } }, stopReason: "end_turn" }
      : await bedrockClient.send(new ConverseCommand(commandInput), {
        abortSignal: getRequestSignal(),
      });
    throwIfRequestAborted();

    if (!followupAnswer) logBedrockResponse({
      iteration: bedrockIteration,
      response,
    });

    const outputMessage = response.output?.message;

    if (!outputMessage) {
      throw new Error("Amazon Bedrock no devolvió un mensaje.");
    }

    /*
     * El modelo solo recibe mensajes y toolResults previamente
     * pseudonimizados, por lo que su salida ya opera sobre tokens [PII_*].
     *
     * No volvemos a ejecutar protectPiiDeep sobre texto generado por el
     * asistente: hacerlo podría confundir lenguaje natural como
     * "cliente seleccionado" con una entidad sensible real.
     */
    const safeOutputMessage = outputMessage;

    messages.push(safeOutputMessage);

    if (response.stopReason === "tool_use") {
      toolIterations += 1;

      if (toolIterations > MAX_TOOL_ITERATIONS) {
        throw new Error(
          `Se alcanzó el máximo de ${MAX_TOOL_ITERATIONS} iteraciones de herramientas.`,
        );
      }

      const {
        toolResults,
        actions,
        internalContext,
      } = await executeToolRequests({
        content: safeOutputMessage.content ?? [],
        sessionId,
        sourceMessages: messages,
        chartRequested,
      });

      conversationActions = mergeActions(
        conversationActions,
        actions,
      );
      conversationInternalContext = {
        ...conversationInternalContext,
        ...internalContext,
        presentationCalls: [
          ...(conversationInternalContext.presentationCalls ?? []),
          ...(internalContext.presentationCalls ?? []),
        ],
        salesPerSqmPeriods: [
          ...(conversationInternalContext.salesPerSqmPeriods ?? []),
          ...(internalContext.salesPerSqmPeriods ?? []),
        ],
      };

      // A complete breakdown is authoritative even when the model requested
      // it after changing dates or filters. Do not ask the model to rewrite it.
      followupAnswer = buildSalesYearComparisonResponse(conversationInternalContext.presentationCalls)
        ?? buildSalesSampleResponse(conversationInternalContext.presentationCalls, { exportAvailable: Boolean(conversationActions.salesExport?.available) })
        ?? buildSalesSeriesResponse(conversationInternalContext.presentationCalls, { message })
        ?? buildVehicleResponse(conversationInternalContext.presentationCalls)
        ?? buildSolesUsageResponse(conversationInternalContext.presentationCalls)
        ?? buildMemberSolesResponse(conversationInternalContext.presentationCalls)
        ?? buildPromotionSearchResponse(conversationInternalContext.presentationCalls)
        ?? buildCampaignSalesPerformanceResponse(conversationInternalContext.presentationCalls)
        ?? buildMemberPurchasesResponse(conversationInternalContext.presentationCalls, { restoreValue: (value) => restorePiiDeep(sessionId, value) })
        ?? buildMemberPurchasesVsSalesResponse(conversationInternalContext.presentationCalls)
        ?? buildMemberAnalysisBreakdownResponse(conversationInternalContext.presentationCalls);

      if (conversationInternalContext.accessDenied) {
        followupAnswer = ACCESS_DENIED_MESSAGE;
        conversationActions = {};
      } else if (conversationActions.chart?.available) followupAnswer = "Aquí tienes el gráfico solicitado.";
      else if (chartRequested && Object.keys(getChartSources([...messages, { role: "user", content: toolResults }])).length) followupAnswer = null;

      if (toolResults.length === 0) {
        throw new Error(
          "Bedrock indicó tool_use pero no devolvió ninguna herramienta.",
        );
      }

      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    const safeAssistantText = sanitizeAssistantTextForUser(
      extractText(safeOutputMessage),
    );

    if (!conversationInternalContext.accessDenied && needsSalesRefresh({
      message, answer: safeAssistantText, history: protectedHistory,
      calls: conversationInternalContext.presentationCalls, chartRequested,
    })) {
      // Give the model one opportunity to resolve the current request through
      // its normal tool schema. Never guess filters from an old narrative.
      if (!salesRefreshRetried) {
        messages.pop();
        salesRefreshRetried = true;
        continue;
      }
      followupAnswer = "No fue posible actualizar la consulta de ventas. Vuelve a intentarlo.";
      conversationActions = {};
      messages.pop();
      continue;
    }

    const monthlyIncidenceText = buildMonthlyIncidenceResponse(
      conversationInternalContext.monthlyIncidenceResult,
    );

    const completedAssistantText = conversationInternalContext.accessDenied
      ? ACCESS_DENIED_MESSAGE
      : conversationActions.chart?.available
      ? "Aquí tienes el gráfico solicitado."
      : monthlyIncidenceText ??
      buildSalesYearComparisonResponse(conversationInternalContext.presentationCalls) ??
      buildSalesSampleResponse(conversationInternalContext.presentationCalls, { exportAvailable: Boolean(conversationActions.salesExport?.available) }) ??
      buildSalesSeriesResponse(conversationInternalContext.presentationCalls, { message }) ??
      buildVehicleResponse(conversationInternalContext.presentationCalls) ??
      buildSolesUsageResponse(conversationInternalContext.presentationCalls) ??
      buildMemberSolesResponse(conversationInternalContext.presentationCalls) ??
      buildPromotionSearchResponse(conversationInternalContext.presentationCalls) ??
      buildCampaignSalesPerformanceResponse(conversationInternalContext.presentationCalls) ??
      buildMemberPurchasesResponse(conversationInternalContext.presentationCalls, { restoreValue: (value) => restorePiiDeep(sessionId, value) }) ??
      buildMemberPurchasesVsSalesResponse(conversationInternalContext.presentationCalls) ??
      buildMemberSummaryResponse(conversationInternalContext.presentationCalls) ??
      buildMemberAnalysisBreakdownResponse(conversationInternalContext.presentationCalls) ??
      buildMemberRankingResponse(conversationInternalContext.presentationCalls) ??
      ensureSqmTwoPeriodComparison({
        text: safeAssistantText,
        internalContext: conversationInternalContext,
      });

    const answer = restorePiiTextForUser(
      sessionId,
      completedAssistantText,
    );

    if (!answer) {
      throw new Error(
        `Bedrock finalizó con stopReason="${response.stopReason}" sin texto.`,
      );
    }

    // Persist the corrected, still pseudonymized answer so unsupported claims
    // from the model cannot become evidence in subsequent turns.
    messages[messages.length - 1] = {
      role: "assistant",
      content: [{ text: completedAssistantText }],
    };

    const compactedMessages =
      compactMemberPurchasePaginationHistory(messages);

    setConversation(
      sessionId,
      trimConversation(compactedMessages, 10),
    );

    return {
      answer,
      actions: conversationActions,
      stopReason: response.stopReason,
      toolIterations,
      usage: response.usage ?? null,
    };
  }
};
