import { getMemberPromoPurchasesRepository } from "../../repositories/members/memberPromoPurchase.repository.js";

export const getMemberPromoPurchases = async (args, connection) => {
  return getMemberPromoPurchasesRepository({
    connection,
    ...args,
  });
};
