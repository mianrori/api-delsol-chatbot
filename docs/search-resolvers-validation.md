# Validación dirigida de buscadores

Base: `00a1acb` (PR #36 fusionada y desplegada). Rama independiente
`test/search-resolvers-dev`. Candidato de código `c8525a6`.

## Alcance y evidencia reutilizada

Solo buscadores sin contraste suficiente en la matriz: locales, rubros, socios,
conceptos y clientes facturados, tipos/destinos/movimientos de soles; de promociones
únicamente el fallback aproximado y su recorrido paginado. No se repiten el
catálogo/paginación textual de R, compras promocionales, saldos/usos, ventas,
segmentación ni los bloques B/D/Q/I ya aprobados.

La segmentación desplegada `00a1acb` aprobó 10/10 controles de una consulta real
en 5,873 s, cierre y salud; los 159 archivos comparados coincidieron. Se conserva
esa evidencia local con su commit y no se atribuye a este candidato.

## Correcciones y pruebas controladas

Las siete reproducciones iniciales fallaron antes de corregir el candidato.
Ahora **68/68 pruebas enfocadas Node 22 aprobadas**, sin red ni credenciales:
`searchResolvers`, `searchSelection`, integración `chatLifecycle` y los consumidores
afectados `promotionSearch`, `solesUsage`, `memberSoles`. Los conteos se solapan
con pruebas históricas; no se suman como casos únicos ni como validación Oracle.

- Locales: filtro contractual activo antes del límite. Mantiene la política
  existente de buscar locales activos; no habilita locales históricos inactivos.
  Locales/rubros admiten fragmentos literales normalizados además del fallback
  Jaro-Winkler. Exactitud se determina por texto normalizado, no por una similitud
  redondeada. Conteos antes del límite y orden determinista por código.
- Rubros: varios exactos conservan ambigüedad; una fila de un resultado limitado
  no se convierte en identidad única. Socios: email/teléfono compartidos no
  eligen la primera identidad; el límite visible conserva el conteo y la búsqueda
  nominal acotada declara incertidumbre si alcanzó el tope de candidatos.
- Soles: varios códigos con la misma descripción canónica/alias conservan
  ambigüedad, incluso invirtiendo el orden de las filas.
- Clientes facturados: deduplicación de identidad Oracle antes de `maxRows`,
  conservando fechas/USER_CAN_CONSULT y prioridad de coincidencias. Los conceptos
  usan fragmentos literales; `%` y `_` no amplían el filtro como comodines SQL.
- Chat: impide consultar datos tras una búsqueda ambigua/ausente en el mismo
  lote. Una selección numérica solo acepta opciones mostradas y conserva filtros
  del intento anterior; facturas conserva además el período de la búsqueda.
  Destinos mantienen la pareja tipo/código y cada identificador usa el contrato
  real de su consumidor. Un número no resuelve dos catálogos ambiguos a la vez.
  Se probó la integración completa búsqueda → bloqueo → opción 2 → consulta con
  modelo y datos controlados. No acredita interpretación libre exhaustiva.

## Contraste DEV preparado (pendiente de ejecución)

`scripts/run-search-resolvers-dev.mjs` recibe solo sesiones por stdin, resuelve
identidad con el servicio existente y compara los usuarios Oracle reales. Ejecuta
solo las variantes anteriores y sus rechazos 942/1031 sin datos; cuenta todos los
proxies y verifica cierre. No autentica usuarios en el chatbot ni recibe username
para decidir la identidad Oracle.

El control independiente lee las vistas autorizadas por un camino distinto de
los repositorios: catálogos y puntuaciones Oracle separadas, filtro/selección por
identidad y cotejo en memoria. Comprueba período de clientes facturados y límites
reales de destinos/movimientos. Reconstruye el fallback de promociones desde el
catálogo y lo recorre conservando término/tamaño de página; no repite la búsqueda
textual ya aprobada. Cada llamada Oracle tiene 60 s y las lecturas de control
se limitan a 10.000 filas; un exceso es fallo/limitación, nunca aprobación parcial
silenciosa. Los tiempos y fallos se identifican por caso y código técnico.

Los buscadores sin parámetro page no se presentan como paginados: conservan sus
límites de opciones y requieren precisar la consulta. La búsqueda nominal de
socios conserva el tope configurado; no garantiza encontrar todos los aproximados
fuera de esa cohorte. Las muestras reales ausentes se informarán por código,
separadas de controles fallidos y de pendientes de implementación.

Se reutiliza el cliente de login DEV protegido validado en la rama independiente
de login, sin repetir sus suites. El helper local ignorado comprueba previamente
loopback 5300/5400, development, protección de logging instalada y hash, y destinos
Oracle/PostgreSQL coincidentes; luego solicita ambas cuentas mediante cuatro
entradas ocultas. Credenciales y sesiones permanecen en memoria/stdin; se hace
logout únicamente de las sesiones creadas, también tras fallos. No van en env,
argv, reportes, archivos temporales ni Git. El flujo de login del producto no se
modifica y no se despliega el candidato: `/app` permanece intacto.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-resolvers-dev.ps1 -Preflight
powershell -NoProfile -ExecutionPolicy Bypass -File .\logs\run-search-resolvers-dev.ps1
```

Preflight aprobado antes de solicitar credenciales. Reportes locales ignorados:
`logs/search-focused.txt` (controladas) y `logs/search-resolvers-final.json` (DEV).
**La validación real Oracle y denegación del candidato aún no está ejecutada.**
PR en borrador hasta revisar ese reporte, conciliaciones y pendientes.

Se conservan sin fabricar muestras: superficie cero/cambiante, ventas registradas
que sumen cero, socios/promociones/segmentación con varias monedas y demás límites
históricos de la matriz. Sin merge ni cambios de datos, permisos o expiraciones.
