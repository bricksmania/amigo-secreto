import { cmd } from '../lib/redis.js';
import { codigoConfere } from '../lib/codigo.js';

const MAX_TENTATIVAS = 5;
const VALIDADE_S = 600;

// POST /api/revelar   body: { token, codigo }
// Só mostra o resultado depois de conferir o código enviado ao WhatsApp da unidade.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const token = String(body.token || '');
    const codigo = String(body.codigo || '').replace(/\s/g, '');

    const ref = token ? await cmd('GET', `tok:${token}`) : null;
    if (!ref) return res.status(404).json({ erro: 'Link inválido.' });

    if (!/^\d{6}$/.test(codigo)) {
      return res.status(400).json({ erro: 'Informe o código de 6 dígitos.' });
    }

    const guardado = await cmd('GET', `codigo:${token}`);
    if (!guardado) {
      return res.status(400).json({ erro: 'Código expirado ou não solicitado. Peça um novo.' });
    }

    // Conta tentativas erradas e invalida o código depois de MAX_TENTATIVAS.
    const tentativas = await cmd('INCR', `tent:${token}`);
    if (tentativas === 1) await cmd('EXPIRE', `tent:${token}`, VALIDADE_S);
    if (tentativas > MAX_TENTATIVAS) {
      await cmd('DEL', `codigo:${token}`);
      return res.status(429).json({ erro: 'Muitas tentativas. Peça um novo código.' });
    }

    if (!codigoConfere(token, codigo, guardado)) {
      return res.status(401).json({ erro: 'Código incorreto.' });
    }

    // Código usado: não pode ser reaproveitado.
    await cmd('DEL', `codigo:${token}`);
    await cmd('DEL', `tent:${token}`);

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
