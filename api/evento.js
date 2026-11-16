import { cmd } from '../lib/redis.js';

// GET /api/evento?id=...
// Lista cada pessoa e se já escolheu. Diz se a pessoa é de uma família (tem dependente)
// e se o PIN do grupo já foi criado. Nunca mostra resultados.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const id = String(req.query.id || '');
    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    const travas = await cmd('MGET', ...ev.givers.map((g) => `lock:${id}:${g.id}`));
    const pinfs = ev.unidades.length
      ? await cmd('MGET', ...ev.unidades.map((u) => `pinf:${id}:${u.id}`))
      : [];

    const responsavelDe = new Map(ev.unidades.map((u) => [u.id, u.nome]));
    const temPinDe = new Map(ev.unidades.map((u, i) => [u.id, pinfs[i] !== null]));
    const tamanhoDe = new Map();
    for (const g of ev.givers) {
      tamanhoDe.set(g.unidade, (tamanhoDe.get(g.unidade) || 0) + 1);
    }

    res.json({
      titulo: ev.titulo,
      pessoas: ev.givers.map((g, i) => ({
        id: g.id,
        nome: g.nome,
        grupo: g.unidade,
        dependente: !!g.dependente,
        responsavel: g.dependente ? responsavelDe.get(g.unidade) : null,
        familia: tamanhoDe.get(g.unidade) > 1,
        temPin: temPinDe.get(g.unidade) === true,
        reservado: travas[i] !== null,
      })),
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
