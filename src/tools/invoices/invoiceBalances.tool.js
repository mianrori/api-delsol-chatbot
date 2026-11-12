const textList=description=>({type:'array',maxItems:100,items:{type:'string',minLength:1,maxLength:120},description});
const date=description=>({type:'string',pattern:'^\\d{2}/\\d{2}/\\d{4}$',description});
export const searchInvoiceBalanceCustomersTool={toolSpec:{
  name:'search_invoice_balance_customers',
  description:'Resuelve un cliente/local por nombre, razón social, RUC o código exclusivamente entre los saldos de facturas visibles para el usuario. No utiliza catálogos de ventas o facturas emitidas. Si devuelve AMBIGUOUS o hasMore espera elección o pide precisar; no elijas el primer cliente. Sin coincidencias no implica falta de permisos.',
  inputSchema:{json:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:120}},required:['query'],additionalProperties:false}},
}};
export const getInvoiceBalancesTool={toolSpec:{
  name:'get_invoice_balances',
  description:'Consulta DEUDA por serie y número de factura, sin confundirlos con una clave única: serie/número todavía se repite en Oracle. Por defecto pendientes (DEUDA>0); canceladas (DEUDA=0) solo a pedido; todas incluye no negativas y desconocidas. Negativos siempre excluidos. Nulos nunca son cero ni cancelados. Identifica divisas por COD_MONEDA, sin conversiones. Summary y rankings solo se calculan si el perfil del alcance no tiene identidades serie/numero repetidas, faltantes, deuda nula ni moneda faltante. Si hay INCONSISTENT_HISTORY informa registros historicos inconsistentes y no calcules ni dedupliques. Orden de registros monetarios requiere un único currencyCodes. Importe decimal exacto; asOfDate clasifica vencimiento actual, no reconstruye historia. Sin PDF, emisión, cobros, conceptos ni matrícula.',
  inputSchema:{json:{type:'object',properties:{
    customerIds:textList('IDs de clientes resueltos por el buscador de saldos. [] consulta todos los clientes visibles.'),
    invoiceSeries:textList('Series exactas de factura o tokens PII. Para identificar facturas concretas usa los pares de invoices.'),
    invoices:{type:'array',maxItems:100,items:{type:'object',properties:{invoiceSeries:{type:'string',minLength:1,maxLength:120},invoiceNumber:{type:'string',minLength:1,maxLength:120}},required:['invoiceSeries','invoiceNumber'],additionalProperties:false},description:'Pares exactos serie/número. No se cruzan series de una factura con números de otra; no prueba unicidad de filas.'},
    invoiceNumbers:textList('Números exactos de factura (o sus tokens PII); sin coincidencia parcial ni comodines.'),
    sectors:textList('Sectores exactos presentes en registros devueltos; no inventes valores.'),
    currencies:textList('Filtra etiquetas de símbolo exactas de registros devueltos. No son claves de divisa ni habilitan sumas/conversión.'),
    currencyCodes:textList('COD_MONEDA exactos retornados, clave de divisa. Orden y rangos de importes requieren un único código; no habilita sumas hasta confirmar la granularidad aditiva.'),
    dueDateFrom:date('Vencimiento mínimo inclusivo, DD/MM/YYYY; no es fecha de emisión.'),dueDateTo:date('Vencimiento máximo inclusivo DD/MM/YYYY.'),
    asOfDate:date('Fecha para clasificar vencimiento/antigüedad. Por defecto hoy en Paraguay. NO reconstruye el saldo a esta fecha.'),
    dueStatus:{type:'string',enum:['all','overdue','dueToday','upcoming','undated'],description:'Vencida: vencimiento anterior a la referencia; dueToday hoy; upcoming posterior; undated fecha vacía/inválida.'},
    debtStatus:{type:'string',enum:['pending','settled','all','unknown'],default:'pending',description:'pending: DEUDA>0; settled: DEUDA=0 (cancelada); all: DEUDA>=0 o null; unknown: null. DEUDA<0 siempre excluida. Null no equivale a cancelada.'},
    minDebt:{type:'number'},maxDebt:{type:'number'},
    minDaysOverdue:{type:'integer',minimum:0},maxDaysOverdue:{type:'integer',minimum:0},
    mode:{type:'string',enum:['detail','summary'],default:'detail',description:'detail disponible; summary devuelve limitación REQUIRES_SOURCE_IDENTITY hasta disponer de claves verificadas.'},
    groupBy:{type:'array',items:{type:'string',enum:['customer','invoice','sector','dueMonth','dueStatus','agingBand']},description:'Reservado para summary, actualmente bloqueado por identificación insuficiente; no agrega importes por símbolo.'},
    orderBy:{type:'string',enum:['dueDateAsc','debtDesc','debtAsc','overdueDaysDesc','invoiceNumber','invoiceCountDesc','group'],description:'Detalle: dueDateAsc/debtDesc/debtAsc/overdueDaysDesc/invoiceNumber. Resumen: debtDesc/debtAsc/invoiceCountDesc/group.'},
    page:{type:'integer',minimum:1,maximum:1000000,default:1},rows:{type:'integer',minimum:1,maximum:100,default:20},
  },additionalProperties:false}},
}};
