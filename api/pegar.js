import { randomBytes } from 'node:crypto';
import { cmd } from '../lib/redis.js';

// POST /api/pegar   body: { id, unidade }
// Reserva a unidade de forma atômica (SET NX) e devolve o token de acesso ao resultado.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '');
    const unidade = String(body.unidade || '');

    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    if (!ev.unidades.some((u) => u.id === unidade)) {
      return res.status(404).json({ erro: 'Unidade não encontrada.' });
    }

    const token = randomBytes(24).toString('base64url');

    // Grava o token antes de travar a unidade: se a trava falhar, o token fica órfão e inofensivo.
    await cmd('SET', `tok:${token}`, `${id}|${unidade}`);

    const ok = await cmd('SET', `lock:${id}:${unidade}`, token, 'NX');
    if (ok !== 'OK') {
      return res.status(409).json({ erro: 'Esta unidade já foi escolhida por outra pessoa.' });
    }

    res.json({ token });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
