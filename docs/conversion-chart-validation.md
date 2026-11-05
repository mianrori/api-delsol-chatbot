# Conversión y gráficos HTTP pendientes

Base `4428874` (PR #39 desplegada), rama `fix/conversion-provider-chart-http`.
No despliegue, merge, cambios de datos, permisos, expiraciones o integración.

## Hallazgos y correcciones

- Costo por m² admitía `$` como USD y podía convertir una moneda ambigua.
  Ahora exige evidencia compatible de código/descripción configurados y moneda
  facturada; `$` solo es neutro, no identifica divisa. Monedas desconocidas o
  contradictorias quedan sin calcular con motivo. Destino solo PYG/USD según
  esquema, validado antes de Oracle. No se cambia la selección contractual.
- La cotización no identificaba fecha de consulta: el proveedor devuelve ahora
  `retrievedAt`, `currentRate`, `rateType` y `dateBasis`; `quotedAt=null` porque
  no se acredita fecha de publicación. Los tres consumidores conservan esa
  metadata. Es venta actual, no tasa del período histórico de ventas/facturas.
- Fallos HTTP/red/timeout se propagan con códigos/mensajes seguros sin causa
  cruda; URL pública fija, sin credenciales ni redirecciones. Lectura del
  proveedor separada en data source/repository/service. Cero, formato inválido,
  ausencia y cotizaciones de venta contradictorias se rechazan sin fallback.
- Los gráficos perdían el período cuando solo estaba en los argumentos de la
  consulta fuente. La procedencia conserva esas fechas sin alterar el resultado
  o historial; el contexto del resultado conserva prioridad. No se acepta `$`
  como moneda inequívoca ni un estado monetario ambiguo.

## Evidencia y límites

`test/conversionProvider.test.js`: respuestas públicas **controladas**, ambos
sentidos PYG/USD, neto/área, fecha de consulta frente a factura histórica, tasas
inválidas/ambiguas, HTTP/red/timeout, monedas ambiguas/contradictorias y destino
inválido antes de SQL. No es una muestra Oracle ni una cotización real.

`test/chartHttpVariants.test.js` y `scripts/chart-http-variant-controls.mjs`:
ruta/controller/chat y render reales en loopback, modelo planificado. Prueba
unitaria con autenticación/fuente controladas; horizontal/circular/multiserie
concilian etiquetas, valores, moneda, período y fuente no mutada. No prueban
frontend ni modelo remoto. El mismo control admite fuente Oracle y auth reales.

`scripts/check-live-conversion-provider.mjs`: una llamada pública real, sin
Oracle ni login; segundo parseo de la misma respuesta y comprobación de fechas.
Publica solo códigos/booleanos. Si falla, queda `not_available`, no aprobada.
La fecha de publicación y una tasa histórica siguen sin acreditarse.

`scripts/check-conversion-chart-dev.mjs`: pendientes Oracle/HTTP exclusivamente.
Neto/IVA/superficie contra SELECT independiente y tasa de venta **controlada**;
fallo de proveedor también controlado, con Oracle real y cierre. Tres gráficos
HTTP consumen el resultado real de un perfil mensual ya acreditado, sin repetir
su conciliación de negocio ni fabricar datos; sus etiquetas, valores, moneda y
período se contrastan con esa fuente. No es muestra real multimoneda.

La sesión se solicita oculta mediante helper local ignorado; login DEV protegido
solo si no se proporciona sesión vigente. Secretos en memoria/stdin, sin argv,
reportes ni archivos; logout solo de sesión creada. Presupuesto Oracle por llamada
60 s y controles limitados a 10.000 filas. Reporte sanitizado sin filas/identidades.

Pendientes de evidencia: llamada real al proveedor y Oracle/HTTP del candidato
aún sin acreditar. Se conservan las muestras DEV ausentes y todas las pruebas
anteriores con su SHA; no se suman ejecuciones como casos únicos. PR en borrador
hasta revisar resultados y correcciones; sin despliegue ni merge.
