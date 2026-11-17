// A bare breakdown has no business subject on a new conversation. Keep this
// narrow so explicit subjects, periods and follow-ups with history use normal routing.
export const clarifyInitialBreakdown = ({ message, history = [] }) => {
  if (history.length !== 0) return null;
  const text = String(message ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[¿?¡!.,;:]/g, "").replace(/\s+/g, " ").trim();
  const match = text.match(
    /^(?:ahora )?(?:(?:desglosa|desglosalo|detalla|detallalo|muestra|muestralo|separa|separalo) )?(?:el detalle |el desglose )?(?:cada mes |cada periodo )?por (local|locales|comercio|comercios|rubro|rubros|categoria|categorias)$/,
  );
  if (!match) return null;
  const dimension = /^(local|comercio)/.test(match[1]) ? "local" : "rubro";
  return `¿Qué información quieres desglosar por ${dimension}: ventas, compras de socios u otra información? ¿Para qué período?`;
};
