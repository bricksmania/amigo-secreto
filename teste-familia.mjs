// Teste do formato atual (dependentes escolhem o próprio nome com o PIN da família).
// Uso (Node 18 ou superior):
//   node teste-familia.mjs https://SEU-SITE.vercel.app
// Cria um sorteio de teste com nomes fictícios e apaga no final.

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base.startsWith('http')) {
  console.log('Uso: node teste-familia.mjs https://SEU-SITE.vercel.app');
  process.exit(1);
}

let falhas = 0;
function check(nome, condicao, detalhe = '') {
  if (condicao) console.log(`  OK    ${nome}`);
  else {
    falhas++;
    console.log(`  FALHA ${nome} ${detalhe}`);
  }
}

async function post(caminho, corpo) {
  const r = await fetch(base + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, dados: await r.json().catch(() => ({})) };
}

async function get(caminho) {
  const r = await fetch(base + caminho);
  return { status: r.status, dados: await r.json().catch(() => ({})) };
}

const porNome = (lista, nome) => lista.find((p) => p.nome === nome);

console.log('\n1. Criar sorteio: Ana (dependente Joao), Bruno, Carla, Diego');
console.log('   Exclusão: Ana não tira Bruno (e Bruno não tira Ana)');
const criado = await post('/api/criar', {
  titulo: 'Teste familia',
  pessoas: [{ nome: 'Ana', dependentes: ['Joao'] }, { nome: 'Bruno' }, { nome: 'Carla' }, { nome: 'Diego' }],
  proibidos: [['Ana', 'Bruno']],
});
check('criar retorna 201', criado.status === 201, JSON.stringify(criado.dados));
if (criado.status !== 201) process.exit(1);
const { id, chaveApagar } = criado.dados;

console.log('\n2. Lista do evento');
const ev = await get(`/api/evento?id=${id}`);
const pessoas = ev.dados.pessoas || [];
check('lista tem as 5 pessoas (incluindo o dependente)', pessoas.length === 5, `(${pessoas.length})`);
const joao = porNome(pessoas, 'Joao');
check('Joao aparece como dependente da Ana', joao?.dependente === true && joao?.responsavel === 'Ana', JSON.stringify(joao));
check('ninguém escolheu no início', pessoas.every((p) => p.reservado === false));
check('evento não vaza resultados', !JSON.stringify(ev.dados).includes('tirou'));
const ana = porNome(pessoas, 'Ana');
const bruno = porNome(pessoas, 'Bruno');
const carla = porNome(pessoas, 'Carla');

console.log('\n3. Escolhas da família da Ana (mesmo PIN)');
const pegaAna = await post('/api/pegar', { id, membro: ana.id, pin: '1234' });
check('Ana escolhe o próprio nome com PIN 1234', pegaAna.status === 200 && !!pegaAna.dados.token, JSON.stringify(pegaAna.dados));
const tokenFamilia = pegaAna.dados.token;

const repetiAna = await post('/api/pegar', { id, membro: ana.id, pin: '1234' });
check('Ana não pode escolher de novo (409)', repetiAna.status === 409);

const joaoPinErrado = await post('/api/pegar', { id, membro: joao.id, pin: '9999' });
check('Joao com PIN diferente é recusado (401)', joaoPinErrado.status === 401, JSON.stringify(joaoPinErrado.dados));

const pinCurto = await post('/api/pegar', { id, membro: joao.id, pin: '12' });
check('PIN com menos de 4 dígitos é recusado (400)', pinCurto.status === 400);

const pegaJoao = await post('/api/pegar', { id, membro: joao.id, pin: '1234' });
check('Joao escolhe o próprio nome com o mesmo PIN', pegaJoao.status === 200, JSON.stringify(pegaJoao.dados));
check('Joao recebe o mesmo link da família', pegaJoao.dados.token === tokenFamilia);

const repetiJoao = await post('/api/pegar', { id, membro: joao.id, pin: '1234' });
check('Joao não pode escolher de novo (409)', repetiJoao.status === 409);

console.log('\n4. Resultados (link da família)');
const senhaErrada = await post('/api/revelar', { token: tokenFamilia, pin: '0000' });
check('PIN errado não mostra nada (401)', senhaErrada.status === 401);

const lista = await post('/api/revelar', { token: tokenFamilia, pin: '1234' });
check('PIN certo mostra a família (Ana e Joao)', lista.status === 200 && lista.dados.membros?.length === 2, JSON.stringify(lista.dados));
check('os dois aparecem como já escolheram', lista.dados.membros?.every((m) => m.escolheu === true));

const resAna = await post('/api/revelar', { token: tokenFamilia, pin: '1234', membro: ana.id });
check('resultado da Ana abre', resAna.status === 200 && !!resAna.dados.tirou, JSON.stringify(resAna.dados));
check('Ana não tira a si mesma nem o Joao', resAna.dados.tirou !== 'Ana' && resAna.dados.tirou !== 'Joao');
check('Ana não tira o Bruno (exclusão)', resAna.dados.tirou !== 'Bruno');

const resJoao = await post('/api/revelar', { token: tokenFamilia, pin: '1234', membro: joao.id });
check('resultado do Joao abre', resJoao.status === 200 && !!resJoao.dados.tirou, JSON.stringify(resJoao.dados));
check('Joao não tira a Ana nem a si mesmo', resJoao.dados.tirou !== 'Ana' && resJoao.dados.tirou !== 'Joao');

const naoDaFamilia = await post('/api/revelar', { token: tokenFamilia, pin: '1234', membro: bruno.id });
check('pessoa de outra família não aparece aqui (404)', naoDaFamilia.status === 404);

console.log('\n5. Outra família: Bruno e Carla escolhem; Diego ainda não');
const pegaBruno = await post('/api/pegar', { id, membro: bruno.id, pin: '5555' });
check('Bruno escolhe com PIN 5555', pegaBruno.status === 200);
const tokenBruno = pegaBruno.dados.token;

const resBruno = await post('/api/revelar', { token: tokenBruno, pin: '5555', membro: bruno.id });
check('Bruno vê o próprio resultado', resBruno.status === 200 && resBruno.dados.tirou !== 'Bruno', JSON.stringify(resBruno.dados));
check('Bruno não tira a Ana (exclusão nos dois sentidos)', resBruno.dados.tirou !== 'Ana');

const pegaCarla = await post('/api/pegar', { id, membro: carla.id, pin: '7777' });
check('Carla escolhe com PIN 7777', pegaCarla.status === 200);
const resCarla = await post('/api/revelar', { token: pegaCarla.dados.token, pin: '7777', membro: carla.id });
check('Carla vê o próprio resultado', resCarla.status === 200 && resCarla.dados.tirou !== 'Carla', JSON.stringify(resCarla.dados));

const diego = porNome(pessoas, 'Diego');
const lista2 = await post('/api/revelar', { token: tokenBruno, pin: '5555' });
check('Bruno vê a lista da própria família (só ele)', lista2.dados.membros?.length === 1);
const naoEscolheu = await post('/api/revelar', { token: tokenBruno, pin: '5555', membro: diego.id });
check('Diego (outra família) não aparece na família do Bruno (404)', naoEscolheu.status === 404);

console.log('\n6. Apagar o sorteio de teste');
const apagou = await post('/api/apagar', { id, chave: chaveApagar });
check('apagar com a chave funciona', apagou.status === 200 && apagou.dados.ok === true, JSON.stringify(apagou.dados));
const depois = await get(`/api/evento?id=${id}`);
check('sorteio apagado não abre mais (404)', depois.status === 404);
const semChave = await post('/api/apagar', { id: 'nao-existe', chave: 'x' });
check('apagar sem sorteio válido retorna 404', semChave.status === 404);

console.log(`\n${falhas === 0 ? 'Tudo passou.' : `${falhas} verificação(ões) falharam.`}`);
process.exit(falhas === 0 ? 0 : 1);
