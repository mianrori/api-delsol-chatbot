import { getPiiSession } from "../../state/pii.store.js";
import { logPiiTransformation } from "../../utils/debug.logger.js";

const TOKEN_PATTERN = /\[PII_([A-Z_]+)_\d+\]/g;

const INTERNAL_ONLY_TOKEN_TYPES = new Set([
  "SOLES_TYPE_ID",
  "CUSTOMER_ID",
  "CATEGORY_ID",
  "CONCEPT_ID",
  "PROMOTION_ID",
  "CAMPAIGN_ID",
  "DESTINATION_CODE",
  "USER_ID",
  "CONTRACT_NUMBER",
  "CONTRACT_SERIES",
]);

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

  ["solestypeid", "SOLES_TYPE_ID"],
  ["solestypeids", "SOLES_TYPE_ID"],
  ["solestypedescription", "SOLES_TYPE_NAME"],
  ["movementtype", "MOVEMENT_TYPE"],
  ["movementtypes", "MOVEMENT_TYPE"],
  ["typeid", "SOLES_TYPE_ID"],
  ["typeids", "SOLES_TYPE_ID"],
  ["typedescription", "SOLES_TYPE_NAME"],

  // Vehículos
  ["plate", "PLATE"],
  ["matricula", "PLATE"],

  // Clientes / locales
  ["customerid", "CUSTOMER_ID"],
  ["codcliente", "CUSTOMER_ID"],
  ["categoryid", "CATEGORY_ID"],
  ["codrubro", "CATEGORY_ID"],
  ["customername", "CUSTOMER_NAME"],
  ["businessname", "BUSINESS_NAME"],
  ["razonsocial", "BUSINESS_NAME"],
  ["localnumber", "LOCAL_NUMBER"],

  // Facturas / transacciones
  ["invoicenumber", "INVOICE_NUMBER"],
  ["transactionnumber", "TRANSACTION_NUMBER"],
  ["conceptdescription", "CONCEPT_DESCRIPTION"],
  ["conceptid", "CONCEPT_ID"],
  ["conceptcode", "CONCEPT_ID"],
  ["pdfurl", "PDF_URL"],

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
  { pattern: /(?:^|\.)searchsolesusagedestinations(?:\.options)?\.name$/, type: "DESTINATION_NAME" },
  { pattern: /(?:^|\.)searchsolestypes(?:\.options)?\.description$/, type: "SOLES_TYPE_NAME" },
  { pattern: /(?:^|\.)getmembersoles\.data\.type\.description$/, type: "SOLES_TYPE_NAME" },
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
    pattern: /(?:^|\.)promotion\.name$/,
    type: "PROMOTION_NAME",
  },
  {
    pattern: /(?:^|\.)campaign\.name$/,
    type: "CAMPAIGN_NAME",
  },
  {
    pattern:
      /(?:^|\.)concepts?\.description$/,
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

const SAFE_DESCRIPTIVE_FIELDS = new Set([
  "activitydefinition",
  "recurrencedefinition",
]);

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

// Generic cohorts and calendar expressions are query semantics, not names.
// Match the whole candidate so a name appended to a cohort is still protected.
const isGenericAnalysisSubject = (value) => {
  const normalized = value.trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  if (/^(?:(?:todos|todas)(?: (?:los|las))? |(?:los|las) )?(?:socios|socias|clientes|locales|comercios|rubros|hombres|mujeres)(?: (?:activos|activas|inactivos|inactivas|registrados|registradas|hombres|mujeres))?(?: (?:de|entre) \d{1,3} (?:a|y) \d{1,3} anos)?$/.test(normalized)) {
    return true;
  }
  const month = "(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
  return new RegExp(`^(?:${month}(?: (?:y|a|hasta) ${month})?|20\\d{2}|hoy|ayer|(?:este|el) (?:mes|ano))$`).test(normalized);
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

  // A vehicle reference can supply the plate without saying matrícula/chapa.
  // Require a digit so ordinary words such as "registrado" stay readable.
  protectedText = protectedText.replace(
    /\b(veh[ií]culo\s+(?:con\s+)?)([A-Z0-9-]{5,10})\b/gi,
    (match, prefix, value) => /[0-9]/.test(value)
      ? `${prefix}${protectPiiValue(sessionId, "PLATE", value)}` : match,
  );

  /*
   * Nombres de personas cuando el contexto indica explícitamente socio/socia.
   */
  protectedText = protectedText.replace(
    /\b((?:del|de\s+la|del\s+)?soci[oa]\s+(?:(?:llamad[oa]|denominad[oa])\s+)?)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]+){1,4})(?=\s*(?:[,.!?;:]|$))/gi,
    (match, prefix, value) => {
      // These words refer to a previously resolved destination, not a name.
      if (/^en\s+(?:ese|este|el|aquel)\s+destino$/i.test(value.trim())) return match;
      return `${prefix}${protectPiiValue(sessionId, "NAME", value.trim())}`;
    },
  );

  // In these short balance requests, the final subject is a member even when
  // the word socio is omitted. Keep the balance intent and any date visible.
  protectedText = protectedText.replace(
    /\b((?:saldo\s+de\s+soles\s+(?:de|del)|cu[aá]ntos\s+soles\s+(?:dispone|tiene)(?:\s+(?:de|del))?)\s+(?:(?:el\s+|la\s+)?soci[oa]\s+)?)(["“]?)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9'’.-]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9'’.-]+){0,7}?)(["”]?)(?=\s*(?:,\s*)?(?:al|a\s+la\s+fecha|con\s+fecha\s+de\s+referencia)\s+\d{1,2}\/\d{1,2}\/\d{4}|\s+por\s+(?:tipo|vencimiento|fecha\s+de\s+vencimiento)\b|\s*[?!.;:]?\s*$)/gi,
    (match, prefix, quote, value, closingQuote) => {
      if (isGenericAnalysisSubject(value) || /^(?:mi|mis|su|sus|el|la|los|las)$/i.test(value)) return match;
      const document = /^[0-9][0-9. -]*$/.test(value);
      return `${prefix}${quote}${protectPiiValue(sessionId, document ? "DOCUMENT" : "NAME", value.trim())}${closingQuote}`;
    },
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
    /\b((?:contrato|condiciones(?:\s+contractuales|\s+del\s+contrato))\s+de\s+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80})(?=\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  /*
   * Consultas de incidencia del costo total shopping:
   *
   *   "Mostrame la incidencia del costo total shopping de Óptica Valerio en marzo de 2023"
   *   "Incidencia del costo shopping de Marca Ejemplo por mes en 2023"
   *
   * Protegemos únicamente el nombre comercial y preservamos el período y
   * la agrupación para que Bedrock pueda construir dateFrom/dateTo/groupBy.
   */
  protectedText = protectedText.replace(
    /\b((?:incidencia\s+(?:del\s+)?costo(?:\s+total)?\s+shopping(?:\s+sobre\s+(?:las\s+)?ventas)?\s+de\s+))([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:(?:de|desde|durante|en)\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2}|hoy|ayer|este|esta)|del\s+(?:20\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|por\s+(?:d[ií]a|mes|a[nñ]o))|\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  /*
   * Consultas contractuales donde la entidad aparece entre la intención
   * y la métrica, por ejemplo:
   *
   *   "¿Cuánto paga Nike por metro cuadrado de arrendamiento mínimo?"
   *   "¿Cuál es el alquiler Nike por metro cuadrado?"
   *
   * El nombre comercial se pseudonimiza antes de Bedrock y se restaura
   * únicamente al ejecutar la herramienta interna.
   */
  protectedText = protectedText.replace(
    /\b((?:cu[aá]nto\s+paga|cu[aá]l\s+es\s+el\s+(?:costo|alquiler)|costo(?:\s+contractual)?|alquiler)\s+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:por\s+(?:metro\s+cuadrado|m(?:2|²))|de\s+(?:alquiler|arrendamiento)|en\s+(?:d[oó]lares|usd)))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  /*
   * Consultas de superficie de un local.
   */
  protectedText = protectedText.replace(
    /\b((?:cu[aá]ntos?\s+metros?\s+cuadrados?\s+tiene|qu[eé]\s+superficie\s+tiene)\s+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80})(?=\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );

  /*
   * Consultas de ventas por superficie:
   *
   *   "Ventas por metro cuadrado de Marca Ejemplo en 2023"
   *   "Ventas por m² de Local Ejemplo por mes"
   */
  protectedText = protectedText.replace(
    /\b((?:ventas\s+por\s+(?:metro\s+cuadrado|m(?:2|²))\s+de\s+))([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:(?:de|desde|durante|en)\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2}|hoy|ayer|este|esta)|por\s+(?:d[ií]a|mes|a[nñ]o))|\s*(?:[,.!?;:]|$))/gi,
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
    /\b((?:ventas|facturaci[oó]n|compras)\s+de\s+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:(?:de|desde|durante|en|entre)\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2}|hoy|ayer|este|esta)|del\s+(?:20\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|por\s+(?:d[ií]a|mes|a[nñ]o|semana|local|rubro))|\s*(?:[,.!?;:]|$))/gi,
    (match, prefix, value) => isGenericAnalysisSubject(value)
      ? match
      : `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
  );


  /*
   * Promociones y campañas mencionadas explícitamente por el usuario.
   * Conservamos fuera del token los calificadores temporales para que
   * Bedrock pueda interpretar correctamente el período solicitado.
   */
  protectedText = protectedText.replace(
    /\b((?:promoci[oó]n|campa[nñ]a)\s+(?:(?:llamada|denominada)\s+)?)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:(?:desde|durante|en)\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2}|hoy|ayer|este|esta)|del\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|\s*(?:[,.!?;:]|$))/gi,
    (_match, prefix, value) =>
      `${prefix}${protectPiiValue(sessionId, "PROMOTION_NAME", value.trim())}`,
  );

  /*
   * Consultas de facturas del tipo:
   *
   *   "Facturas de Nike de enero a abril de 2023"
   *   "Mostrame las facturas de ALMACEN DE JUGUETES en 2023"
   *
   * No tratamos nombres de meses ni años como entidades comerciales.
   */
  protectedText = protectedText.replace(
    /\b((?:facturas?|comprobantes?)\s+de\s+)(?!(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2})\b)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9&.'’ -]{2,80}?)(?=\s+(?:(?:de|desde|durante|en)\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|20\d{2}|hoy|ayer|este|esta)|del\s+(?:20\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(?:sobre|respecto\s+(?:a|de)|frente\s+a)\s+(?:las\s+)?ventas|por\s+(?:d[ií]a|mes|a[nñ]o|local|rubro))|\s*(?:[,.!?;:]|$))/gi,
    (match, prefix, value) => isGenericAnalysisSubject(value)
      ? match
      : `${prefix}${protectPiiValue(sessionId, "BUSINESS_ENTITY", value.trim())}`,
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
          protectPiiDeep(sessionId, childValue,
            path.at(-1) === "dimensions" && ["customer", "category"].includes(value.type) && ["id", "name"].includes(key)
              ? `${value.type}${key === "id" ? "Id" : "Name"}` : key,
            childPath),
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
    if (SAFE_DESCRIPTIVE_FIELDS.has(normalizeFieldName(fieldName))) {
      return value;
    }

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

const normalizeUserVisibleCurrencyFormatting = (text) =>
  String(text ?? "")
    // Siempre un espacio ASCII entre el símbolo de Guaraníes y el importe.
    .replace(/₲[\u00A0\u2007\u202F \t]*(?=\d)/g, "₲ ")
    // Si el modelo usa espacios Unicode como separador de miles, normalizar a punto.
    .replace(/(\d)[\u00A0\u2007\u202F](?=\d{3}(?:\D|$))/g, "$1.");

export const restorePiiTextForUser = (sessionId, text) => {
  if (!sessionId || typeof text !== "string") {
    return text;
  }

  const state = getPiiSession(sessionId);

  const restoredText = text
    .replace(TOKEN_PATTERN, (token, type) => {
      if (INTERNAL_ONLY_TOKEN_TYPES.has(type)) {
        return "";
      }

      return state.tokenToValue.get(token) ?? "";
    })
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();

  return normalizeUserVisibleCurrencyFormatting(restoredText);
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
