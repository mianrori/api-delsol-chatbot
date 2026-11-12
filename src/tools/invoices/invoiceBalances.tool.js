const textList=description=>({type:'array',maxItems:100,items:{type:'string',minLength:1,maxLength:120},description});
const date=description=>({type:'string',pattern:'^\\d{2}/\\d{2}/\\d{4}$',description});
export const searchInvoiceBalanceCustomersTool={toolSpec:{
  name:'search_invoice_balance_customers',
  description:'Resuelve un cliente/local por nombre, razón social, RUC o código exclusivamente entre los saldos de facturas visibles para el usuario. No utiliza catálogos de ventas o facturas emitidas. Si devuelve AMBIGUOUS o hasMore espera elección o pide precisar; no elijas el primer cliente. Sin coincidencias no implica falta de permisos.',
  inputSchema:{json:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:120}},required:['query'],additionalProperties:false}},
}};
export const getInvoiceBalancesTool={toolSpec:{
  name:'get_invoice_balances',
  description:'Consulta registros individuales actuales de DEUDA, con COD_MONEDA como clave de divisa. Los números se repiten entre clientes/sectores/códigos de moneda y la clave aditiva de factura no está demostrada: summary, sumas y rankings por cliente permanecen bloqueados con REQUIRES_SOURCE_IDENTITY. Para ordenar importes individuales o filtrar rangos monetarios requiere exactamente un currencyCodes. Nunca identifica la divisa por el símbolo ni convierte importes. Cero no prueba pago y negativo no prueba crédito; deuda se conserva como texto decimal exacto. asOfDate solo clasifica vencimientos, no reconstruye historia. Usa search_invoice_balance_customers; detalle paginado. Sin PDF, emisión, cobros, conceptos ni matrícula.',
  inputSchema:{json:{type:'object',properties:{
    customerIds:textList('IDs de clientes resueltos por el buscador de saldos. [] consulta todos los clientes visibles.'),
    invoiceNumbers:textList('Números exactos de factura (o sus tokens PII); sin coincidencia parcial ni comodines.'),
    sectors:textList('Sectores exactos presentes en registros devueltos; no inventes valores.'),
    currencies:textList('Filtra etiquetas de símbolo exactas de registros devueltos. No son claves de divisa ni habilitan sumas/conversión.'),
    currencyCodes:textList('COD_MONEDA exactos retornados, clave de divisa. Orden y rangos de importes requieren un único código; no habilita sumas hasta confirmar la granularidad aditiva.'),
    dueDateFrom:date('Vencimiento mínimo inclusivo, DD/MM/YYYY; no es fecha de emisión.'),dueDateTo:date('Vencimiento máximo inclusivo DD/MM/YYYY.'),
    asOfDate:date('Fecha para clasificar vencimiento/antigüedad. Por defecto hoy en Paraguay. NO reconstruye el saldo a esta fecha.'),
    dueStatus:{type:'string',enum:['all','overdue','dueToday','upcoming','undated'],description:'Vencida: vencimiento anterior a la referencia; dueToday hoy; upcoming posterior; undated fecha vacía/inválida.'},
    balanceStatus:{type:'string',enum:['all','positive','zero','negative','nonZero','unknown'],description:'Signo numérico registrado; por defecto all. Cero no prueba pago; negativo no prueba crédito o devolución sin definición contable. Null es desconocido.'},
    minBalance:{type:'number'},maxBalance:{type:'number'},
    minDaysOverdue:{type:'integer',minimum:0},maxDaysOverdue:{type:'integer',minimum:0},
    mode:{type:'string',enum:['detail','summary'],default:'detail',description:'detail disponible; summary devuelve limitación REQUIRES_SOURCE_IDENTITY hasta disponer de claves verificadas.'},
    groupBy:{type:'array',items:{type:'string',enum:['customer','invoice','sector','dueMonth','dueStatus','agingBand']},description:'Reservado para summary, actualmente bloqueado por identificación insuficiente; no agrega importes por símbolo.'},
    orderBy:{type:'string',enum:['dueDateAsc','balanceDesc','balanceAsc','overdueDaysDesc','invoiceNumber','invoiceCountDesc','group'],description:'Detalle: dueDateAsc/balanceDesc/balanceAsc/overdueDaysDesc/invoiceNumber. Resumen: balanceDesc/balanceAsc/invoiceCountDesc/group.'},
    page:{type:'integer',minimum:1,maximum:1000000,default:1},rows:{type:'integer',minimum:1,maximum:100,default:20},
  },additionalProperties:false}},
}};
