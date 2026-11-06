# Librería 2023: diagnóstico de filtros y alcance de la respuesta

Base `059ac13`, rama `fix/library-category-sales-2023`. Sin merge ni despliegue.
Pregunta: **Ventas del rubro librería durante 2023, por mes**.

## Causa contrastada

En conversación nueva, **modelo Bedrock real** y Oracle DEV: coincidencia
exacta única del rubro entre cuatro candidatos; con/sin tilde resuelven la
misma identidad. El modelo consultó 2023 por mes, sin local ni tipo de día.
Seis grupos mensuales coincidieron con SELECT independientes. **9/9 controles**,
dos llamadas al modelo; cierre y logout aprobados. No se reprodujo el vacío.

Después se reprodujeron cuatro preguntas previas aportadas mediante entradas
ocultas, sin guardarlas ni modificar la conversación original del servidor.
**Modelo real**, nueve llamadas en los antecedentes y dos en la consulta final:
el modelo omitió `customerIds`, pero la selección confirmada del local seguía
activa y el guard la conservó. Rubro, año y agrupación fueron correctos.

Oracle independiente confirmó **cero grupos** para local+rubro y **seis** para
el rubro sin ese local. El SQL efectivo incorporó ambos filtros con binds
`customerId0`, `categoryId0`, `dateFrom`, `dateTo`. **7/7 controles diagnósticos**,
cierre y logout aprobados. Son diagnósticos de reproducción, no una aprobación
de la presentación defectuosa. La respuesta vacía exacta no se reprodujo
literalmente: esa ejecución emitió `metrics` escalar, que el servicio normaliza
pero el presentador anterior rechazaba, dejando la respuesta al modelo.

La diferencia no procede de una tilde, una selección arbitraria del rubro ni
ventas perdidas. El filtro de local conservado explica el vacío de la
intersección. **No debe retirarse porque el modelo lo omita.** El defecto es
que la respuesta no hacía explícito el alcance y podía interpretarse como
ausencia de ventas del rubro completo.

## Corrección y regresiones

Solo cambia `salesSeriesPresentation.service.js`:

- Expone si se consultan locales/rubros seleccionados o todos, además del tipo
  de día cuando existe, sin mostrar IDs o identidades.
- Ante local+rubro sin filas, explica que el vacío corresponde a esa combinación
  y ofrece la petición explícita **todos los locales**. No hace una consulta
  alternativa ni borra filtros silenciosamente.
- Refleja la normalización de métricas escalares reconocidas ya realizada por
  el servicio; la definición de la herramienta y las reglas de SQL no cambian.

`librarySalesContext` prueba el caso con propuesta del modelo sin local,
conservación de IDs confirmados, binds/fechas, texto y ausencia de mutaciones
en argumentos/historial. También prueba retirada explícita solo del local,
conservando rubro, período, agrupación y tipo de día, y equivalencia de métricas
escalar/array. Con las regresiones existentes del presentador: **11/11 locales**
y **11/11 en Node 22.23.4 de Docker DEV**, candidato
`94808dfe9e95dc0a0670fc0edc28528539b9ed34`. Preflight completo aprobado y
**262 archivos** src/scripts/test/config/packages coincidentes con Git. No
modelo real, sesión ni Oracle en el preflight. Reporte ignorado
`library-sales-final-focused.json`, SHA-256 de la salida enfocada:
`99827a5d24b0415033a51fd04d12521e23494b67e4e84ef2d385057f9d39a816`.
Contraste Oracle afectado aprobado sobre `e5240d2`, según el resultado final
descrito abajo; no es una repetición de las conversaciones con modelo real.

## Separación de evidencias

| Evidencia | Atribución y límite |
| --- | --- |
| Conversación nueva real | `059ac13`, 06/11/2026 15:11:11–15:11:20 (Asunción); `library-sales-baseline-059ac13.json`, SHA-256 `b986706b3e89ec04d6eba02956b50f03befb78b7cedd90576331c42068a77b47`. 9/9 técnicos/conciliación, no prueba de la corrección posterior. |
| Contexto real reproducido | `059ac13`, 06/11/2026 15:20:16–15:20:46 (Asunción); `library-sales-context-059ac13.json`, SHA-256 `03ed70b4b82aa406053f795ab76e077e9010ed30c7bd96cc88be2f8ccb806309`. 7/7 diagnósticos y vacío de la intersección confirmado; no conserva las preguntas/valores privados. |
| Regresiones nuevas | Datos y propuestas controlados, repositorio/servicio/guard/presentador reales. No simulan una ejecución Oracle ni un modelo real. |
| Control final aprobado | `e5240d2`, código idéntico a `94808df`: **19/19 verificaciones** de `scripts/check-library-sales-context-dev.mjs`. Modelo y estado de resolución controlados; IDs/filas Oracle legítimos y SELECT independientes. Vacío explicado y posterior retirada explícita con conciliación mensual completa. El local reseleccionado no se declara idéntico al original; no son conversaciones nuevas con modelo real. |

## Resultado final de la corrección

Ejecución del **06/11/2026, 15:54:10–15:54:14 (Asunción)** sobre
`e5240d223aef4f0f9e5de3be28f6cdae459df508`: **19/19 verificaciones**,
**262 archivos coincidentes** con Git. Desde `94808df` solo cambian dos
documentos; código, pruebas, ejecutor y configuración son idénticos.

Se comprobó en el candidato aislado:

- La propuesta sin local conserva el local confirmado, el rubro, 2023 y el mes;
  SQL efectivo con ambos filtros y vacío concordante con SELECT independiente.
- Respuesta determinista con alcance activo, explicación de la intersección y
  petición explícita para ampliar a todos los locales.
- «Todos los locales» elimina exclusivamente el local aun si el modelo propone
  el ID anterior; conserva rubro/fechas/mes. El SQL elimina solo ese filtro y
  todos los grupos mensuales, importes y monedas coinciden con Oracle.
- Presentación positiva del alcance ampliado; estado de local retirado y rubro
  seleccionado. Sin alterar reglas de búsqueda, permisos o SQL de producción.
- Identidad proxy por sesión, cierre de todas las conexiones y logout de la
  sesión creada por el login DEV protegido aprobados. Sin llamadas a modelo real
  ni proveedor de conversión en este control final.

Las **11/11 pruebas Node 22** y los reportes de las dos reproducciones reales
se reutilizaron por hash. Los 19 checks verifican dos turnos controlados y su
infraestructura; no son 19 conversaciones o variantes distintas ni se suman
a los 9/7 diagnósticos como cobertura única.

Reporte congelado ignorado `logs/library-sales-final-e5240d2.json`, SHA-256
`9a81aa7241107094969399e98c23bc85a2c1a22e05026ffeb284651e355407a3`.
Esquema revisado sin claves sensibles ni UUID de sesión. Logs compactos del
intervalo completo del helper: chatbot cero líneas, ERP dos, sin códigos
Oracle/driver, marcadores sensibles o fatales detectados. No se publicaron
filas, importes, preguntas, binds ni identidades.

Reportes y helpers de `logs/` ignorados. Los logs compactos de cada reproducción:
chatbot cero líneas, ERP dos, sin códigos técnicos, marcadores sensibles o
fatales detectados. Sesiones, credenciales, preguntas previas, documentos,
identidades, binds y resultados completos permanecen en memoria. Solo se cierra
la sesión que crea el helper; ambas sesiones creadas fueron cerradas.

Ventas sigue consultando **`VW_BOT_VENTAS_LOCALES`**, con su regla vigente de
ventas auditadas y fallback: no se cambia la vista, el SQL del repositorio ni
se reemplazan importes para producir positivos. El contraste usa la misma
fuente autorizada con SELECT escritos por separado; no audita nuevamente la
definición interna de la vista. Oracle conserva la autoridad de permisos por
`sessionId` y conexión proxy.

Las seis reservas F3/F4/M7, F5/T1, muestras históricas y cotización real positiva
siguen documentadas. Sin proveedor de conversión, suites completas, datos,
permisos, expiraciones ni integración frontend/ERP. **PR #42 en borrador**;
control final revisado, pendiente de revisión final del diff antes de marcarla
lista para revisión. Sin merge ni despliegue.
