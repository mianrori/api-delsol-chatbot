import { clearPiiSession } from "./pii.store.js";

const conversations = new Map();
// Protected local/category resolution and query arguments, process/session scoped.
// Independent of bounded history; no credentials, Oracle identities or connections.
const searchResolutions = new Map();
const searchSelectionTurns = new Map();
// Protected arguments and pagination metadata only; no rows or connections.
const invoiceBalancePages = new Map();
export const getInvoiceBalancePageState=sessionId=>structuredClone(invoiceBalancePages.get(sessionId));
export const setInvoiceBalancePageState=(sessionId,state)=>invoiceBalancePages.set(sessionId,structuredClone(state));
export const getSearchResolutions=sessionId=>structuredClone(searchResolutions.get(sessionId)??{domains:{},contexts:{}});
export const setSearchResolutions=(sessionId,state)=>searchResolutions.set(sessionId,structuredClone(state));
export const getSearchSelectionTurn=sessionId=>structuredClone(searchSelectionTurns.get(sessionId)??{});
export const setSearchSelectionTurn=(sessionId,turn)=>searchSelectionTurns.set(sessionId,structuredClone(turn));
export const getRemovedSearchFilters=sessionId=>new Set(Object.entries(getSearchResolutions(sessionId).domains).filter(([,s])=>s.kind==='cleared').map(([name])=>name));
export const setSearchFilterRemoved=(sessionId,search,removed)=>{
  const state=getSearchResolutions(sessionId);
  if(removed)state.domains[search]={kind:'cleared'};else if(state.domains[search]?.kind==='cleared')delete state.domains[search];
  setSearchResolutions(sessionId,state);
};
export const clearRemovedSearchFilters=sessionId=>{const state=getSearchResolutions(sessionId);for(const name of getRemovedSearchFilters(sessionId))delete state.domains[name];setSearchResolutions(sessionId,state);};

export const getConversation = (sessionId) => {
  return conversations.get(sessionId) ?? [];
};

export const setConversation = (sessionId, messages) => {
  conversations.set(sessionId, messages);
};

export const clearConversation = (sessionId) => {
  conversations.delete(sessionId);
  searchResolutions.delete(sessionId);
  searchSelectionTurns.delete(sessionId);
  invoiceBalancePages.delete(sessionId);
  clearPiiSession(sessionId);
};
