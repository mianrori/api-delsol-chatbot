# Contrastes independientes restantes del backend

Base: `ef9bff4`, PR #37 fusionada y desplegada. Rama separada:
`test/backend-independent-controls-dev`. PR #38 en borrador. Estado: ocho bloques
aprobados sobre `7762f35`, usos/ranking sobre `6e6c423` y compras/edades sobre
`d529cfd`. De los trece bloques de esta tanda solo saldo de soles sigue abierto.
Las variantes adicionales y muestras documentadas permanecen fuera de ese conteo.
No se declara cerrado el backend.

## Evidencia reutilizada

Se conservan H/B/D, Q/I/R, G, XLSX y los buscadores/ciclo completo de filtros
con sus commits y límites de la [matriz](backend-functional-matrix.md).
No se ejecutaron nuevamente sus suites. El login existente se usó solo para
obtener una sesión vigente y su logout propio aprobó. La comprobación desplegada
de PR #37 fue 30/30 sobre `ef9bff4`, con modelo controlado y Oracle real.
Su ausencia de ventas en el perfil de enero de 2023 no es una muestra de filas
registradas cuya suma sea cero.

S y P carecen de SHA propio. Los manifiestos de `87c6fa5` y `b315ff9` no bastan
para atribuirles retrospectivamente ese código: mantener la salvedad, sin inferir
un commit por fecha. Los nuevos contrastes se vincularán al archivo Git exacto
del candidato, con comprobación de hashes en Docker, no al árbol sin confirmar.

## Hallazgo corregido y pruebas

Canjes frente a ventas usaba el símbolo como identidad de moneda. Dos grupos
con descripciones diferentes y `$` se sobrescribían; el resultado dependía del
orden de las filas. La nueva prueba reprodujo el fallo (un grupo en lugar de tres).
La unión ahora conserva la pareja exacta descripción/símbolo que agrupa SQL.
La presentación muestra ambos campos. `$` sin descripción no habilita el porcentaje.
No se convierten importes, no se unifican alias ni se suman socios distintos.
Si las fuentes usan etiquetas diferentes para una misma divisa, quedan separadas
y sin denominador coincidente; esta decisión conservadora se muestra al usuario.

Validación enfocada: **10/10** pruebas de `memberPurchasesVsSales.test.js`,
Node 22 en imagen aislada de validación; incluye orden invertido, colisión de `$`,
metadatos distintos, filtros, porcentaje no calculable, permisos y cancelación.
No se reconstruyó ni desplegó DEV para ejecutar estas pruebas.
Código funcional: `222d761`. Además, **1/1** prueba nueva del puente HTTP
(`backendIndependentHttp.test.js`) pasa con autenticación/datos controlados,
sin login ni acceso a Oracle. Es una verificación del ejecutor, no evidencia DEV.

## Resultado Oracle/HTTP sobre `7762f35`

Reporte local `backend-independent-7762f35.json`: 13 bloques, ocho aprobados,
dos fallidos y tres sin muestra. **69/70 comprobaciones verdaderas; la ejecución
global falló**, no es un resultado 69/69 aprobado. Duración 92,248 s; 175 archivos
de fuente coinciden con Git. Todas las conexiones cerraron, incluso tras el timeout.
El logout de la sesión creada aprobó. La revisión compacta de logs retenidos del
intervalo devolvió cero líneas de ambos contenedores; no acredita otros intervalos.

| Bloque aprobado | Contraste que acredita | Lo que no acredita |
| --- | --- | --- |
| Ficha | Todos los campos de una ficha y documento ausente, contra Oracle independiente | Otros perfiles o cada combinación de nulos |
| Vehículos del socio | Documento, solo activos y débito sí/no contra filas independientes | No apareció chapa activa compartida; chapa única y ausencia no se ensayaron |
| Canjes/ventas | Ambos universos, resumen y mes, filtros local/rubro, importes/conteos/porcentajes y etiquetas monetarias | No acredita toda combinación de divisas reales |
| Campaña | Antes/durante/después, duración y límites, filtros e importes/facturas/moneda | No todas las campañas ni bases cero reales |
| Facturas | Cliente/fecha/número/período/anuladas y seguridad de consulta, moneda, importe y facturas únicas; total de detalle | No chapa ni recorrido de todas las páginas |
| Condiciones/costo | Identidad, área, conceptos/configuración, último facturado, vigencia, IVA y costo en misma moneda | No conversión con tasa real ni todos los empates/ausencias posibles |
| Colisión `$` | CTE Oracle con USD/CAD/sin identificar y ambos órdenes, servicio real con adaptador controlado | **No** es muestra real de socio multimoneda |
| Cuatro HTTP positivos | Canjes/ventas, facturas, condiciones y costo, argumentos y resultados coincidentes con los contrastados | Modelo/resolución preparados; no integración frontend/ERP ni lenguaje libre |

## Cinco bloques que requieren continuación acotada

- Compras: `NJS-123` a los 60,179 s antes de la primera conciliación. La búsqueda
  global agrupaba/ordenaba socios; se sustituye en el ejecutor por una muestra
  acotada sin ese agregado global, conservando filtros y límites. Falta repetir
  solo este contraste y registrar la operación exacta si vuelve a fallar.
- Saldo de soles: falló la primera comparación de tipos/totales. Se reproduce con
  datos controlados la diferencia NUMBER/CHAR con ceros/espacios; el contrato de
  la herramienta devuelve IDs numéricos. El control ahora normaliza exclusivamente
  ese ID y mantiene nulo distinto de cero. **La causa real sigue sin confirmar**:
  el próximo reporte compara etiquetas crudas y numéricas con los mismos totales,
  sin publicar valores. No cambia validación de documentos ni identidad de sesión.
- Usos combinados, ranking de usos y edades/únicos de altas no encontraron muestra
  en enero–mayo de 2023. Esto no demuestra que falten datos en toda la vista. La
  continuación descubre un mes con filas disponibles, en memoria, y registra
  únicamente el período y códigos seguros.

Las cuatro pruebas nuevas de `backendIndependentControls.test.js` pasan en Node 22
Docker. Cubren normalización numérica/nulos, respuesta controlada, límites reales
del mes y exclusión de los ocho bloques aprobados. No se repiten las 10+1 pruebas
previas porque el código de aplicación y el puente HTTP permanecen iguales.

El helper `logs/run-backend-independent-remaining-dev.ps1` ejecutó únicamente
los cinco pendientes. Reutilizó los ocho bloques por SHA del reporte y comprobó
que `src/`, configuración y dependencias eran idénticos a `7762f35`.

## Continuación revisada sobre `6e6c423`

Reporte local `backend-independent-6e6c423.json`: cinco bloques, dos aprobados y
tres fallidos; global fallida (**18/20 checks verdaderos**, no sumar con N).
Duración 63,795 s; 176 archivos candidatos idénticos, cierre completo y logout
propio aprobados. La referencia al reporte de `7762f35` coincide por SHA-256.

| Caso | Resultado y alcance |
| --- | --- |
| Usos de soles | Aprobado en octubre de 2023: socio, movimiento, tipo/código de destino, tipo de sol, rubro, transacción, cantidad; suma, movimientos, transacciones y socios distintos por tipo; conteo del detalle. No suma distintos entre grupos. |
| Ranking de usos | Aprobado en octubre de 2023: orden y límite de socios y desglose por tipo contra Oracle independiente. La muestra devuelve cuatro socios; no inventa el quinto. |
| Compras | NJS-123 después de 60,848 s en `PURCHASE_FILTER_PAIR_DISCOVERY`, no en el descubrimiento inicial ya acotado. No hay conciliación aprobada. La siguiente revisión reutiliza local/rubro de cada fila muestreada y elimina ese segundo agregado/ordenamiento de descubrimiento. |
| Saldo de soles | Falla nuevamente `all` sin ventanas. Difieren número de grupos, generado, saldo y conteos; la equivalencia numérica del tipo **no** lo resuelve. No atribuir el fallo únicamente a ceros/espacios ni modificar importes para hacerlo pasar. |
| Edades/únicos de vehículos | Ya existe muestra de julio de 2025, pero falla el primer contraste de edades. No es una limitación de muestra ausente. Hace falta separar discrepancia del control JS de un fallo del servicio. |

La continuación no cambió código de aplicación. La próxima etapa de diagnóstico
ejecuta únicamente compras, saldo y edades. En soles captura SQL/binds/resultados
solo en memoria para comparar el control, el servicio directo sobre **la misma
conexión**, el resultado SQL anterior al mapeo y el dispatcher. Publica únicamente
indicadores de coincidencia y cantidades de grupos, no documentos ni importes.

En edades añade un censo Oracle independiente con búsqueda correlacionada de fecha
de nacimiento y conteos globales separados. Conserva el calendario/Map de JS como
diagnóstico: no debe sustituir la semántica de DATE/CHAR y DISTINCT de Oracle.
Todavía no se declara corregida la discrepancia; se exige coincidencia con ese
censo. Los conteos distintos globales se calculan aparte, nunca sumando grupos.

Dos pruebas nuevas del muestreo y la selección de los tres casos pasan en Node 22
Docker. Las cuatro anteriores conservan su evidencia; no se repitieron los bloques
Oracle/HTTP aprobados. Helper preparado: `logs/run-backend-independent-diagnostic-dev.ps1`.
Conserva por hash ambos reportes previos y verifica el código de aplicación sin
cambios. Su ejecución se revisa a continuación; la PR conserva el borrador.

## Diagnóstico revisado sobre `d529cfd`

Reporte `backend-independent-d529cfd.json`: únicamente tres bloques, compras y
edades aprobados y soles fallido; duración 8,247 s, 176 archivos idénticos, cierre
completo y logout propios aprobados. Los 18 checks registrados son verdaderos,
pero **la ejecución global falla** por la excepción de soles: no es un 18/18 que
acredite los tres casos. Reutiliza por hash las dos ejecuciones anteriores.

- Compras: dos documentos distintos, resumen mensual por pareja monetaria,
  local/rubro combinados y conteo real de página inicial contra SQL independiente
  aprobados. El descubrimiento que agotaba 60 segundos queda eliminado: la fila
  de muestra ya llevaba una pareja real del mismo documento. Caso completo 6,492 s.
  No se altera el servicio ni se repite la paginación HTTP histórica.
- Vehículos: julio de 2025, edades a referencia/al registro, distintos globales
  y por grupo, filtros marca/modelo/color/débito y detalle aprobados. Los totales
  globales JS ya coincidían, su calendario/agrupación no; el servicio coincide con
  el censo Oracle independiente en ambas referencias y sus tres grupos. Se confirma
  discrepancia del control JS, no un fallo del servicio. El censo conserva DATE/CHAR
  y DISTINCT en Oracle; no sumar distintos entre grupos.
- Soles: la discrepancia de grupos/totales sigue abierta. La traza del servicio
  directo se interrumpió con NJS-005: el adaptador llamaba `execute(sql, binds,
  undefined)`. node-oracledb considera inválido ese tercer argumento; debe omitirlo
  al usar la sobrecarga de dos argumentos. Es un fallo del ejecutor, no evidencia
  de que el servicio Oracle produzca NJS-005 ni explicación del saldo discrepante.

El adaptador ahora conserva la sobrecarga de dos/tres argumentos. Dos pruebas
nuevas pasan: aislamiento exclusivo de soles y reproducción de NJS-005 con el
validador real de node-oracledb (solo red controlada, sin login), opciones válidas
y propagación de errores. El preflight del próximo helper repite esa comprobación
del driver antes de solicitar valores ocultos; así no basta con importar módulos.

Continuación ejecutada: `logs/run-backend-independent-soles-dev.ps1`, únicamente
saldo y su traza de misma conexión. Reutiliza los doce bloques aprobados mediante
los tres reportes y sus hashes; exige código de aplicación/configuración/dependencias
idéntico. No repite compras, vehículos, usos ni los cuatro HTTP. La PR sigue en
borrador. El resultado y la corrección del control se detallan a continuación.

## Causa confirmada sobre `ef27c48`

Reporte `backend-independent-ef27c48.json`: únicamente saldo, fallido; cinco de
seis checks verdaderos, 0,754 s, 176 archivos idénticos, cierre y logout aprobados.
El adaptador ya supera NJS-005 y la traza de misma conexión confirma:

- La muestra tiene espacios exteriores. El control usaba ese valor crudo; el
  servicio aplica `.trim()` al argumento, conforme a su contrato existente.
- Los binds no eran iguales: el control seleccionaba un grupo y servicio/dispatcher
  dos. El control era estable antes/después, sin cambio de datos durante la lectura.
- El SQL capturado coincide con su mapeo y el servicio directo con el dispatcher.
  No hay filtro de fecha inesperado ni problema de formato de filas del driver.

La discrepancia se localiza en **argumentos distintos del ejecutor**, no en el
mapeo ni en el cálculo del servicio. El control ahora normaliza una vez la entrada
igual que `get_member_soles` y entrega exactamente la misma cadena a ambos caminos.
Se conserva `COD_SOCIO = :d`: **no** se aplica TRIM a la columna, no se mezclan
identificadores almacenados con/sin espacios ni se eliminan ceros iniciales o
espacios internos. No se cambia el servicio, la resolución de identidad ni permisos.

Dos regresiones nuevas Node 22 Docker reproducen los conjuntos distintos con datos
controlados y verifican la conciliación al usar el mismo argumento canónico, la
preservación de identidad y el rechazo de entrada vacía/no textual. Pasan 2/2.
No sustituyen la repetición Oracle del control corregido.

El helper exclusivo de saldo conserva los doce bloques aprobados por hash y
registra esta traza como investigación, **sin contarla como aprobada**. Su preflight
verifica tanto las dos nuevas regresiones como la sobrecarga real del driver antes
de pedir secretos. Añade comprobación del documento exacto en cada variante y
registra explícitamente las ventanas sin filas; no las describe como muestra positiva.
Pendiente de ejecutar/revisar el contraste corregido para las seis variantes.

## Alcance del ejecutor

`scripts/check-backend-independent-dev.mjs` compara el dispatcher real con SELECT
independientes, sin reutilizar generadores SQL de repositorios. Consultas limitadas
a 10.000 filas de control y 60 segundos por llamada Oracle. Período histórico de
compras/canjes: enero–mayo de 2023. Para usos y vehículos la continuación descubre
un mes disponible tras la ausencia en ese período. La selección de muestras ocurre
dentro del usuario Oracle autorizado; los documentos nunca salen de memoria.
El presupuesto global es de ocho minutos entre operaciones; una llamada ya
iniciada conserva su timeout. Agotar el presupuesto o el límite de filas produce
`not_run`, distinto de muestra ausente y de aprobación. Las páginas iniciales
respetan el límite configurado y usan como máximo tres filas.

| Contraste funcional pendiente | Caso preparado | Límite explícito |
| --- | --- | --- |
| Ficha de socio | Encontrado, todos los campos/nulos de la muestra y ausencia comprobada | No promete muestra con cada campo nulo ni prueba de PII con usuario ajeno |
| Compras individuales | Dos documentos positivos distintos; mes/moneda/importe/conteo; local+rubro; conteo real de página inicial | Recorrido HTTP anterior reutilizado; muestra multimoneda se detecta, no se acredita automáticamente |
| Vehículos del socio | Documento, activo, débito; chapa compartida si existe | Chapa única y ausencia requieren contraste adicional dedicado |
| Saldo de soles | Tipo, saldo/generado/conteo; vigente/vencido/todos, referencia y generación/vencimiento combinados | Sin repetir la conversación S; ventanas sin filas se registran como tales |
| Usos de soles | Socio, movimiento, destino tipo/código, tipo de sol, rubro, transacción y cantidad combinados; resumen/detalle | Un caso combinado no acredita por separado todas las combinaciones |
| Ranking de usos | Top cinco socios, orden y desglose por tipo contra SQL | No suma conteos distintos entre grupos |
| Altas de vehículos | Edad a fecha fija/al registro; únicos globales y por grupo; filtros de marca/modelo/color/débito y detalle | Fechas relativas aún requieren contraste específico |
| Canjes/ventas | Dos universos independientes, resumen/mes y filtros combinados; cantidades, socios, importes y porcentaje por pareja monetaria | CTE de `$` y orden invertido es controlada, no muestra real multimoneda |
| Campaña | Tres períodos equivalentes, límites y ventas por filtro local+rubro | Cohorte 2023; una campaña con varias monedas internas se considera hallazgo, no aprobación |
| Facturas | Seguridad de consulta, cliente, fecha, número, período y anuladas; moneda/importe/facturas únicas; conteos del detalle | Chapa y recorrido de todas las páginas siguen pendientes específicos |
| Condiciones/costo por m² | Identidad/área/conceptos; último facturado, IVA y vigencia contra filas independientes; costo en misma moneda | Cohorte de hasta diez contratos; conversión y ausencia/ambigüedad de este endpoint no quedan acreditadas por incidencia |
| HTTP positivo pendiente/afectado | Canjes/ventas, facturas, condiciones y costo con el perfil contrastado | Ruta/controller/chat y Oracle reales en loopback aislado; modelo y resolución previa preparados, no conversación libre ni integración ERP |

Los casos sin muestra quedan `sample_missing`, nunca aprobados. Los fallos quedan
`failed`; un reporte parcial no acredita cierre. Se comprueba cierre tras cada caso.
Una sesión vigente se resuelve por PostgreSQL/proxy Oracle; no se acepta username
para elegir la identidad de las consultas. Denegación D y pruebas de autenticación
existentes se reutilizan: la corrección no cambia ese flujo.

El helper ignorado `logs/run-backend-independent-dev.ps1` pide una sesión autorizada
mediante entrada oculta. Si se deja vacía, pide usuario/contraseña ocultos para el
login DEV ya autorizado, comprobando previamente su protección de logs. Conserva
secretos solo en memoria/stdin y cierra únicamente la sesión que crea. El reporte
contiene códigos, estados, duración y commit; no filas, identidades, argumentos,
credenciales ni errores crudos. El preflight no inicia sesión.

## Muestras y límites que se conservan

- Ventas por m²: superficie cero y cambio histórico real; cobertura controlada aprobada.
- Incidencia: ventas registradas que sumen cero; cobertura controlada aprobada.
- Compras promocionales: socio real con varias monedas; grupos reconocidos/ambiguos controlados en CTE. Segundo socio positivo aún sin acreditar.
- Segmentación: muestra real multimoneda pendiente, con su propia cobertura controlada.
- Compras individuales: variantes multimoneda sin evidencia específica; no extrapolar la cobertura de promociones.
- Otras coincidencias nominales/fuzzy, combinaciones no exhaustivas y muestras de catálogos conservan los límites de la matriz; los buscadores aprobados no se repiten.

No se cambian datos, permisos, expiraciones ni integración frontend/ERP. No merge
ni despliegue de la corrección. La PR debe permanecer en borrador hasta revisar
el nuevo reporte y resolver cualquier hallazgo.
