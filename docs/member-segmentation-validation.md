# Segmentación de socios: validación DEV

Base: `6b1303e`. Rama: `test/member-segmentation-dev`. Alcance: variantes
pendientes de `analyze_members` en la [matriz](backend-functional-matrix.md).
No incluye integración, cambios de datos o de expiraciones, ni merge/despliegue.

## Contraste preparado

`scripts/run-member-segmentation-dev.mjs` contrasta los caminos materializados
de resumen/ranking contra `VW_BOT_COMPRAS_SOCIO` y `VW_BOT_SOCIOS`, sin reutilizar
la materializada ni el SQL de los repositorios para calcular los controles.
`scripts/member-segmentation-control.mjs` selecciona pertenencia a períodos con
EXISTS independientes de la agrupación monetaria, conserva datos demográficos
nulos y compara identidades únicamente en memoria.

Se prepararon controles de resumen mensual, rubro/local/mes/año, filtros
combinados demográficos y de compras, importes/recurrencia, filtro vacío,
rankings por tres métricas y ambas direcciones por importe, períodos ALL/ANY,
inactividad y ausencia de filtros demográficos. Los conteos globales se
obtienen de conjuntos de socios distintos, nunca de sumar distintos de grupos.
Los desgloses y sus importes se contrastan por moneda original.

La etapa final añade seguimientos HTTP con rutas/controladores reales en un
servidor temporal de la copia candidata: cambia rubro/local conservando ranking,
cohorte, límite, orden, períodos y filtros. Parte de contexto previo preparado;
no pretende cubrir toda la interpretación inicial de nombres por el modelo.
Con una sesión adicional de otro usuario verifica identidad Oracle distinta,
rechazo sin datos y cierre; si no se proporciona, queda pendiente.

## Reproducción privada

El helper local ignorado `logs/run-member-segmentation-dev.ps1 -Stage baseline|final|remaining`
pide sesiones con `Read-Host -AsSecureString`, las pasa por variables del proceso
y restaura sus valores al terminar. No requiere documentos personales. La etapa
baseline extrae el código de `6b1303e`; final copia la candidata local. Se ejecutan
en `/tmp/segmentation-candidate`, sin modificar `/app` ni reiniciar Docker DEV.

El reporte sanitizado contiene códigos, cobertura, pendientes y tiempos; no
identidades, documentos, nombres, filas ni importes. Los controles abortan si
superan los límites explícitos de filas en vez de aprobar resultados truncados.
No ejecutar los scripts SQL de alineación/refresco de la materializada para
subsanar una diferencia: debe documentarse y resolverse en el alcance autorizado.

## Evidencia y estado

- Dos pruebas nuevas del control independiente aprobadas en Node 22 aislado,
  sin red ni credenciales. Comprueban combinación de binds, membresía ALL/ANY
  entre monedas, ausencia de SQL materializado y conservación de demografía nula.
- Preflight del helper aprobado; no acredita ejecución de consultas Oracle.
- **Baseline sobre `6b1303e`: 108/108 controles ejecutados aprobados**, incluidos
  conteos, importes, rankings, filtros combinados, ALL/ANY, nulos demográficos y
  cierre de la conexión de control. El ejecutor era `16fbacc`. La ejecución duró
  4215 segundos y terminó con `ORACLE_SESSION_NOT_ACTIVE` al validar las sesiones
  antes de la denegación. No permite identificar cuál de las dos estaba inactiva.
  Denegación y HTTP no se marcan aprobados. Los 138 archivos baseline coinciden
  con el commit tras normalizar exclusivamente CRLF/LF; el reporte completo sigue
  siendo incompleto, no se convierte su resultado global en aprobado.
- Tres fallos reproducidos con datos controlados: los argumentos podían sustituir
  la conexión de la ruta general; `returnedCount` y actividad contaban filas por
  moneda como socios; filtros inválidos podían aceptarse sin rechazo. La candidata
  descarta conexión/usuario de argumentos, valida antes de consultar y usa conjuntos
  de identidades para esos conteos. No se presenta como validada en Oracle todavía.
- Las 17 pruebas enfocadas ejecutadas en Node 22 aprobaron sobre esta primera
  corrección (nuevos controles y rutas afectadas, sin suite completa). El archivo
  nuevo actualizado, incluido un caso adicional de demografía nula/contactos,
  aprobó después 4/4 en Node 22; no se suman ambas ejecuciones como casos únicos.
- Se reutilizan las suites controladas existentes de resumen, agrupación,
  seguimiento y ranking. No se repitieron las suites completas aprobadas.
- Se conservan las muestras DEV históricas faltantes de superficie cero/cambiante,
  ventas registradas con suma cero y socio con varias monedas. Su ausencia no
  autoriza crear datos ni equivale a un fallo de implementación.

## Correcciones y etapa acotada posterior al baseline

La candidata conserva moneda en los desgloses de compras y género, evita mezclar
el importe de segmentos entre monedas y cuenta sus socios mediante conjuntos.
La pertenencia ALL y la recurrencia se calculan por socio antes de agrupar por
moneda. El ranking general aplica el límite a socios distintos, conserva sus
filas monetarias y usa documento como desempate estable. Un ranking por importe
con varios grupos monetarios devuelve un error explícito de no calculable;
no impone un orden entre esos importes ni los convierte. La presentación de
seguimientos usa la moneda de cada fila y el número de socios únicos.

El camino materializado conserva su contrato preexistente de fuente PYG sin
columna moneda; el baseline lo contrastó con la vista de origen en los perfiles
ensayados. No se refresca ni redefine la materializada, ni se afirma cobertura
real de varias monedas para ese camino. La candidata modifica en él únicamente
el desempate por documento. Los casos de varias monedas del camino general se
comprueban con datos controlados; la muestra real sigue siendo una limitación.

**37/37 pruebas enfocadas aprobadas en Node 22 aislado** tras estas correcciones:
segmentación, control independiente, resumen/agrupación, ranking, seguimientos y
ciclo de chat afectados. No se ejecutó la suite completa.

Para completar solo lo pendiente se preparó `-Stage remaining`:

- Reutiliza explícitamente el resumen sanitizado de los 108 controles baseline,
  atribuidos a `6b1303e`; no los presenta como ejecutados sobre la corrección.
- Comprueba ambas sesiones y la denegación al principio. No modifica su estado
  ni expiración; si falta otro usuario real, conserva la prueba como pendiente.
- Omite las lecturas amplias y el ranking materializado ya comprobados. Usa un
  perfil real acotado por local/rubro/demografía para las rutas generales afectadas
  y los dos seguimientos HTTP. Reutiliza controles independientes idénticos en
  memoria dentro de la misma ejecución, sin reutilizar respuestas narrativas.
- Registra tiempos por caso y resultados parciales sanitizados; fija un timeout
  de 60 segundos por llamada Oracle de control y aborta ante errores técnicos.
  Este timeout no cambia la política de sesiones.
- `scripts/check-member-segmentation-cases.mjs` prepara CTE Oracle de solo lectura
  para moneda/grupos, socios únicos, ALL/recurrencia entre monedas, límites de
  ranking, demografía faltante, inactividad y rechazo temprano de filtros. Son
  cobertura controlada, no datos fabricados en las vistas de DEV.

Preflight de esta etapa aprobado. **Oracle/HTTP sobre la candidata corregida
siguen pendientes de ejecución** con entradas ocultas vigentes. La PR #36
permanece en borrador y las muestras históricas faltantes se conservan.

### Entrada opcional de denegación: ejecución de `d1061bb`

La etapa acotada se detuvo en 46 ms con `ORACLE_SESSION_NOT_FOUND` durante
`DENIED_SESSION_CHECK`, después de validar la sesión autorizada. Ejecutó cero
controles de negocio/CTE/HTTP. No es un fallo ni una aprobación de las consultas
de segmentación; el reporte sanitizado conserva este resultado y su commit.

Se corrigió el ejecutor para que una sesión opcional ausente, inexistente,
inactiva, vencida o del mismo usuario deje la denegación explícitamente pendiente
y permita continuar con la sesión autorizada. Solo usuarios resueltos distintos
habilitan la prueba real; su rechazo Oracle y cierre deben comprobarse antes de
declararla aprobada. Los errores inesperados de infraestructura siguen propagándose.
La autorización de los controles principales sigue siendo obligatoria.

Esta corrección cambia únicamente el ejecutor y sus pruebas/documentación, sin
cambios de código productivo desde `d1061bb`. Cuatro pruebas nuevas del manejo
opcional aprobaron en Node 22 aislado; se conservan las 37/37 enfocadas anteriores.
Las condiciones pendientes de muestra real no se convierten en aprobaciones.

### Ejecución parcial de `82e72ba` y continuación del caso lento

La etapa acotada aprobó **40 comprobaciones**: sesión autorizada, usuarios Oracle
distintos, denegación real sin datos/cierre y los seis casos reales de filtros
combinados, importe/recurrencia, ausencia y ranking por tres métricas. Después
`BOUNDED_TWO_PERIODS_ALL` alcanzó 60 segundos y terminó con `NJS-123` (timeout
de llamada según el driver instalado), sin resultado conciliado de ese caso.
Los seis casos previos duraron aproximadamente 22 segundos cada uno, salvo el
filtro vacío (0,5 segundos). CTE y HTTP no llegaron a ejecutarse. No se atribuye
un resultado aprobado al caso que agotó el tiempo.

La consulta productiva general ahora calcula presencia por período y recurrencia
mediante analíticas por socio sobre una única referencia a la fuente. Conserva
la pertenencia antes de agrupar por moneda. Se elimina el autojoin de dos
agregaciones sobre compras; falta medir el efecto real en DEV. Oracle 19c permite
`COUNT(DISTINCT ...) OVER (PARTITION BY ...)` sin ORDER BY ni ventana, según su
[referencia de COUNT](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/COUNT.html).

El control independiente acotado lee agregados diarios por socio/moneda/local/rubro
con una sola referencia a la vista. ALL/ANY, recurrencia, orden, filtros métricos
y distintos se calculan aparte en JavaScript; el orden nominal viene de Oracle.
No reutiliza la consulta productiva, no depende de la MV ni hace EXISTS
correlacionados repetidos. Los filtros métricos conservan también la moneda
seleccionada al formar el desglose; no se reintroducen filas monetarias excluidas.

**46/46 pruebas enfocadas aprobadas en Node 22 aislado** con estas correcciones,
incluidas las cuatro del control diario y los casos de períodos entre monedas,
solapamientos y demografía contradictoria. No acredita todavía el tiempo ni la
ejecución Oracle de la nueva consulta.

`-Stage remaining -Retry` reutiliza explícitamente los 40 controles de `82e72ba`,
incluida la denegación real. Pide solo la sesión autorizada y no repite los seis
casos aprobados. Ejecuta ALL/ANY pendientes, CTE y seguimientos HTTP. Mantiene
60 segundos por llamada, añade tiempos por fase/rol y hashes de SQL (sin binds),
y comprueba cierre de la conexión de control también si falla la operación.
Los reportes anteriores se conservaron en `logs/`; no se modifica ninguna sesión
para completar las pruebas. **Reintento Oracle/HTTP pendiente; PR aún en borrador.**

El intento de `6d3af88` falló en el helper antes de arrancar Node: PowerShell
considera `$retry` y el parámetro switch `$Retry` la misma variable. El reporte
de negocio local seguía siendo el de `82e72ba`; no se atribuyen sus 40 controles
a una ejecución nueva. Se reprodujo la colisión y se corrigió el nombre local.
El preflight ahora construye y ejecuta el comando Docker completo en modo
`node --check` antes de pedir entradas ocultas; terminó con código 0 usando
`-Stage remaining -Retry`. No consulta Oracle.

Cada ejecución recibe además una correlación aleatoria de prueba (`runId`, sin
relación con la sesión). El helper rechaza reportes de otra ejecución y deja un
estado local explícito si Node no llegó a arrancar. Esta modificación afecta
solo al ejecutor/reportes y documentación; el código productivo de `6d3af88`
y su evidencia enfocada de 46/46 se conservan. Oracle/HTTP siguen pendientes.
