import { cmd } from '../lib/redis.js';
import { codigoConfere } from '../lib/codigo.js';

const MAX_ERRADAS = 5;
const BLOQUEIO_S = 3600; // 1 hora

// POST /api/ver   body: { id, membro, pin }
// Mostra, dentro da página, com quem a pessoa saiu. Confere o PIN da família antes.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '');
    const membro = String(body.membro || '');
    const pin = String(body.pin || '');

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ erro: 'Informe o PIN de 4 dígitos.' });
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

    const guardado = await cmd('GET', `pinf:${id}:${uid}`);
    if (!guardado) {
      return res.status(400).json({ erro: 'Ainda não há PIN criado para este nome.' });
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

    if (!(await cmd('GET', `lock:${id}:${membro}`))) {
      return res.status(400).json({ erro: `${pessoa.nome} ainda não escolheu.` });
    }

    const nomeDe = new Map(ev.givers.map((g) => [g.id, g.nome]));
    res.json({
      titulo: ev.titulo,
      nome: pessoa.nome,
      tirou: nomeDe.get(ev.pares[membro]),
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
