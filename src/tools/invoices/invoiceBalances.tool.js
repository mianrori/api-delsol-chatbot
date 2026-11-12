const textList=description=>({type:'array',maxItems:100,items:{type:'string',minLength:1,maxLength:120},description});
const date=description=>({type:'string',pattern:'^\\d{2}/\\d{2}/\\d{4}$',description});
export const searchInvoiceBalanceCustomersTool={toolSpec:{
  name:'search_invoice_balance_customers',
  description:'Resuelve un cliente/local por nombre, razón social, RUC o código exclusivamente entre los saldos de facturas visibles para el usuario. No utiliza catálogos de ventas o facturas emitidas. Si devuelve AMBIGUOUS o hasMore espera elección o pide precisar; no elijas el primer cliente. Sin coincidencias no implica falta de permisos.',
  inputSchema:{json:{type:'object',properties:{query:{type:'string',minLength:1,maxLength:120}},required:['query'],additionalProperties:false}},
}};
export const getInvoiceBalancesTool={toolSpec:{
  name:'get_invoice_balances',
  description:'Consulta el saldo ACTUAL registrado de facturas por cliente/local, factura, sector, moneda y vencimiento: detalle, deuda vencida/por vencer, antigüedad, rankings, conteos y resúmenes. Usa IDs resueltos con search_invoice_balance_customers. No consulta pagos, emisión, conceptos, matrícula, PDF ni reconstruye saldos históricos. asOfDate solo clasifica vencimientos del saldo actual. Los saldos conservan signo; no sumes monedas diferentes. Paginación en detalle y resumen; totalsByCurrency abarca todo el filtro, no solo la página. matchedCustomers y matchedInvoices cuentan clientes y facturas identificados distintos de todo el filtro, sin sumar conteos por moneda. Rankings ordenados dentro de cada moneda; filtra currencies para un top de una moneda. Fechas vacías/inválidas quedan como undated y saldos NULL como desconocidos, no cero.',
  inputSchema:{json:{type:'object',properties:{
    customerIds:textList('IDs de clientes resueltos por el buscador de saldos. [] consulta todos los clientes visibles.'),
    invoiceNumbers:textList('Números exactos de factura (o sus tokens PII); sin coincidencia parcial ni comodines.'),
    sectors:textList('Sectores exactos presentes en resultados. Para descubrir sectores usa summary y groupBy=["sector"].'),
    currencies:textList('Símbolos exactos registrados. No convierte moneda; descubre las monedas con summary sin agrupación.'),
    dueDateFrom:date('Vencimiento mínimo inclusivo, DD/MM/YYYY; no es fecha de emisión.'),dueDateTo:date('Vencimiento máximo inclusivo DD/MM/YYYY.'),
    asOfDate:date('Fecha para clasificar vencimiento/antigüedad. Por defecto hoy en Paraguay. NO reconstruye el saldo a esta fecha.'),
    dueStatus:{type:'string',enum:['all','overdue','dueToday','upcoming','undated'],description:'Vencida: vencimiento anterior a la referencia; dueToday hoy; upcoming posterior; undated fecha vacía/inválida.'},
    balanceStatus:{type:'string',enum:['all','positive','zero','negative','nonZero','unknown'],description:'Por defecto all. Para deuda usa positive; para saldos a favor negative. Nunca conviertas saldo desconocido a cero ni infieras pagos.'},
    minBalance:{type:'number'},maxBalance:{type:'number'},
    minDaysOverdue:{type:'integer',minimum:0},maxDaysOverdue:{type:'integer',minimum:0},
    mode:{type:'string',enum:['detail','summary'],default:'detail'},
    groupBy:{type:'array',items:{type:'string',enum:['customer','invoice','sector','dueMonth','dueStatus','agingBand']},description:'Solo summary. Moneda siempre separada. agingBand: notDue, dueToday, 1-30, 31-60, 61-90, 91-180, 181+, undated. dueMonth clasifica vencimientos, no evolución histórica de saldos.'},
    orderBy:{type:'string',enum:['dueDateAsc','balanceDesc','balanceAsc','overdueDaysDesc','invoiceNumber','invoiceCountDesc','group'],description:'Detalle: dueDateAsc/balanceDesc/balanceAsc/overdueDaysDesc/invoiceNumber. Resumen: balanceDesc/balanceAsc/invoiceCountDesc/group.'},
    page:{type:'integer',minimum:1,maximum:1000000,default:1},rows:{type:'integer',minimum:1,maximum:100,default:20},
  },additionalProperties:false}},
}};
