# Aviso de autorizacion en facturas

Cuando VW_BOT_FACTURAS contiene filas con USER_CAN_CONSULT = 'N' dentro de los filtros solicitados, el chatbot distingue la restriccion de una busqueda sin registros.

- Si no hay filas permitidas, devuelve el mensaje existente de falta de permisos (ACCESS_DENIED), sin filas, enlaces ni acciones.
- Si hay filas permitidas y restringidas, conserva la pagina y sus conteos autorizados, y agrega un aviso determinista de autorizacion parcial. No muestra registros, nombres, identificadores ni cantidades de la parte restringida.
- La comprobacion devuelve solamente un bit de existencia y reutiliza los filtros de cliente, concepto, fechas, factura, periodo, matricula y anulacion. Una pagina fuera de rango no se confunde con una denegacion total.
- Cuando no se resuelve un cliente/local autorizado, se comprueba una coincidencia restringida fuerte dentro del mismo periodo antes de responder NOT_FOUND. No se hacen selecciones sobre clientes restringidos ni se usa fuzzy para revelar sus identidades.
- Se mantienen sessionId, proxy Oracle y cierre de conexiones existentes. No se cambian permisos ni datos.

## Validacion enfocada

**38/38 pruebas sobre `6b85edd`**, con Node 22.23.4 sobre candidato temporal aislado, sin despliegue. Incluye repositorios, servicios, presentacion, flujo determinista de concepto/cliente y dos POST HTTP sinteticos (denegacion total y parcial). Los POST emplean SDK controlado con una llamada sintetica por caso; los tres casos tipados no invocan el modelo. Ninguna prueba llama al modelo real, Oracle real o descarga PDFs.

Salida local: logs/invoice-access-focused-node22.txt
SHA-256: b99f784dfce3e9cc3b2622ef47b6787c326cd1ecdad8efaa6b9c9ed672e864f8

Se ejecutaron solo test/invoiceAccess.test.js, test/invoices.test.js, test/invoiceNamedRequest.test.js y test/invoicePlatePdf.test.js. Las aserciones Oracle de estas 38 pruebas usan conexiones simuladas; esa evidencia previa no acredita Oracle real. Las evidencias y reservas anteriores, incluido el PDF positivo y el 404 separado, siguen siendo historicas y no validan estos cambios nuevos.

## Contraste Oracle DEV y HTTP

Ejecutor **ea812b4**, con aplicacion y pruebas identicas a **6b85edd** (diff src/test/config/paquetes vacio). Se reutilizaron las 38 pruebas por hash, sin ejecutarlas de nuevo. Se verificaron 309 archivos del candidato aislado; manifiesto SHA-256 4cfedf65ad2b808b29301983ccf57e568f79af84dfc3cfe41bddc980a786bf46.

**25/25 comprobaciones en 3 POST HTTP**, por router/controller/chat/services/repositories reales y sesion PostgreSQL/proxy Oracle autorizada. SELECT independientes conciliaron argumentos efectivos, filas de la primera pagina, importes, conteos de registros y facturas distintas, paginacion, enlaces Ver PDF y totales por moneda. Los totales del resumen se compararon en el resultado efectivo de get_invoices; su texto HTTP fue controlado y no valida una redaccion libre con importes por modelo real. El sondeo SQL nuevo se ejecuto realmente para los alcances permitidos y vacios. No se descargaron archivos.

| Muestra | Resultado | Limite |
| --- | --- | --- |
| Permitida | Disponible: detalle y resumen HTTP 200 conciliados con Oracle independiente. Sin aviso de denegacion incorrecto. | La pagina consultada no cubre todas las paginas posibles. |
| Sin facturas | HTTP 200 y pagina vacia, clasificacion Oracle independiente sin filas permitidas ni restringidas; mensaje de ausencia, sin denegacion falsa. | Se uso un filtro de fecha sin datos, confirmado por SELECT; no se creo una factura. |
| Restringida sin permitidas | No se encontro un alcance cliente/concepto/dia compuesto solo por filas restringidas. | No ejecutado con muestra Oracle real; aviso, ausencia de datos/enlaces y acciones vacias cubiertos solo por pruebas sinteticas. |
| Mixta | No se encontro un anio con ambas clases de permiso. | Aviso parcial, exclusion de restringidos, conteos/totales y segunda pagina mixta siguen sin evidencia Oracle real; cobertura sintetica previa. |

La busqueda de muestras restringidas exige cliente, concepto y fecha no nulos; la de mixtas exige fecha no nula y agrupa por anio. El resultado no demuestra ausencia global de filas USER_CAN_CONSULT=N en toda la vista ni para otras sesiones. No se alteraron muestras, datos o permisos para generar positivos. La rama de busqueda de cliente restringido tampoco obtuvo una muestra real; conserva cobertura sintetica.

SDK controlado: **4 invocaciones** para proponer herramientas/presentar resumen en estos 3 POST; **cero modelo real, Bedrock o proveedor**. Esta evidencia acredita HTTP y Oracle del candidato, no interpretacion libre por modelo real ni el listener desplegado de 5400. El servidor efimero, todas las conexiones Oracle y el logout cerraron; logs sanitizados aprobados. DEV desplegado permanece en PR47, con la misma imagen y arranque, salud 200 y sin reinicios.

[Reporte sanitizado](invoice-access-oracle-http-ea812b4.json), SHA-256 **9605fcaa58da48138d39c318988488ed97633cdbea93f3ec5f93b4ae478a7097**. Contiene solo metadatos tecnicos y comprobaciones; no filas, importes, nombres, IDs, sesiones, credenciales ni URLs reales. No se suman las 25 aserciones a las 38 pruebas como cobertura unica.

La PR #48 permanece en borrador. Este documento y la matriz registran resultados; no amplian la validacion real a las muestras faltantes. Las reservas historicas, incluido el PDF positivo y el 404 separado, permanecen sin cambios. Sin merge, despliegue o cambios de configuracion, datos, permisos o expiraciones.
