# Variantes pendientes: contraste acotado desde PR #38

Base: `30ffab4328df3f40228c5ffc839b6f088122e495`, actualizada desde origin.
Rama: `test/backend-pending-variants-dev`. No cambia aplicación, datos, permisos,
expiraciones ni integración frontend/ERP. No se reconstruye ni despliega DEV.

## Plan y criterio de evidencia

El ejecutor `scripts/check-backend-pending-variants-dev.mjs` contrasta solo las
ocho variantes de la tabla de cierre en la [matriz](backend-functional-matrix.md).
Usa el dispatcher real y SELECT escritos independientemente de los repositorios.
No es una conversación HTTP ni prueba un modelo real. Las peticiones HTTP y
denegaciones ya aprobadas se conservan con su SHA; no se atribuyen al ejecutor.

Cada caso registra únicamente código, estado y duración. Una muestra ausente es
`sample_missing`, nunca `passed`; un presupuesto agotado es `not_run`. Límite de
60 segundos por llamada Oracle, ocho minutos entre operaciones y 10.000 filas
por control; cohortes de facturas de 3–20 detalles, páginas de hasta dos filas
respetando el límite configurado. Se compara el multiconjunto completo y una
página posterior vacía, sin sumar distintos por página o moneda.

Soles usa igualdad exacta del documento canónico, sin normalizar la columna ni
quitar ceros. Las fechas se descubren en memoria; las ventanas históricas vacías
del socio de V conservan su condición, aunque otra ventana resulte positiva.
Compras promocionales conserva la pareja descripción/símbolo, sus cantidades e
importes y los motivos de no calculable, sin convertir ni mezclar grupos.

La conversión de costo depende de Maxicambios: se conserva su respuesta pública
solo en memoria para un segundo parseo; neto, IVA y área se leen de Oracle. No se
presenta esa tasa actual como histórica ni como dato de Oracle. Un fallo del
proveedor deja pendiente la verificación; no acredita ni invalida por sí solo
los cálculos previamente aprobados en la misma moneda.

## Ejecución local segura

Helper ignorado por Git: `logs/run-backend-pending-variants-dev.ps1`.
Primero verifica configuración DEV y protección de logs del ERP, salud, cadena
de evidencia previa y archivos del candidato comprometidos por hash. Después
solicita una sesión vigente mediante entrada oculta. Si se deja vacía, pide
usuario y contraseña ocultos de una cuenta autorizada y usa el login DEV ya
protegido. No valida otra vez el flujo de login. Secretos solo en memoria/stdin;
cierra únicamente la sesión que cree. No requiere documentos introducidos por
el usuario. El reporte seguro es `logs/backend-pending-variants.json`.

Se reutilizan por hash los trece bloques para sus perfiles y la corrección
monetaria W; se verifica que `src`, configuración y dependencias no difieran de
la base desplegada. Cierre de conexiones comprobado en cada caso nuevo.

## Estado

Ejecución `cafc5f11c34e7b19e538dc55de5feaeb61256dbb`, 05/11/2026
20:24:10–20:24:45 UTC, **global fallida**. Cinco bloques aprobados, dos fallidos,
uno sin muestra; sus 37 checks verdaderos **no equivalen a suite aprobada**.
179 archivos candidatos coinciden; cierre tras cada caso, cierre global y logout
de la sesión creada aprobados. `src`, configuración y dependencias sin cambios
respecto de `30ffab4`. No se volvieron a ejecutar los trece bloques históricos.

| Contraste | Resultado atribuido a `cafc5f1` |
| --- | --- |
| Chapa única/ausente | Aprobado, dueño y campos del vehículo contra SELECT, ausencia sin dueño. No chapa compartida. |
| Facturación por chapa | Parcial: tres páginas comprobadas (incluida la posterior vacía), metadatos y multiconjunto completo contra SELECT aprobados. Falla después, al leer el resumen como lista cuando es un único objeto; no aprueba el bloque completo. |
| Soles con ventanas combinadas positivas | Aprobado: filas reales para todos, vigentes al vencimiento y vencidos al día siguiente; cantidades, tipos, generado y saldo. Fechas descubiertas, no las tres ventanas históricas vacías de V. |
| Dos socios promocionales distintos | Aprobado: identidad exacta, períodos descubiertos, conteos e importes por pareja monetaria contra SQL; no constituye muestra multimoneda. |
| Cinco períodos relativos de vehículos | Aprobado: límites Asunción y distintos globales contra SQL. Hoy/ayer/semana/mes vacíos; año con filas. No sumar distintos de períodos. |
| Condiciones sin contrato | Aprobado: ausencia SQL y `NOT_FOUND` sin importes. |
| Condiciones ambiguas | `sample_missing`: la búsqueda de 2–20 contratos CNT activos por cliente no devolvió cohorte. No se declara ausencia de toda ambigüedad posible ni se reutiliza incidencia como prueba de este endpoint. |
| Conversión real de costo | Fallo durante la llamada al proveedor. Diagnóstico posterior sin sesión ni Oracle reproduce `PROVIDER_TIMEOUT` a los ocho segundos desde Docker. Pendiente externo; no hay tasa/importe aprobado ni bug aritmético demostrado. |

Reporte congelado local `logs/backend-pending-variants-cafc5f1.json`, SHA-256
`52886678e0945d2b55130659f5b79df76ed8a9338599645acaf9e762d24d8b2b`.
Logs del intervalo ampliado para incluir login/logout: chatbot cero líneas,
ERP dos, sin códigos Oracle/driver ni marcadores de campos sensibles. Solo se
inspeccionaron metadatos, sin publicar líneas crudas.

## Corrección del control y continuación mínima

El servicio de facturas tiene un contrato existente: sin dimensiones, cero/un
grupo monetario devuelve un objeto; varios grupos devuelven `{data}`. El control
asumía siempre `{data}` y fallaba antes del check del resumen. Se corrige solo el
adaptador del control (`invoiceSummaryRows`), sin cambiar el servicio ni agrupar
monedas. Dos regresiones adicionales consumen el servicio real con conexión
controlada: objeto PYG único y lista PYG/USD separada; rechazan formatos ajenos.
Seis pruebas enfocadas pasan en Node 22/Docker (cuatro previas y dos nuevas),
junto con el preflight completo de `255fd53`.

Helper nuevo `logs/run-backend-pending-summary-dev.ps1`: ejecuta **solo el resumen
de facturas por chapa**, con un SELECT independiente. Conserva por hash los
cinco bloques aprobados y los checks parciales del recorrido; comprueba que sus
cuerpos y el código de aplicación no hayan cambiado. No vuelve a recorrer
páginas, buscar contratos ambiguos ni consultar el proveedor bloqueado. La
cohorte del nuevo resumen se descubre de nuevo: no se afirma que sea idéntica
a la del recorrido anterior ni se suman sus checks como casos únicos.
Resultado del resumen: **6/6 aprobado sobre
`255fd53ae31ffcf1c90b13923c5f7d977efd23fa`**, 05/11/2026
20:37:55–20:37:56 UTC, caso de 690 ms. Importes y facturas distintas por moneda
contra SELECT independiente, sin sumar grupos; identidad proxy, cierre por caso,
cierre global y logout aprobados. 179 archivos candidatos coinciden; los cinco
cuerpos de casos reutilizados y `src`/configuración/dependencias no cambiaron.
`coverageComplete` corresponde solo al caso exclusivo, no al backend completo.

Reporte local congelado `logs/backend-pending-invoice-summary-255fd53.json`,
SHA-256 `419820e76b763afb31cc6d3ce74b8ef893e30e97951a0c5bee3bd6d22996deb1`.
Su vínculo al reporte parcial coincide con el hash anterior. Logs desde antes
del login hasta terminar el helper/logout: chatbot cero líneas y ERP dos; sin
códigos Oracle/driver ni marcadores sensibles detectados. No se repiten los
cinco bloques, las páginas, la muestra ausente ni la llamada pública bloqueada.

Las cuatro muestras DEV conocidas de la matriz y las limitaciones específicas
de G/R/T/V se conservan. Gráficos HTTP horizontal/circular/multiserie siguen como
variante backend separada, sin Oracle nuevo ni UI. No hay hallazgo funcional de
aplicación confirmado; la PR #39 sigue en borrador para revisión de la corrección
y de la evidencia. No hay merge ni despliegue. El commit posterior de resultados
modifica únicamente estos dos documentos; no requiere repetir controles.
