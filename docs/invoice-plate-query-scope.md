# Alcance de consultas de facturas por matricula

Una consulta completa como «facturas de la matricula ...» inicia un alcance independiente. No hereda cliente, concepto, fechas, anulacion ni pagina del caso anterior, incluido un caso denegado. Un periodo indicado en esa misma consulta se conserva. «Filtra tambien por matricula ...» conserva el alcance previo y cambia la matricula; no se eliminan filtros por simple omision en seguimientos ordinarios.

La causa era la reconstruccion de los resolvers de facturacion y sus periodos desde el historial, que podia volver a aplicar IDs antiguos sobre la consulta nueva. La consulta autonoma ahora marca un limite de alcance al reconstruir ese historial; el estado persistente guarda exclusivamente argumentos protegidos efectivos despues del guard y la validacion, incluso si Oracle deniega la operacion. No almacena filas, conexiones o credenciales. El alcance sobrevive al recorte; una consulta nueva tambien cancela selecciones antiguas de facturacion.

El recorrido acotado de matricula ejecuta directamente get_invoices. La normalizacion y la igualdad de matricula, permisos USER_CAN_CONSULT, SQL de conteos/resumen/paginacion y enlaces PDF mantienen su implementacion existente. Un resultado sin filas permitidas pero con restringidas produce falta de permisos; sin ninguna clase produce ausencia real; resultados permitidos se muestran con el alcance nuevo. La gramática acotada no intenta absorber consultas con otros modificadores.

## Validacion

- 56/56 pruebas enfocadas Node 22.23.4. Incluye denegacion inicial por concepto/cliente/2023 seguida de nueva matricula permitida, denegada o ausente, y seguimiento aditivo que conserva filtros. Cada rama se comprueba antes/despues del recorte, mediante chat y tambien HTTP con router/controller reales. Se verifican argumentos, binds de matricula normalizada, respuesta, acciones vacias en denegacion y metadatos persistentes sin filas.
- 6/6 controles existentes de seleccion de cliente/concepto de facturas.
- Primer grupo: SHA-256 67030383c7d7a25b56cdef7699bdcde348de347cb5e69f093abc165c7acaef3b. Seleccion: SHA-256 2e1fffc1d1179e409d066407455055ffcb5853f1f06f7ea6e6328644aa38b977. 312 archivos del candidato aislado verificados; manifiesto 271bb61e6f7a33b9d32d78216510df451af7cd2f1e7fad4b0a513cd1f7b26108.
- Los fixtures HTTP generales previos siguen comprobando filtros combinados propuestos por SDK controlado; se ajusto su frase para que ese caso permanezca fuera de la nueva gramatica autonoma, conservando sus aserciones originales. Los ocho nuevos casos HTTP verifican la secuencia solicitada con SDK que rechaza invocaciones.

Las conexiones y los resultados Oracle son simulados; no se acredita disponibilidad ni permisos reales de la matricula del usuario. No se invoco Bedrock, proveedor ni modelo real; no se descargaron PDFs. DEV permanece desplegado en PR48; esta correccion no se desplego. Las reservas de muestras Oracle restringidas, mixtas y segunda pagina mixta, y el positivo PDF/404 separados, se conservan.

## Ajuste detectado al preparar Oracle DEV

73e1eef cubre el reinicio autonomo y la conservacion del alcance ya resuelto. La revision detecto un caso adicional: denegacion al resolver el cliente, antes de disponer de un ID autorizado. 5f94216 marca ese alcance pendiente como denegado e impide que un seguimiento aditivo consulte otros clientes. La consulta autonoma cancela esa marca y consulta solo la nueva matricula.

20/20 controles afectados Node 22 aprobados, incluidos cuatro casos HTTP nuevos (consulta autonoma/seguimiento tras denegacion en resolucion, antes/despues del recorte). SHA-256 e35e3bd9b52c92412e18e2f1050c11fbbeb9bf664f018947954fd2d31b412ebf. No se repitieron los 56/6 controles originales al preparar el ejecutor Oracle; se reutilizan para las partes no modificadas. El codigo alterado de denegacion se acredita por estos 20 controles, no por el resultado antiguo.

El ejecutor Oracle/HTTP queda preparado para ambas secuencias con sesion protegida, cuatro POST y SDK que rechaza invocaciones. Clasificara la muestra real sin presuponer un positivo para la matricula. Evidencia Oracle y matriz pendientes de revisar la ejecucion; sin merge ni despliegue.
