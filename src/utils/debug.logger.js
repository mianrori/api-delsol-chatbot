import config from "../../config.js";

const DEV_PREFIX = "[CHATBOT-DEV]";

const isDevelopment = () => config.env === "development";

const safeJson = (value) => {
  try {
    return JSON.stringify(
      value,
      (_key, currentValue) =>
        typeof currentValue === "bigint"
          ? currentValue.toString()
          : currentValue,
      2,
    );
  } catch (_error) {
    return String(value);
  }
};

const maskValue = (value) => {
  const text = String(value ?? "");

  if (!text) {
    return text;
  }

  if (text.length <= 4) {
    return "*".repeat(text.length);
  }

  return text.slice(0, 2) + "***" + text.slice(-2);
};

const sanitizeObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [key, currentValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey.includes("password") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("authorization") ||
      normalizedKey.includes("bearer") ||
      normalizedKey.includes("token")
    ) {
      result[key] = "[REDACTED]";
      continue;
    }

    if (normalizedKey === "sessionid" || normalizedKey === "session_id") {
      result[key] = maskValue(currentValue);
      continue;
    }

    result[key] = sanitizeObject(currentValue);
  }

  return result;
};

const logSection = (title, payload) => {
  console.log("\n" + DEV_PREFIX + " " + title);

  if (payload !== undefined) {
    console.log(safeJson(payload));
  }
};

export const logBedrockRequest = ({ iteration, modelId, input }) => {
  if (!isDevelopment() || !config.bedrockDebug) {
    return;
  }

  logSection("BEDROCK REQUEST", {
    iteration,
    modelId,
    messageCount: input?.messages?.length ?? 0,
    toolCount: input?.toolConfig?.tools?.length ?? 0,
  });

  if (config.bedrockDebugPayloads) {
    logSection("BEDROCK REQUEST PAYLOAD", sanitizeObject(input));
  }
};

export const logBedrockResponse = ({ iteration, response }) => {
  if (!isDevelopment() || !config.bedrockDebug) {
    return;
  }

  logSection("BEDROCK RESPONSE", {
    iteration,
    stopReason: response?.stopReason ?? null,
    usage: response?.usage ?? null,
    contentTypes:
      response?.output?.message?.content?.map((block) => {
        if (block?.text !== undefined) return "text";
        if (block?.toolUse !== undefined) return "toolUse";
        if (block?.reasoningContent !== undefined) return "reasoningContent";
        return "other";
      }) ?? [],
  });

  if (config.bedrockDebugPayloads) {
    logSection("BEDROCK RESPONSE PAYLOAD", sanitizeObject(response));
  }
};

export const logToolCall = ({ name, input, sessionId }) => {
  if (!isDevelopment() || !config.bedrockDebug) {
    return;
  }

  logSection("TOOL CALL", {
    name,
    sessionId: maskValue(sessionId),
    input: config.bedrockDebugPayloads
      ? sanitizeObject(input)
      : "[payload oculto]",
  });
};

export const logToolResult = ({ name, result, error }) => {
  if (!isDevelopment() || !config.bedrockDebug) {
    return;
  }

  if (error) {
    logSection("TOOL RESULT ERROR", {
      name,
      message: error?.message ?? String(error),
      errorNum: error?.errorNum ?? null,
    });
    return;
  }

  logSection("TOOL RESULT", {
    name,
    result: config.bedrockDebugPayloads
      ? sanitizeObject(result)
      : "[payload oculto]",
  });
};

export const logPiiTransformation = ({
  field,
  originalValue,
  transformedValue,
  transformation = "hash",
}) => {
  if (!isDevelopment() || !config.piiDebug) {
    return;
  }

  logSection("PII TRANSFORMATION", {
    field,
    transformation,
    before: config.piiDebugShowRaw
      ? originalValue
      : maskValue(originalValue),
    after: transformedValue,
  });
};
