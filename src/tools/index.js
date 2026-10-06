import { searchCustomersTool } from "./customers/searchCustomers.tool.js";
import { searchCategoriesTool } from "./categories/searchCategories.tool.js";
import { getSalesTool } from "./sales/getSales.tool.js";
import { getSalesPerSqmTool } from "./sales/getSalesPerSqm.tool.js";
import { searchInvoiceConceptsTool } from "./invoices/searchInvoiceConcepts.tool.js";
import { searchInvoiceCustomersTool } from "./invoices/searchInvoiceCustomers.tool.js";
import { getInvoicesTool } from "./invoices/getInvoices.tool.js";
import { getContractConditionsTool } from "./contracts/getContractConditions.tool.js";
import { getContractCostPerSqmTool } from "./contracts/getContractCostPerSqm.tool.js";

export const tools = [
  searchCustomersTool,
  searchCategoriesTool,
  getSalesTool,
  getSalesPerSqmTool,
  searchInvoiceConceptsTool,
  searchInvoiceCustomersTool,
  getInvoicesTool,
  getContractConditionsTool,
  getContractCostPerSqmTool,
];
