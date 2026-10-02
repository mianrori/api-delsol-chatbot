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
