import { searchPromotionsRepository } from "../../repositories/promotions/promotion.repository.js";

const mapPromotion = (item) => ({
  promotionId: String(item.COD_PROMOCION),

  promotionName: item.NOMBRE_PROMOCION,

  campaignId: Number(item.COD_CAMPANIA),

  campaignName: item.NOMBRE_CAMPANIA,

  dateFrom: item.FECHA_DESDE ?? null,

  dateTo: item.FECHA_HASTA ?? null,

  similarity: Number(item.SIMILARITY ?? 0),
});

export const resolvePromotion = async (search, connection) => {
  const results = await searchPromotionsRepository(connection, search);

  if (!Array.isArray(results) || results.length === 0) {
    return {
      status: "NOT_FOUND",
      query: search,
      options: [],
    };
  }

  if (results.length === 1) {
    return {
      status: "RESOLVED",
      promotion: mapPromotion(results[0]),
    };
  }

  const first = results[0];

  const second = results[1];

  const scoreDifference =
    Number(first.SIMILARITY ?? 0) - Number(second.SIMILARITY ?? 0);

  if (
    first.MATCH_PRIORITY === 2 &&
    Number(first.SIMILARITY ?? 0) >= 92 &&
    scoreDifference >= 12
  ) {
    return {
      status: "RESOLVED",
      promotion: mapPromotion(first),
    };
  }

  return {
    status: "AMBIGUOUS",

    query: search,

    options: results.map((item, index) => ({
      optionId: String(index + 1),

      promotionId: String(item.COD_PROMOCION),

      promotionName: item.NOMBRE_PROMOCION,

      campaignId: Number(item.COD_CAMPANIA),

      campaignName: item.NOMBRE_CAMPANIA,

      dateFrom: item.FECHA_DESDE ?? null,

      dateTo: item.FECHA_HASTA ?? null,
    })),
  };
};
