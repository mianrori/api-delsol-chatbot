const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const defaultSalesMetrics=['totalAmount','totalInvoices'];

export function getSalesMetricIntent(message){
 const text=normalize(message);
 if(/\b(?:ambas (?:las )?metricas|las dos metricas|no (?:(?:muestres|mostrar|quiero) )?(?:solo|solamente|unicamente))\b/.test(text))return [...defaultSalesMetrics];
 const amount='(?:importe|monto|ventas totales)(?: total)?',invoices='(?:(?:cantidad|numero) de )?facturas';
 if(new RegExp(`\\b${amount}\\s+(?:y|e)\\s+(?:la )?${invoices}\\b|\\b${invoices}\\s+y\\s+(?:el )?${amount}\\b`).test(text))return [...defaultSalesMetrics];
 const only='\\b(?:solo|solamente|unicamente) (?:mostrar |muestra |el |la |las )?';
 if(new RegExp(only+amount+'\\b').test(text)||new RegExp('\\bsin (?:la |las )?'+invoices+'\\b').test(text))return ['totalAmount'];
 if(new RegExp(only+invoices+'\\b').test(text)||new RegExp('\\bsin (?:el )?'+amount+'\\b').test(text))return ['totalInvoices'];
 return null;
}

// Apply after identity/filter guards. This policy changes only the metrics key.
export const applySalesMetrics=(input,metrics=defaultSalesMetrics)=>({...input,metrics:[...metrics]});
