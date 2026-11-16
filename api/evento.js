import { createHash } from 'node:crypto';
import { cmd } from '../lib/redis.js';

// Código anônimo de uma pessoa: depende do segredo do sorteio, então não dá para descobrir o nome.
const codigoDe = (salt, pessoaId) =>
  createHash('sha256').update(`${salt}|${pessoaId}`).digest('hex').slice(0, 12);

// GET /api/evento?id=...
// Lista cada pessoa e se já escolheu. Inclui a verificação do sorteio (códigos repetidos).
// Nunca mostra resultados nem nomes de quem tirou quem.
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

    // Verificação: cada pessoa tem um código; o código de quem foi sorteado é contado.
    const salt = ev.salt || id;
    const sorteados = new Map();
    for (const g of ev.givers) {
      const cod = codigoDe(salt, ev.pares[g.id]);
      sorteados.set(cod, (sorteados.get(cod) || 0) + 1);
    }
    const repetidos = [...sorteados]
      .filter(([, vezes]) => vezes > 1)
      .map(([codigo, vezes]) => ({ codigo, vezes }));

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
      verificacao: {
        total: ev.givers.length,
        unicos: sorteados.size,
        repetidos,
      },
    });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
