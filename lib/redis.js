// Cliente mínimo para o Redis (Upstash) via API REST, sem dependências.
// O Vercel injeta as variáveis ao conectar o Upstash ao projeto.
const URL_BASE = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export async function cmd(...args) {
  if (!URL_BASE || !TOKEN) {
    throw new Error('Banco não configurado. Conecte o Upstash Redis ao projeto no Vercel.');
  }
  const resp = await fetch(URL_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
