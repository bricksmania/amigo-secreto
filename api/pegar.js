import { randomBytes } from 'node:crypto';
import { cmd } from '../lib/redis.js';
import { hashCodigo } from '../lib/codigo.js';

// POST /api/pegar   body: { id, unidade, pin }
// Reserva a unidade (SET NX), grava o PIN escolhido pela pessoa e devolve o token de acesso.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '');
    const unidade = String(body.unidade || '');
    const pin = String(body.pin || '');

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ erro: 'O PIN precisa ter 4 dígitos.' });
    }

    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    if (!ev.unidades.some((u) => u.id === unidade)) {
      return res.status(404).json({ erro: 'Unidade não encontrada.' });
    }

    const token = randomBytes(24).toString('base64url');

    // Grava token e PIN antes de travar a unidade: se a trava falhar, ficam órfãos e inofensivos.
    await cmd('SET', `tok:${token}`, `${id}|${unidade}`);
    await cmd('SET', `pin:${token}`, hashCodigo(token, pin));

    const ok = await cmd('SET', `lock:${id}:${unidade}`, token, 'NX');
    if (ok !== 'OK') {
      return res.status(409).json({ erro: 'Esta unidade já foi escolhida por outra pessoa.' });
    }

    res.json({ token });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
