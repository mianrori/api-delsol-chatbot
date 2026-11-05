# Variantes pendientes: contraste acotado desde PR #38

Base: `30ffab4328df3f40228c5ffc839b6f088122e495`, actualizada desde origin.
Rama: `test/backend-pending-variants-dev`. No cambia aplicación, datos, permisos,
expiraciones ni integración frontend/ERP. No se reconstruye ni despliega DEV.

## Plan y criterio de evidencia

El ejecutor `scripts/check-backend-pending-variants-dev.mjs` contrasta solo las
ocho variantes de la tabla de cierre en la [matriz](backend-functional-matrix.md).
Usa el dispatcher real y SELECT escritos independientemente de los repositorios.
No es una conversación HTTP ni prueba un modelo real. Las peticiones HTTP y
denegaciones ya aprobadas se conservan con su SHA; no se atribuyen al ejecutor.

Cada caso registra únicamente código, estado y duración. Una muestra ausente es
`sample_missing`, nunca `passed`; un presupuesto agotado es `not_run`. Límite de
60 segundos por llamada Oracle, ocho minutos entre operaciones y 10.000 filas
por control; cohortes de facturas de 3–20 detalles, páginas de hasta dos filas
respetando el límite configurado. Se compara el multiconjunto completo y una
página posterior vacía, sin sumar distintos por página o moneda.

Soles usa igualdad exacta del documento canónico, sin normalizar la columna ni
quitar ceros. Las fechas se descubren en memoria; las ventanas históricas vacías
del socio de V conservan su condición, aunque otra ventana resulte positiva.
Compras promocionales conserva la pareja descripción/símbolo, sus cantidades e
importes y los motivos de no calculable, sin convertir ni mezclar grupos.

La conversión de costo depende de Maxicambios: se conserva su respuesta pública
solo en memoria para un segundo parseo; neto, IVA y área se leen de Oracle. No se
presenta esa tasa actual como histórica ni como dato de Oracle. Un fallo del
proveedor deja pendiente la verificación; no acredita ni invalida por sí solo
los cálculos previamente aprobados en la misma moneda.

## Ejecución local segura

Helper ignorado por Git: `logs/run-backend-pending-variants-dev.ps1`.
Primero verifica configuración DEV y protección de logs del ERP, salud, cadena
de evidencia previa y archivos del candidato comprometidos por hash. Después
solicita una sesión vigente mediante entrada oculta. Si se deja vacía, pide
usuario y contraseña ocultos de una cuenta autorizada y usa el login DEV ya
protegido. No valida otra vez el flujo de login. Secretos solo en memoria/stdin;
cierra únicamente la sesión que cree. No requiere documentos introducidos por
el usuario. El reporte seguro es `logs/backend-pending-variants.json`.

Se reutilizan por hash los trece bloques para sus perfiles y la corrección
monetaria W; se verifica que `src`, configuración y dependencias no difieran de
la base desplegada. Se comprobará cierre de conexiones en cada caso nuevo.

## Estado

Contrastes DEV aún no ejecutados. No hay resultados nuevos acreditados ni
hallazgo funcional confirmado. Las cuatro muestras DEV conocidas de la matriz
y las limitaciones específicas de G/R/T/V se conservan. Los gráficos HTTP
horizontal/circular/multiserie quedan como variante backend separada; no se
reabren sus unitarias ni se incluye la UI.
