# AGENTS.md

## Arquitectura

Todo código nuevo debe seguir:

Route -> Controller -> Service -> Repository -> Data source

## Sesiones Oracle

- El chatbot nunca autentica usuarios finales directamente.
- El frontend entrega `sessionId`.
- El servicio resuelve `sessionId -> username` desde PostgreSQL.
- La conexión Oracle se crea mediante el usuario proxy configurado.
- Nunca aceptar `username` del frontend para decidir la identidad Oracle.
- Nunca almacenar conexiones Oracle en PostgreSQL o Redis.
- Toda conexión Oracle abierta por el chatbot debe cerrarse al finalizar la operación.

## Seguridad

- Nunca versionar passwords, tokens o credenciales.
- No registrar PII ni resultados sensibles de las vistas `VW_BOT_*`.
- Oracle es la autoridad para permisos sobre `VW_BOT_*`.
