# Amigo secreto

Sorteio de amigo secreto sem limite de participantes. Cada unidade (uma pessoa e os dependentes dela) é escolhida de uma vez, e só quem pegou a unidade vê os resultados dela. Exclusões garantem que pares indesejados não se tirem.

## Como funciona

- **Criar**: o organizador informa os participantes, os dependentes (`Arlete: Joao, Maria`) e as exclusões (`Carlos - Ana`). O sorteio é feito no servidor já com as regras.
- **Escolher**: cada participante abre o link do evento e escolhe a unidade dele. A unidade fica travada para os outros, sem mostrar quem a escolheu.
- **Revelar**: quem escolheu recebe um link privado (com o token após o `#`, que nunca é enviado ao servidor em logs). Esse link mostra o resultado da pessoa e de todos os dependentes da unidade.

## Passo a passo para publicar

### 1. Criar o repositório no GitHub

1. Acesse github.com e clique em **New repository**.
2. Nome: `amigo-secreto`. Deixe **vazio** (sem README, sem .gitignore).
3. Copie a URL que aparece, por exemplo `https://github.com/SEU_USUARIO/amigo-secreto.git`.

### 2. Enviar o código para o GitHub

No terminal, dentro da pasta do projeto:

```bash
cd amigo-secreto
git init
git add .
git commit -m "Primeira versão do amigo secreto"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/amigo-secreto.git
git push -u origin main
```

### 3. Importar no Vercel

1. Acesse vercel.com, faça login com o GitHub e clique em **Add New > Project**.
2. Escolha o repositório `amigo-secreto` e clique em **Import**.
3. Em **Framework Preset**, deixe **Other**. Não precisa configurar build.
4. Clique em **Deploy**. O primeiro deploy vai funcionar, mas o sorteio ainda não, porque falta o banco de dados.

### 4. Criar o banco (Upstash Redis)

1. No projeto do Vercel, vá em **Storage > Create Database**.
2. Escolha **Upstash Redis** (pode ser o plano gratuito) e conecte ao projeto `amigo-secreto`.
3. O Vercel cria as variáveis de ambiente automaticamente.
4. Vá em **Deployments**, abra o último deploy e clique em **Redeploy** para as variáveis valerem.

### 5. Testar

1. Abra a URL do projeto (algo como `amigo-secreto.vercel.app`).
2. Cadastre algumas pessoas, com dependentes e exclusões.
3. Abra o link gerado em duas abas ou aparelhos diferentes e escolha unidades diferentes.
4. Verifique que a unidade escolhida aparece como indisponível na outra aba e que o resultado mostra os dependentes.

## Limites conhecidos

- O organizador não tem tela para ver os resultados. Quem tem acesso direto ao banco de dados consegue ler os resultados, porque eles ficam guardados sem criptografia.
- Se a pessoa perder o link de revelação, não tem como recuperar. Por isso a tela de escolha avisa para guardar o link.
- Os eventos ficam guardados sem prazo de expiração. Você pode apagar as chaves `ev:*` no painel do Upstash quando quiser.

## Desenvolvimento local

```bash
npm i -g vercel
vercel dev
```

Use `vercel env pull` para baixar as variáveis do Upstash para testar localmente.
