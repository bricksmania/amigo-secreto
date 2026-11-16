import { cmd } from '../lib/redis.js';
import { codigoConfere } from '../lib/codigo.js';

const MAX_ERRADAS = 5;
const BLOQUEIO_S = 3600; // 1 hora

// POST /api/revelar   body: { token, pin, membro? }
// Sem "membro": devolve a lista de pessoas da família (quem da família já escolheu).
// Com "membro": devolve o resultado dessa pessoa, se ela já tiver escolhido.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const token = String(body.token || '');
    const pin = String(body.pin || '');
    const membro = body.membro ? String(body.membro) : null;

    const familia = token ? await cmd('GET', `tok:${token}`) : null;
    if (!familia) return res.status(404).json({ erro: 'Link inválido.' });

    if (await cmd('GET', `bloq:${token}`)) {
      return res.status(429).json({ erro: 'Acesso bloqueado por 1 hora por excesso de tentativas.' });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ erro: 'Informe o PIN de 4 dígitos.' });
    }

    const [id, uid] = familia.split('|');
    const guardado = await cmd('GET', `pinf:${id}:${uid}`);
    if (!guardado || !codigoConfere(familia, pin, guardado)) {
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

    const raw = await cmd('GET', `ev:${id}`);
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });
    const ev = JSON.parse(raw);

    const unidade = ev.unidades.find((u) => u.id === uid);
    const membros = ev.givers.filter((g) => g.unidade === uid);

    if (!membro) {
      const travas = await cmd('MGET', ...membros.map((m) => `lock:${id}:${m.id}`));
      return res.json({
        titulo: ev.titulo,
        unidade: unidade.nome,
        membros: membros.map((m, i) => ({
          id: m.id,
          nome: m.nome,
          dependente: !!m.dependente,
          escolheu: travas[i] !== null,
        })),
      });
    }

    const pessoa = membros.find((m) => m.id === membro);
    if (!pessoa) return res.status(404).json({ erro: 'Pessoa não encontrada nesta família.' });

    if (!(await cmd('GET', `lock:${id}:${membro}`))) {
      return res.status(400).json({ erro: `${pessoa.nome} ainda não escolheu o próprio nome.` });
    }

    const nomeDe = new Map(ev.givers.map((g) => [g.id, g.nome]));
    res.json({
      titulo: ev.titulo,
      quem: pessoa.nome,
      tirou: nomeDe.get(ev.pares[pessoa.id]),
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
