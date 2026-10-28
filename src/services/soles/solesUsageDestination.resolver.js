import { searchSolesUsageDestinationsRepository } from "../../repositories/soles/solesUsageDestination.repository.js";


const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const mapDestination = (row, optionId) => ({
  optionId,
  destinationType: row.DESTINATION_TYPE ?? null,
  destinationCode: row.DESTINATION_CODE ?? null,
  name: row.DESTINATION_NAME ?? null,
});

export const searchSolesUsageDestinations = async (args = {}, connection) => {
  const search = String(args.search ?? "").trim();

  if (!search) {
    throw new Error("Debe indicar un destino para buscar.");
  }

  const rows = await searchSolesUsageDestinationsRepository({
    connection,
    search,
    limit: args.limit ?? 20,
  });

  if (rows.length === 0) {
    return {
      status: "NOT_FOUND",
      search,
      options: [],
    };
  }

  const totalMatches = Number(rows[0]?.TOTAL_MATCHES ?? rows.length);
  const hasMore = totalMatches > rows.length;
  const metadata = { totalMatches, returnedMatches: rows.length, hasMore };

  const exactMatches = rows.filter(
    (row) => normalize(row.DESTINATION_NAME) === normalize(search),
  );

  const candidates = !hasMore && exactMatches.length > 0 ? exactMatches : rows;

  if (candidates.length === 1 && !hasMore) {
    const destination = mapDestination(candidates[0], 1);

    return {
      status: "RESOLVED",
      ...metadata,
      search,
      ...destination,
    };
  }

  return {
    status: "AMBIGUOUS",
    ...metadata,
    search,
    options: candidates.map((row, index) => mapDestination(row, index + 1)),
  };
};
