import { resolveCustomer } from "../customers/customer.resolver.js";
import { resolveCategory } from "../categories/category.resolver.js";
import { getSales } from "../sales/sales.service.js";
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
};

export const executeTool = async ({ name, arguments: args, context }) => {
  const handler = toolHandlers[name];

  if (!handler) {
    throw new Error(`Tool no implementada: ${name}`);
  }

  return handler(args, context);
};
