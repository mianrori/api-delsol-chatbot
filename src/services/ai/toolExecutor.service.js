import { getSales } from "../sales/sales.service.js";
import { withOracleProxySession } from "../sessions/oracleSession.service.js";

const toolHandlers = {
  get_sales: async (args, context) => {
    return withOracleProxySession(
      context.sessionId,
      async ({ connection }) => {
        try {
          return await getSales(args, connection);
        } catch (error) {
          if (Number(error?.errorNum) === 942) {
            throw new Error(
              "El usuario no tiene permisos para consultar información de ventas.",
            );
          }

          throw error;
        }
      },
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
