import { cmd } from '../lib/redis.js';
import { codigoConfere } from '../lib/codigo.js';

// POST /api/apagar   body: { id, chave }
// Apaga o sorteio e tudo ligado a ele (escolhas, PINs, tokens). Só quem tem a chave consegue.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '');
    const chave = String(body.chave || '');

    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Sorteio não encontrado.' });

    const ev = JSON.parse(raw);
    if (!chave || !ev.apagarHash || !codigoConfere(id, chave, ev.apagarHash)) {
      return res.status(401).json({ erro: 'Chave inválida para apagar este sorteio.' });
    }

    const travas = ev.unidades.map((u) => `lock:${id}:${u.id}`);
    const valores = travas.length ? await cmd('MGET', ...travas) : [];

    const apagar = [...travas, `ev:${id}`];
    for (const token of valores) {
      if (token) apagar.push(`tok:${token}`, `pin:${token}`, `erros:${token}`, `bloq:${token}`);
    }

    for (let i = 0; i < apagar.length; i += 500) {
      await cmd('DEL', ...apagar.slice(i, i + 500));
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
