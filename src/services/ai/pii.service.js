import { getPiiSession } from "../../state/pii.store.js";
import { logPiiTransformation } from "../../utils/debug.logger.js";

const TOKEN_PATTERN = /\[PII_[A-Z_]+_\d+\]/g;

/*
|--------------------------------------------------------------------------
| Clasificación de datos sensibles
|--------------------------------------------------------------------------
|
| Protegemos identidad, claves de negocio y referencias operativas.
|
| Deliberadamente NO pseudonimizamos métricas analíticas como:
| - importes;
| - cantidades;
| - porcentajes;
| - saldos;
| - superficies;
| - conteos.
|
| El modelo necesita esos valores para comparar, calcular y resumir.
|--------------------------------------------------------------------------
*/

const FIELD_TYPES = new Map([
  // Socios / personas
  ["documentnumber", "DOCUMENT"],
  ["documento", "DOCUMENT"],
  ["cedula", "DOCUMENT"],
  ["codsocio", "DOCUMENT"],
  ["memberdocumentnumber", "DOCUMENT"],
  ["email", "EMAIL"],
  ["phone", "PHONE"],
  ["telefono", "PHONE"],
  ["firstname", "NAME"],
  ["lastname", "NAME"],
  ["fullname", "NAME"],
  ["nombre", "NAME"],
  ["apellido", "NAME"],
  ["nombrecompleto", "NAME"],
  ["nomsocio", "NAME"],
  ["membername", "NAME"],
  ["birthdate", "BIRTH_DATE"],
  ["fechanacimiento", "BIRTH_DATE"],
  ["registrationdate", "REGISTRATION_DATE"],
  ["gender", "GENDER"],
  ["genero", "GENDER"],
  ["observation", "OBSERVATION"],
  ["observacion", "OBSERVATION"],
  ["address", "ADDRESS"],
  ["direccion", "ADDRESS"],
  ["ruc", "TAX_ID"],
  ["taxid", "TAX_ID"],

  // Vehículos
  ["plate", "PLATE"],
  ["matricula", "PLATE"],

  // Clientes / locales
  ["customerid", "CUSTOMER_ID"],
  ["codcliente", "CUSTOMER_ID"],
  ["customername", "CUSTOMER_NAME"],
  ["businessname", "BUSINESS_NAME"],
  ["razonsocial", "BUSINESS_NAME"],
  ["localnumber", "LOCAL_NUMBER"],

  // Facturas / transacciones
  ["invoicenumber", "INVOICE_NUMBER"],
  ["transactionnumber", "TRANSACTION_NUMBER"],
  ["conceptdescription", "CONCEPT_DESCRIPTION"],

  // Promociones / campañas
  ["promotionid", "PROMOTION_ID"],
  ["promotionname", "PROMOTION_NAME"],
  ["campaignid", "CAMPAIGN_ID"],
  ["campaignname", "CAMPAIGN_NAME"],

  // Destinos asociados a movimientos
  ["destinationcode", "DESTINATION_CODE"],
  ["destinationname", "DESTINATION_NAME"],

  // Auditoría
  ["createdbycode", "USER_ID"],
  ["createdbyname", "USER_NAME"],
  ["updatedbycode", "USER_ID"],
  ["updatedbyname", "USER_NAME"],

  // Texto de búsqueda devuelto por resolvers
  ["query", "SEARCH_TERM"],
  ["search", "SEARCH_TERM"],
]);

const PATH_TYPES = [
  {
    pattern: /(?:^|\.)contract\.number$/,
    type: "CONTRACT_NUMBER",
  },
  {
    pattern: /(?:^|\.)contract\.series$/,
    type: "CONTRACT_SERIES",
  },
  {
    pattern: /(?:^|\.)referencedcontract\.number$/,
    type: "CONTRACT_NUMBER",
  },
  {
    pattern: /(?:^|\.)referencedcontract\.series$/,
    type: "CONTRACT_SERIES",
  },
  {
    pattern: /(?:^|\.)(?:customer|options)\.name$/,
    type: "CUSTOMER_NAME",
  },
  {
    pattern:
      /(?:^|\.)getcontractconditions\.concepts\.description$/,
    type: "CONCEPT_DESCRIPTION",
  },
  {
    pattern:
      /(?:^|\.)getinvoices\.data\.concept\.description$/,
    type: "CONCEPT_DESCRIPTION",
  },
  {
    pattern:
      /(?:^|\.)searchinvoiceconcepts\.(?:description|options\.description)$/,
    type: "CONCEPT_DESCRIPTION",
  },
  {
    pattern: /(?:^|\.)owner\.fullname$/,
    type: "NAME",
  },
  {
    pattern: /(?:^|\.)vehicle\.plate$/,
    type: "PLATE",
  },
];

const normalizeFieldName = (key) =>
  String(key ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

const normalizePath = (path = []) =>
  path
    .map((part) => normalizeFieldName(part))
    .filter(Boolean)
    .join(".");

const normalizeType = (type) =>
  String(type ?? "VALUE")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();

const getSensitiveType = ({ fieldName, path }) => {
  const normalizedPath = normalizePath(path);

  const pathMatch = PATH_TYPES.find(({ pattern }) =>
    pattern.test(normalizedPath),
  );

  if (pathMatch) {
    return pathMatch.type;
  }

  return FIELD_TYPES.get(normalizeFieldName(fieldName)) ?? null;
};

const isProtectableValue = (value) =>
  typeof value === "string" || typeof value === "number";

export const protectPiiValue = (sessionId, type, value) => {
  if (!sessionId || value === null || value === undefined) {
    return value;
  }

  if (!isProtectableValue(value)) {
    return value;
  }

  const rawValue = String(value);

  if (!rawValue.trim()) {
    return value;
  }

  if (/^\[PII_[A-Z_]+_\d+\]$/.test(rawValue)) {
    return rawValue;
  }

  const normalizedType = normalizeType(type);
  const state = getPiiSession(sessionId);
  const valueKey = `${normalizedType}:${rawValue}`;

  const existingToken = state.valueToToken.get(valueKey);

  if (existingToken) {
    return existingToken;
  }

  const nextCounter = (state.counters.get(normalizedType) ?? 0) + 1;
  state.counters.set(normalizedType, nextCounter);

  const token = `[PII_${normalizedType}_${nextCounter}]`;

  state.valueToToken.set(valueKey, token);
  state.tokenToValue.set(token, rawValue);

  logPiiTransformation({
    field: normalizedType,
    originalValue: rawValue,
    transformedValue: token,
    transformation: "pseudonymize",
  });

  return token;
};

const protectKnownTextPatterns = (sessionId, text) => {
  let protectedText = String(text ?? "");

  protectedText = protectedText.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    (value) => protectPiiValue(sessionId, "EMAIL", value),
  );

  protectedText = protectedText.replace(
    /(?:\+595[\s.-]?|0)9\d{2}(?:[\s.-]?\d{3}){2}\b/g,
    (value) => protectPiiValue(sessionId, "PHONE", value),
  );

  protectedText = protectedText.replace(
    /\b((?:documento|n[uú]mero\s+de\s+documento|c[eé]dula|c\.?i\.?|socio)\s*(?:n[°ºo]\.?|:|=)?\s*)([0-9][0-9.\s-]{4,14}[0-9])\b/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "DOCUMENT", value)}`,
  );

  protectedText = protectedText.replace(
    /\b((?:matr[ií]cula|chapa|patente)\s*(?:n[°ºo]\.?|:|=)?\s*)([A-Z0-9-]{5,10})\b/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "PLATE", value)}`,
  );

  /*
   * Nombres de personas cuando el contexto indica explícitamente socio/socia.
   */
  protectedText = protectedText.replace(
    /\b((?:del|de\s+la|del\s+)?soci[oa]\s+(?:(?:llamad[oa]|denominad[oa])\s+)?)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+){1,4})(?=\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "NAME", value.trim())}`,
  );

  /*
   * Entidades comerciales solo cuando el usuario identifica explícitamente
   * el tipo de entidad. No intentamos ocultar cualquier texto después de
   * "ventas de", porque podría ser un rubro, período u otra dimensión que
   * el modelo necesita comprender.
   */
  protectedText = protectedText.replace(
    /\b((?:cliente|local)\s+(?:(?:llamado|llamada|denominado|denominada)\s+)?)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80})(?=\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  protectedText = protectedText.replace(
    /\b((?:contrato|condiciones\s+del\s+contrato)\s+de\s+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80})(?=\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  /*
   * Consultas analíticas del tipo:
   *
   *   "Ventas de Nike de enero a abril de 2023"
   *   "Ventas de ALMACEN DE JUGUETES en 2023"
   *   "Facturación de Nike por mes"
   *
   * Protegemos únicamente la entidad comercial. Los calificadores temporales
   * y de agrupación deben permanecer visibles para que el modelo pueda
   * construir correctamente dateFrom/dateTo/groupBy.
   */
  protectedText = protectedText.replace(
    /\b((?:ventas|facturaci[oó]n|compras)\s+de\s+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:(?:de|desde|durante|en)\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2}|hoy|ayer|este|esta)|del\s+(?:20\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|por\s+(?:d[ií]a|mes|a[nñ]o|semana|local|rubro))|\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  protectedText = protectedText.replace(
    /\b((?:factura|transacci[oó]n|contrato)\s*(?:n[°ºo]\.?|nro\.?|n[uú]mero|:|=)\s*)([A-Z0-9][A-Z0-9./-]{2,30})\b/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_REFERENCE", value)}`,
  );

  return protectedText;
};

export const protectPiiText = (sessionId, text) => {
  if (!sessionId || typeof text !== "string") {
    return text;
  }

  return protectKnownTextPatterns(sessionId, text);
};

export const protectPiiDeep = (
  sessionId,
  value,
  fieldName = null,
  path = [],
) => {
  if (!sessionId || value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      protectPiiDeep(sessionId, item, fieldName, path),
    );
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => {
        const childPath = [...path, key];

        return [
          key,
          protectPiiDeep(sessionId, childValue, key, childPath),
        ];
      }),
    );
  }

  const fieldType = getSensitiveType({
    fieldName,
    path,
  });

  if (fieldType && isProtectableValue(value)) {
    return protectPiiValue(sessionId, fieldType, value);
  }

  if (typeof value === "string") {
    return protectKnownTextPatterns(sessionId, value);
  }

  return value;
};

export const restorePiiText = (sessionId, text) => {
  if (!sessionId || typeof text !== "string") {
    return text;
  }

  const state = getPiiSession(sessionId);

  return text.replace(TOKEN_PATTERN, (token) => {
    return state.tokenToValue.get(token) ?? token;
  });
};

export const restorePiiDeep = (sessionId, value) => {
  if (!sessionId || value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => restorePiiDeep(sessionId, item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        restorePiiDeep(sessionId, childValue),
      ]),
    );
  }

  if (typeof value === "string") {
    return restorePiiText(sessionId, value);
  }

  return value;
};
