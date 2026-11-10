# Facturas: concepto de facturación frente a cliente/local

Caso reportado: «facturas de arrendamiento mínimo del 2023 del local impacto».
La respuesta que presenta «arrendamiento mínimo» como cliente es incorrecta.
En esa estructura explícita el concepto debe buscarse con
`search_invoice_concepts`, e «impacto» con `search_invoice_customers` dentro de
01/01/2023–31/12/2023; `get_invoices` debe recibir ambos IDs autorizados.

Se agrega una interpretación acotada de concepto + año + local/cliente; no se
codifican nombres ni identificadores particulares. Los demás enunciados siguen
el flujo existente. La consulta completa posee sus sujetos/período y no recupera
filtros de otra consulta; esto no elimina filtros omitidos de los seguimientos
ordinarios. Modificadores fuera de esta gramática no se absorben como nombre.

Los dos resolvers se ejecutan en orden. Una ambigüedad pide selección del dominio
correcto antes de consultar facturas; una opción inválida no consulta. El estado
de la solicitud contiene solo metadatos protegidos de selección y argumentos,
no filas facturadas; sobrevive al recorte durante la selección y se retira al
cambiar de solicitud. No se confunde concepto no encontrado con cliente no
resuelto o facturas sin registros.

El buscador de conceptos ahora normaliza tildes y presentación para comparar la
descripción, conservando el bind literal para códigos. No se inventan alias ni
se cambian permisos: Route → Controller → Service → Repository, identidad por
sessionId/PostgreSQL/proxy y USER_CAN_CONSULT sin cambios.

Pruebas enfocadas: roles, otras descripciones de concepto, sintaxis no aplicable,
tildes, códigos literales, nombres no encontrados, opciones válidas/incorrectas,
ambigüedad individual/doble antes y después del recorte, argumentos finales,
2023, filtros anteriores y presentación. Verificación Oracle autorizada revisada en una copia aislada. No merge ni despliegue.

## Resultado verificado

Commit de aplicación y pruebas: `5816a8bd0d173319038aad14eb30e22e1280e346`.
**28/28 pruebas afectadas Node 22.23.4**: 13 nuevas y 15 existentes de facturas y
PDF, sin suite completa. Salida SHA-256
`481b1e089946db3502027dc19f4649097ecaf684afe9bcecfbd24a6d62ec864b`.

**15/15 comprobaciones Oracle independientes** en el mismo commit:

- Catálogo autorizado: una coincidencia del concepto solicitado, `RESOLVED`.
- Cliente/local de facturación «impacto»: `RESOLVED` dentro de 2023. El nombre se
  contrastó también de forma independiente en las filas fiscales autorizadas.
- La frase literal hizo primero `search_invoice_concepts` con el concepto y luego
  `search_invoice_customers` únicamente con el local y el rango 2023; no hubo
  elecciones numéricas controladas porque ambos resolvers dieron unicidad.
- `get_invoices` recibió los dos IDs efectivos y 01/01/2023–31/12/2023. Hubo
  facturas; conteos y página de detalle/cliente/concepto/importes se conciliaron
  con SELECT independientes, sin publicar valores ni documentos.
- Estado final con metadatos de solicitud, sin filas de facturas; cierres, logout
  y auditoría de logs sanitizados aprobados. Cero Bedrock/proveedor y sin GET de
  PDF. No se reproduce una conversación completa con modelo remoto: el caso
  literal se resuelve por la ruta tipada y el modelo del control rechaza llamadas.

301 archivos del candidato verificados en la copia aislada, manifiesto SHA-256
`96661b009576482045eb7c7172fc1550d2b3cad9236cdfd4002ee7d1c7e382b2`.
Reporte congelado ignorado `logs/invoice-named-5816a8b.json`, SHA-256
`b536329c7945f41ecc49e4447f0c73c79403565b390654af6553d33f4a9b77d2`.
Revisión local sanitizada: `logs/invoice-named-evidence-review.json`.

DEV sigue con el código desplegado de `9addbef`; la nueva interpretación no está
en `/app`. Esta entrega está en la rama local
`fix/invoice-concept-customer-intent`, sin publicar PR, merge ni despliegue.
No se modificaron datos, configuración, permisos o expiraciones. La gramática
es acotada; no se acredita interpretación remota exhaustiva ni otras muestras
fiscales. Las reservas previas, incluida la del PDF ausente, no se modifican.
Los cambios posteriores a `5816a8b` de esta entrega solo documentan resultados.

## Alcance HTTP: ampliación solicitada

Las 15 comprobaciones de `5816a8b` invocaron `chatService` con Oracle real y
pasaron por buscadores/servicios/repositorios, pero **no por router/controller
HTTP**. Las 28 pruebas incluyen HTTP con datos controlados para otros flujos de
facturas; no se atribuyen a la pregunta literal completa con Oracle real.

Se añade únicamente el POST literal de este caso mediante router, controller,
chat, resolvers, servicios y repositorios del candidato en loopback efímero.
El SDK está controlado y rechaza su invocación; la ruta tipada no necesita llamar
al modelo. No se acredita modelo real, Bedrock ni conversación servida por el
DEV desplegado en 5400. El control contrasta los argumentos finales de cliente,
concepto y fechas, binds/permisos, conteos, filas, paginación, enlaces PDF y estado
con SELECT independientes. No descarga PDFs ni repite las 28/15 comprobaciones.

Ejecutor reproducible con entradas ocultas y sesión solo en memoria:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-invoice-named-http-dev.ps1
```

Su preflight reutiliza el reporte congelado y el hash de las 28 pruebas, exige
identidad de aplicación/pruebas con `5816a8b` y verifica la copia aislada. La sesión
DEV propia se cierra con logout y el servidor efímero se cierra al terminar.
Resultado de este único recorrido HTTP pendiente de revisar. Las reservas de
matrícula/PDF y de las PR anteriores permanecen sin cambios.
