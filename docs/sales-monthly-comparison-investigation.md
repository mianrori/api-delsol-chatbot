# Comparaciones mensuales: alcance y catalogo autorizado

Base: PR #44 integrada en `7d29892`. Rama separada
`fix/sales-monthly-comparison-scope`.

## Investigacion y correccion

Las frases reportadas no coincidian con la gramatica existente del atajo anual.
La politica persistente tampoco reconocia esta comparacion como consulta
autonoma. La nueva intencion anclada reconoce los dos anos y el sujeto completo;
no interpreta la omision de argumentos del modelo como retirada de filtros.

La comparacion general reinicia locales, rubros, tipo de dia y preferencia de
metricas anterior. Consulta ambos anos completos por mes con importe y facturas.
La que nombra un rubro usa el resolver y el catalogo Oracle autorizado; no hay
alias comerciales inventados. NOT_FOUND no consulta ventas; AMBIGUOUS espera
seleccion y conserva ambos anos tras recorte. Un rubro resuelto sin filas produce
una respuesta de ausencia de registros, distinta de rubro inexistente y de cero.

El seguimiento explicito "compara ese mismo rubro con 2022" conserva los filtros,
la ventana de meses y la preferencia de metricas. Los argumentos de ambos anos
persisten como metadatos protegidos; no se guardan filas de negocio.

## Validacion enfocada

Dieciseis perfiles nuevos de chat/servicio/repositorios con datos sinteticos:
consulta nueva y con filtros previos, general y por rubro; ambiguedad y seleccion,
rubro no encontrado, rubro sin ventas y seguimiento explicito. Cada perfil antes
y despues de recortar el historial. Argumentos finales, SQL, estado y alcance;
importe y facturas; cero real, meses ausentes y periodos verificados.

Ejecutor protegido: `scripts/run-sales-monthly-comparison-dev.ps1`.
Comando desde PowerShell local: 

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-sales-monthly-comparison-dev.ps1
```

Copia aislada del commit en Docker, sin reconstruccion, sustitucion de `/app`,
merge ni despliegue. Login mediante entradas ocultas y sesion en memoria;
identidad desde PostgreSQL y proxy Oracle; consultas independientes de solo
lectura, cierres y logout. Reportes sanitizados ignorados en `logs/`.

El contraste distingue dos sondas de planificacion con Bedrock real (mismos
prompts y schemas de ventas, sin ejecutar sus propuestas) y el recorrido exacto
del chat candidato que resuelve deterministicamente estas frases. No se afirma
una conversacion HTTP ni interpretacion libre remota de las rutas deterministas.
El catalogo independiente determina inexistencia, unicidad o ambiguedad; las
filas de ambos anos se concilian por mes, moneda, importe y facturas. No se
consulta otro proveedor. Fixtures previos y elecciones numericas son controlados
sobre IDs autorizados, no muestras adicionales de conversaciones reales.

Resultados de Node 22, catalogo, sondas reales y conciliacion: aprobados tras
revisar. La evidencia historica de PR #44 permanece previa; no acredita estos
cambios. Se conservan todas las reservas del balance, las muestras pendientes y
los limites de cobertura. No cambios de datos, permisos o expiraciones.

## Evidencia revisada del 2026-11-09

- **44/44 pruebas afectadas en Node 22.23.4**, commit de aplicación y pruebas
  `4a8ead7ee62976072a4d1ce03d789eaed8760191`: 16 perfiles nuevos y 28 controles
  existentes de comparación, intención, métricas y ciclo de filtros. No suite
  completa. Salida congelada `logs/sales-monthly-comparison-focused-node22.txt`,
  SHA-256 `565d6bf371bd9d981438acdaa8dc0a79874c22dccbe5ff5830a0c331217d53c6`.
- `d11d0bd` solo agiliza la lectura del manifiesto del ejecutor. `0d1f799` corrige
  el nombre de suite esperado y comprueba ese contrato durante el preflight;
  conserva además el reporte sanitizado en la copia aislada. No cambian aplicación
  ni pruebas: las 44 se reutilizan por identidad de `src`/`test` y hash de salida.
- **227/227 aserciones del contraste DEV en `0d1f79952b03772487f3809a8010c224fccb6307`**.
  288 archivos de la copia aislada verificados, manifiesto SHA-256
  `b13cfd16f93bbbc4afa78366f4ca8816d8c9bc97f19b90f4b2659a4eb1f5dab6`.
  Ocho perfiles autónomos (general/rubro × nueva/con filtros previos × historial
  completo/recortado) y dos seguimientos explícitos del rubro. Se concilian ambos
  años, alcance por IDs efectivos, nombres autorizados, métricas, SQL, presentación
  y estado. Los filtros local/tipo de día y métrica única del seguimiento tienen
  regresiones sintéticas antes/después del recorte; estos seguimientos Oracle
  parten del rubro resuelto en la comparación autónoma, sin local.
- Catálogo Oracle independiente: **una coincidencia exacta autorizada de
  «ropa femenina», RESOLVED**. La ausencia de rubro de la respuesta reportada no
  corresponde a este catálogo. No se añadieron alias ni se modificó el resolver.
  Ambigüedad, NOT_FOUND y rubro existente sin filas se cubren sintéticamente;
  no se atribuyen esos estados a esta muestra real de catálogo.
- En esta ejecución aprobada, **dos sondas Bedrock reales de planificación**:
  la primera propuso `search_categories` con el texto solicitado y la segunda
  `get_sales`, sin exigir selección de alcance. Son propuestas iniciales, no
  conversaciones completas: ninguna acredita por sí sola las dos consultas
  anuales. Las rutas exactas del producto son deterministas y ejecutan ambos años
  con repositorios reales y Oracle independiente; no hay stubs de esos componentes.
- Se compararon 200 grupos de mes/moneda a lo largo de los perfiles (hay consultas
  repetidas entre perfiles; no son 200 conversaciones ni ventas únicas). Hubo
  ausencia de filas en 40 posiciones de mes/año; no se rellenaron con cero. No
  hubo grupos reales de valor cero en esta muestra; cero frente a ausencia queda
  acreditado por los fixtures sintéticos, sin inventar una muestra Oracle.
- Cierres por bloque/global, logout y auditoría de logs aprobados: cero líneas de
  chatbot y dos eventos ERP del esquema sanitizado reconocido. Cero consultas al
  proveedor externo. Sin datos de negocio, credenciales, sesiones, IDs de catálogo
  ni respuestas del modelo en el material versionado.

Reporte congelado ignorado `logs/sales-monthly-comparison-0d1f799.json`, SHA-256
`f95d4948ed0db574a2420b44123cf8ab3e7cf61eb22eb59d6d154946bf1dcb9e`.
El primer intento `d11d0bd` descartó el reporte por incompatibilidad del nombre
 de suite. Su wrapper acredita logout, pero no conserva resultados del worker;
no se cuentan sus consultas, llamadas al modelo ni cierres como aprobados.
Se conserva como `logs/sales-monthly-comparison-d11d0bd-unaccepted.json`.

Comprobación final: `/app` conserva los 286 archivos de `7d29892`, la misma imagen
 e instancia DEV de PR #44, salud correcta y cero reinicios. El candidato no se
ha desplegado. Evidencia local `logs/sales-monthly-comparison-final.json`.
Los commits posteriores a `0d1f799` de esta entrega solo documentan resultados.
Todas las reservas del balance permanecen; esta muestra no acredita cobertura
lingüística exhaustiva, nuevos recorridos HTTP ni los estados de catálogo o
ventas no observados. PR en borrador, sin merge ni despliegue.
