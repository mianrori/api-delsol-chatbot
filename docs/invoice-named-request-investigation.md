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
en `/app`. Esta entrega está publicada en `fix/invoice-concept-customer-intent` mediante
[PR #47 en borrador](https://github.com/mianrori/api-delsol-chatbot/pull/47), sin
merge ni despliegue.
No se modificaron datos, configuración, permisos o expiraciones. La gramática
es acotada; no se acredita interpretación remota exhaustiva ni otras muestras
fiscales. Las reservas previas, incluida la del PDF ausente, no se modifican.
`1d5b67e` solo documentó la verificación. `e60df5d` añade el ejecutor HTTP y su
matriz, sin cambiar aplicación ni pruebas de `5816a8b`.

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
Resultado revisado de este único recorrido: HTTP 200 y 17/17 aserciones. Las reservas de
matrícula/PDF y de las PR anteriores permanecen sin cambios.

## Único caso HTTP con Oracle: resultado revisado

Commit del ejecutor y del control: **`e60df5d0b60126c5a6251b302591ddf646827b83`**.
La aplicación y las pruebas siguen idénticas a **`5816a8b`**, cubierto por las
28 pruebas y 15 comprobaciones de servicio previas. Esas dos evidencias se
reutilizaron por hash e identidad de código, sin volver a ejecutarlas.

Se envió **un único POST** a `/chatbot/api/bot/chat` del candidato aislado con la
pregunta literal. Pasó por router y controller reales, autenticación de sesión,
chat, los dos resolvers, servicio y repositorio, con Oracle proxy real y SDK
controlado. **HTTP 200, 17/17 aserciones**:

- `search_invoice_concepts`: únicamente el texto del concepto, RESOLVED.
- `search_invoice_customers`: únicamente «impacto» y ambas fechas de 2023,
  RESOLVED. No se pasó el concepto como cliente.
- `get_invoices`: los IDs efectivos de ambos resultados, `dateFrom=01/01/2023`,
  `dateTo=31/12/2023`, detalle y primera página de 20 filas. Binds reales y
  `USER_CAN_CONSULT` verificados.
- IDs contrastados con descripción del catálogo y nombre fiscal independientes;
  conteos, toda la página de cliente/concepto/importes, presentación y
  `actions.invoicePagination` contra SELECT independientes.
- «Ver PDF» coincide por fila con base configurada + archivo de Oracle; no se
  descargan documentos ni se reejecuta el caso PDF anterior.
- Metadatos persistentes coinciden con los argumentos finales; no incluyen filas
  facturadas. Conexiones, servidor efímero y logout cerrados; auditoría de logs
  sanitizados aprobada (cero líneas chatbot, dos eventos ERP reconocidos).

**Modelo controlado no equivale a modelo real.** El SDK del control lanza error
si se invoca; esta ruta tipada literal lo evitó. Cero invocaciones al modelo
controlado, cero al modelo real/Bedrock y cero proveedor. Se acredita el recorrido
HTTP completo de **esta pregunta literal**, sin afirmar interpretación libre con
modelo remoto ni una conversación servida por el DEV desplegado en el puerto
5400. El servidor efímero se limitó a loopback, sin publicar DEV.

304 archivos del candidato verificados; manifiesto SHA-256
`86d7ba61f60a4dec6f6f3e9b1236b924fd6cc1dbc45e0e81a0f8edbb2eaa6ce8`.
Reporte congelado ignorado `logs/invoice-named-http-e60df5d.json`, SHA-256
`94276b1d04100c5085dc843b0bc5ccea66db8f060d2642d0141164863f871287`.
Revisión sanitizada local: `logs/invoice-named-http-evidence-review.json`.
No se suman 28 pruebas, 15 comprobaciones de servicio y 17 aserciones HTTP como
casos/conversaciones independientes o cobertura única.

El código desplegado permanece en `9addbef`, saludable y sin esta corrección en
`/app`. Los commits posteriores a `e60df5d` de esta entrega solo documentan
resultados. PR #47 en borrador; sin merge, despliegue o cambios de datos,
configuración, permisos o expiraciones. Se conservan paginación, enlaces y todas
las reservas anteriores, con el PDF positivo y el archivo ausente con 404
separados. Las ambigüedades y el recorte mantienen la cobertura sintética de las
regresiones; este caso Oracle/HTTP fue de resolución única en ambos dominios.
