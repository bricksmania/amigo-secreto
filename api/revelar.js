import { cmd } from '../lib/redis.js';
import { codigoConfere } from '../lib/codigo.js';

const MAX_ERRADAS = 5;
const BLOQUEIO_S = 3600; // 1 hora

// POST /api/revelar   body: { token, pin }
// Mostra o resultado da unidade depois de conferir o PIN. Bloqueia por 1 hora após 5 erros.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const token = String(body.token || '');
    const pin = String(body.pin || '');

    const ref = token ? await cmd('GET', `tok:${token}`) : null;
    if (!ref) return res.status(404).json({ erro: 'Link inválido.' });

    const bloqueado = await cmd('GET', `bloq:${token}`);
    if (bloqueado) {
      return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ erro: 'Informe o PIN de 4 dígitos.' });
    }

    const guardado = await cmd('GET', `pin:${token}`);
    if (!guardado || !codigoConfere(token, pin, guardado)) {
      const erradas = await cmd('INCR', `erros:${token}`);
      if (erradas === 1) await cmd('EXPIRE', `erros:${token}`, BLOQUEIO_S);
      if (erradas >= MAX_ERRADAS) {
        await cmd('SET', `bloq:${token}`, '1', 'EX', BLOQUEIO_S);
        await cmd('DEL', `erros:${token}`);
        return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
      }
      return res.status(401).json({ erro: `PIN incorreto. Restam ${MAX_ERRADAS - erradas} tentativas.` });
    }

    await cmd('DEL', `erros:${token}`);

    const [id, uid] = ref.split('|');
    const raw = await cmd('GET', `ev:${id}`);
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    const unidade = ev.unidades.find((u) => u.id === uid);
    const nomeDe = new Map(ev.givers.map((g) => [g.id, g.nome]));

    const resultados = ev.givers
      .filter((g) => g.unidade === uid)
      .map((g) => ({ quem: g.nome, tirou: nomeDe.get(ev.pares[g.id]) }));

    res.json({ titulo: ev.titulo, unidade: unidade.nome, resultados });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
