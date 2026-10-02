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

  if (categories.length === 1 || Number(categories[0].SIMILARITY) === 100) {
    return {
      status: "RESOLVED",
      category: {
        codRubro: String(categories[0].COD_RUBRO),
        name: categories[0].DESCRIPCION,
      },
    };
  }

  return {
    status: "AMBIGUOUS",
    query: search,
    options: categories.map((category, index) => ({
      optionId: String(index + 1),
      codRubro: String(category.COD_RUBRO),
      name: category.DESCRIPCION,
    })),
  };
};
