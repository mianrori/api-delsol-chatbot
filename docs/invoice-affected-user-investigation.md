# Reapertura: usuario afectado y proceso habitual

Base: 22f4b02. Estado: investigacion pendiente de reproduccion con el usuario DEV afectado; caso no resuelto.

Los controles historicos con otra sesion autorizada no acreditan la secuencia que comienza con denegacion. No se reutilizan como reproduccion ni se presupone la causa.

El ejecutor usa login DEV protegido (entradas ocultas, credenciales/sesion en memoria), el endpoint habitual 5400 y el modelo/ruta reales del proceso. No hay SDK controlado ni cuenta alternativa. Primero verifica el codigo de diez modulos cargados mediante el inspector loopback interno del contenedor, ademas del manifiesto de /app. La traza temporal envuelve el driver Oracle sin cambiar argumentos, resultados, identidad o permisos; registra solo SQL con literales ocultos, metadatos protegidos de argumentos/estado y senales de autorizacion. La identidad y los identificadores usan HMAC con clave efimera que no se publica.

Si la pregunta inicial no devuelve denegacion, el control se detiene con AFFECTED_INITIAL_DENIAL_NOT_REPRODUCED y el caso queda bloqueado. No continua con otra cuenta ni declara resuelta la incidencia. Si se reproduce, contrasta la matricula con SELECT independientes usando la misma identidad, luego reinicia solo la conversacion temporal propia y compara la pregunta en conversacion nueva. No se modifican datos de negocio, permisos o expiraciones.

Se restauran los metodos originales del driver, se cierra el inspector si lo abrio el control, se limpia la conversacion temporal propia, se cierran conexiones y se hace logout. La evidencia y cualquier hallazgo se revisaran antes de publicarlos. No hay correccion de aplicacion propuesta sin reproduccion y causa verificadas. PR en borrador; sin merge ni despliegue.
