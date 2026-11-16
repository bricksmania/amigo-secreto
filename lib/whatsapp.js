// Envio de código pelo WhatsApp usando a WhatsApp Cloud API (Meta), sem dependências.
// Variáveis necessárias no Vercel:
//   WHATSAPP_TOKEN      token de acesso permanente do app Meta
//   WHATSAPP_PHONE_ID   ID do número de telefone do WhatsApp Business
//   WHATSAPP_TEMPLATE   nome do template aprovado (padrão: codigo_amigo_secreto)
//   WHATSAPP_LANG       idioma do template (padrão: pt_BR)
//
// O template precisa existir e estar aprovado no Meta Business Manager.
// Conteúdo sugerido (categoria Utility), com uma variável:
//   "Seu código de acesso ao amigo secreto é {{1}}. Ele expira em 10 minutos."

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || 'codigo_amigo_secreto';
const LANG = process.env.WHATSAPP_LANG || 'pt_BR';

export async function enviarCodigo(numero, codigo) {
  if (!TOKEN || !PHONE_ID) {
    throw new Error('WhatsApp não configurado. Defina WHATSAPP_TOKEN e WHATSAPP_PHONE_ID.');
  }

  const resp = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: TEMPLATE,
        language: { code: LANG },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: codigo }] },
        ],
      },
    }),
  });

  const dados = await resp.json();
  if (!resp.ok) {
    throw new Error(dados?.error?.message || 'Falha ao enviar o código pelo WhatsApp.');
  }
  return dados;
}
