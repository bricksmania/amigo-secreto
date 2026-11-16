import { randomBytes } from 'node:crypto';
import { cmd } from '../lib/redis.js';
import { hashCodigo, codigoConfere } from '../lib/codigo.js';

const MAX_ERRADAS = 5;
const BLOQUEIO_S = 3600; // 1 hora

// POST /api/pin   body: { id, membro, pin }
// Identifica a família: cria o PIN se for a primeira vez, ou confere se já existe.
// Não escolhe nenhum nome.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '');
    const membro = String(body.membro || '');
    const pin = String(body.pin || '');

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ erro: 'O PIN precisa ter 4 dígitos.' });
    }

    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Sorteio não encontrado.' });

    const ev = JSON.parse(raw);
    const pessoa = ev.givers.find((g) => g.id === membro);
    if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada.' });

    const uid = pessoa.unidade;
    const familia = `${id}|${uid}`;

    if (await cmd('GET', `bloqp:${id}:${uid}`)) {
      return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
    }

    let guardado = await cmd('GET', `pinf:${id}:${uid}`);
    if (!guardado) {
      const token = randomBytes(24).toString('base64url');
      const criou = await cmd('SET', `pinf:${id}:${uid}`, hashCodigo(familia, pin), 'NX');
      if (criou === 'OK') {
        await cmd('SET', `famtok:${id}:${uid}`, token);
        await cmd('SET', `tok:${token}`, familia);
        return res.json({ ok: true, criou: true });
      }
      guardado = await cmd('GET', `pinf:${id}:${uid}`);
    }

    if (!codigoConfere(familia, pin, guardado)) {
      const erradas = await cmd('INCR', `errosp:${id}:${uid}`);
      if (erradas === 1) await cmd('EXPIRE', `errosp:${id}:${uid}`, BLOQUEIO_S);
      if (erradas >= MAX_ERRADAS) {
        await cmd('SET', `bloqp:${id}:${uid}`, '1', 'EX', BLOQUEIO_S);
        await cmd('DEL', `errosp:${id}:${uid}`);
        return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
      }
      return res.status(401).json({ erro: `PIN incorreto. Restam ${MAX_ERRADAS - erradas} tentativas.` });
    }

    await cmd('DEL', `errosp:${id}:${uid}`);
    res.json({ ok: true, criou: false });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
