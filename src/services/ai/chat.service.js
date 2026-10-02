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

const bedrockClient = new BedrockRuntimeClient({
  region: config.awsRegion || "us-east-1",
});

const MAX_TOOL_ITERATIONS = 8;

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

const executeToolRequests = async ({ content, sessionId }) => {
  const toolResults = [];
  const toolUses = content.filter((block) => block.toolUse);

  for (const block of toolUses) {
    const { toolUseId, name, input = {} } = block.toolUse;

    try {
      const result = await executeTool({
        name,
        arguments: input,
        context: {
          sessionId,
        },
      });

      toolResults.push({
        toolResult: {
          toolUseId,
          status: "success",
          content: [
            {
              json: normalizeToolResult(result),
            },
          ],
        },
      });
    } catch (error) {
      console.error(`Error ejecutando tool "${name}":`, error);

      toolResults.push({
        toolResult: {
          toolUseId,
          status: "error",
          content: [
            {
              json: {
                success: false,
                error: "TOOL_EXECUTION_ERROR",
                message:
                  error?.message || "Error ejecutando la herramienta.",
              },
            },
          ],
        },
      });
    }
  }

  return toolResults;
};

export const chatService = async ({ message, sessionId }) => {
  if (!message?.trim()) {
    throw new Error("El mensaje del usuario es obligatorio.");
  }

  if (!sessionId) {
    throw new Error("El sessionId es obligatorio.");
  }

  const history = getConversation(sessionId) ?? [];

  const messages = [
    ...normalizeHistory(history),
    {
      role: "user",
      content: [
        {
          text: message.trim(),
        },
      ],
    },
  ];

  const systemPrompt = getSystemPrompt({
    currentDate: getCurrentDateParaguay(),
  });

  let toolIterations = 0;

  while (true) {
    const response = await bedrockClient.send(
      new ConverseCommand({
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
      }),
    );

    const outputMessage = response.output?.message;

    if (!outputMessage) {
      throw new Error("Amazon Bedrock no devolvió un mensaje.");
    }

    messages.push(outputMessage);

    if (response.stopReason === "tool_use") {
      toolIterations += 1;

      if (toolIterations > MAX_TOOL_ITERATIONS) {
        throw new Error(
          `Se alcanzó el máximo de ${MAX_TOOL_ITERATIONS} iteraciones de herramientas.`,
        );
      }

      const toolResults = await executeToolRequests({
        content: outputMessage.content ?? [],
        sessionId,
      });

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

    const answer = extractText(outputMessage);

    if (!answer) {
      throw new Error(
        `Bedrock finalizó con stopReason="${response.stopReason}" sin texto.`,
      );
    }

    setConversation(sessionId, trimConversation(messages, 10));

    return {
      answer,
      actions: {},
      stopReason: response.stopReason,
      toolIterations,
      usage: response.usage ?? null,
    };
  }
};
