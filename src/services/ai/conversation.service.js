const isMemberPurchaseDetailToolUse = (block) =>
  block?.toolUse?.name === "get_member_purchases" &&
  block?.toolUse?.input?.mode === "detail";

const compactMemberPurchaseToolResult = (json = {}) => {
  if (
    json?.mode !== "detail" ||
    !Array.isArray(json?.data) ||
    json.data.length === 0
  ) {
    return json;
  }

  return {
    documentNumber: json.documentNumber,
    mode: json.mode,
    page: json.page,
    rows: json.rows,
    returnedRows: json.returnedRows,
    totalRows: json.totalRows,
    totalPages: json.totalPages,
    hasMore: json.hasMore,
    nextPage: json.nextPage,
    dataCompacted: true,
  };
};

export const compactMemberPurchasePaginationHistory = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  const memberPurchaseToolUseIds = new Set();
  const compactedToolUseIds = new Set();

  const compactedMessages = messages.map((message) => {
    const content = Array.isArray(message?.content)
      ? message.content
      : [];

    for (const block of content) {
      if (isMemberPurchaseDetailToolUse(block)) {
        memberPurchaseToolUseIds.add(block.toolUse.toolUseId);
      }
    }

    if (message?.role !== "user") {
      return message;
    }

    let changed = false;
    const compactedContent = content.map((block) => {
      const toolResult = block?.toolResult;

      if (
        !toolResult ||
        !memberPurchaseToolUseIds.has(toolResult.toolUseId)
      ) {
        return block;
      }

      const resultContent = Array.isArray(toolResult.content)
        ? toolResult.content
        : [];

      const compactedResultContent = resultContent.map((item) => {
        if (!item?.json) {
          return item;
        }

        const compactedJson = compactMemberPurchaseToolResult(
          item.json,
        );

        if (compactedJson === item.json) {
          return item;
        }

        changed = true;
        compactedToolUseIds.add(toolResult.toolUseId);

        return {
          ...item,
          json: compactedJson,
        };
      });

      return changed
        ? {
            ...block,
            toolResult: {
              ...toolResult,
              content: compactedResultContent,
            },
          }
        : block;
    });

    return changed
      ? {
          ...message,
          content: compactedContent,
        }
      : message;
  });

  if (compactedToolUseIds.size === 0) {
    return compactedMessages;
  }

  let previousCompactedMemberPurchaseResult = null;

  return compactedMessages.map((message) => {
    const content = Array.isArray(message?.content)
      ? message.content
      : [];

    if (message?.role === "user") {
      const compactedResult = content
        .map((block) => block?.toolResult)
        .find(
          (toolResult) =>
            toolResult &&
            compactedToolUseIds.has(toolResult.toolUseId),
        );

      if (compactedResult) {
        const json = compactedResult.content?.find(
          (item) => item?.json,
        )?.json;

        previousCompactedMemberPurchaseResult = json ?? null;
      }

      return message;
    }

    if (
      message?.role === "assistant" &&
      previousCompactedMemberPurchaseResult &&
      content.some((block) => typeof block?.text === "string")
    ) {
      const page = previousCompactedMemberPurchaseResult.page;
      const totalPages =
        previousCompactedMemberPurchaseResult.totalPages;
      const returnedRows =
        previousCompactedMemberPurchaseResult.returnedRows;
      const totalRows =
        previousCompactedMemberPurchaseResult.totalRows;
      const hasMore =
        previousCompactedMemberPurchaseResult.hasMore;
      const nextPage =
        previousCompactedMemberPurchaseResult.nextPage;

      previousCompactedMemberPurchaseResult = null;

      return {
        ...message,
        content: [
          {
            text:
              "[Historial compactado de compras de socio] " +
              `Se presentó la página ${page} de ${totalPages}, ` +
              `con ${returnedRows} de ${totalRows} registros. ` +
              `hasMore=${hasMore}; nextPage=${nextPage ?? "null"}.`,
          },
        ],
      };
    }

    return message;
  });
};

export const trimConversation = (messages, maxUserMessages = 10) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  let count = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    const isUserText =
      message.role === "user" &&
      message.content?.some((block) => typeof block.text === "string");

    if (!isUserText) {
      continue;
    }

    count += 1;

    if (count === maxUserMessages) {
      return messages.slice(index);
    }
  }

  return messages;
};
