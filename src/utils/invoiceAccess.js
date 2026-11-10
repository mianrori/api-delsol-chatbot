export const INVOICE_ACCESS_DENIED_MESSAGE = 'No est\u00e1 autorizado a consultar estos datos.';
export const INVOICE_PARTIAL_ACCESS_MESSAGE = 'No est\u00e1 autorizado a consultar parte de los datos solicitados. Se muestran exclusivamente los registros permitidos.';

export const invoiceAccessDeniedError = () => Object.assign(
  new Error(INVOICE_ACCESS_DENIED_MESSAGE), {code: 'ACCESS_DENIED'},
);
