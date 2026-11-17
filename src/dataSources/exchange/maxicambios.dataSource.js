// Fixed public provider; never forward caller URLs, credentials or redirects.
export const readMaxicambios = async ({ timeoutMs, fetchImpl = fetch }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://www.maxicambios.com.py/', {
      headers: { Accept: 'text/html' }, signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) throw Object.assign(Error(), { code: 'EXCHANGE_PROVIDER_HTTP' });
    const html = await response.text();
    if (html.length > 2_000_000) throw Object.assign(Error(), { code: 'EXCHANGE_PROVIDER_RESPONSE_LIMIT' });
    return { html, retrievedAt: new Date().toISOString() };
  } catch (error) {
    const code = controller.signal.aborted ? 'EXCHANGE_PROVIDER_TIMEOUT'
      : ['EXCHANGE_PROVIDER_HTTP','EXCHANGE_PROVIDER_RESPONSE_LIMIT'].includes(error?.code) ? error.code : 'EXCHANGE_PROVIDER_NETWORK';
    // No raw error/cause, response, URL or transport message crosses this boundary.
    throw Object.assign(new Error('No se pudo consultar la cotización pública.'), { code });
  } finally { clearTimeout(timer); }
};
