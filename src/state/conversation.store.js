import { clearPiiSession } from "./pii.store.js";

const conversations = new Map();
// Two domain markers, scoped to the same process/session lifetime as history.
// No Oracle identity, connection or filter value is stored here.
const removedSearchFilters = new Map();
export const getRemovedSearchFilters=sessionId=>new Set(removedSearchFilters.get(sessionId)??[]);
export const setSearchFilterRemoved=(sessionId,search,removed)=>{
  const filters=getRemovedSearchFilters(sessionId);
  if(removed)filters.add(search);else filters.delete(search);
  if(filters.size)removedSearchFilters.set(sessionId,filters);else removedSearchFilters.delete(sessionId);
};
export const clearRemovedSearchFilters=sessionId=>removedSearchFilters.delete(sessionId);

export const getConversation = (sessionId) => {
  return conversations.get(sessionId) ?? [];
};

export const setConversation = (sessionId, messages) => {
  conversations.set(sessionId, messages);
};

export const clearConversation = (sessionId) => {
  conversations.delete(sessionId);
  clearRemovedSearchFilters(sessionId);
  clearPiiSession(sessionId);
};
