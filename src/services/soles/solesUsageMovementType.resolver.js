import { searchSolesUsageMovementTypesRepository } from "../../repositories/soles/solesUsageMovementType.repository.js";


const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export const searchSolesUsageMovementTypes = async (args = {}, connection) => {
  const search = String(args.search ?? "").trim();

  const rows = await searchSolesUsageMovementTypesRepository({
    connection,
    search,
    limit: args.limit ?? 20,
  });

  if (rows.length === 0) {
    return {
      status: "NOT_FOUND",
      totalMatches: 0, returnedMatches: 0, hasMore: false,
      search,
      options: [],
    };
  }

  const totalMatches = Number(rows[0]?.TOTAL_MATCHES ?? rows.length);
  const hasMore = totalMatches > rows.length;
  const metadata = { totalMatches, returnedMatches: rows.length, hasMore };

  const exactMatches = rows.filter(
    (row) => normalize(row.MOVEMENT_TYPE) === normalize(search),
  );

  const candidates = !hasMore && exactMatches.length > 0 ? exactMatches : rows;

  if (search && candidates.length === 1 && !hasMore) {
    return {
      status: "RESOLVED",
      ...metadata,
      search,
      movementType: candidates[0].MOVEMENT_TYPE,
    };
  }

  return {
    status: search ? "AMBIGUOUS" : "LISTED",
    ...metadata,
    search,
    options: candidates.map((row, index) => ({
      optionId: index + 1,
      movementType: row.MOVEMENT_TYPE,
    })),
  };
};
