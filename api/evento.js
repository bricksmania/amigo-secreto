import { cmd } from '../lib/redis.js';

// GET /api/evento?id=...
// Lista cada pessoa (responsável e dependentes) e se já escolheu. Nunca mostra resultados.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const id = String(req.query.id || '');
    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    const travas = await cmd('MGET', ...ev.givers.map((g) => `lock:${id}:${g.id}`));
    const responsavelDe = new Map(ev.unidades.map((u) => [u.id, u.nome]));

    res.json({
      titulo: ev.titulo,
      pessoas: ev.givers.map((g, i) => ({
        id: g.id,
        nome: g.nome,
        grupo: g.unidade,
        dependente: !!g.dependente,
        responsavel: g.dependente ? responsavelDe.get(g.unidade) : null,
        reservado: travas[i] !== null,
      })),
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
