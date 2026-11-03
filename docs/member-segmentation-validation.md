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

El helper local ignorado `logs/run-member-segmentation-dev.ps1 -Stage baseline|final`
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
- Medición baseline Oracle pendiente de sesión oculta vigente. Ningún caso
  nuevo de segmentación está marcado como aprobado en DEV todavía.
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
