# Ventas: alcance autorizado y métricas predeterminadas

Base `d6ca3ae` (PR #43 integrada). Rama
`feat/sales-resolved-scope-default-metrics`. Sin merge ni despliegue de esta rama.

El alcance de las series mostraba «locales/rubros seleccionados» y una propuesta
del modelo con solo `totalAmount` omitía las cantidades aunque el usuario no
hubiera pedido esa restricción.

La consulta conserva los argumentos efectivos del guard de filtros. El servicio
de ventas obtiene las etiquetas mediante un repositorio nuevo, en la misma
conexión proxy autorizada: `VW_BOT_CLIENTES.NOMBRE_FANTASIA` por `COD_CLIENTE`
y `VW_BOT_RUBROS_LOCALES.DESCRIPCION` por `COD_RUBRO`. Son SELECT con binds de
los IDs efectivos; no se usan etiquetas de argumentos, narraciones o consultas
anteriores. Sin filtro no se consulta ese catálogo. Etiquetas ausentes o
contradictorias no se eligen arbitrariamente; se mantiene un alcance genérico
sin inventar nombres. No cambia la autoridad Oracle ni se modifican permisos.

`get_sales.scope` vincula cada nombre con su ID. El presentador vuelve a verificar
esa correspondencia, restaura los valores protegidos y escapa Markdown antes de
mostrar, por ejemplo, «Alcance: todos los locales del rubro Librería». Se conserva
la grafía autorizada del catálogo. Cada operación obtiene sus etiquetas, por lo
que el recorte, la reselección y la retirada de filtros no recuperan nombres viejos.
La retirada de rubro que usa el atajo de ventas también utiliza el presentador
determinista cuando su resultado es una serie completa.

La política del chat aplica ambas métricas después del guard y cambia solo
`metrics`. Una propuesta de solo importe se convierte por defecto en
`[totalAmount,totalInvoices]`. Una petición explícita de solo importe o solo
facturas se conserva en el estado de esa sesión y en los seguimientos, incluso
después del recorte. «Ambas métricas» restablece las dos; una nueva consulta
autónoma de rubro vuelve al valor predeterminado. Los clientes internos que
invocan el servicio con métricas explícitas conservan su contrato. No se cambia
el SQL ni la regla auditada/fallback de `VW_BOT_VENTAS_LOCALES`.

Las regresiones cubren nombres con IDs correctos/equivocados, nombres propuestos
por el modelo ignorados, PII restaurada antes de escapar, cambios/retiros de ambos
dominios, opciones ambiguas y recorte real. Comprueban argumentos completos,
períodos, agrupaciones, tipo de día, preferencia de métrica y columnas efectivas.
También se revisan el presentador, los seguimientos/exportaciones/comparaciones
afectados y los contratos existentes de cancelación/cierre; no la suite completa.

Controles preparados:

```powershell
.\scripts\run-sales-scope-metrics-dev.ps1 -Preflight
.\scripts\run-sales-scope-metrics-dev.ps1
```

El segundo pide login DEV mediante entradas ocultas, conserva sesión y resultados
en memoria y hace logout solo de la sesión creada. El candidato se copia del
commit limpio a `/tmp` y se verifican sus archivos contra Git. El servicio DEV
publicado no se reconstruye ni se modifica. Se usa modelo controlado, sin cliente
Bedrock real, herramientas de conversión ni peticiones HTTP externas del worker.
La conciliación compara importes, cantidades y monedas con SELECT independientes,
y las etiquetas con lecturas separadas de los catálogos autorizados. Incluye ambos
Nike legítimos, ambos modos de intención y recorte, métricas únicas/restauradas,
cambio de rubro y retirada de filtros. Los nombres, IDs, binds y resultados no se
publican en el reporte. Los logs se revisan en todo el intervalo del helper.

**Evidencia Oracle y Node 22 pendiente de ejecución y revisión.** Los controles
anteriores de PR #43 no se atribuyen a estos cambios. Se conservan sus reservas,
muestras pendientes y límites, sin proveedor ni cambios de datos/permisos/
expiraciones.
