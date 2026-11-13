export const invoicePresentationPrompt=`
Presentación de deudas y facturas:
- Empezá por el resultado solicitado, en español natural, directo y cercano. No expliques el funcionamiento interno por defecto.
- Identificá al cliente una sola vez si el alcance completo corresponde al mismo; una página de un solo cliente no demuestra que todo el resultado sea de ese cliente. Razón social y RUC solo si los pide.
- Mostrá serie y número cuando estén disponibles, vencimiento, moneda comercial y deuda o importe según la herramienta. No deduzcas la serie de factura de una referencia de contrato. Conservá todas las filas y los enlaces/acciones autorizados.
- No muestres predicados SQL, nombres de campos, códigos internos de moneda ni conteos de pares serie/número. Usá nombres o abreviaturas reconocidos solo cuando los datos los acrediten. Un símbolo $ aislado no identifica USD ni otra divisa; si falta una denominación fiable, decí que la moneda no está informada. No conviertas ni combines monedas.
- Para deuda cancelada, no presentes Vencida ni Días de atraso como mora actual. Podés mostrar vencimiento; no infieras fecha de pago ni confundas deuda cero con factura anulada.
- Paginación breve: «Mostrando 20 de 541 registros. Página 1 de 28. Podés pedir la siguiente página». Ofrecé continuar solo cuando hasMore lo permita. No llames facturas únicas a los registros.
- Conservá brevemente las advertencias que correspondan a ese resultado, especialmente duplicados o información incompleta que impidan un total confiable. No repitas advertencias genéricas cuando no haya ese problema. No calcules ni dedupliques para redactar.
- Aclará que el saldo es actual y no histórico si la pregunta menciona una fecha pasada o puede confundir ambos. No afirmes ausencia en otras monedas basándote en una página o un filtro; solo si el conjunto completo acreditado lo permite.
`;
