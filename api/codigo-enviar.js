import { cmd } from '../lib/redis.js';
import { enviarCodigo } from '../lib/whatsapp.js';
import { gerarCodigo, hashCodigo } from '../lib/codigo.js';

const VALIDADE_S = 600; // 10 minutos
const INTERVALO_S = 60; // 1 minuto entre envios

// POST /api/codigo-enviar   body: { token }
// Envia um código de 6 dígitos para o WhatsApp cadastrado na unidade do token.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const token = String(body.token || '');

    const ref = token ? await cmd('GET', `tok:${token}`) : null;
    if (!ref) return res.status(404).json({ erro: 'Link inválido.' });

    const [id, uid] = ref.split('|');
    const raw = await cmd('GET', `ev:${id}`);
    if (!raw) return res.status(404).json({ erro: 'Evento não encontrado.' });
    const ev = JSON.parse(raw);
    const unidade = ev.unidades.find((u) => u.id === uid);
    if (!unidade) return res.status(404).json({ erro: 'Unidade não encontrada.' });

    // Limite de um envio por minuto, para evitar spam no WhatsApp da pessoa.
    const liberado = await cmd('SET', `cool:${token}`, '1', 'NX', 'EX', INTERVALO_S);
    if (liberado !== 'OK') {
      return res.status(429).json({ erro: 'Aguarde um minuto antes de pedir outro código.' });
    }

    const codigo = gerarCodigo();
    await cmd('SET', `codigo:${token}`, hashCodigo(token, codigo), 'EX', VALIDADE_S);
    await cmd('DEL', `tent:${token}`); // zera as tentativas a cada novo código

    await enviarCodigo(unidade.whatsapp, codigo);

    const final = unidade.whatsapp.slice(-4);
    res.json({ mensagem: `Código enviado para o WhatsApp terminado em ${final}.` });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
