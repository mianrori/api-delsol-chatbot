import {
  getMemberAnalysisRepository,
  getMemberPurchaseBreakdownRepository,
} from "../../repositories/members/memberAnalysis.repository.js";
import { getMemberSummaryRepository } from "../../repositories/members/memberSummary.repository.js";

const GENDER_LABELS = {
  M: "Masculino",
  F: "Femenino",
};

const VALID_METRICS = ["totalAmount", "purchaseCount", "recurrenceMonths"];

const PURCHASE_BREAKDOWN_DIMENSIONS = ["category", "customer", "month", "year"];

const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

const normalizeMetrics = (metrics = []) => {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return ["totalAmount", "purchaseCount", "recurrenceMonths"];
  }

  return metrics.filter((metric) => VALID_METRICS.includes(metric));
};

const validateSegments = ({
  amountSegments = [],
  recurrenceSegments = [],
  activityMonths,
}) => {
  for (const segment of amountSegments) {
    if (segment?.min == null || segment?.max == null) {
      throw new Error(
        "Cada amountSegment debe contener min y max proporcionados por el usuario.",
      );
    }

    if (Number(segment.min) > Number(segment.max)) {
      throw new Error(`Rango monetario inválido: ${segment.label ?? ""}`);
    }
  }

  for (const segment of recurrenceSegments) {
    if (segment?.min == null || segment?.max == null) {
      throw new Error(
        "Cada recurrenceSegment debe contener min y max proporcionados por el usuario.",
      );
    }

    if (Number(segment.min) > Number(segment.max)) {
      throw new Error(`Rango de recurrencia inválido: ${segment.label ?? ""}`);
    }

    if (Number(segment.max) > Number(activityMonths)) {
      throw new Error(
        `El rango de recurrencia "${segment.label ?? ""}" supera activityMonths=${activityMonths}.`,
      );
    }
  }
};

/*
 * EMAIL, RECEIVES_TELEMARKETING y PHONE pueden venir del repository
 * para la exportación a Excel, pero deliberadamente NO se incluyen
 * en mapMember para evitar enviarlos a Bedrock/toolResult.
 */
const mapMember = (row, metrics) => {
  const member = {
    documentNumber: String(row.DOCUMENT_NUMBER),

    fullName: row.FULL_NAME ?? null,

    birthDate: row.BIRTH_DATE ?? null,

    birthMonth: row.BIRTH_MONTH != null ? Number(row.BIRTH_MONTH) : null,

    gender: GENDER_LABELS[row.GENDER] ?? row.GENDER ?? null,

    age: row.AGE != null ? Number(row.AGE) : null,

    commerciallyActive: Number(row.COMMERCIALLY_ACTIVE ?? 0) === 1,

    currency: {
      description: row.CURRENCY_DESCRIPTION ?? null,

      symbol: row.CURRENCY_SYMBOL ?? null,
    },
  };

  if (metrics.includes("totalAmount")) {
    member.totalAmount = Number(row.TOTAL_AMOUNT ?? 0);
  }

  if (metrics.includes("purchaseCount")) {
    member.purchaseCount = Number(row.PURCHASE_COUNT ?? 0);
  }

  if (metrics.includes("recurrenceMonths")) {
    member.recurrenceMonths = Number(row.RECURRENCE_MONTHS ?? 0);
  }

  /*
   * Valores internos utilizados para:
   * - segmentación por monto
   * - segmentación por recurrencia
   * - breakdown por género
   *
   * Se eliminan antes de retornar la respuesta final.
   */
  member._totalAmount = Number(row.TOTAL_AMOUNT ?? 0);

  member._purchaseCount = Number(row.PURCHASE_COUNT ?? 0);

  member._recurrenceMonths = Number(row.RECURRENCE_MONTHS ?? 0);

  return member;
};

const createAmountSegments = ({ members, segments }) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  return segments.map((segment) => {
    const matched = members.filter(
      (member) =>
        member._totalAmount >= Number(segment.min) &&
        member._totalAmount <= Number(segment.max),
    );

    return {
      label: segment.label,

      min: Number(segment.min),

      max: Number(segment.max),

      memberCount: matched.length,

      totalAmount: matched.reduce(
        (sum, member) => sum + member._totalAmount,
        0,
      ),
    };
  });
};

const createRecurrenceSegments = ({ members, segments }) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  return segments.map((segment) => {
    const matched = members.filter(
      (member) =>
        member._recurrenceMonths >= Number(segment.min) &&
        member._recurrenceMonths <= Number(segment.max),
    );

    return {
      label: segment.label,

      min: Number(segment.min),

      max: Number(segment.max),

      memberCount: matched.length,
    };
  });
};

const createGenderBreakdown = ({ members }) => {
  const map = new Map();

  for (const member of members) {
    const key = member.gender ?? "No informado";

    if (!map.has(key)) {
      map.set(key, {
        gender: key,

        memberCount: 0,

        totalAmount: 0,

        purchaseCount: 0,
      });
    }

    const item = map.get(key);

    item.memberCount++;

    item.totalAmount += member._totalAmount;

    item.purchaseCount += member._purchaseCount;
  }

  return Array.from(map.values());
};

const createTotalsByCurrency = ({ members }) => {
  const map = new Map();

  for (const member of members) {
    const description = member.currency?.description ?? null;
    const symbol = member.currency?.symbol ?? null;

    /*
     * Para socios sin compras puede no existir moneda.
     * No incluimos esos registros dentro de los totales monetarios.
     */
    if (!description && !symbol) {
      continue;
    }

    const key = `${description ?? ""}|${symbol ?? ""}`;

    if (!map.has(key)) {
      map.set(key, {
        currency: {
          description,
          symbol,
        },

        memberCount: 0,

        totalAmount: 0,

        purchaseCount: 0,

        _members: new Set(),
      });
    }

    const item = map.get(key);

    item._members.add(member.documentNumber);

    item.totalAmount += Number(member._totalAmount ?? 0);

    item.purchaseCount += Number(member._purchaseCount ?? 0);
  }

  return Array.from(map.values()).map(({ _members, ...item }) => ({
    ...item,

    memberCount: _members.size,
  }));
};

const attachPurchaseBreakdown = ({ members, rows, dimension }) => {
  const byDocument = new Map();

  for (const row of rows) {
    if (!byDocument.has(row.documentNumber)) {
      byDocument.set(row.documentNumber, []);
    }

    byDocument.get(row.documentNumber).push(row);
  }

  for (const member of members) {
    if (!member.breakdown) {
      member.breakdown = {};
    }

    member.breakdown[dimension] = byDocument.get(member.documentNumber) ?? [];
  }
};

const aggregatePurchaseBreakdown = ({ rows, dimension }) => {
  const map = new Map();

  for (const row of rows) {
    let key;
    let base;

    if (dimension === "category") {
      key = `category:${row.categoryId ?? ""}`;

      base = {
        categoryId: row.categoryId ?? null,
        categoryName: row.categoryName ?? null,
      };
    } else if (dimension === "customer") {
      key = `customer:${row.customerId ?? ""}`;

      base = {
        customerId: row.customerId ?? null,
        customerName: row.customerName ?? null,
      };
    } else if (dimension === "month") {
      key = `month:${row.month ?? ""}`;

      base = {
        month: row.month ?? null,
      };
    } else if (dimension === "year") {
      key = `year:${row.year ?? ""}`;

      base = {
        year: row.year ?? null,
      };
    } else {
      continue;
    }

    if (!map.has(key)) {
      map.set(key, {
        ...base,
        memberCount: 0,
        totalAmount: 0,
        purchaseCount: 0,
        _members: new Set(),
      });
    }

    const item = map.get(key);

    item._members.add(row.documentNumber);
    item.totalAmount += Number(row.totalAmount ?? 0);
    item.purchaseCount += Number(row.purchaseCount ?? 0);
  }

  return Array.from(map.values()).map(({ _members, ...item }) => ({
    ...item,
    memberCount: _members.size,
  }));
};

const removeInternalFields = (member) => {
  const { _totalAmount, _purchaseCount, _recurrenceMonths, ...clean } = member;

  return clean;
};

const buildAnalysisDescription = ({
  activityMonths,
  referenceDate,
  purchasePeriods,
}) => {
  const hasPurchasePeriods =
    Array.isArray(purchasePeriods) && purchasePeriods.length > 0;

  if (hasPurchasePeriods) {
    return {
      activityMonths,
      referenceDate,

      periodDefinition: purchasePeriods.map((period) => ({
        label: period.label ?? null,

        dateFrom: period.dateFrom,

        dateTo: period.dateTo,
      })),

      activityDefinition:
        "La actividad comercial se determina por la existencia de compras dentro del período solicitado.",

      recurrenceDefinition:
        "Cantidad de meses distintos dentro del período analizado en los que el socio realizó al menos una compra.",
    };
  }

  return {
    activityMonths,
    referenceDate,

    activityDefinition: `Socio activo = al menos una compra en los últimos ${activityMonths} meses calendario, incluyendo el mes de la fecha de referencia.`,

    recurrenceDefinition:
      "Cantidad de meses distintos dentro de la ventana analizada en los que el socio realizó al menos una compra.",
  };
};

export const analyzeMembers = async (args, connection, username) => {
  /*
   * -------------------------------------------------------------
   * Defaults de negocio
   * -------------------------------------------------------------
   */

  const activityMonths = args.activityMonths ?? 12;

  const referenceDate = args.referenceDate ?? formatDate(new Date());

  const metrics = normalizeMetrics(args.metrics);

  const aggregated = await getMemberSummaryRepository(args, connection);
  if (aggregated) {
    const { memberCount, totalAmount, purchaseCount } = aggregated;
    return {
      status: memberCount > 0 ? "FOUND" : "NOT_FOUND",
      analysis: buildAnalysisDescription({ activityMonths, referenceDate, purchasePeriods: args.purchasePeriods }),
      summary: {
        totalMatches: memberCount, returnedCount: memberCount, hasMore: false,
        commerciallyActiveCount: memberCount, commerciallyInactiveCount: 0,
        purchaseCount,
        totalsByCurrency: memberCount > 0 ? [{
          currency: { description: "GUARANIES", symbol: "₲" },
          memberCount, totalAmount, purchaseCount,
        }] : [],
      },
      export: { available: false, exportId: null, fileName: null, totalRecords: memberCount, format: null },
      breakdown: {},
    };
  }

  /*
   * Regla de límite:
   *
   * - resultMode="summary":
   *   el análisis debe calcularse sobre todo el universo que cumple
   *   los filtros, por lo tanto no aplicamos limit.
   *
   * - resultMode="members":
   *   el resultado es una lista de socios; si el usuario no especifica
   *   un límite, mostramos hasta 20.
   */
  const CHAT_DEFAULT_LIMIT = 20;

  const isSummaryMode = args.resultMode === "summary";

  const requestedLimit = isSummaryMode
    ? null
    : args.limit != null
      ? Number(args.limit)
      : CHAT_DEFAULT_LIMIT;

  /*
   * -------------------------------------------------------------
   * Segmentos
   * -------------------------------------------------------------
   */

  const amountSegments = Array.isArray(args.amountSegments)
    ? args.amountSegments
    : [];

  const recurrenceSegments = Array.isArray(args.recurrenceSegments)
    ? args.recurrenceSegments
    : [];

  validateSegments({
    amountSegments,
    recurrenceSegments,
    activityMonths,
  });

  /*
   * -------------------------------------------------------------
   * Validaciones de recurrencia
   * -------------------------------------------------------------
   */

  if (
    args.recurrenceMin != null &&
    Number(args.recurrenceMin) > activityMonths
  ) {
    throw new Error("recurrenceMin no puede ser mayor que activityMonths.");
  }

  if (
    args.recurrenceMax != null &&
    Number(args.recurrenceMax) > activityMonths
  ) {
    throw new Error("recurrenceMax no puede ser mayor que activityMonths.");
  }

  /*
   * -------------------------------------------------------------
   * Consulta principal
   * -------------------------------------------------------------
   *
   * El repository retorna:
   *
   * {
   *   rows,
   *   totalMatches
   * }
   *
   * totalMatches se calcula antes de aplicar limit.
   * -------------------------------------------------------------
   */

  const { rows, totalMatches, hasMore: repositoryHasMore } = await getMemberAnalysisRepository({
    connection,

    ...args,

    activityMonths,

    referenceDate,

    limit: requestedLimit,
  });

  const members = rows.map((row) => mapMember(row, metrics));

  /*
   * -------------------------------------------------------------
   * Breakdowns
   * -------------------------------------------------------------
   *
   * IMPORTANTE:
   *
   * En resultMode="summary", los breakdowns se calculan sobre todos
   * los socios que cumplen los filtros.
   *
   * En resultMode="members", se calculan sobre la lista retornada,
   * respetando ranking y limit.
   * -------------------------------------------------------------
   */

  const breakdownBy = Array.isArray(args.breakdownBy) ? args.breakdownBy : [];

  const breakdown = {};

  const purchaseDimensions = breakdownBy.filter((dimension) =>
    PURCHASE_BREAKDOWN_DIMENSIONS.includes(dimension),
  );

  if (members.length > 0 && purchaseDimensions.length > 0) {
    const documentNumbers = [
      ...new Set(members.map((member) => member.documentNumber)),
    ];

    for (const dimension of purchaseDimensions) {
      const breakdownRows = await getMemberPurchaseBreakdownRepository({
        connection,

        documentNumbers,

        dimension,

        activityMonths,

        referenceDate,

        purchasePeriods: args.purchasePeriods ?? [],

        customerIds: args.customerIds ?? [],

        categoryIds: args.categoryIds ?? [],
      });

      /*
       * En modo members mantenemos el detalle por socio.
       */
      if (!isSummaryMode) {
        attachPurchaseBreakdown({
          members,

          rows: breakdownRows,

          dimension,
        });
      }

      /*
       * Siempre generamos un agregado global para Bedrock.
       * En resultMode="summary" este agregado representa todo el universo,
       * porque la consulta principal se ejecutó sin limit.
       */
      breakdown[dimension] = aggregatePurchaseBreakdown({
        rows: breakdownRows,

        dimension,
      });
    }
  }

  /*
   * -------------------------------------------------------------
   * Summary
   * -------------------------------------------------------------
   *
   * totalMatches:
   *   cantidad real de socios que cumplen los filtros.
   *
   * returnedCount:
   *   cantidad enviada al modelo/chat.
   *
   * hasMore:
   *   indica que existen más socios que los mostrados.
   *
   * No utilizamos members.length como "total encontrados".
   * -------------------------------------------------------------
   */

  const returnedCount = members.length;

  const hasMore =
    repositoryHasMore != null
      ? Boolean(repositoryHasMore)
      : totalMatches != null
        ? totalMatches > returnedCount
        : false;

  /*
   * En summary, members contiene todo el universo filtrado.
   * En members, estos conteos corresponden únicamente a la lista retornada.
   */
  const commerciallyActiveCount = members.filter(
    (member) => member.commerciallyActive,
  ).length;

  const commerciallyInactiveCount = returnedCount - commerciallyActiveCount;

  /*
   * Totales globales.
   *
   * purchaseCount puede sumarse globalmente porque representa cantidad
   * de facturas.
   *
   * totalAmount NO se mezcla entre monedas. Se devuelve agrupado por
   * moneda en totalsByCurrency.
   */
  const totalPurchaseCount = members.reduce(
    (sum, member) => sum + Number(member._purchaseCount ?? 0),
    0,
  );

  const totalsByCurrency = createTotalsByCurrency({
    members,
  });

  const summary = {
    totalMatches: totalMatches ?? null,

    returnedCount,

    hasMore,

    /*
     * En resultMode="summary" corresponden al universo completo.
     * En resultMode="members" corresponden únicamente a la lista retornada.
     */
    commerciallyActiveCount,

    commerciallyInactiveCount,

    /*
     * Cantidad total de facturas del universo analizado.
     */
    purchaseCount: totalPurchaseCount,

    /*
     * Los importes se mantienen separados por moneda.
     */
    totalsByCurrency,
  };

  /*
   * -------------------------------------------------------------
   * Exportación
   * -------------------------------------------------------------
   *
   * La migración actual del chatbot todavía no incluye el flujo
   * Redis/Excel del backend legacy. Exponemos metadata explícita
   * para evitar que el modelo afirme que existe una exportación
   * cuando esa capacidad aún no está habilitada.
   * -------------------------------------------------------------
   */
  const exportInfo = {
    available: false,
    exportId: null,
    fileName: null,
    totalRecords: totalMatches ?? null,
    format: null,
  };

  /*
   * -------------------------------------------------------------
   * Segmentaciones
   * -------------------------------------------------------------
   */

  if (breakdownBy.includes("gender")) {
    breakdown.gender = createGenderBreakdown({
      members,
    });
  }

  if (breakdownBy.includes("amountSegment") || amountSegments.length > 0) {
    breakdown.amountSegments = createAmountSegments({
      members,

      segments: amountSegments,
    });
  }

  if (
    breakdownBy.includes("recurrenceSegment") ||
    recurrenceSegments.length > 0
  ) {
    breakdown.recurrenceSegments = createRecurrenceSegments({
      members,

      segments: recurrenceSegments,
    });
  }

  /*
   * -------------------------------------------------------------
   * Resultado
   * -------------------------------------------------------------
   */

  const result = {
    status:
      returnedCount > 0
        ? "FOUND"
        : totalMatches === 0
          ? "NOT_FOUND"
          : "NOT_FOUND",

    analysis: buildAnalysisDescription({
      activityMonths,

      referenceDate,

      purchasePeriods: args.purchasePeriods ?? [],
    }),

    summary,

    export: exportInfo,

    breakdown,
  };

  if (args.resultMode !== "summary") {
    result.members = members.map(removeInternalFields);
  }

  return result;
};
