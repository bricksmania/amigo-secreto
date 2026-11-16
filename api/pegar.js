import { randomBytes } from 'node:crypto';
import { cmd } from '../lib/redis.js';
import { hashCodigo, codigoConfere } from '../lib/codigo.js';

const MAX_ERRADAS = 5;
const BLOQUEIO_S = 3600; // 1 hora

// POST /api/pegar   body: { id, membro, pin }
// membro = id da pessoa (responsável ou dependente) que está escolhendo o próprio nome.
// O PIN é o da família: o primeiro a escolher cria, os outros da mesma família precisam digitar igual.
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
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    const pessoa = ev.givers.find((g) => g.id === membro);
    if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada.' });

    const uid = pessoa.unidade;
    const familia = `${id}|${uid}`;

    if (await cmd('GET', `bloqp:${id}:${uid}`)) {
      return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
    }

    // Primeira escolha da família: cria o PIN e o token da família.
    let guardado = await cmd('GET', `pinf:${id}:${uid}`);
    if (!guardado) {
      const token = randomBytes(24).toString('base64url');
      const criou = await cmd('SET', `pinf:${id}:${uid}`, hashCodigo(familia, pin), 'NX');
      if (criou === 'OK') {
        await cmd('SET', `famtok:${id}:${uid}`, token);
        await cmd('SET', `tok:${token}`, familia);
      } else {
        guardado = await cmd('GET', `pinf:${id}:${uid}`);
      }
    }

    // Demais escolhas da família: o PIN precisa ser o mesmo.
    if (guardado && !codigoConfere(familia, pin, guardado)) {
      const erradas = await cmd('INCR', `errosp:${id}:${uid}`);
      if (erradas === 1) await cmd('EXPIRE', `errosp:${id}:${uid}`, BLOQUEIO_S);
      if (erradas >= MAX_ERRADAS) {
        await cmd('SET', `bloqp:${id}:${uid}`, '1', 'EX', BLOQUEIO_S);
        await cmd('DEL', `errosp:${id}:${uid}`);
        return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
      }
      return res.status(401).json({ erro: 'PIN diferente do PIN da sua família.' });
    }
    await cmd('DEL', `errosp:${id}:${uid}`);

    // Trava a pessoa (SET NX: só um consegue).
    const travou = await cmd('SET', `lock:${id}:${membro}`, '1', 'NX');
    if (travou !== 'OK') {
      return res.status(409).json({ erro: `${pessoa.nome} já foi escolhido(a).` });
    }

    const token = await cmd('GET', `famtok:${id}:${uid}`);
    res.json({ token, nome: pessoa.nome });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
