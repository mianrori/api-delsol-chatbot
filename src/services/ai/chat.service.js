import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import config from "../../../config.js";
import { tools } from "../../tools/index.js";
import { executeTool } from "./toolExecutor.service.js";
import {
  getConversation,
  setConversation,
} from "../../state/conversation.store.js";
import { trimConversation } from "./conversation.service.js";
import { getSystemPrompt } from "../../prompts/system.prompt.js";
import {
  logBedrockRequest,
  logBedrockResponse,
  logToolCall,
  logToolResult,
} from "../../utils/debug.logger.js";
import {
  protectPiiDeep,
  protectPiiText,
  restorePiiDeep,
  restorePiiText,
} from "./pii.service.js";

const bedrockClient = new BedrockRuntimeClient({
  region: config.awsRegion || "us-east-1",
});

const MAX_TOOL_ITERATIONS = 8;
const MAX_MODEL_ROWS_WITH_EXPORT = 12;

const RUNTIME_CAPABILITIES_PROMPT = `
## Capacidades disponibles en este servicio

En esta etapa de migración, las únicas herramientas habilitadas son:
- search_customers
- search_categories
- get_sales

Aunque el prompt general pueda contener reglas para otros dominios del ERP, no afirmes que puedes consultar esos dominios ni intentes utilizar herramientas que no estén presentes en toolConfig.

Para esta etapa:
- puedes consultar ventas;
- puedes resolver clientes, marcas o locales;
- puedes resolver rubros comerciales.

Si el usuario solicita información que requiere una herramienta todavía no habilitada en este servicio, indícale brevemente que esa consulta aún no está disponible en esta etapa de migración.

Para marcas o nombres propios comerciales como Nike, Adidas, Zara o Cines, utiliza search_customers.
Para rubros genéricos como librería, gastronomía, indumentaria o electrónica, utiliza search_categories.
Si existe duda entre marca/local y rubro, intenta primero search_customers.

Si get_sales devuelve un resultado sin registros y la moneda no está disponible, informa simplemente que no se encontraron ventas para el período solicitado. No presentes una moneda desconocida como un problema de datos.

Para importes monetarios:
- respeta siempre currency.symbol y currency.symbolPosition cuando estén presentes;
- si currency.symbolPosition="prefix", coloca el símbolo antes del importe y separado por un espacio;
- para Guaraníes, presenta siempre el formato "₲ 329.378.000", nunca "329.378.000 ₲";
- conserva el formato numérico paraguayo con punto como separador de miles y coma como separador decimal.

Cuando get_sales incluya resultSet.truncated=true:
- el conjunto completo contiene más registros que los enviados al modelo;
- resultSet.totalRecords indica la cantidad total real;
- resultSet.returnedRecords indica cuántos registros de muestra recibiste;
- resultSet.sampleType="FIRST_ROWS_IN_SOURCE_ORDER" significa que la muestra contiene únicamente las primeras filas según el orden original de la consulta;
- resultSet.isRanking=false significa que la muestra NO es un ranking, Top N ni selección de mayores o menores valores;
- presenta únicamente una muestra breve de los registros recibidos;
- utiliza una frase como: "Se muestran 12 de 187 registros. El detalle completo está disponible para exportación.";
- indica claramente que existe un conjunto completo disponible para exportación;
- nunca afirmes que la muestra representa todos los resultados;
- nunca describas la muestra como "los primeros por importe", "los de mayor venta", "Top", "ranking", "líderes" ni expresiones equivalentes;
- nunca sumes, promedies ni construyas totales a partir de la muestra;
- nunca presentes totales aproximados;
- nunca armes rankings, Top N o conclusiones sobre máximos/mínimos globales usando solamente la muestra;
- nunca afirmes que "la mayoría" del conjunto cumple una condición utilizando solamente la muestra;
- nunca afirmes concentración, distribución global o participación relativa utilizando solamente la muestra;
- puedes describir literalmente los valores visibles de una fila concreta, pero no extrapolarlos al conjunto completo.

Si resultSet.analysisPolicy="NO_ANALYSIS":
- NO agregues secciones "Análisis", "Observación", "Conclusión" ni equivalentes;
- NO calcules porcentajes, participaciones, sumas, promedios, comparaciones ni tendencias a partir de las filas de muestra;
- NO identifiques líderes, mayores, menores, concentración, distribución ni comportamiento global;
- limita la respuesta a presentar la muestra y señalar que el conjunto completo está disponible para exportación.

Si resultSet.analysisPolicy="EXPLICIT_INSIGHTS_ONLY":
- puedes agregar análisis únicamente a partir de valores presentes explícitamente en insights;
- nunca derives análisis adicional desde las filas truncadas;
- distingue claramente la muestra de datos de los insights globales calculados por el sistema.

## Presentación de identificadores protegidos
- Los tokens [PII_*] son exclusivamente internos y nunca deben mostrarse literalmente al usuario.
- Nunca presentes códigos, IDs ni identificadores internos de clientes o rubros en respuestas comerciales.
- Para clientes/locales, presenta únicamente el nombre comercial cuando esté disponible.
- Nunca escribas expresiones como "código de cliente", "ID de cliente", "customerId", "código de rubro" o equivalentes salvo que el usuario solicite explícitamente información técnica.
- Un identificador interno puede reutilizarse silenciosamente como argumento de una herramienta, pero no debe formar parte del texto final.
`.trim();

const normalizeHistory = (history = []) => {
  return history
    .filter(
      (message) => message && ["user", "assistant"].includes(message.role),
    )
    .map((message) => {
      if (Array.isArray(message.content)) {
        return message;
      }

      return {
        role: message.role,
        content: [
          {
            text: String(message.content ?? ""),
          },
        ],
      };
    });
};

const extractText = (message) => {
  if (!Array.isArray(message?.content)) {
    return "";
  }

  return message.content
    .filter((block) => typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
};

const sanitizeAssistantTextForUser = (text) => {
  if (typeof text !== "string") {
    return text;
  }

  return text
    .replace(
      /\s*\((?:c[oó]digo\s+de\s+cliente|id\s+de\s+cliente|customer\s*id)\s*:\s*\[PII_CUSTOMER_ID_\d+\]\)/gi,
      "",
    )
    .replace(
      /(?:c[oó]digo\s+de\s+cliente|id\s+de\s+cliente|customer\s*id)\s*:?\s*\[PII_CUSTOMER_ID_\d+\]/gi,
      "",
    )
    .replace(
      /\s*\((?:c[oó]digo\s+de\s+rubro|id\s+de\s+rubro|category\s*id)\s*:\s*\[PII_[A-Z_]*CATEGORY_ID_\d+\]\)/gi,
      "",
    )
    .trim();
};

const normalizeToolResult = (value) => {
  if (value === undefined) {
    return { success: true };
  }

  const json = JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue,
  );

  if (json === undefined) {
    return { success: true };
  }

  const normalized = JSON.parse(json);

  if (Array.isArray(normalized)) {
    return { data: normalized };
  }

  if (normalized !== null && typeof normalized === "object") {
    return normalized;
  }

  return { value: normalized };
};

const getCurrentDateParaguay = () => {
  return new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
};

const mergeActions = (currentActions, newActions) => ({
  ...currentActions,
  ...newActions,
});

const extractClientActions = ({ name, result }) => {
  if (name !== "get_sales" || !result?.export?.available) {
    return {};
  }

  const exportId = result.export.exportId ?? null;

  return {
    salesExport: {
      eligible: true,
      available: Boolean(exportId),
      exportId,
      totalRecords: Number(
        result.export.totalRecords ??
          (Array.isArray(result?.data) ? result.data.length : 0),
      ),
      format: result.export.format ?? "xlsx",
      fileName: result.export.fileName ?? null,
      expiresAt: result.export.expiresAt ?? null,
    },
  };
};

const removeClientOnlyMetadata = ({ name, result }) => {
  if (
    name === "get_sales" &&
    result &&
    typeof result === "object" &&
    !Array.isArray(result)
  ) {
    const { export: exportMetadata, ...resultForModel } = result;

    if (
      exportMetadata?.available &&
      Array.isArray(resultForModel.data) &&
      resultForModel.data.length > MAX_MODEL_ROWS_WITH_EXPORT
    ) {
      const hasTemporalInsights = Boolean(
        resultForModel.insights?.scope?.timeDimension,
      );

      const {
        insights,
        ...resultWithoutInsights
      } = resultForModel;

      return {
        ...resultWithoutInsights,
        ...(hasTemporalInsights ? { insights } : {}),
        data: resultForModel.data.slice(0, MAX_MODEL_ROWS_WITH_EXPORT),
        resultSet: {
          truncated: true,
          totalRecords: Number(
            exportMetadata.totalRecords ?? resultForModel.data.length,
          ),
          returnedRecords: MAX_MODEL_ROWS_WITH_EXPORT,
          sampleType: "FIRST_ROWS_IN_SOURCE_ORDER",
          isRanking: false,
          analysisPolicy: hasTemporalInsights
            ? "EXPLICIT_INSIGHTS_ONLY"
            : "NO_ANALYSIS",
          fullResultAvailableInExport: true,
        },
      };
    }

    return resultForModel;
  }

  return result;
};

const executeToolRequests = async ({ content, sessionId }) => {
  const toolResults = [];
  let actions = {};
  const toolUses = content.filter((block) => block.toolUse);

  for (const block of toolUses) {
    const { toolUseId, name, input = {} } = block.toolUse;

    logToolCall({
      name,
      input,
      sessionId,
    });

    try {
      const restoredInput = restorePiiDeep(sessionId, input);

      const result = await executeTool({
        name,
        arguments: restoredInput,
        context: {
          sessionId,
        },
      });

      actions = mergeActions(
        actions,
        extractClientActions({ name, result }),
      );

      const resultForModel = removeClientOnlyMetadata({
        name,
        result,
      });

      const protectedResultForModel = protectPiiDeep(
        sessionId,
        resultForModel,
        null,
        [name],
      );

      logToolResult({
        name,
        result: protectedResultForModel,
      });

      toolResults.push({
        toolResult: {
          toolUseId,
          status: "success",
          content: [
            {
              json: normalizeToolResult(protectedResultForModel),
            },
          ],
        },
      });
    } catch (error) {
      const protectedErrorMessage = protectPiiText(
        sessionId,
        error?.message || "Error ejecutando la herramienta.",
      );

      logToolResult({
        name,
        error: {
          ...error,
          message: protectedErrorMessage,
        },
      });

      console.error(
        `Error ejecutando tool "${name}":`,
        protectedErrorMessage,
      );

      toolResults.push({
        toolResult: {
          toolUseId,
          status: "error",
          content: [
            {
              json: {
                success: false,
                error: "TOOL_EXECUTION_ERROR",
                message: protectedErrorMessage,
              },
            },
          ],
        },
      });
    }
  }

  return {
    toolResults,
    actions,
  };
};

export const chatService = async ({ message, sessionId }) => {
  if (!message?.trim()) {
    throw new Error("El mensaje del usuario es obligatorio.");
  }

  if (!sessionId) {
    throw new Error("El sessionId es obligatorio.");
  }

  const history = getConversation(sessionId) ?? [];

  const protectedHistory = protectPiiDeep(
    sessionId,
    normalizeHistory(history),
  );

  const messages = [
    ...protectedHistory,
    {
      role: "user",
      content: [
        {
          text: protectPiiText(sessionId, message.trim()),
        },
      ],
    },
  ];

  const systemPrompt = getSystemPrompt({
    currentDate: getCurrentDateParaguay(),
  });

  let toolIterations = 0;
  let bedrockIteration = 0;
  let conversationActions = {};

  while (true) {
    bedrockIteration += 1;

    const commandInput = {
        modelId: config.awsBedrockModelId,
        system: [
          {
            text: systemPrompt,
          },
          {
            text: RUNTIME_CAPABILITIES_PROMPT,
          },
        ],
        messages,
        toolConfig: {
          tools,
        },
        inferenceConfig: {
          maxTokens: Number(config.awsBedrockMaxTokens || 8192),
          temperature: Number(config.awsBedrockTemperature || 0.1),
        },
      };

    logBedrockRequest({
      iteration: bedrockIteration,
      modelId: config.awsBedrockModelId,
      input: commandInput,
    });

    const response = await bedrockClient.send(
      new ConverseCommand(commandInput),
    );

    logBedrockResponse({
      iteration: bedrockIteration,
      response,
    });

    const outputMessage = response.output?.message;

    if (!outputMessage) {
      throw new Error("Amazon Bedrock no devolvió un mensaje.");
    }

    /*
     * El modelo solo recibe mensajes y toolResults previamente
     * pseudonimizados, por lo que su salida ya opera sobre tokens [PII_*].
     *
     * No volvemos a ejecutar protectPiiDeep sobre texto generado por el
     * asistente: hacerlo podría confundir lenguaje natural como
     * "cliente seleccionado" con una entidad sensible real.
     */
    const safeOutputMessage = outputMessage;

    messages.push(safeOutputMessage);

    if (response.stopReason === "tool_use") {
      toolIterations += 1;

      if (toolIterations > MAX_TOOL_ITERATIONS) {
        throw new Error(
          `Se alcanzó el máximo de ${MAX_TOOL_ITERATIONS} iteraciones de herramientas.`,
        );
      }

      const { toolResults, actions } = await executeToolRequests({
        content: safeOutputMessage.content ?? [],
        sessionId,
      });

      conversationActions = mergeActions(
        conversationActions,
        actions,
      );

      if (toolResults.length === 0) {
        throw new Error(
          "Bedrock indicó tool_use pero no devolvió ninguna herramienta.",
        );
      }

      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    const safeAssistantText = sanitizeAssistantTextForUser(
      extractText(safeOutputMessage),
    );

    const answer = restorePiiText(
      sessionId,
      safeAssistantText,
    );

    if (!answer) {
      throw new Error(
        `Bedrock finalizó con stopReason="${response.stopReason}" sin texto.`,
      );
    }

    setConversation(sessionId, trimConversation(messages, 10));

    return {
      answer,
      actions: conversationActions,
      stopReason: response.stopReason,
      toolIterations,
      usage: response.usage ?? null,
    };
  }
};
