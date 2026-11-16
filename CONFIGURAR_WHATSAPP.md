# Configurar o envio de código pelo WhatsApp

O código de acesso é enviado pela **WhatsApp Cloud API** (Meta). Esta configuração é feita uma vez, depois do passo 4 do README.

## 1. Criar o app na Meta

1. Acesse developers.facebook.com e crie um app do tipo **Business**.
2. Adicione o produto **WhatsApp** ao app.
3. Em **WhatsApp > API Setup**, você verá um número de teste. Para enviar a todos, cadastre um número real no **Business Manager** (ele não pode estar em uso no WhatsApp comum).
4. Copie o **Phone number ID** (é um número longo, não o telefone).

## 2. Criar o token permanente

1. No Business Manager, crie um **System User** com permissão de administrador.
2. Atribua o app e o número do WhatsApp a esse usuário.
3. Gere um token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`. Esse token não expira.

## 3. Criar o template do código

1. Em **WhatsApp Manager > Message templates**, crie um template:
   - Categoria: **Utility** (utilitário)
   - Nome: `codigo_amigo_secreto`
   - Idioma: Portuguese (BR)
   - Corpo: `Seu código de acesso ao amigo secreto é {{1}}. Ele expira em 10 minutos.`
2. Aguarde a aprovação. Quando aprovado, o template pode ser usado para enviar a qualquer número.

## 4. Variáveis no Vercel

No projeto do Vercel, em **Settings > Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `WHATSAPP_TOKEN` | o token permanente do passo 2 |
| `WHATSAPP_PHONE_ID` | o Phone number ID do passo 1 |
| `WHATSAPP_TEMPLATE` | `codigo_amigo_secreto` (opcional, já é o padrão) |
| `WHATSAPP_LANG` | `pt_BR` (opcional, já é o padrão) |

Depois faça um **Redeploy**.

## 5. Testar

1. Crie um sorteio com um WhatsApp real seu.
2. Escolha uma unidade e abra o link de revelação.
3. Clique em **Enviar código pelo WhatsApp**, digite o código recebido e confirme o resultado.

## Regras de segurança já implementadas

- O código tem 6 dígitos, vale 10 minutos e só pode ser usado uma vez.
- Depois de 5 tentativas erradas, o código é invalidado e é preciso pedir outro.
- Um novo código só pode ser pedido a cada 1 minuto.
- O código fica guardado só como hash no banco.

## Observações

- Cadastre apenas números de pessoas que participam do sorteio. Você está enviando mensagens para elas, então elas precisam saber que vão receber o código.
- Se o template não estiver aprovado ou as variáveis estiverem erradas, a Meta retorna erro e a tela mostra a mensagem de falha.
