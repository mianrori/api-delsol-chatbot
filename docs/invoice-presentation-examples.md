# Ejemplos de presentación: antes y después

Ejemplos generados con los mismos resultados sintéticos en los presentadores de `9aaecaa` y de `0a8a857`, commit de código final validado. No son datos ni evidencia Oracle. Los conteos son de registros; se conserva cada fila, importe y enlace autorizado.

## Facturas pendientes

Antes:

**Deudas registradas de facturas**
Vencimientos clasificados al 13/11/2026. Son importes actuales; no reconstruyen un saldo histórico.

Clientes distintos identificados: 1. Pares serie/número distintos: 3.

Cada fila es un registro: serie/número todavía no demuestra una factura única. Los negativos se excluyen; cero indica deuda cancelada. No se suman importes ni se mezclan monedas.

| Serie de factura | Número de factura | Estado de deuda | Cliente | Razón social | RUC | Sector | Vencimiento | Estado de vencimiento | Días de atraso | Moneda (código) | Símbolo informado | Deuda |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 0001 | Pendiente | Tienda Ejemplo | Empresa Ejemplo SA | RUC-SINTETICO | Local | 01/11/2026 | Vencida | 12 | 001 | PYG | 250,50 |
| A | 0002 | Pendiente | Tienda Ejemplo | Empresa Ejemplo SA | RUC-SINTETICO | Local | 01/11/2026 | Vencida | 12 | 001 | PYG | 250,50 |

Se muestran 2 de 3 registros. Página 1 de 2.
Puedes pedir la siguiente página (2).

Después:

Estas son las facturas pendientes de pago de Tienda Ejemplo.

| Serie | Número | Vencimiento | Moneda | Deuda |
| --- | --- | --- | --- | --- |
| A | 0001 | 01/11/2026 | Gs. | 250,50 |
| A | 0002 | 01/11/2026 | Gs. | 250,50 |

Mostrando 2 de 3 registros. Página 1 de 2. Podés pedir la siguiente página.

## Deuda cancelada

Antes:

**Facturas con deuda cancelada**
Vencimientos clasificados al 13/11/2026. Son importes actuales; no reconstruyen un saldo histórico.

Deuda cancelada significa deuda cero. No indica que la factura esté anulada.

Clientes distintos identificados: 1. Pares serie/número distintos: 3.

Cada fila es un registro: serie/número todavía no demuestra una factura única. Los negativos se excluyen; cero indica deuda cancelada. No se suman importes ni se mezclan monedas.

| Serie de factura | Número de factura | Estado de deuda | Cliente | Razón social | RUC | Sector | Vencimiento | Estado de vencimiento | Días de atraso | Moneda (código) | Símbolo informado | Deuda |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 0001 | Deuda cancelada | Tienda Ejemplo | Empresa Ejemplo SA | RUC-SINTETICO | Local | 01/11/2026 | Vencida | 12 | 001 | PYG | 0,00 |
| A | 0002 | Deuda cancelada | Tienda Ejemplo | Empresa Ejemplo SA | RUC-SINTETICO | Local | 01/11/2026 | Vencida | 12 | 001 | PYG | 0,00 |

Se muestran 2 de 3 registros. Página 1 de 2.
Puedes pedir la siguiente página (2).

Después:

Estas son las facturas con deuda cancelada de Tienda Ejemplo.

| Serie | Número | Vencimiento | Moneda | Deuda |
| --- | --- | --- | --- | --- |
| A | 0001 | 01/11/2026 | Gs. | 0,00 |
| A | 0002 | 01/11/2026 | Gs. | 0,00 |

Mostrando 2 de 3 registros. Página 1 de 2. Podés pedir la siguiente página.

## Duplicados que bloquean totales

Antes:

**Deudas registradas de facturas**
Vencimientos clasificados al 13/11/2026. Son importes actuales; no reconstruyen un saldo histórico.

Hay registros históricos inconsistentes: se conserva el detalle sin deduplicar; no se calculan totales, rankings ni conteos de facturas.

Clientes distintos identificados: 1. Pares serie/número distintos: 3.

Cada fila es un registro: serie/número todavía no demuestra una factura única. Los negativos se excluyen; cero indica deuda cancelada. No se suman importes ni se mezclan monedas.

| Serie de factura | Número de factura | Estado de deuda | Cliente | Razón social | RUC | Sector | Vencimiento | Estado de vencimiento | Días de atraso | Moneda (código) | Símbolo informado | Deuda |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 0001 | Pendiente | Tienda Ejemplo | Empresa Ejemplo SA | RUC-SINTETICO | Local | 01/11/2026 | Vencida | 12 | 001 | PYG | 250,50 |
| A | 0001 | Pendiente | Tienda Ejemplo | Empresa Ejemplo SA | RUC-SINTETICO | Local | 01/11/2026 | Vencida | 12 | 001 | PYG | 250,50 |

Se muestran 2 de 3 registros. Página 1 de 2.
Puedes pedir la siguiente página (2).

Después:

Estas son las facturas pendientes de pago de Tienda Ejemplo.
Hay registros históricos duplicados; por eso no puedo calcular un total confiable.

| Serie | Número | Vencimiento | Moneda | Deuda |
| --- | --- | --- | --- | --- |
| A | 0001 | 01/11/2026 | Gs. | 250,50 |
| A | 0001 | 01/11/2026 | Gs. | 250,50 |

Mostrando 2 de 3 registros. Página 1 de 2. Podés pedir la siguiente página.

## Facturas generales con acceso parcial

Antes:

Se muestran 2 de 3 registros (2 facturas distintas). Página 1 de 2.

| Factura | Emisión | Cliente | Concepto | Período | Vencimiento | Contrato | Matrícula | Anulada | Moneda | Importe | PDF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-0001 | 01/10/2026 | Tienda Ejemplo | Alquiler | 10/2026 | 01/11/2026 | C-55 | ABC123 | No | PYG | 250,5 | [Ver PDF](<https://pdf.example.test/factura.pdf>) |
| A-0002 | 01/10/2026 | Tienda Ejemplo | Alquiler | 10/2026 | 01/11/2026 | C-55 | ABC123 | No | PYG | 250,5 | — |

Puedes pedir la siguiente página (2).

No está autorizado a consultar parte de los datos solicitados. Se muestran exclusivamente los registros permitidos.

Después:

Estas son las facturas solicitadas de Tienda Ejemplo.

| Factura | Emisión | Concepto | Vencimiento | Moneda | Importe | PDF |
| --- | --- | --- | --- | --- | --- | --- |
| A-0001 | 01/10/2026 | Alquiler | 01/11/2026 | Gs. | 250,5 | [Ver PDF](<https://pdf.example.test/factura.pdf>) |
| A-0002 | 01/10/2026 | Alquiler | 01/11/2026 | Gs. | 250,5 | — |

Mostrando 2 de 3 registros. Página 1 de 2. Podés pedir la siguiente página.

Solo puedo mostrar los registros que tenés permiso para consultar.

## Límites de la denominación

Un código interno sin símbolo o denominación comercial reconocida se presenta como «Moneda no informada». Un signo `$` aislado se conserva como «$ (moneda no identificada)»; no se lo convierte en USD. No se agrupan ni suman importes para redactar. Las facturas generales conservan el identificador completo disponible: no se deduce una serie de factura de la serie del contrato.

La aclaración de saldo actual aparece cuando la pregunta menciona historia o una fecha: «La deuda que se muestra es la actual; no reconstruye el saldo de una fecha pasada». No se infiere fecha de pago. Un resumen de deuda cancelada por vencimiento usa referencias temporales neutrales y aclara que no indican mora actual. No se afirma ausencia en otras monedas a partir de una página.
