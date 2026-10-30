# Ventas por m²: validación DEV

Base: `13e69ef`, después del merge de la PR #32. Alcance exclusivo: ventas por m².
No se modifican incidencia contractual, compras por promoción ni expiraciones.

## Regla histórica y cálculo

- Se busca el contrato de tipo configurado aplicable **en la fecha de cada
  venta**, con fecha de inicio inclusiva y vencimiento inclusivo o abierto.
  No se filtra por el estado actual del contrato.
- Solo una coincidencia con superficie positiva permite calcular el indicador.
  Cero coincidencias, superficie nula/cero/negativa o contratos superpuestos no
  autorizan a sustituir el área por la de otro contrato, ni a elegir un máximo.
- El indicador del período es `SUM(venta / superficie aplicable a esa venta)`.
  Si el área cambia, no se divide el total por el último metraje ni por un promedio.
  Si falta área para alguna venta, el indicador completo queda sin calcular.
- Para varios locales se exige agrupar por local: no se suma un indicador de
  locales distintos para presentarlo como si correspondiera a un único local.
- Se conservan ventas totales cuando el área falta o es ambigua, pero no se
  inventan ventas por m². Se protegen divisiones con `NULLIF` y validación de área.
- Monedas diferentes no producen un total monetario conjunto. Monedas desconocidas
  o contradictorias no se convierten a PYG por inferencia.
- Para PYG se calcula también USD usando la **venta actual** de Maxicambios.
  La superficie es histórica; la cotización es actual, no histórica. Una cotización
  fallida, cero, negativa o no finita deja USD sin calcular. Para ventas originalmente
  en USD se conserva USD sin tratar ese importe como PYG.

## Fallos reproducidos y correcciones

La medición inicial contra Oracle mostró diferencias en contratos ambiguos y en
un rubro sin coincidencias: la consulta anterior elegía un área mediante
`MAX ... KEEP`, y la herramienta no admitía el filtro por rubro, por lo que se
ignoraba. El control independiente no validó esos resultados.

Se cuentan los contratos aplicables antes de validar el área, sin descartar primero
los contratos con área inválida. Solo se usa el metraje cuando la coincidencia es
única. Se incorporan filtros enlazados por rubro y tipo de día, validación de fechas
y agrupación, y rechazo de monedas incompatibles.

Los seguimientos explícitos que cambian un único campo conservan los demás
argumentos de la última consulta exitosa. Ejemplos:

- `Ahora cambia el período a 01/02/2023 al 28/02/2023; conserva los demás filtros`
- `Ahora cambia el local a "Otro local"; conserva los demás filtros`
- `Ahora cambia el rubro a "Otro rubro"; conserva los demás filtros`

Los nombres se resuelven por las herramientas habituales; no se convierten en IDs
mediante una expresión regular. Cambios compuestos, otro tema o una consulta previa
fallida siguen el flujo normal. La tabla final se genera desde los valores de la
herramienta, con restauración de PII y escape de Markdown, sin pedir al modelo que
reescriba importes o invente un indicador donde no existe.

## Controles independientes y reproducción

`scripts/run-sales-per-sqm-dev.mjs` consulta por separado las ventas y los contratos
permitidos por la sesión. Asocia fechas y contratos en JavaScript y agrega los
importes y divisiones de control. No llama a los repositorios de la implementación
para construir esos valores ni reutiliza el SQL de asociación de área.

Configuración privada: `BOT_TEST_SESSION_ID` y, opcionalmente,
`BOT_TEST_DENIED_SESSION_ID`. Fechas: `BOT_TEST_SQM_FROM=01/01/2023` y
`BOT_TEST_SQM_TO=31/05/2023` por defecto. `BOT_TEST_SQM_HTTP=true` activa los tres
seguimientos HTTP. El ejecutor utiliza las rutas y controladores reales en una
instancia HTTP temporal dentro del contenedor; parte de un contexto previo con
argumentos y resultados reales de Oracle para aislar el seguimiento de la búsqueda
inicial. Los controles SQL contrastan los resultados de cada seguimiento.

```powershell
docker exec -e BOT_TEST_SESSION_ID -e BOT_TEST_DENIED_SESSION_ID -e BOT_TEST_SQM_HTTP=true api-delsol-chatbot-dev node scripts/run-sales-per-sqm-dev.mjs
```

Introduce las sesiones solo mediante entradas ocultas de una terminal local, como
`Read-Host -AsSecureString`, y pásalas como variables del proceso. No las escribas
en argumentos literales, `.env`, documentos ni chat. El helper temporal local de
esta validación está en `logs/run-sales-per-sqm-dev.ps1`; no se versiona.

El reporte predeterminado es `/tmp/sales-per-sqm-dev.json` dentro de Linux y se puede
cambiar con `BOT_TEST_REPORT`. Contiene códigos, tiempos e indicadores de cobertura,
sin identidades, nombres, importes, cotizaciones ni filas. Los resultados se usan
solo en memoria. Se rechazan logging de payloads o PII sin ocultar y rangos inválidos;
los controles tienen límites de filas explícitos para no validar datos truncados.

## Resultados

- **251/251 pruebas** aprobadas en Node 22, en un contenedor efímero sin red externa,
  volúmenes ni credenciales. Cubren área ausente/cero/parcial/ambigua/cambiante,
  moneda nativa USD, mezcla/conflicto de monedas, cotización no disponible/inválida,
  Compra frente a Venta, filtros, fechas, cancelación, presentación y autorización.
- **114/114 comprobaciones** aprobadas contra Oracle DEV y mediante HTTP. Hay
  muestras reales con superficie histórica válida, ausente, parcial y ambigua.
  La conversión real de PYG a USD se contrastó con la tasa de venta retornada.
- Los tres seguimientos HTTP ejecutaron nuevas consultas y conservaron local,
  rubro, período, agrupación y tipo de día salvo el campo explícitamente cambiado;
  cada resultado se contrastó con los controles independientes.
- La validación ejecutó los módulos candidatos en procesos temporales dentro de
  Docker DEV; no se reconstruyó ni reinició el servicio desplegado. Después se
  restituyeron los cuatro módulos originales de la base en el contenedor.
- La sesión se resolvió en PostgreSQL. Se verificó el cierre real de la conexión
  de controles y de la conexión que recibió una denegación Oracle con otro usuario.
  Las pruebas del dispatcher también verifican éxito y ORA-00942/01031, ignoran un
  `username` suministrado en argumentos y comprueban cierre en ambos casos.

## Pendientes y límites

No se encontró en enero–mayo de 2023 una muestra real con **superficie cero** ni
una con **cambio de superficie** dentro del período. Estos casos pasan con datos
controlados; su validación contra una muestra real DEV queda pendiente. No se
crearon ni alteraron contratos o ventas para fabricar esa cobertura.

Los controles comprueban coherencia con las vistas autorizadas, no sustituyen una
auditoría de las tablas ERP subyacentes. La prueba HTTP de seguimientos usa un
contexto previo real preparado por el ejecutor; no cubre todas las variantes de
lenguaje o de desambiguación inicial de locales históricos. Las reglas compartidas
de resolución de locales con contrato activo no se modifican en este bloque.
