import {
  searchSolesTypesRepository,
  getAllSolesTypesRepository,
} from "../../repositories/soles/solesTypes.repository.js";

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const GENERIC_WORDS = new Set(["SOL", "SOLES"]);

/*
 * Alias comerciales.
 *
 * Importante:
 * el alias apunta a una DESCRIPCION canónica,
 * nunca a un ID.
 *
 * El ID siempre se obtiene desde Oracle.
 */
const TYPE_ALIASES = {
  SOLES: [
    "NORMAL",
    "NORMALES",
    "SHOPPING",
    "SOL SHOPPING",
    "SOLES SHOPPING",
    "SOL NORMAL",
    "SOLES NORMALES",
  ],

  "SOLES OBSEQUIO": ["OBSEQUIO", "OBSEQUIOS", "SOL OBSEQUIO", "SOL OBSEQUIOS"],

  "SOLES RECOMPENSA": [
    "RECOMPENSA",
    "RECOMPENSAS",
    "SOL RECOMPENSA",
    "SOL RECOMPENSAS",
  ],

  "SOLES ATLAS": ["ATLAS", "SOL ATLAS"],
};

const removeGenericWords = (value) => {
  return normalizeText(value)
    .split(" ")
    .filter((word) => !GENERIC_WORDS.has(word))
    .join(" ")
    .trim();
};

const resolveAlias = (query) => {
  const normalizedQuery = normalizeText(query);

  for (const [canonicalDescription, aliases] of Object.entries(TYPE_ALIASES)) {
    if (normalizeText(canonicalDescription) === normalizedQuery) {
      return canonicalDescription;
    }

    const aliasFound = aliases.some(
      (alias) => normalizeText(alias) === normalizedQuery,
    );

    if (aliasFound) {
      return canonicalDescription;
    }
  }

  return null;
};

const levenshteinDistance = (source, target) => {
  const a = normalizeText(source);
  const b = normalizeText(target);

  const matrix = Array.from({ length: b.length + 1 }, () =>
    Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= b.length; i++) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
};

const calculateSimilarity = (a, b) => {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  const maxLength = Math.max(normalizedA.length, normalizedB.length);

  if (maxLength === 0) {
    return 1;
  }

  const distance = levenshteinDistance(normalizedA, normalizedB);

  return 1 - distance / maxLength;
};

const calculateTypeSimilarity = ({ query, description }) => {
  const fullSimilarity = calculateSimilarity(query, description);

  const reducedQuery = removeGenericWords(query);

  const reducedDescription = removeGenericWords(description);

  const reducedSimilarity =
    reducedQuery && reducedDescription
      ? calculateSimilarity(reducedQuery, reducedDescription)
      : 0;

  return Math.max(fullSimilarity, reducedSimilarity);
};

const findFuzzyMatches = ({ query, types, minSimilarity = 0.65 }) => {
  return types
    .map((item) => ({
      ...item,

      similarity: calculateTypeSimilarity({
        query,
        description: item.description,
      }),
    }))

    .filter((item) => item.similarity >= minSimilarity)

    .sort((a, b) => b.similarity - a.similarity);
};

const buildResolvedResponse = ({ query, item }) => ({
  status: "RESOLVED",

  query,

  typeId: item.typeId,

  description: item.description,
});

const buildAmbiguousResponse = ({ query, items }) => ({
  status: "AMBIGUOUS",

  query,

  options: items.map((item, index) => ({
    option: index + 1,

    typeId: item.typeId,

    description: item.description,
  })),
});

export const searchSolesTypes = async ({ query }, connection) => {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return {
      status: "NOT_FOUND",

      query,

      options: [],
    };
  }

  /*
   * 1. Alias comercial.
   *
   * "Soles normales"
   * "Soles Shopping"
   *
   * pasan a buscar:
   *
   * "SOLES"
   */
  const alias = resolveAlias(query);

  const queryToSearch = alias ?? query;

  /*
   * 2. Coincidencia directa en Oracle.
   */
  const directResults = await searchSolesTypesRepository({
    connection,

    query: queryToSearch,

    limit: 10,
  });

  /*
   * Si utilizamos un alias canónico,
   * preferimos coincidencia EXACTA con la
   * descripción canónica.
   *
   * Esto evita que buscar "SOLES" resuelva
   * ambiguamente:
   *
   * SOLES
   * SOLES ATLAS
   * SOLES OBSEQUIO
   * etc.
   */
  if (alias) {
    const exactAliasMatch = directResults.find(
      (item) => normalizeText(item.description) === normalizeText(alias),
    );

    if (exactAliasMatch) {
      return buildResolvedResponse({
        query,

        item: exactAliasMatch,
      });
    }
  }

  /*
   * Si la consulta original coincide
   * exactamente con una descripción,
   * resolvemos esa opción aunque el LIKE
   * también haya retornado otros tipos.
   */
  const exactMatch = directResults.find(
    (item) => normalizeText(item.description) === normalizedQuery,
  );

  if (exactMatch) {
    return buildResolvedResponse({
      query,

      item: exactMatch,
    });
  }

  if (directResults.length === 1) {
    return buildResolvedResponse({
      query,

      item: directResults[0],
    });
  }

  /*
   * Si hubo varias coincidencias directas,
   * son opciones reales del catálogo.
   */
  if (directResults.length > 1) {
    return buildAmbiguousResponse({
      query,

      items: directResults,
    });
  }

  /*
   * 3. Fuzzy matching.
   *
   * Solamente se ejecuta cuando Oracle
   * no encontró coincidencias directas.
   */
  const allTypes = await getAllSolesTypesRepository({
    connection,
  });

  const fuzzyMatches = findFuzzyMatches({
    query,

    types: allTypes,

    minSimilarity: 0.65,
  });

  if (fuzzyMatches.length === 0) {
    return {
      status: "NOT_FOUND",

      query,

      options: [],
    };
  }

  const bestMatch = fuzzyMatches[0];

  const secondMatch = fuzzyMatches[1] ?? null;

  /*
   * Solo resolvemos automáticamente cuando
   * existe suficiente confianza y separación
   * respecto a la segunda opción.
   */
  const canAutoResolve =
    bestMatch.similarity >= 0.8 &&
    (!secondMatch || bestMatch.similarity - secondMatch.similarity >= 0.1);

  if (canAutoResolve) {
    return buildResolvedResponse({
      query,

      item: bestMatch,
    });
  }

  return buildAmbiguousResponse({
    query,

    items: fuzzyMatches,
  });
};
