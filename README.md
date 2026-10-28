# api-delsol-chatbot

Servicio independiente para el chatbot del ERP delSol.

## Primera etapa

Esta versión inicial valida la independencia de infraestructura:

1. recibe un `sessionId` existente;
2. consulta `delsol_oracle_sessions_dev`;
3. obtiene el `username` persistido por el ERP;
4. abre una conexión Oracle mediante `PROXY_USERNAME[username]`;
5. Oracle aplica los permisos del usuario final;
6. la conexión Oracle creada por el chatbot se cierra al terminar la operación.

El servicio no crea ni cierra sesiones ERP. PostgreSQL es la fuente compartida de metadata de sesión.

## Endpoints iniciales

- `GET /chatbot/api/health`
- `GET /chatbot/api/health/oracle/:sessionId` solo en development.

## Siguiente etapa

Migrar el módulo de IA del ERP por capas: catálogo, repositories, services, tools, Bedrock y PII.


## Conversaciones del chatbot

`POST /chatbot/api/bot/chat` recibe `{ "sessionId": "...", "message": "..." }`.
El historial y el diccionario PII se guardan en memoria por `sessionId`.

Para iniciar una conversación nueva sin reiniciar el contenedor:

```http
POST /chatbot/api/bot/chat/reset
Content-Type: application/json

{ "sessionId": "SESION_VIGENTE_DEL_ERP" }
```

La operación valida la sesión existente y elimina únicamente su historial y su
diccionario PII. No cierra la sesión ERP, no modifica su vencimiento y no abre
una conexión Oracle. Después se envía la primera pregunta al endpoint habitual,
con el mismo `sessionId`. La interfaz puede asociar esta operación al botón
«Nueva conversación» y limpiar sus mensajes visibles cuando reciba `success: true`.

Ejemplo desde PowerShell en DEV (puerto 5400):

```powershell
$chatbotSessionId = "SESION_VIGENTE_DEL_ERP"
Invoke-RestMethod -Method Post -Uri "http://localhost:5400/chatbot/api/bot/chat/reset" -ContentType "application/json" -Body (@{ sessionId = $chatbotSessionId } | ConvertTo-Json)
```

Si hay una solicitud activa para esa sesión, chat y reset responden `409`.
Espera a que termine o cancélala y espera a que el backend complete la limpieza;
no se mezclan mensajes ni se limpia el diccionario PII mientras una respuesta lo utiliza.
Los códigos de sesión siguen siendo `400` (ausente), `404` (inexistente) y `401`
(inactiva o vencida). Otras sesiones no se ven afectadas.
El historial y esta exclusión son locales al proceso; no proporcionan coordinación
entre varias réplicas del backend.

Las comparaciones mensuales repetidas literalmente dentro de una secuencia de
resúmenes compatibles vuelven a consultar Oracle una vez por mes, sin Bedrock.
Se conservan los filtros, métricas, períodos y desglose de la consulta original.
Los cambios de tema, filtros o fechas usan el flujo normal del modelo.

Pruebas locales: `node --test test/*.test.js`.


## Comparación de canjes de socios frente a ventas

La herramienta `compare_member_purchases_vs_sales` compara el importe de facturas
canjeadas por socios con las ventas disponibles en el mismo período. Conserva
la consulta del ERP a `VW_BOT_VENTAS_LOCALES` y `VW_BOT_COMPRAS_SOCIO`, sin agregar
filtros de auditoría. Calcula `importe de canjes / ventas * 100` por moneda; si
las ventas no son positivas, muestra «No calculable».

Admite hasta dos dimensiones entre mes, año, local y rubro; filtros por locales
y rubros previamente resueltos; orden y límite de hasta 100 grupos después del
cálculo. Usa exclusivamente la sesión proxy resuelta desde `sessionId`. Las
consultas se ejecutan secuencialmente para respetar la cancelación y el cierre
de conexión. Los identificadores y nombres de locales en las dimensiones se
pseudonimizan antes de enviarse al modelo.

Prueba en Insomnia después de reset:
«¿Qué porcentaje representan los canjes de facturas de socios sobre las ventas
de enero de 2023?». Después: «Ahora desglosa ese porcentaje por rubro» y «Ahora
por local». Se muestran los valores calculados sin pedir al modelo que reescriba
la tabla. Los resultados deben validarse contra Oracle DEV.

Inventario de herramientas aún pendientes frente al registro de `api-delsol-erp/main`
revisado el 28/10/2026: generación de gráficos,
registros de vehículos, búsqueda de tipos de soles, soles de socios, uso de soles,
destinos de uso y tipos de movimiento de soles. La presencia de herramientas
migradas no equivale a haber validado todos sus casos en DEV.


## Ventas antes, durante y después de una campaña

`analyze_campaign_sales_performance` se utiliza después de resolver la promoción
con `search_promotions`. Recibe los identificadores y las fechas de la campaña
seleccionada. El backend vuelve a comprobarlos contra `VW_BOT_PROMOCIONES` y
utiliza los nombres registrados. Si hay ambigüedad o no coinciden las fechas,
no consulta ventas hasta resolver la campaña.

Los tres períodos tienen la misma duración en días calendario, sin solaparse.
Para una campaña del 01/05/2023 al 10/05/2023, se comparan 21–30/04, 01–10/05 y
11–20/05. Cada consulta usa los mismos filtros de locales y rubros, la conexión
proxy del `sessionId` y el repositorio de ventas ya migrado. Las consultas son
secuenciales y respetan la cancelación.

La tabla muestra ventas, cantidad de facturas y promedio diario. Las variaciones
se calculan en Node.js, se presentan directamente y se conservan en el historial.
No se atribuyen causas a la campaña. Una base cero produce porcentaje no
calculable; si las monedas difieren, se conservan los importes separados y solo
se comparan las cantidades. Los períodos sin registros permanecen visibles.
Los nombres e identificadores de promoción/campaña se protegen mediante PII.

Prueba DEV en Insomnia: después de reset, enviar «Analiza las ventas antes,
durante y después de la campaña [nombre de una campaña que exista en DEV]».
Si devuelve opciones, seleccionar una. Verificar vigencia, igualdad de duración,
importes y variaciones contra la base; recordar que el conjunto DEV llega hasta
mayo de 2023 y un período posterior puede no tener registros.
