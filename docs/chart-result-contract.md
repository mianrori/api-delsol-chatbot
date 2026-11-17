# F5: formas de resultado admitidas por los gráficos

Revisión estática de `generateChart.tool.js`, `chart.service.js` y
`chartSource.service.js` en la base `84fd67c`. No se ejecutan gráficos nuevos
para enumerar combinaciones ya aprobadas.

## Contrato efectivo

- Un resultado de negocio exitoso y aplicable del turno actual o del tema
  inmediatamente anterior; si hay varios, se requiere su `chartSourceId`.
  No combina fuentes ni recibe valores numéricos propuestos por el modelo.
- `dataPath` debe resolver un **array existente de 1–100 filas**, por defecto
  `data`. Las rutas admiten campos e índices numéricos de arrays existentes,
  hasta ocho segmentos. No admite claves de prototipo ni aplana objetos.
- Entre una y tres etiquetas comerciales por fila; cada valor debe existir y
  ser escalar no vacío. Entre una y cinco series con números finitos explícitos,
  nunca nulos reemplazados por cero. Cada etiqueta queda asociada a su valor
  y a su serie, conservando el orden de la fuente.
- Todas las series comparten la unidad reconocida por su métrica: porcentajes,
  soles/saldo, importes, edad o conteo. Dos conteos con nombres de métrica
  distintos son unidades distintas. No hace sumas, pivotes ni conversiones.
- Para dinero requiere una moneda explícita y única en todas las filas y
  series, tomada del objeto de la métrica, fila o resultado. `$` solo y las
  contradicciones PYG/USD son rechazados. Las pruebas de monedas reconocidas
  no certifican todas las descripciones o divisas posibles del ERP.
- No admite resultados truncados, `NO_ANALYSIS`, páginas posteriores o con
  `hasMore`; primero debe obtenerse un resumen completo.
- Tipos: `bar`, `horizontalBar`, `line` y `pie`; línea con al menos dos puntos;
  circular con una serie, hasta ocho filas, valores no negativos y total
  positivo. Ancho 300–999, alto 250–999; puede rechazar tamaño insuficiente.
- El período/subtítulo proviene del contexto de la consulta y del resultado.
  No transforma una fecha de consulta de FX en cotización histórica.

El ejemplo `periods` del texto de la herramienta **no transforma** el objeto
`periods` de campañas en filas: ese objeto no satisface el requisito de array.
No se considera una funcionalidad de pivote pendiente de implementar.

## Evidencia existente por forma

| Forma | Evidencia reutilizada | Qué no acredita |
| --- | --- | --- |
| Array `data`, etiquetas y métricas planas | `charts` y `chartHttpVariants`, ejecución enfocada Node 22 `e5868ea`; los tipos/unidades incluyen conteos, soles, porcentajes y dinero reconocido. | No todas las fuentes ni combinaciones posibles. |
| Etiqueta anidada con índice y métrica monetaria anidada | Positivo `nested dimension labels and explicit nested monetary units remain tied to their source` de `charts`, incluido en esa ejecución. | La ruta de **filas** no es anidada en ese caso; no extrapolarlo. |
| Array no predeterminado `results`, varias series | Oracle/HTTP `d59d1f2`, 27/27; horizontal/circular/multiserie y comparación estricta etiqueta–serie–valor. Despliegue `84fd67c`, 21/21 para un horizontal multiserie. | Modelo/historial preparados; perfil mensual PYG, no proveedor real. |
| Selección de fuente/contexto; rechazo de falta de fuente, nulos, unidades y monedas mezcladas | `charts`, `chatLifecycle`, `chartHttpVariants`, `chartValueAssociation`; `ad0ef01` y `d59d1f2`. | No valida una fuente arbitraria ni integración frontend. |
| `dataPath` que atraviesa un array, p. ej. `groups.0.rows` | Contratado por el selector compartido; no se identificó un **positivo específico** atribuido a esta forma de la ruta de filas. | **Reserva F5 concreta:** no afirmar cobertura integral de esa forma. Un positivo controlado que conserve etiquetas/series/valores bastaría; no requiere proveedor ni fabricar datos Oracle. |

Conclusión: no falta implementar un formato de gráfico identificado; existe
una forma contratada del selector de filas sin positivo específico acreditado.
F5 queda acotado a esa reserva y a la falta de exhaustividad por fuente/divisa,
no a una campaña abierta de pruebas de todas las herramientas. La cotización
real positiva E1 y las muestras multimoneda reales permanecen independientes.
