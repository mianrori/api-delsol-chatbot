# Código de cliente en selecciones ambiguas

Código validado: `0186d75`, rama `fix/customer-choice-code`. Cambio local, sin publicación, merge ni despliegue.

Antes, dos clientes podían aparecer con el mismo nombre sin un dato que los distinguiera. Ahora la selección muestra valores del catálogo autorizado:

| Opción | Código de cliente | Cliente |
| --- | --- | --- |
| 1 | 0012 | Tienda Igual |
| 2 | 0045 | Tienda Igual |

Ejemplo ficticio. El usuario sigue eligiendo el número de opción. Se conservan las filas, los ceros iniciales y la advertencia de lista limitada cuando corresponde. No se añaden RUC ni razón social a esta selección; si falta el código, se indica «No informado».

El presentador determinista cubre `search_customers`, `search_invoice_customers` y `search_invoice_balance_customers`, incluidos los caminos acotados de facturas pendientes/canceladas y concepto + cliente. Se actualizó también la instrucción de presentación contradictoria. La excepción para mostrar códigos está limitada a esta selección: `CUSTOMER_ID` sigue protegido para el modelo, el historial, los logs y las respuestas ordinarias. Las celdas se escapan y se guardan como tokens de presentación de la sesión.

## Validación enfocada

Node 22.23.5, contenedor separado de DEV, creado desde su imagen local y sin red. Aplicación y tests del candidato copiados a sus rutas exactas. No se llamó al proveedor ni a Oracle real.

- `customerSelectionPresentation.test.js`: 11/11, incluidos seis recorridos HTTP (tres catálogos, antes/después del recorte). Nombres iguales, códigos distintos, elección de la segunda opción, argumentos efectivos, PII, ausencia del código fuera de la selección y advertencia de lista limitada.
- `invoiceBalancesHttp.test.js`, `invoiceNamedRequest.test.js`, `invoiceSettledIntent.test.js`: 36/36 sobre el mismo código de aplicación. Incluyen selección de cliente/concepto, paginación, permisos y cierre de conexiones sintéticas.

Son **47 pruebas distintas afectadas**, no una suite global. La ejecución de 47 controles tuvo inicialmente dos fallos en el fixture nuevo: usaba `optionId` para catálogos de facturas/saldos, cuyo contrato real devuelve `option`. Se corrigió el fixture para reproducir el contrato real y pasaron sus 11 controles; los otros 36 ya aprobados no se repitieron. No se modificó el mecanismo de selección de producción.

Una ejecución anterior sobre archivos de la imagen previa no cubrió el candidato debido a la ruta de copia y se descarta como evidencia de esta corrección. No se suman ejecuciones superpuestas.

No cambian consultas, filtros, permisos, datos o expiraciones. La planificación de los recorridos HTTP es simulada; no demuestra interpretación por un modelo real. Los fallos globales y reservas Oracle anteriores conservan su atribución y no se revalidaron aquí.
