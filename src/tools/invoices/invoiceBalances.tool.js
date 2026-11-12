const textList=description=>({type:'array',maxItems:100,items:{type:'string',minLength:1,maxLength:120},description});
const date=description=>({type:'string',pattern:'^\\d{2}/\\d{2}/\\d{4}$',description});
export const searchInvoiceBalanceCustomersTool={toolSpec:{
  name:'search_invoice_balance_customers',
  description:'Resuelve un cliente/local por nombre, razón social, RUC o código exclusivamente entre los saldos de facturas visibles para el usuario. No utiliza catálogos de ventas o facturas emitidas. Si devuelve AMBIGUOUS o hasMore espera elección o pide precisar; no elijas el primer cliente. Sin coincidencias no implica falta de permisos.',
  inputSchema:{json:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:120}},required:['query'],additionalProperties:false}},
}};
export const getInvoiceBalancesTool={toolSpec:{
  name:'get_invoice_balances',
  description:'Consulta registros individuales de saldo actual de la vista autorizada: clientes, n?meros de factura, sectores, s?mbolos, vencimientos y signo del importe. Un n?mero puede repetirse entre clientes/sectores/s?mbolos; filas no equivalen a facturas. La vista no expone clave de divisa ni factura: summary, sumas, rangos monetarios y orden monetario devuelven REQUIRES_SOURCE_IDENTITY, sin agregar valores. El s?mbolo es una etiqueta, no identifica una divisa. Cero no prueba pago y negativo no prueba cr?dito. SALDO se conserva como texto decimal exacto, sin convertir importes. asOfDate solo clasifica vencimientos, no reconstruye historia. Usa search_invoice_balance_customers para resolver clientes; detalle paginado. Sin PDF, emisi?n, cobros, conceptos ni matr?cula.',
  inputSchema:{json:{type:'object',properties:{
    customerIds:textList('IDs de clientes resueltos por el buscador de saldos. [] consulta todos los clientes visibles.'),
    invoiceNumbers:textList('Números exactos de factura (o sus tokens PII); sin coincidencia parcial ni comodines.'),
    sectors:textList('Sectores exactos presentes en resultados. Para descubrir sectores usa summary y groupBy=["sector"].'),
    currencies:textList('Símbolos exactos registrados. No convierte moneda; descubre las monedas con summary sin agrupación.'),
    dueDateFrom:date('Vencimiento mínimo inclusivo, DD/MM/YYYY; no es fecha de emisión.'),dueDateTo:date('Vencimiento máximo inclusivo DD/MM/YYYY.'),
    asOfDate:date('Fecha para clasificar vencimiento/antigüedad. Por defecto hoy en Paraguay. NO reconstruye el saldo a esta fecha.'),
    dueStatus:{type:'string',enum:['all','overdue','dueToday','upcoming','undated'],description:'Vencida: vencimiento anterior a la referencia; dueToday hoy; upcoming posterior; undated fecha vacía/inválida.'},
    balanceStatus:{type:'string',enum:['all','positive','zero','negative','nonZero','unknown'],description:'Signo numérico registrado; por defecto all. Cero no prueba pago; negativo no prueba crédito o devolución sin definición contable. Null es desconocido.'},
    minBalance:{type:'number'},maxBalance:{type:'number'},
    minDaysOverdue:{type:'integer',minimum:0},maxDaysOverdue:{type:'integer',minimum:0},
    mode:{type:'string',enum:['detail','summary'],default:'detail'},
    groupBy:{type:'array',items:{type:'string',enum:['customer','invoice','sector','dueMonth','dueStatus','agingBand']},description:'Solo summary. Moneda siempre separada. agingBand: notDue, dueToday, 1-30, 31-60, 61-90, 91-180, 181+, undated. dueMonth clasifica vencimientos, no evolución histórica de saldos.'},
    orderBy:{type:'string',enum:['dueDateAsc','balanceDesc','balanceAsc','overdueDaysDesc','invoiceNumber','invoiceCountDesc','group'],description:'Detalle: dueDateAsc/balanceDesc/balanceAsc/overdueDaysDesc/invoiceNumber. Resumen: balanceDesc/balanceAsc/invoiceCountDesc/group.'},
    page:{type:'integer',minimum:1,maximum:1000000,default:1},rows:{type:'integer',minimum:1,maximum:100,default:20},
  },additionalProperties:false}},
}};
