# Variantes finales: F1/F2/F3/F4/M7

Base: `84fd67c` desplegada. Rama: `test/backend-final-variants-dev`.
Solo se completan ramas sin evidencia suficiente; no se consulta al proveedor,
no se despliega y no se cambian datos, permisos ni expiraciones.

## Revisión previa de la evidencia

Los logs locales históricos contienen aprobaciones controladas de referencia
cero/ausencia y monedas distintas de campañas, presentación de compras con
monedas separadas y chapa con varios socios. Se verificaron los títulos y el
resumen del ejecutor, no solamente la existencia de los archivos de test:

| Reporte local ignorado | Resultado histórico | SHA-256 de los bytes del log |
| --- | --- | --- |
| `contract-incidence-unit-tests.txt` | 263/263, sin fallos ni omitidos | `6455b4101cb704220be9c1708559b0e2f4cd653cb6aaf55c4a4a79655f5e56b5` |
| `promotion-purchases-unit-tests.txt` | 277/277, sin fallos ni omitidos | `40ccdbfcbcd2e8daebd49011865f3565a6b51a9b92bb294a1a91ba93022b2397` |

Estos hashes identifican **los logs, no el código ejecutado**. Los logs no
incluyen un SHA de código y los manifiestos revisados no enlazan sus bytes de
forma suficiente. No se reconstruye ese vínculo por fecha o proximidad a otro
reporte. M7 conserva esa reserva; no se repite el control aprobado para crear
artificialmente una atribución histórica.

F4 tiene evidencia T `d529cfd` de dos socios y SQL por moneda. La presentación
controlada anterior no acredita por sí sola el repositorio multimoneda de
compras individuales; tampoco hereda CTE de promociones o segmentación.

## Hallazgos y correcciones candidatas

1. **F3:** la consulta de campaña agregaba importes antes de adjuntar
   `MAX(moneda)`. Ahora agrupa por la pareja exacta descripción/abreviatura en
   cada período. Conserva cada importe; si hay varios grupos, total/promedio
   monetario y comparaciones quedan sin calcular con motivo. No hay FX.
   `sourceRows` distingue falta de filas de filas que suman cero; la cantidad
   de facturas sigue siendo la suma de la métrica de la vista, **no** un
   `COUNT(DISTINCT factura)` ni una suma de distintos entre grupos.
2. **F4:** dos descripciones que compartían `$` se distinguían en el DTO pero
   podían aparecer con la misma etiqueta. La presentación conserva la
   descripción junto al símbolo; no infiere USD ni convierte importes.

Cuatro regresiones nuevas en `finalVariantGaps`, junto con las pruebas de
campaña y presentación afectadas: **15/15 locales** y **15/15 en Node 22.23.4**
del contenedor DEV, candidato `61c5c9fa9066f31010cb757fef2129abb95b2314`.
Preflight completo aprobado: **257 archivos** src/scripts/test/config/packages
del archivo Git coinciden. No hubo sesión, consulta Oracle ni proveedor.
Reporte local ignorado `backend-final-variants-focused.json`; SHA-256 de la
salida de las pruebas:
`c2b62a886ee336b17b20976d5a7e48658ac0bab72a300aff1d5c3d0ebaf111b3`.
El hash de salida identifica esas pruebas, no un reporte Oracle.

## Contrastes independientes pendientes de ejecutar

`scripts/final-variant-controls.mjs` no importa SQL ni resolutores de producción.
El ejecutor llama al dispatch real con `sessionId`, conexión proxy y SELECT de
control por separado. No ejecuta HTTP conversacional ni presenta eso como HTTP.

| Rama | Búsqueda/contraste acotado | Reserva si no hay muestra |
| --- | --- | --- |
| F1 RUC y matrícula positivos | Hasta 20 filas autorizadas de facturas; período de un día obtenido de Oracle. SELECT de identidades exactas; resolución o ambigüedad sin elegir la primera. | No encontrada en esas 20 filas; no ausencia global. |
| F1 fuzzy positivo | Hasta seis nombres de esa cohorte, con un error de escritura controlado; primero demostrar cero coincidencias fuertes. Jaro-Winkler Oracle independiente, IDs distintos y orden. | Rama no acreditada si no se obtiene candidato positivo. La errata es controlada; catálogo/identidades son Oracle. |
| F2 fuzzy positivo | Hasta ocho tipos autorizados; errata controlada, cero coincidencias directas y distancia calculada mediante implementación independiente. | No sustituir por alias o coincidencia parcial ya aprobados. |
| F3 excepcionales | Hasta diez campañas reales de hasta 61 días; tres ventanas equivalentes, SELECT por moneda, registros y métrica de facturas. Un perfil afectado por el cambio de repositorio; después solo campañas que aporten ausencia, referencia cero, filas con suma cero o monedas distintas no cubiertas. | Cada variante no encontrada conserva su código de reserva. No prueba ausencia exhaustiva ni sustituye la muestra de incidencia M3. |
| F4 socio multimoneda | Hasta 1.000 filas enero–mayo 2023. Si hay socio con varias parejas monetarias y hasta 100 filas de detalle, resumen y recorrido completo con páginas de hasta tres filas, dentro del límite configurado, contra multiconjunto SQL. | No extender el período ni seleccionar dos socios monomoneda como sustituto. Si excede el presupuesto, queda pendiente. |
| M7 chapa compartida | Hasta 1.000 vehículos activos, placas no vacías sin espacios interiores; si hay dos socios, SELECT completo de esa placa contra todas las inscripciones sin dueño arbitrario. | Muestra no encontrada en esa cohorte; aprobación controlada histórica conserva su límite de SHA. |

El reporte `logs/backend-final-variants.json` publicará únicamente códigos,
booleanos, tiempos, tamaños de búsqueda y SHA. Documentos, nombres, placas,
credenciales, sesiones, importes y resultados de vistas permanecen en memoria.
Cada operación comprueba cierre de conexiones; límite de 60 s por llamada
Oracle y presupuesto de ocho minutos entre operaciones. Un caso reservado no
es un caso aprobado, aunque el ejecutor termine correctamente.

La entrada se hará en `logs/run-backend-final-variants-dev.ps1`: sesión vigente
oculta o, dejándola vacía, usuario y contraseña ocultos de una cuenta DEV
autorizada. Solo se cierra la sesión creada por el helper. Preflight protegido
antes de pedir entradas. No hay credenciales en argumentos, archivos ni Git.

## Estado

Contrastes Oracle nuevos **todavía pendientes de ejecución y revisión**.
La rama conserva la evidencia aprobada de los demás perfiles. El contrato F5
se delimita en [formas de gráficos](chart-result-contract.md); T1 continúa
sin atribución por fecha. E1, cotización real positiva, permanece separado y
no se consulta al proveedor en este bloque.
