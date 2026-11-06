# Conversión y gráficos HTTP pendientes

Base `4428874` (PR #39 desplegada), rama `fix/conversion-provider-chart-http`.
No despliegue, merge, cambios de datos, permisos, expiraciones o integración.

## Hallazgos y correcciones

- Costo por m² admitía `$` como USD y podía convertir una moneda ambigua.
  Ahora exige evidencia compatible de código/descripción configurados y moneda
  facturada; `$` solo es neutro, no identifica divisa. Monedas desconocidas o
  contradictorias quedan sin calcular con motivo. Destino solo PYG/USD según
  esquema, validado antes del SQL del servicio. No se cambia la selección contractual.
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

## Resultado del candidato `e5868ea`

Seis archivos de pruebas enfocados aprobados en Node 22/Docker: proveedor,
gráficos HTTP, gráficos, contratos, ventas por m² e incidencia contractual.
Son los consumidores afectados, no las suites generales del backend. Preflight
completo y verificación de archivos comprometidos aprobados; aplicación DEV
desplegada permanece en `4428874`, sin reconstrucción.

Llamada real del candidato, 05/11/2026 21:20:23–21:20:29 UTC:
`status=not_available`, `EXCHANGE_PROVIDER_QUOTE_UNAVAILABLE`. Se recibió la
página pero no se acreditó una cotización válida bajo el contrato de extracción.
No es el timeout anterior ni equivale a tasa aprobada. Diagnóstico adicional
solo de estructura/etiquetas confirma que no hay fila de tabla inequívoca de
USD/Dólar en el texto inspeccionado; no se elige otra moneda o primer número ni
se relaja el parser. HTML solo en memoria. Reporte local ignorado:
`logs/conversion-provider-live.json`. No hay fecha de publicación acreditada.

## Resultado Oracle/HTTP `92b5e11`

**32/32 controles en tres bloques aprobados** sobre
`92b5e114037ac6d41227f974fe6a95f132e407af`, código idéntico a `e5868ea`.
05/11/2026 21:27:14–21:27:19 UTC, 184 archivos candidatos coincidentes.

| Bloque | Fuente de evidencia | Resultado |
| --- | --- | --- |
| Neto/superficie y conversión | SELECT independientes y herramienta Oracle reales; respuesta del proveedor explícitamente controlada | Neto, área, moneda, aritmética con venta 7.100 y fecha de consulta frente a factura histórica aprobados; no es una tasa real del proveedor. |
| Fallo del proveedor | Consulta contractual Oracle real y fallo de red controlado | Error seguro propagado, sin fallback ni causa cruda; cierre aprobado. No se simula un fallo de Oracle. |
| Horizontal/circular/multiserie HTTP | Autenticación real, resultado mensual PYG Oracle real del perfil ya acreditado; modelo planificado | Tres peticiones, etiquetas/valores/moneda/período y fuente no mutada conciliados con el resultado. No se vuelve a auditar la consulta fuente con otra suite. |

Identidad proxy, cierre tras cada bloque, cierre global y logout de la sesión
creada aprobados. Los seis archivos de pruebas enfocadas de `e5868ea` se
reutilizaron por hash, sin ejecutarlos de nuevo. `coverageComplete` solo describe
estos tres bloques, no disponibilidad del proveedor ni backend completo.

Reporte congelado local `logs/conversion-chart-92b5e11.json`, SHA-256
`8d1e9abbac0d0cabc9ace1da0cee78e44e33b4912231472be4d90ff85f7c481b`.
Logs compactos del intervalo ampliado login/logout: chatbot cero líneas, ERP
dos; sin códigos Oracle/driver ni marcadores de campos sensibles detectados.
No se publicaron sesiones, usuarios, documentos o resultados comerciales.

La tasa real positiva y la fecha de publicación siguen sin acreditar; tampoco
se ensayó conversión histórica ni una muestra real multimoneda. PYG/USD en ambos
sentidos está cubierto con respuestas y datos controlados; el bloque Oracle
acredita su propio contrato seleccionado, no todos los contratos o divisas.
Se conservan las muestras DEV ausentes y todas las pruebas
anteriores con su SHA; no se suman ejecuciones como casos únicos. PR en borrador
hasta revisar resultados y correcciones; sin despliegue ni merge. El commit
posterior únicamente actualiza documentación, sin repetir controles aprobados.

## Corrección de los dos P2 de revisión

La evidencia de `92b5e11` conserva su SHA y sus perfiles, pero el control antiguo
de gráficos solo buscaba presencia de textos; no acreditaba la asociación de
cada valor con etiqueta y serie. Tampoco cubría tasas como `0x10`.

- El parser valida el token decimal completo antes de `Number`: enteros sin
  agrupación, puntos de miles en grupos exactos de tres y coma decimal opcional.
  Admite `7100`, `7.100`, `7100,50` y `7.100,50`; rechaza hexadecimal/binario,
  exponentes, signos, punto decimal, agrupaciones defectuosas, números partidos
  por espacios, cero, negativos y desbordamiento a infinito. No intenta reparar
  separadores. Las fechas y el carácter actual/no histórico no cambian.
- `chart-value-association.mjs` compara, por serie, la secuencia exacta de
  títulos etiqueta/valor de los puntos renderizados con la fuente; identifica
  cada serie por su leyenda/color. En circular comprueba cada pareja exacta de
  la leyenda. Los ejes y otros textos no sustituyen puntos. Se respeta la
  precisión visual de seis decimales del render, sin recalcular la fuente.
- Regresiones con gráficos renderizados: correcto, valores intercambiados entre
  etiquetas, valores intercambiados entre series y puntos ausentes aunque los
  números permanezcan en ejes/textos. Los tres negativos deben fallar.

Solo se ejecutan los archivos afectados `conversionProvider`,
`chartValueAssociation` y `chartHttpVariants` (13 pruebas); no las seis suites
previas. El helper nuevo `logs/run-conversion-chart-p2-dev.ps1` ejecutó solo
los tres gráficos HTTP con autenticación y fuente Oracle reales y el comprobador
nuevo. Conserva por hash los dos bloques de costo Oracle/controlado de
`92b5e11`, sin repetirlos. No consulta el proveedor público; su cotización real
positiva sigue pendiente. La sesión se introduce oculta y no se conserva.

Código P2: `ad0ef01e7dce8baa45b6c755efd819a820d9ec3b`.
**13/13 pruebas afectadas y preflight completo aprobados en Node 22/Docker**.
Son respuestas, fuente y autenticación controladas; no una nueva llamada al
proveedor ni muestra Oracle. El helper conserva estas pruebas por hash y no las
repitió durante la ejecución siguiente.

### Contraste final de asociación `d59d1f2`

**27/27 controles aprobados** sobre
`d59d1f2bb6575fa8025546e9e3cda25bf0ba2dca`, código idéntico a `ad0ef01`.
06/11/2026 13:11:37–13:11:43 UTC; bloque HTTP de 4.948 ms y 185 archivos
candidatos coincidentes. Etapa `chart-association-only`: un único bloque, tres
peticiones de gráfico (horizontal/circular/multiserie), autenticación real,
fuente mensual PYG Oracle y modelo planificado. Asociación etiqueta/serie/valor
de puntos o leyenda, moneda, período, conteos y fuente no mutada aprobados.

Los casos de costo no se ejecutaron: se reutilizan los dos bloques de
`92b5e11` por su hash. La descripción genérica del ejecutor y sus metadatos
heredados no acreditan una nueva ejecución de costo; la etapa y `cases`
identifican el alcance real. Las 13 pruebas controladas de `ad0ef01` también
se reutilizaron por hash. No sumar estos 27 controles a los 32 como casos únicos.

Identidad proxy, cierre por caso/global y logout de la sesión creada aprobados.
Logs compactos incluyendo login/logout: chatbot cero líneas, ERP dos; sin
códigos Oracle/driver ni marcadores de campos sensibles detectados. Reporte
local congelado `logs/conversion-chart-p2-d59d1f2.json`, SHA-256
`13e0ac63cce9cfdc10004fed909f1aaa8bce252b65a71eb05dec42c4eb01c926`.
`coverageComplete` solo describe esta etapa. Proveedor real no consultado;
cotización real positiva, fecha de publicación y muestras DEV ausentes siguen
pendientes. Mantener PR #40 en borrador para revisión; no merge ni despliegue.
El commit posterior solo documenta estos resultados, sin cambios de código.
