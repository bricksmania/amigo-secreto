import { randomBytes } from 'node:crypto';
import { cmd } from '../lib/redis.js';
import { sortear } from '../lib/sorteio.js';
import { hashCodigo } from '../lib/codigo.js';

const limpa = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

// POST /api/criar
// body: { titulo, pessoas: [{ nome, dependentes: [nome, ...] }], proibidos: [[a, b], ...] }
// Retorna o link do evento (participantes e acompanhamento ficam nessa mesma página).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const titulo = limpa(body.titulo) || 'Amigo secreto';
    const pessoas = Array.isArray(body.pessoas) ? body.pessoas : [];

    if (pessoas.length < 1) throw new Error('Cadastre pelo menos uma pessoa.');

    // Unidade = uma pessoa + seus dependentes. Todos da mesma unidade são escolhidos juntos
    // e nunca tiram alguém da própria unidade.
    const unidades = [];
    const givers = [];
    pessoas.forEach((p, i) => {
      const uid = `u${i}`;
      const nome = limpa(p.nome);
      if (!nome) throw new Error('Há uma pessoa sem nome.');
      const dependentes = (Array.isArray(p.dependentes) ? p.dependentes : [])
        .map(limpa)
        .filter(Boolean);
      unidades.push({ id: uid, nome, dependentes });
      [nome, ...dependentes].forEach((n, k) => {
        givers.push({ id: `g${givers.length}`, nome: n, unidade: uid, dependente: k > 0 });
      });
    });

    if (givers.length < 2) throw new Error('É preciso pelo menos 2 participantes para sortear.');

    const nomes = givers.map((g) => g.nome.toLowerCase());
    if (new Set(nomes).size !== nomes.length) {
      throw new Error('Há nomes repetidos. Diferencie-os (ex.: "João Silva" e "João Souza").');
    }

    // Exclusões: o par fica bloqueado nos dois sentidos.
    const porNome = new Map(givers.map((g) => [g.nome.toLowerCase(), g.id]));
    const proibidos = new Set();
    for (const par of Array.isArray(body.proibidos) ? body.proibidos : []) {
      const a = porNome.get(limpa(par?.[0]).toLowerCase());
      const b = porNome.get(limpa(par?.[1]).toLowerCase());
      if (!a || !b) {
        throw new Error(`Nome não encontrado nas exclusões: "${par?.[0]}" / "${par?.[1]}".`);
      }
      proibidos.add(`${a}|${b}`);
      proibidos.add(`${b}|${a}`);
    }

    const unidadeDe = new Map(givers.map((g) => [g.id, g.unidade]));
    const sorteio = sortear(givers.map((g) => g.id), unidadeDe, proibidos);
    if (!sorteio) {
      throw new Error('Não há sorteio possível com essas regras. Revise as exclusões.');
    }

    const id = randomBytes(6).toString('base64url');
    // Chave para apagar o sorteio: fica só no aparelho de quem criou. O servidor guarda só o hash.
    const chaveApagar = randomBytes(16).toString('base64url');
    // Segredo do sorteio: os códigos anônimos só podem ser recalculados com ele.
    const salt = randomBytes(16).toString('hex');

    await cmd(
      'SET',
      `ev:${id}`,
      JSON.stringify({
        titulo,
        unidades,
        givers,
        pares: sorteio,
        apagarHash: hashCodigo(id, chaveApagar),
        salt,
      }),
    );

    res.status(201).json({ id, link: `/evento.html?id=${id}`, chaveApagar });
  } catch (e) {
    res.status(400).json({ erro: e.message });
  }
}
