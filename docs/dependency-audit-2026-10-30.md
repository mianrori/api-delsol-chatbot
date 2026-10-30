# Auditoría de dependencias — 30/10/2026

Base: `feature/chat-sales-pilot` en `e85630b`. Rama de propuesta:
`fix/npm-audit-production-dependencies`. No se despliega ni se modifica la rama base.

## Hallazgos iniciales y uso en producción

`npm audit --json` informó cuatro paquetes afectados: una severidad alta y tres
moderadas. Corresponden a **tres avisos independientes**: el aviso de ExcelJS se
propaga desde UUID, no constituye una cuarta vulnerabilidad independiente.
Los cuatro paquetes están en el árbol de producción, no solo en herramientas DEV.

| Paquete instalado | Tipo y ruta | Severidad npm | Uso y exposición en este proyecto | Corrección |
| --- | --- | --- | --- | --- |
| `body-parser 2.3.0` | Transitiva: `express → body-parser` | Alta | `index.js` usa `express.json()` y `express.urlencoded()` con descompresión habilitada. Procesan solicitudes antes de las rutas y de la validación de sesión. | `2.4.0`, permitida por el rango de Express. |
| `qs 6.16.0` | Transitiva: `express → qs` y `express → body-parser → qs` | Moderada | Incluida para analizar query strings y formularios. El aviso específico afecta `stringify` con `arrayFormat: 'comma'`; no se encontró ese uso en el código de la aplicación. La presencia en producción no demuestra que esa ruta vulnerable sea alcanzable aquí. | Corregida desde `6.16.1`; instalada `6.17.1`, dentro de los rangos existentes. |
| `uuid 8.3.2` | Transitiva: `exceljs → uuid` | Moderada | ExcelJS importa `v4()` mediante CommonJS para extensiones de formato condicional. El aviso afecta `v3/v5/v6` con buffers de salida; no se encontró ese uso en ExcelJS ni en la aplicación. Los identificadores propios del chatbot usan `node:crypto`. | `11.1.1`, con el parche y exportación CommonJS. Override limitado a ExcelJS. |
| `exceljs 4.4.0` | Directa, afectada por UUID | Moderada heredada | Genera XLSX de ventas en `buildSalesExcel`. El ejecutor de pruebas también reabre los XLSX. No hay una ruta de carga de libros de usuarios en la API. | Se conserva `4.4.0` y se corrige UUID. No se acepta la degradación a `3.4.0` sugerida por audit. |

Fuentes primarias: aviso de [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828),
aviso de [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), aviso de
[UUID](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
El código instalado y el árbol de `npm ls` se revisaron para distinguir presencia
de dependencia de uso efectivo de la función vulnerable.

## Cambios y compatibilidad

- `package-lock.json`: únicamente cambian las versiones de `body-parser`
  (`2.3.0 → 2.4.0`), `qs` (`6.16.0 → 6.17.1`) y `uuid` (`8.3.2 → 11.1.1`).
  Express permanece en `5.2.1`; ExcelJS permanece en `4.4.0`.
- `package.json`: `overrides.exceljs.uuid = "11.1.1"`. No se añade una dependencia
  directa de UUID ni un override global que afecte a otros consumidores.
- El salto mayor **transitivo** de UUID se revisó expresamente: ExcelJS utiliza
  solo `require('uuid').v4()` sin argumentos. `11.1.1` conserva esa exportación
  CommonJS y esa llamada. Sus cambios en otras funciones, imports internos o CLI
  no forman parte del uso encontrado. Se probó la ruta real de ExcelJS que genera
  los identificadores de formatos condicionales extendidos.
- Se revisaron el [changelog de UUID 11.1.1](https://github.com/uuidjs/uuid/blob/v11.1.1/CHANGELOG.md)
  y el [changelog de qs 6.17.1](https://github.com/ljharb/qs/blob/v6.17.1/CHANGELOG.md).
  La actualización de qs incluye correcciones del parser; se probaron formularios
  anidados y arrays además del caso de serialización del aviso.
- No se ejecuta `npm audit fix --force`, no se cambian versiones mayores de las
  dependencias directas ni se modifica lógica, permisos o sesiones del chatbot.
  El override debe revisarse al actualizar ExcelJS en el futuro.

## Validación

- `npm audit --json`: salida 0, cero vulnerabilidades.
- `npm audit --omit=dev --json`: salida 0, cero vulnerabilidades de producción.
- Instalación limpia mediante `npm ci --ignore-scripts` en imagen efímera
  `node:22-alpine`, seguida de **240/240 pruebas aprobadas**, sin omisiones.
  La ejecución no publica puertos, no monta volúmenes y usa `--network none`.
- Las cuatro pruebas nuevas comprueban: compatibilidad CommonJS/v4 y rechazo de
  buffers insuficientes en v3/v5; escritura y lectura XLSX con formato condicional
  extendido; serialización de arrays con `toString` no invocable; JSON comprimido,
  formularios y supervivencia del proceso ante compresión inválida o bytes finales.
- Los libros y las solicitudes de estas pruebas usan datos sintéticos en memoria.
  No requieren sesiones reales ni conexiones Oracle, PostgreSQL, Redis o Bedrock.
- Windows tiene Node 24, fuera del rango `>=22 <23` del proyecto. La ejecución
  local de la prueba quedó bloqueada y se detuvo; no se presenta como aprobada.
  El resultado de compatibilidad corresponde al entorno soportado Node 22.
- No se reconstruyó ni recreó Docker DEV. Su ID de contenedor, imagen y fecha de
  arranque permanecen iguales. Los reportes completos y el Dockerfile temporal de
  validación permanecen en `logs/`, ignorado por Git y por el contexto Docker.

El resultado de audit corresponde al catálogo de avisos consultado en esta fecha;
no equivale a una garantía de ausencia de futuras vulnerabilidades. La PR no
incluye una validación contra las bases DEV ni un despliegue de la API.
