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

export const resolvePromotion = async (search, connection, paging = {}) => {
  const result = await searchPromotionsRepository(connection, search, paging);
  const { items, ...pagination } = result;
  if (result.totalRows === 0) return { status: "NOT_FOUND", query: search, ...pagination, options: [] };
  // A page containing one row is not a unique match when other pages exist.
  if (result.totalRows === 1) {
    return items.length === 1
      ? { status: "RESOLVED", query: search, ...pagination, promotion: mapPromotion(items[0]) }
      : { status: "AMBIGUOUS", query: search, ...pagination, options: [] };
  }
  return {
    status: "AMBIGUOUS", query: search, ...pagination,
    options: items.map((item, index) => ({
      optionId: String((result.page - 1) * result.rows + index + 1),
      ...mapPromotion(item),
    })),
  };
};
