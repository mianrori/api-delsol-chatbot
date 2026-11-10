// Keep the original protected runner name without replaying the retired LIKE controls.
if(!process.env.INVOICE_DIAGNOSTIC_DOCKER&&process.env.INVOICE_PDF_DOCKER)process.env.INVOICE_DIAGNOSTIC_DOCKER=process.env.INVOICE_PDF_DOCKER;
await import('./run-invoice-pdf-diagnostic-login.mjs');
