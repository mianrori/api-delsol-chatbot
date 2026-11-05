# Contrastes independientes restantes del backend

Base: `ef9bff4`, PR #37 fusionada y desplegada. Rama separada:
`test/backend-independent-controls-dev`. Estado: candidato corregido; validación
Oracle/HTTP nueva pendiente de entrada local oculta. No se declara cerrado el backend.

## Evidencia reutilizada

Se conservan H/B/D, Q/I/R, G, XLSX y los buscadores/ciclo completo de filtros
con sus commits y límites de la [matriz](backend-functional-matrix.md).
No se ejecutaron nuevamente sus suites ni el login. La comprobación desplegada
de PR #37 fue 30/30 sobre `ef9bff4`, con modelo controlado y Oracle real.
Su ausencia de ventas en el perfil de enero de 2023 no es una muestra de filas
registradas cuya suma sea cero.

S y P carecen de SHA propio. Los manifiestos de `87c6fa5` y `b315ff9` no bastan
para atribuirles retrospectivamente ese código: mantener la salvedad, sin inferir
un commit por fecha. Los nuevos contrastes se vincularán al archivo Git exacto
del candidato, con comprobación de hashes en Docker, no al árbol sin confirmar.

## Hallazgo corregido y pruebas

Canjes frente a ventas usaba el símbolo como identidad de moneda. Dos grupos
con descripciones diferentes y `$` se sobrescribían; el resultado dependía del
orden de las filas. La nueva prueba reprodujo el fallo (un grupo en lugar de tres).
La unión ahora conserva la pareja exacta descripción/símbolo que agrupa SQL.
La presentación muestra ambos campos. `$` sin descripción no habilita el porcentaje.
No se convierten importes, no se unifican alias ni se suman socios distintos.
Si las fuentes usan etiquetas diferentes para una misma divisa, quedan separadas
y sin denominador coincidente; esta decisión conservadora se muestra al usuario.

Validación enfocada: **10/10** pruebas de `memberPurchasesVsSales.test.js`,
Node 22 en imagen aislada de validación; incluye orden invertido, colisión de `$`,
metadatos distintos, filtros, porcentaje no calculable, permisos y cancelación.
No se reconstruyó ni desplegó DEV para ejecutar estas pruebas.

## Ejecutor preparado: evidencia todavía no obtenida

`scripts/check-backend-independent-dev.mjs` compara el dispatcher real con SELECT
independientes, sin reutilizar generadores SQL de repositorios. Consultas limitadas
a 10.000 filas de control y 60 segundos por llamada Oracle. Período histórico de
compras/usos/vehículos/canjes: enero–mayo de 2023. La selección de muestras ocurre
dentro del usuario Oracle autorizado; los documentos nunca salen de memoria.

| Contraste funcional pendiente | Caso preparado | Límite explícito |
| --- | --- | --- |
| Ficha de socio | Encontrado, todos los campos/nulos de la muestra y ausencia comprobada | No promete muestra con cada campo nulo ni prueba de PII con usuario ajeno |
| Compras individuales | Dos documentos positivos distintos; mes/moneda/importe/conteo; local+rubro; conteo real de página inicial | Recorrido HTTP anterior reutilizado; muestra multimoneda se detecta, no se acredita automáticamente |
| Vehículos del socio | Documento, activo, débito; chapa compartida si existe | Chapa única y ausencia requieren contraste adicional dedicado |
| Saldo de soles | Tipo, saldo/generado/conteo; vigente/vencido/todos, referencia y generación/vencimiento combinados | Sin repetir la conversación S; ventanas sin filas se registran como tales |
| Usos de soles | Socio, movimiento, destino tipo/código, tipo de sol, rubro, transacción y cantidad combinados; resumen/detalle | Un caso combinado no acredita por separado todas las combinaciones |
| Ranking de usos | Top cinco socios, orden y desglose por tipo contra SQL | No suma conteos distintos entre grupos |
| Altas de vehículos | Edad a fecha fija/al registro; únicos globales y por grupo; filtros de marca/modelo/color/débito y detalle | Fechas relativas aún requieren contraste específico |
| Canjes/ventas | Dos universos independientes, resumen/mes y filtros combinados; cantidades, socios, importes y porcentaje por pareja monetaria | CTE de `$` y orden invertido es controlada, no muestra real multimoneda |
| Campaña | Tres períodos equivalentes, límites y ventas por filtro local+rubro | Cohorte 2023; una campaña con varias monedas internas se considera hallazgo, no aprobación |
| Facturas | Seguridad de consulta, cliente, fecha, número, período y anuladas; moneda/importe/facturas únicas; conteos del detalle | Chapa y recorrido de todas las páginas siguen pendientes específicos |
| Condiciones/costo por m² | Identidad/área/conceptos; último facturado, IVA y vigencia contra filas independientes; costo en misma moneda | Cohorte de hasta diez contratos; conversión y ausencia/ambigüedad de este endpoint no quedan acreditadas por incidencia |
| HTTP positivo pendiente/afectado | Canjes/ventas, facturas, condiciones y costo con el perfil contrastado | Ruta/controller/chat y Oracle reales en loopback aislado; modelo y resolución previa preparados, no conversación libre ni integración ERP |

Los casos sin muestra quedan `sample_missing`, nunca aprobados. Los fallos quedan
`failed`; un reporte parcial no acredita cierre. Se comprueba cierre tras cada caso.
Una sesión vigente se resuelve por PostgreSQL/proxy Oracle; no se acepta username
para elegir la identidad de las consultas. Denegación D y pruebas de autenticación
existentes se reutilizan: la corrección no cambia ese flujo.

El helper ignorado `logs/run-backend-independent-dev.ps1` pide una sesión autorizada
mediante entrada oculta. Si se deja vacía, pide usuario/contraseña ocultos para el
login DEV ya autorizado, comprobando previamente su protección de logs. Conserva
secretos solo en memoria/stdin y cierra únicamente la sesión que crea. El reporte
contiene códigos, estados, duración y commit; no filas, identidades, argumentos,
credenciales ni errores crudos. El preflight no inicia sesión.

## Muestras y límites que se conservan

- Ventas por m²: superficie cero y cambio histórico real; cobertura controlada aprobada.
- Incidencia: ventas registradas que sumen cero; cobertura controlada aprobada.
- Compras promocionales: socio real con varias monedas; grupos reconocidos/ambiguos controlados en CTE. Segundo socio positivo aún sin acreditar.
- Segmentación: muestra real multimoneda pendiente, con su propia cobertura controlada.
- Compras individuales: variantes multimoneda sin evidencia específica; no extrapolar la cobertura de promociones.
- Otras coincidencias nominales/fuzzy, combinaciones no exhaustivas y muestras de catálogos conservan los límites de la matriz; los buscadores aprobados no se repiten.

No se cambian datos, permisos, expiraciones ni integración frontend/ERP. No merge
ni despliegue de la corrección. La PR debe permanecer en borrador hasta revisar
el nuevo reporte y resolver cualquier hallazgo.
