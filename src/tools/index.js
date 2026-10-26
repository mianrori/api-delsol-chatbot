import { searchCustomersTool } from "./customers/searchCustomers.tool.js";
import { searchCategoriesTool } from "./categories/searchCategories.tool.js";
import { getSalesTool } from "./sales/getSales.tool.js";
import { getSalesPerSqmTool } from "./sales/getSalesPerSqm.tool.js";
import { searchInvoiceConceptsTool } from "./invoices/searchInvoiceConcepts.tool.js";
import { searchInvoiceCustomersTool } from "./invoices/searchInvoiceCustomers.tool.js";
import { getInvoicesTool } from "./invoices/getInvoices.tool.js";
import { getContractConditionsTool } from "./contracts/getContractConditions.tool.js";
import { getContractCostPerSqmTool } from "./contracts/getContractCostPerSqm.tool.js";
import { analyzeContractCostIncidenceTool } from "./contracts/analyzeContractCostIncidence.tool.js";
import { searchMembersTool } from "./members/searchMembers.tool.js";
import { getMemberTool } from "./members/getMember.tool.js";
import { getMemberPurchasesTool } from "./members/getMemberPurchases.tool.js";
import { searchPromotionsTool } from "./promotions/searchPromotions.tool.js";
import { getMemberPromoPurchasesTool } from "./members/getMemberPromoPurchases.tool.js";
import { getMemberVehiclesTool } from "./members/getMemberVehicles.tool.js";
import { analyzeMembersTool } from "./members/analyzeMembers.tool.js";

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
  analyzeContractCostIncidenceTool,
  searchMembersTool,
  getMemberTool,
  getMemberPurchasesTool,
  searchPromotionsTool,
  getMemberPromoPurchasesTool,
  getMemberVehiclesTool,
  analyzeMembersTool,
];
