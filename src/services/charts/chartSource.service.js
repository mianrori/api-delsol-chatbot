const businessTools = new Set(["get_sales", "get_sales_per_sqm", "get_invoices", "get_contract_conditions", "get_contract_cost_per_sqm", "analyze_contract_cost_incidence", "get_member_purchases", "get_member_promo_purchases", "analyze_members", "compare_member_purchases_vs_sales", "analyze_campaign_sales_performance", "get_member_soles", "get_soles_usage", "get_vehicle_registrations"]);
export const isChartSourceTool = (name) => businessTools.has(name);
export const isChartRequest = (message) => /\b(grafic\w*|grafiqu\w*|grafica\w*|visualiza\w*|representacion visual)\b/i.test(String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
export const getChartSources = (messages = []) => {
  const calls = new Map(), results = new Map();
  const turns = [];
  const attempted = new Set();
  for (const message of messages) {
    if (message.role === "user" && message.content?.some((block) => typeof block.text === "string")) turns.push([]);
    for (const block of message.content ?? []) {
      if (message.role === "assistant" && block.toolUse) {
        calls.set(block.toolUse.toolUseId, block.toolUse.name);
        if (businessTools.has(block.toolUse.name)) attempted.add(turns.length - 1);
      }
      const response = message.role === "user" ? block.toolResult : null;
      if (response?.status !== "success") continue;
      const result = response.content?.find((item) => item.json)?.json;
      const name = calls.get(response.toolUseId);
      if (businessTools.has(name) && result) {
        const source = { name, result };
        results.set(response.toolUseId, source);
        turns.at(-1)?.push([response.toolUseId, source]);
      } else if (name === "generate_chart" && result?.sourceToolUseId) turns.at(-1)?.push([result.sourceToolUseId, null]);
    }
  }
  // Only the current turn, or the immediately preceding topic, is applicable.
  const current = turns.at(-1) ?? [];
  const previous = attempted.has(turns.length - 1) ? [] : turns.at(-2) ?? [];
  return Object.fromEntries((current.length ? current : previous).flatMap(([id, source]) => source || results.has(id) ? [[id, source ?? results.get(id)]] : []));
};
