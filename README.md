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
