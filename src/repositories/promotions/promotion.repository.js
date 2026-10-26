import { executeOracleQuery } from "../../database/oracle-query.database.js";
import config from "../../../config.js";

const normalizeText = (value = "") => {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenize = (value) => {
  return normalizeText(value).split(" ").filter(Boolean);
};

const levenshteinDistance = (a, b) => {
  const matrix = Array.from(
    {
      length: b.length + 1,
    },
    () => Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
};

const calculateTokenSimilarity = (a, b) => {
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 100;
  }

  const distance = levenshteinDistance(a, b);

  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) {
    return 0;
  }

  return Math.round((1 - distance / maxLength) * 100);
};

const calculateTextSimilarity = (promotionName, campaignName, search) => {
  const candidateTokens = tokenize(
    [promotionName, campaignName].filter(Boolean).join(" "),
  );

  const searchTokens = tokenize(search);

  if (candidateTokens.length === 0 || searchTokens.length === 0) {
    return {
      similarity: 0,
      minTokenSimilarity: 0,
      tokenScores: [],
    };
  }

  const tokenScores = searchTokens.map((searchToken) => {
    let bestScore = 0;
    let bestToken = null;

    for (const candidateToken of candidateTokens) {
      const score = calculateTokenSimilarity(searchToken, candidateToken);

      if (score > bestScore) {
        bestScore = score;
        bestToken = candidateToken;
      }
    }

    return {
      searchToken,
      matchedToken: bestToken,
      similarity: bestScore,
    };
  });

  const scores = tokenScores.map((item) => item.similarity);

  const average =
    scores.reduce((total, value) => total + value, 0) / scores.length;

  const minimum = Math.min(...scores);

  const similarity = Math.round(average * 0.75 + minimum * 0.25);

  return {
    similarity,
    minTokenSimilarity: minimum,
    tokenScores,
  };
};

export const searchPromotionsRepository = async (connection, search) => {
  const normalizedSearch = normalizeText(search);

  if (!normalizedSearch) {
    return [];
  }

  const exactSql = `
      SELECT
        COD_PROMOCION,
        NOMBRE_PROMOCION,
        COD_CAMPANIA,
        NOMBRE_CAMPANIA,

        TO_CHAR(
          FECHA_DESDE,
          'DD/MM/YYYY'
        ) AS FECHA_DESDE,

        TO_CHAR(
          FECHA_HASTA,
          'DD/MM/YYYY'
        ) AS FECHA_HASTA

      FROM
        VW_BOT_PROMOCIONES

      WHERE
           UPPER(TRIM(COD_PROMOCION)) =
           UPPER(TRIM(:search))

        OR TO_CHAR(COD_CAMPANIA) =
           TRIM(:search)

        OR UPPER(
             TRIM(
               REGEXP_REPLACE(
                 TRANSLATE(
                   NVL(
                     NOMBRE_PROMOCION,
                     ''
                   ),
                   'ÁÉÍÓÚÜÑáéíóúüñ',
                   'AEIOUUNAEIOUUN'
                 ),
                 '[^A-Za-z0-9]+',
                 ' '
               )
             )
           ) =
           UPPER(
             TRIM(
               REGEXP_REPLACE(
                 TRANSLATE(
                   :search,
                   'ÁÉÍÓÚÜÑáéíóúüñ',
                   'AEIOUUNAEIOUUN'
                 ),
                 '[^A-Za-z0-9]+',
                 ' '
               )
             )
           )

        OR UPPER(
             TRIM(
               REGEXP_REPLACE(
                 TRANSLATE(
                   NVL(
                     NOMBRE_CAMPANIA,
                     ''
                   ),
                   'ÁÉÍÓÚÜÑáéíóúüñ',
                   'AEIOUUNAEIOUUN'
                 ),
                 '[^A-Za-z0-9]+',
                 ' '
               )
             )
           ) =
           UPPER(
             TRIM(
               REGEXP_REPLACE(
                 TRANSLATE(
                   :search,
                   'ÁÉÍÓÚÜÑáéíóúüñ',
                   'AEIOUUNAEIOUUN'
                 ),
                 '[^A-Za-z0-9]+',
                 ' '
               )
             )
           )

      ORDER BY
        FECHA_DESDE DESC,
        NOMBRE_PROMOCION,
        NOMBRE_CAMPANIA
    `;

  const exactResult = await executeOracleQuery(connection, exactSql, {
    search,
  });

  const exactMatches = Array.isArray(exactResult) ? exactResult : [];

  if (exactMatches.length > 0) {
    return exactMatches
      .slice(0, Number(config.limitFilter ?? 10))
      .map((item) => ({
        ...item,
        MATCH_PRIORITY: 1,
        SIMILARITY: 100,
        MIN_TOKEN_SIMILARITY: 100,
        TOKEN_SCORES: [],
      }));
  }

  const searchTokens = tokenize(search);

  if (searchTokens.length === 0) {
    return [];
  }

  const binds = {};

  const tokenFilters = searchTokens.map((token, index) => {
    const bindName = `token${index}`;

    binds[bindName] = token.length > 4 ? token.substring(0, 4) : token;

    return `
            (
              NORMALIZED_PROMOTION
              LIKE '%' || :${bindName} || '%'

              OR

              NORMALIZED_CAMPAIGN
              LIKE '%' || :${bindName} || '%'
            )
          `;
  });

  binds.candidateLimit = Math.max(Number(config.limitFilter ?? 10) * 50, 500);

  const candidateSql = `
      SELECT
        COD_PROMOCION,
        NOMBRE_PROMOCION,
        COD_CAMPANIA,
        NOMBRE_CAMPANIA,
        FECHA_DESDE,
        FECHA_HASTA

      FROM (
        SELECT
          COD_PROMOCION,
          NOMBRE_PROMOCION,
          COD_CAMPANIA,
          NOMBRE_CAMPANIA,

          TO_CHAR(
            FECHA_DESDE,
            'DD/MM/YYYY'
          ) AS FECHA_DESDE,

          TO_CHAR(
            FECHA_HASTA,
            'DD/MM/YYYY'
          ) AS FECHA_HASTA,

          UPPER(
            TRIM(
              REGEXP_REPLACE(
                TRANSLATE(
                  NVL(
                    NOMBRE_PROMOCION,
                    ''
                  ),
                  'ÁÉÍÓÚÜÑáéíóúüñ',
                  'AEIOUUNAEIOUUN'
                ),
                '[^A-Za-z0-9]+',
                ' '
              )
            )
          ) AS NORMALIZED_PROMOTION,

          UPPER(
            TRIM(
              REGEXP_REPLACE(
                TRANSLATE(
                  NVL(
                    NOMBRE_CAMPANIA,
                    ''
                  ),
                  'ÁÉÍÓÚÜÑáéíóúüñ',
                  'AEIOUUNAEIOUUN'
                ),
                '[^A-Za-z0-9]+',
                ' '
              )
            )
          ) AS NORMALIZED_CAMPAIGN

        FROM
          VW_BOT_PROMOCIONES
      )

      WHERE (
        ${tokenFilters.join("\n OR ")}
      )

      AND ROWNUM <= :candidateLimit
    `;

  const candidateResult = await executeOracleQuery(connection, candidateSql, binds);

  const candidates = Array.isArray(candidateResult) ? candidateResult : [];

  const ranked = candidates
    .map((item) => {
      const score = calculateTextSimilarity(
        item.NOMBRE_PROMOCION,
        item.NOMBRE_CAMPANIA,
        search,
      );

      return {
        ...item,
        MATCH_PRIORITY: 2,
        SIMILARITY: score.similarity,
        MIN_TOKEN_SIMILARITY: score.minTokenSimilarity,
        TOKEN_SCORES: score.tokenScores,
      };
    })
    .filter(
      (item) =>
        item.SIMILARITY >= Number(config.minSimilarity ?? 65) &&
        item.MIN_TOKEN_SIMILARITY >= 60,
    )
    .sort((a, b) => {
      if (b.SIMILARITY !== a.SIMILARITY) {
        return b.SIMILARITY - a.SIMILARITY;
      }

      return b.MIN_TOKEN_SIMILARITY - a.MIN_TOKEN_SIMILARITY;
    })
    .slice(0, Number(config.limitFilter ?? 10));

  return ranked;
};
