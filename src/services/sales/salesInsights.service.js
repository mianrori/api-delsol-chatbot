// src/services/sales/salesInsights.service.js

/*
|--------------------------------------------------------------------------
| Sales insights + statistical anomaly detection
|--------------------------------------------------------------------------
|
| Este servicio calcula indicadores determinísticos a partir de los datos
| ya normalizados retornados por getSalesRepository.
|
| No consulta Oracle.
| No genera texto comercial.
| No intenta explicar causas.
|
| Calcula:
|
| - promedio
| - mediana
| - desviación estándar
| - mínimo
| - máximo
| - variaciones consecutivas
| - mayor aumento
| - mayor caída
| - variación entre primer y último punto
| - tendencia lineal
| - R²
| - cuartiles e IQR
| - z-score
| - detección de posibles anomalías estadísticas
|
|--------------------------------------------------------------------------
*/

const TIME_DIMENSIONS = ["day", "month", "year"];

const SUPPORTED_METRICS = ["totalAmount", "totalInvoices"];

/*
 * Cantidad mínima de puntos para intentar detectar anomalías.
 *
 * Con muestras demasiado pequeñas los indicadores estadísticos pueden ser
 * engañosos. Cinco puntos es el mínimo técnico utilizado por este servicio.
 */
const MIN_ANOMALY_SAMPLE_SIZE = 5;

/*
 * Umbrales estadísticos.
 *
 * IQR:
 *   Regla clásica de Tukey: 1.5 * IQR.
 *
 * Z-score:
 *   Un valor absoluto >= 2 se considera una señal que merece revisión.
 *
 * Una anomalía "confirmed" requiere que ambos métodos coincidan.
 * Si solo uno de ellos detecta el punto, se devuelve como "possible".
 */
const IQR_MULTIPLIER = 1.5;
const Z_SCORE_THRESHOLD = 2;

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const toNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const round = (value, decimals = 4) => {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;

  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const getPercentageChange = (previousValue, currentValue) => {
  if (
    !Number.isFinite(previousValue) ||
    !Number.isFinite(currentValue) ||
    previousValue === 0
  ) {
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
};

const getDimensionLabel = (row, dimension) => {
  switch (dimension) {
    case "day":
      return row.date ?? null;

    case "month":
      return row.month ?? null;

    case "year":
      return row.year ?? null;

    case "customer":
      return row.customerName ?? row.customerId ?? null;

    case "category":
      return row.categoryName ?? row.categoryId ?? null;

    default:
      return null;
  }
};

const getTimeLabel = (row, groupBy = []) => {
  const timeDimension = groupBy.find((dimension) =>
    TIME_DIMENSIONS.includes(dimension),
  );

  if (!timeDimension) {
    return null;
  }

  const baseLabel = getDimensionLabel(row, timeDimension);

  if (timeDimension === "day" && row.dayOfWeek) {
    return `${baseLabel} (${row.dayOfWeek})`;
  }

  return baseLabel;
};

const buildPointLabel = (row, groupBy = []) => {
  const labels = groupBy
    .map((dimension) => {
      if (dimension === "day") {
        const date = row.date ?? null;

        if (!date) {
          return null;
        }

        return row.dayOfWeek ? `${date} (${row.dayOfWeek})` : date;
      }

      return getDimensionLabel(row, dimension);
    })
    .filter(Boolean);

  return labels.length > 0 ? labels.join(" - ") : null;
};

/*
|--------------------------------------------------------------------------
| Estadística descriptiva
|--------------------------------------------------------------------------
*/

const calculateMean = (values = []) => {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

const calculateMedian = (values = []) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

/*
 * Percentil mediante interpolación lineal.
 *
 * Ejemplo:
 * percentile(values, 0.25) -> Q1
 * percentile(values, 0.75) -> Q3
 */
const calculatePercentile = (values = [], percentile) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);

  if (sorted.length === 1) {
    return sorted[0];
  }

  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = position - lowerIndex;

  return (
    sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight
  );
};

/*
 * Desviación estándar poblacional.
 *
 * El conjunto representa todos los puntos retornados para el período analizado,
 * por eso utilizamos N y no N - 1.
 */
const calculatePopulationStandardDeviation = (values = [], mean = null) => {
  if (values.length === 0) {
    return null;
  }

  const resolvedMean = Number.isFinite(mean) ? mean : calculateMean(values);

  const variance =
    values.reduce((acc, value) => acc + (value - resolvedMean) ** 2, 0) /
    values.length;

  return Math.sqrt(variance);
};

/*
|--------------------------------------------------------------------------
| Tendencia lineal
|--------------------------------------------------------------------------
*/

const calculateLinearTrend = (values = []) => {
  if (!Array.isArray(values) || values.length < 2) {
    return null;
  }

  const n = values.length;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let index = 0; index < n; index += 1) {
    const x = index;
    const y = values[index];

    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const mean = sumY / n;

  let totalVariation = 0;
  let unexplainedVariation = 0;

  for (let index = 0; index < n; index += 1) {
    const actual = values[index];
    const predicted = intercept + slope * index;

    totalVariation += (actual - mean) ** 2;
    unexplainedVariation += (actual - predicted) ** 2;
  }

  const rSquared =
    totalVariation === 0 ? 1 : 1 - unexplainedVariation / totalVariation;

  let direction = "stable";

  if (slope > 0) {
    direction = "increasing";
  } else if (slope < 0) {
    direction = "decreasing";
  }

  return {
    direction,
    slopePerPoint: round(slope),
    rSquared: round(rSquared),
  };
};

/*
|--------------------------------------------------------------------------
| Detección estadística de anomalías
|--------------------------------------------------------------------------
*/

const calculateAnomalyDetection = ({
  points,
  values,
  mean,
  standardDeviation,
}) => {
  if (!Array.isArray(points) || points.length < MIN_ANOMALY_SAMPLE_SIZE) {
    return {
      eligible: false,
      reason: "insufficient_sample",
      minimumSampleSize: MIN_ANOMALY_SAMPLE_SIZE,
      sampleSize: points.length,
      methods: null,
      anomalies: [],
    };
  }

  const q1 = calculatePercentile(values, 0.25);
  const q3 = calculatePercentile(values, 0.75);
  const iqr = q3 - q1;

  const lowerFence = q1 - IQR_MULTIPLIER * iqr;
  const upperFence = q3 + IQR_MULTIPLIER * iqr;

  const canUseZScore =
    Number.isFinite(standardDeviation) && standardDeviation > 0;

  const anomalies = [];

  for (const point of points) {
    const iqrOutlier = point.value < lowerFence || point.value > upperFence;

    const zScore = canUseZScore
      ? (point.value - mean) / standardDeviation
      : null;

    const zScoreOutlier =
      Number.isFinite(zScore) && Math.abs(zScore) >= Z_SCORE_THRESHOLD;

    if (!iqrOutlier && !zScoreOutlier) {
      continue;
    }

    const methods = [];

    if (iqrOutlier) {
      methods.push("iqr");
    }

    if (zScoreOutlier) {
      methods.push("zScore");
    }

    const direction = point.value > mean ? "high" : "low";

    anomalies.push({
      label: point.label,
      timeLabel: point.timeLabel,
      value: point.value,

      direction,

      /*
       * confirmed:
       *   IQR y z-score coinciden.
       *
       * possible:
       *   solo uno de los métodos detecta el punto.
       */
      classification: iqrOutlier && zScoreOutlier ? "confirmed" : "possible",

      detectedBy: methods,

      zScore: zScore === null ? null : round(zScore),

      deviationFromMean: round(point.value - mean),

      percentageFromMean:
        mean === 0 ? null : round(((point.value - mean) / mean) * 100),
    });
  }

  /*
   * Primero mostramos las anomalías confirmadas.
   * Dentro de cada grupo ordenamos por distancia absoluta del z-score.
   */
  anomalies.sort((a, b) => {
    if (a.classification !== b.classification) {
      return a.classification === "confirmed" ? -1 : 1;
    }

    return Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0);
  });

  return {
    eligible: true,

    methods: {
      iqr: {
        multiplier: IQR_MULTIPLIER,
        q1: round(q1),
        q3: round(q3),
        iqr: round(iqr),
        lowerFence: round(lowerFence),
        upperFence: round(upperFence),
      },

      zScore: {
        threshold: Z_SCORE_THRESHOLD,
        mean: round(mean),
        standardDeviation: round(standardDeviation),
        available: canUseZScore,
      },
    },

    anomalyCount: anomalies.length,

    confirmedCount: anomalies.filter(
      (item) => item.classification === "confirmed",
    ).length,

    possibleCount: anomalies.filter(
      (item) => item.classification === "possible",
    ).length,

    anomalies,
  };
};

/*
|--------------------------------------------------------------------------
| Insights por métrica
|--------------------------------------------------------------------------
*/

const calculateMetricInsights = ({ rows, metric, groupBy }) => {
  const points = rows
    .map((row, index) => {
      const value = toNumber(row?.[metric]);

      if (value === null) {
        return null;
      }

      return {
        index,
        label: buildPointLabel(row, groupBy),
        timeLabel: getTimeLabel(row, groupBy),
        value,
      };
    })
    .filter(Boolean);

  if (points.length === 0) {
    return null;
  }

  const values = points.map((point) => point.value);

  const total = values.reduce((acc, value) => acc + value, 0);

  const average = total / values.length;
  const median = calculateMedian(values);

  const standardDeviation = calculatePopulationStandardDeviation(
    values,
    average,
  );

  const minPoint = points.reduce((min, point) =>
    point.value < min.value ? point : min,
  );

  const maxPoint = points.reduce((max, point) =>
    point.value > max.value ? point : max,
  );

  const consecutiveChanges = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    const absoluteChange = current.value - previous.value;

    const percentageChange = getPercentageChange(previous.value, current.value);

    consecutiveChanges.push({
      from: previous.label,
      to: current.label,
      previousValue: previous.value,
      currentValue: current.value,
      absoluteChange,
      percentageChange:
        percentageChange === null ? null : round(percentageChange),
    });
  }

  const changesWithPercentage = consecutiveChanges.filter((change) =>
    isFiniteNumber(change.percentageChange),
  );

  const largestIncrease =
    changesWithPercentage
      .filter((change) => change.percentageChange > 0)
      .sort((a, b) => b.percentageChange - a.percentageChange)[0] ?? null;

  const largestDecrease =
    changesWithPercentage
      .filter((change) => change.percentageChange < 0)
      .sort((a, b) => a.percentageChange - b.percentageChange)[0] ?? null;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  const firstToLastPercentageChange = getPercentageChange(
    firstPoint.value,
    lastPoint.value,
  );

  const anomalyDetection = calculateAnomalyDetection({
    points,
    values,
    mean: average,
    standardDeviation,
  });

  return {
    metric,

    sampleSize: points.length,

    summary: {
      average: round(average),

      median: round(median),

      standardDeviation: round(standardDeviation),

      minimum: {
        label: minPoint.label,
        value: minPoint.value,
      },

      maximum: {
        label: maxPoint.label,
        value: maxPoint.value,
      },
    },

    periodChange: {
      from: firstPoint.label,
      to: lastPoint.label,

      absoluteChange: lastPoint.value - firstPoint.value,

      percentageChange:
        firstToLastPercentageChange === null
          ? null
          : round(firstToLastPercentageChange),
    },

    largestIncrease,

    largestDecrease,

    trend: calculateLinearTrend(values),

    anomalyDetection,

    consecutiveChanges,
  };
};

/*
|--------------------------------------------------------------------------
| API pública
|--------------------------------------------------------------------------
*/

export const buildSalesInsights = ({
  salesResult,
  groupBy = [],
  metrics = ["totalAmount", "totalInvoices"],
} = {}) => {
  const rows = Array.isArray(salesResult?.data) ? salesResult.data : [];

  /*
   * Para calcular evolución necesitamos al menos dos puntos.
   *
   * Si get_sales no tiene agrupación o devuelve una sola fila,
   * no existe una serie sobre la cual calcular tendencia o variaciones.
   */
  if (rows.length < 2 || groupBy.length === 0) {
    return null;
  }

  const metricInsights = {};

  for (const metric of metrics) {
    if (!SUPPORTED_METRICS.includes(metric)) {
      continue;
    }

    const insight = calculateMetricInsights({
      rows,
      metric,
      groupBy,
    });

    if (insight) {
      metricInsights[metric] = insight;
    }
  }

  if (Object.keys(metricInsights).length === 0) {
    return null;
  }

  const timeDimension =
    groupBy.find((dimension) => TIME_DIMENSIONS.includes(dimension)) ?? null;

  return {
    version: 2,

    scope: {
      groupBy: [...groupBy],
      timeDimension,
      rowCount: rows.length,
    },

    metrics: metricInsights,
  };
};
