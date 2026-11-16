// Teste automático do amigo secreto contra o site publicado.
// Uso (Node 18 ou superior):
//   node teste.mjs https://SEU-SITE.vercel.app
// Cria sorteios de teste (com nomes de teste), não apaga nada e não mexe em dados reais.

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base.startsWith('http')) {
  console.log('Informe a URL do site. Ex.: node teste.mjs https://amigo-secreto.vercel.app');
  process.exit(1);
}

let falhas = 0;
function check(nome, condicao, detalhe = '') {
  if (condicao) {
    console.log(`  OK    ${nome}`);
  } else {
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

console.log('\n1. Criar sorteio (Ana com dependente Joao, Bruno, Carla)');
const criado = await post('/api/criar', {
  titulo: 'Teste automatico',
  pessoas: [{ nome: 'Ana', dependentes: ['Joao'] }, { nome: 'Bruno' }, { nome: 'Carla' }],
  proibidos: [],
});
check('criar retorna 201', criado.status === 201, JSON.stringify(criado.dados));
const id = criado.dados.id;

console.log('\n2. Página do evento');
const ev1 = await get(`/api/evento?id=${id}`);
check('evento retorna 3 unidades', ev1.dados.unidades?.length === 3);
check('nenhuma unidade escolhida no início', ev1.dados.unidades?.every((u) => u.reservado === false));
const textoEvento = JSON.stringify(ev1.dados);
check('evento não vaza pares nem givers', !textoEvento.includes('pares') && !textoEvento.includes('givers'));

const unidadeAna = ev1.dados.unidades.find((u) => u.nome === 'Ana').id;
const unidadeBruno = ev1.dados.unidades.find((u) => u.nome === 'Bruno').id;

console.log('\n3. Escolha da unidade e PIN');
const pinCurto = await post('/api/pegar', { id, unidade: unidadeAna, pin: '12' });
check('PIN com menos de 4 dígitos é recusado', pinCurto.status === 400);

const pegou = await post('/api/pegar', { id, unidade: unidadeAna, pin: '1234' });
check('primeira escolha da unidade da Ana funciona', pegou.status === 200 && !!pegou.dados.token, JSON.stringify(pegou.dados));
const tokenAna = pegou.dados.token;

const repetiu = await post('/api/pegar', { id, unidade: unidadeAna, pin: '9999' });
check('segunda escolha da mesma unidade é bloqueada (409)', repetiu.status === 409, JSON.stringify(repetiu.dados));

const ev2 = await get(`/api/evento?id=${id}`);
check('unidade da Ana aparece como escolhida', ev2.dados.unidades.find((u) => u.id === unidadeAna)?.reservado === true);

console.log('\n4. Revelação com PIN');
const semPin = await post('/api/revelar', { token: tokenAna, pin: '' });
check('revelar sem PIN é recusado (400)', semPin.status === 400);

const certo = await post('/api/revelar', { token: tokenAna, pin: '1234' });
check('PIN certo mostra o resultado', certo.status === 200 && Array.isArray(certo.dados.resultados), JSON.stringify(certo.dados));
if (certo.status === 200) {
  const linhas = certo.dados.resultados;
  check('resultado tem Ana e Joao (a unidade inteira)', linhas.length === 2 && linhas.some((l) => l.quem === 'Ana') && linhas.some((l) => l.quem === 'Joao'));
  check('ninguém da unidade tira alguém da própria unidade', linhas.every((l) => !['Ana', 'Joao'].includes(l.tirou)), JSON.stringify(linhas));
  check('ninguém tira a si mesmo', linhas.every((l) => l.quem !== l.tirou));
}

const tokenInvalido = await post('/api/revelar', { token: 'token-que-nao-existe', pin: '1234' });
check('token inválido retorna 404', tokenInvalido.status === 404);

console.log('\n5. Bloqueio após 5 PINs errados (unidade do Bruno)');
const pegouBruno = await post('/api/pegar', { id, unidade: unidadeBruno, pin: '5555' });
check('Bruno consegue escolher a unidade dele', pegouBruno.status === 200);
const tokenBruno = pegouBruno.dados.token;
const erros = [];
for (let i = 0; i < 5; i++) erros.push((await post('/api/revelar', { token: tokenBruno, pin: '0000' })).status);
check('4 primeiros erros retornam 401', erros.slice(0, 4).every((s) => s === 401), JSON.stringify(erros));
check('o 5º erro bloqueia (429)', erros[4] === 429, JSON.stringify(erros));
const comPinCerto = await post('/api/revelar', { token: tokenBruno, pin: '5555' });
check('com o acesso bloqueado, nem o PIN certo abre (429)', comPinCerto.status === 429);

console.log('\n6. Exclusões impossíveis são recusadas');
const impossivel = await post('/api/criar', {
  titulo: 'Teste impossivel',
  pessoas: [{ nome: 'Dani' }, { nome: 'Eva' }],
  proibidos: [['Dani', 'Eva']],
});
check('sorteio sem solução é recusado (400)', impossivel.status === 400, JSON.stringify(impossivel.dados));

console.log('\n7. Exclusão funciona');
const comExclusao = await post('/api/criar', {
  titulo: 'Teste exclusao',
  pessoas: [{ nome: 'Fabio' }, { nome: 'Gisele' }, { nome: 'Hugo' }, { nome: 'Ivo' }],
  proibidos: [['Fabio', 'Gisele']],
});
check('sorteio com exclusão é criado', comExclusao.status === 201);
if (comExclusao.status === 201) {
  const idEx = comExclusao.dados.id;
  const evEx = await get(`/api/evento?id=${idEx}`);
  const uF = evEx.dados.unidades.find((u) => u.nome === 'Fabio').id;
  const pF = await post('/api/pegar', { id: idEx, unidade: uF, pin: '4321' });
  const resF = await post('/api/revelar', { token: pF.dados.token, pin: '4321' });
  check('Fabio não tira a Gisele', resF.dados.resultados?.[0]?.tirou !== 'Gisele', JSON.stringify(resF.dados));
}

console.log(`\n${falhas === 0 ? 'Tudo passou.' : `${falhas} teste(s) falharam.`}`);
process.exit(falhas === 0 ? 0 : 1);
