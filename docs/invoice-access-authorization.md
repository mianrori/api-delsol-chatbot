# Aviso de autorizacion en facturas

Cuando VW_BOT_FACTURAS contiene filas con USER_CAN_CONSULT = 'N' dentro de los filtros solicitados, el chatbot distingue la restriccion de una busqueda sin registros.

- Si no hay filas permitidas, devuelve el mensaje existente de falta de permisos (ACCESS_DENIED), sin filas, enlaces ni acciones.
- Si hay filas permitidas y restringidas, conserva la pagina y sus conteos autorizados, y agrega un aviso determinista de autorizacion parcial. No muestra registros, nombres, identificadores ni cantidades de la parte restringida.
- La comprobacion devuelve solamente un bit de existencia y reutiliza los filtros de cliente, concepto, fechas, factura, periodo, matricula y anulacion. Una pagina fuera de rango no se confunde con una denegacion total.
- Cuando no se resuelve un cliente/local autorizado, se comprueba una coincidencia restringida fuerte dentro del mismo periodo antes de responder NOT_FOUND. No se hacen selecciones sobre clientes restringidos ni se usa fuzzy para revelar sus identidades.
- Se mantienen sessionId, proxy Oracle y cierre de conexiones existentes. No se cambian permisos ni datos.

## Validacion enfocada

38/38 pruebas con Node 22.23.4 sobre candidato temporal aislado, sin despliegue. Incluye repositorios, servicios, presentacion, flujo determinista de concepto/cliente y dos POST HTTP sinteticos (denegacion total y parcial). Los POST emplean SDK controlado con una llamada sintetica por caso; los tres casos tipados no invocan el modelo. Ninguna prueba llama al modelo real, Oracle real o descarga PDFs.

Salida local: logs/invoice-access-focused-node22.txt
SHA-256: b99f784dfce3e9cc3b2622ef47b6787c326cd1ecdad8efaa6b9c9ed672e864f8

Se ejecutaron solo test/invoiceAccess.test.js, test/invoices.test.js, test/invoiceNamedRequest.test.js y test/invoicePlatePdf.test.js. Las aserciones Oracle usan conexiones simuladas: la sintaxis y los resultados del nuevo sondeo no se atribuyen a una validacion Oracle real. Las evidencias y reservas anteriores, incluido el PDF positivo y el 404 separado, siguen siendo historicas y no validan estos cambios nuevos.
