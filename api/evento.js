import { cmd } from '../lib/redis.js';

// GET /api/evento?id=...
// Mostra só as unidades e se já foram escolhidas. Nunca mostra quem escolheu nem o resultado.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const id = String(req.query.id || '');
    const raw = id ? await cmd('GET', `ev:${id}`) : null;
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });

    const ev = JSON.parse(raw);
    const travas = await cmd('MGET', ...ev.unidades.map((u) => `lock:${id}:${u.id}`));

    res.json({
      titulo: ev.titulo,
      unidades: ev.unidades.map((u, i) => ({
        id: u.id,
        nome: u.nome,
        dependentes: u.dependentes.length,
        reservado: travas[i] !== null,
      })),
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
