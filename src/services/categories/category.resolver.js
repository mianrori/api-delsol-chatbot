import { searchCategoriesRepository } from "../../repositories/categories/category.repository.js";

export const resolveCategory = async (search, connection) => {
  const categories = await searchCategoriesRepository(connection, search);

  if (!categories || categories.length === 0) {
    return {
      status: "NOT_FOUND",
      query: search,
      options: [],
    };
  }

  const totalMatches=Number(categories[0].TOTAL_MATCHES??categories.length);
  const exact=categories.filter(c=>c.EXACT_MATCH!=null?Number(c.EXACT_MATCH)===1:Number(c.SIMILARITY)===100);
  const exactCount=Number(categories[0].EXACT_MATCH_COUNT??exact.length);
  const candidates=exactCount>0?exact:categories;
  const relevantCount=exactCount||totalMatches;
  const metadata={totalMatches:relevantCount,returnedMatches:candidates.length,hasMore:relevantCount>candidates.length};
  if (relevantCount === 1 && candidates.length === 1) {
    return {
      status: "RESOLVED",
      ...metadata,
      category: {
        codRubro: String(candidates[0].COD_RUBRO),
        name: candidates[0].DESCRIPCION,
      },
    };
  }

  return {
    status: "AMBIGUOUS",
    ...metadata,
    query: search,
    options: candidates.map((category, index) => ({
      optionId: String(index + 1),
      codRubro: String(category.COD_RUBRO),
      name: category.DESCRIPCION,
    })),
  };
};
