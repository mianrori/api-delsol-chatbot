import { searchCustomersTool } from "./customers/searchCustomers.tool.js";
import { searchCategoriesTool } from "./categories/searchCategories.tool.js";
import { getSalesTool } from "./sales/getSales.tool.js";

export const tools = [
  searchCustomersTool,
  searchCategoriesTool,
  getSalesTool,
];
