import { resolveCustomer } from "../customers/customer.resolver.js";
import { resolveCategory } from "../categories/category.resolver.js";
import { getSales } from "../sales/sales.service.js";
import { getSalesPerSqm } from "../sales/salesPerSqm.service.js";
import { searchInvoiceConcepts } from "../invoices/searchInvoiceConcepts.service.js";
import { searchInvoiceCustomers } from "../invoices/searchInvoiceCustomers.service.js";
import { getInvoices } from "../invoices/invoices.service.js";
import { getContractConditions } from "../contracts/contractConditions.service.js";
import { getContractCostPerSqm } from "../contracts/contractCostPerSqm.service.js";
import { analyzeContractCostIncidence } from "../contracts/contractCostIncidence.service.js";
import { resolveMember } from "../members/member.resolver.js";
import { getMember, getMemberPurchases } from "../members/member.service.js";
import { resolvePromotion } from "../promotions/promotion.resolver.js";
import { getMemberPromoPurchases } from "../members/memberPromoPurchase.service.js";
import { withOracleProxySession } from "../sessions/oracleSession.service.js";

const withAuthorizedOracle = async (sessionId, callback) => {
  return withOracleProxySession(
    sessionId,
    async ({ connection, username }) => {
      try {
        return await callback({ connection, username });
      } catch (error) {
        if (Number(error?.errorNum) === 942) {
          throw new Error(
            "El usuario no tiene permisos para consultar esta información.",
          );
        }

        throw error;
      }
    },
  );
};

const toolHandlers = {
  search_customers: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => resolveCustomer(args.search, connection),
    );
  },

  search_categories: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => resolveCategory(args.search, connection),
    );
  },

  get_sales: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection, username }) =>
        getSales(args, connection, username),
    );
  },

  get_sales_per_sqm: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getSalesPerSqm(args, connection),
    );
  },

  search_invoice_concepts: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => searchInvoiceConcepts(args, connection),
    );
  },

  search_invoice_customers: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => searchInvoiceCustomers(args, connection),
    );
  },

  get_invoices: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getInvoices(args, connection),
    );
  },

  get_contract_conditions: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getContractConditions(args, connection),
    );
  },

  get_contract_cost_per_sqm: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getContractCostPerSqm(args, connection),
    );
  },

  analyze_contract_cost_incidence: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => analyzeContractCostIncidence(args, connection),
    );
  },

  search_members: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => resolveMember(args.search, connection),
    );
  },

  get_member: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getMember(args, connection),
    );
  },

  get_member_purchases: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getMemberPurchases(args, connection),
    );
  },

  search_promotions: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => resolvePromotion(args.search, connection),
    );
  },

  get_member_promo_purchases: async (args, context) => {
    return withAuthorizedOracle(
      context.sessionId,
      ({ connection }) => getMemberPromoPurchases(args, connection),
    );
  },
};

export const executeTool = async ({ name, arguments: args, context }) => {
  const handler = toolHandlers[name];

  if (!handler) {
    throw new Error(`Tool no implementada: ${name}`);
  }

  return handler(args, context);
};
