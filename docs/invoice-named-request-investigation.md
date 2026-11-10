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
2023, filtros anteriores y presentación. Verificación Oracle autorizada pendiente
hasta revisar el reporte sanitizado de la copia aislada. No merge ni despliegue.
