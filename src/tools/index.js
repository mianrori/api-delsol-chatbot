import { searchCustomersTool } from "./customers/searchCustomers.tool.js";
import { searchCategoriesTool } from "./categories/searchCategories.tool.js";
import { getSalesTool } from "./sales/getSales.tool.js";
import { searchInvoiceConceptsTool } from "./invoices/searchInvoiceConcepts.tool.js";
import { searchInvoiceCustomersTool } from "./invoices/searchInvoiceCustomers.tool.js";
import { getInvoicesTool } from "./invoices/getInvoices.tool.js";

export const tools = [
  searchCustomersTool,
  searchCategoriesTool,
  getSalesTool,
  searchInvoiceConceptsTool,
  searchInvoiceCustomersTool,
  getInvoicesTool,
];
