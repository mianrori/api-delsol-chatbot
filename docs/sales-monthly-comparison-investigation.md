# Comparaciones mensuales: alcance y catalogo autorizado

Base: PR #44 integrada en `7d29892`. Rama separada
`fix/sales-monthly-comparison-scope`.

## Investigacion y correccion

Las frases reportadas no coincidian con la gramatica existente del atajo anual.
La politica persistente tampoco reconocia esta comparacion como consulta
 autonoma. La nueva intencion anclada reconoce los dos anos y el sujeto completo;
no interpreta la omision de argumentos del modelo como retirada de filtros.

La comparacion general reinicia locales, rubros, tipo de dia y preferencia de
metricas anterior. Consulta ambos anos completos por mes con importe y facturas.
La que nombra un rubro usa el resolver y el catalogo Oracle autorizado; no hay
alias comerciales inventados. NOT_FOUND no consulta ventas; AMBIGUOUS espera
seleccion y conserva ambos anos tras recorte. Un rubro resuelto sin filas produce
una respuesta de ausencia de registros, distinta de rubro inexistente y de cero.

El seguimiento explicito "compara ese mismo rubro con 2022" conserva los filtros,
la ventana de meses y la preferencia de metricas. Los argumentos de ambos anos
persisten como metadatos protegidos; no se guardan filas de negocio.

## Validacion enfocada

Dieciseis perfiles nuevos de chat/servicio/repositorios con datos sinteticos:
consulta nueva y con filtros previos, general y por rubro; ambiguedad y seleccion,
rubro no encontrado, rubro sin ventas y seguimiento explicito. Cada perfil antes
y despues de recortar el historial. Argumentos finales, SQL, estado y alcance;
importe y facturas; cero real, meses ausentes y periodos verificados.

Ejecutor protegido: `scripts/run-sales-monthly-comparison-dev.ps1`.
Comando desde PowerShell local: 

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-sales-monthly-comparison-dev.ps1
```

Copia aislada del commit en Docker, sin reconstruccion, sustitucion de `/app`,
merge ni despliegue. Login mediante entradas ocultas y sesion en memoria;
identidad desde PostgreSQL y proxy Oracle; consultas independientes de solo
lectura, cierres y logout. Reportes sanitizados ignorados en `logs/`.

El contraste distingue dos sondas de planificacion con Bedrock real (mismos
prompts y schemas de ventas, sin ejecutar sus propuestas) y el recorrido exacto
del chat candidato que resuelve deterministicamente estas frases. No se afirma
una conversacion HTTP ni interpretacion libre remota de las rutas deterministas.
El catalogo independiente determina inexistencia, unicidad o ambiguedad; las
filas de ambos anos se concilian por mes, moneda, importe y facturas. No se
consulta otro proveedor. Fixtures previos y elecciones numericas son controlados
sobre IDs autorizados, no muestras adicionales de conversaciones reales.

Resultados de Node 22, catalogo, sondas reales y conciliacion: pendientes de
revisar. La evidencia historica de PR #44 permanece previa; no acredita estos
cambios. Se conservan todas las reservas del balance, las muestras pendientes y
los limites de cobertura. No cambios de datos, permisos o expiraciones.
