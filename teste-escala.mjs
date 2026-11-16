// Teste de escala do amigo secreto contra o site publicado.
// Uso (Node 18 ou superior):
//   node teste-escala.mjs https://SEU-SITE.vercel.app
// Roda com 28 e 500 pessoas, com dependentes e exclusões.
// Cria sorteios de teste com nomes fictícios. Não apaga nada e não mexe em dados reais.

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base.startsWith('http')) {
  console.log('Uso: node teste-escala.mjs https://SEU-SITE.vercel.app');
  process.exit(1);
}

const TAMANHOS = [28, 500];
const LOTE = 20;
let falhas = 0;

function check(nome, condicao, detalhe = '') {
  if (condicao) {
    console.log(`  OK    ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome} ${detalhe}`);
  }
}

// Gerador de números fixo: o mesmo teste sempre cria os mesmos dados.
function prng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

async function rodar(n) {
  console.log(`\n=== Teste com ${n} pessoas ===`);
  const rnd = prng(n * 7919 + 1);

  // Monta as pessoas: a cada 3 pessoas, uma tem 1 dependente; a cada 5, tem 2.
  const pessoas = [];
  const pais = [];
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(3, '0');
    const nome = `Pessoa ${num}`;
    const dependentes = [];
    if (i % 3 === 0) dependentes.push(`Filho ${num}-1`);
    if (i % 5 === 0) dependentes.push(`Filho ${num}-2`);
    pessoas.push({ nome, dependentes });
    pais.push(nome);
  }

  // Exclusões aleatórias entre as pessoas (cerca de 1 para cada 4).
  const proibidos = [];
  const usados = new Set();
  const alvo = Math.floor(n / 4);
  while (proibidos.length < alvo) {
    const a = pais[Math.floor(rnd() * n)];
    const b = pais[Math.floor(rnd() * n)];
    const chave = [a, b].sort().join('|');
    if (a === b || usados.has(chave)) continue;
    usados.add(chave);
    proibidos.push([a, b]);
  }

  // Mapas para conferir o resultado depois.
  const unidadeDe = new Map();
  for (const p of pessoas) {
    unidadeDe.set(p.nome, p.nome);
    for (const d of p.dependentes) unidadeDe.set(d, p.nome);
  }
  const todos = [...unidadeDe.keys()];
  const excl = new Set();
  for (const [a, b] of proibidos) {
    excl.add(`${a}|${b}`);
    excl.add(`${b}|${a}`);
  }

  console.log(`  (${n} unidades, ${todos.length} participantes contando dependentes, ${proibidos.length} exclusões)`);

  const t0 = Date.now();
  const criado = await post('/api/criar', { titulo: `Escala ${n}`, pessoas, proibidos });
  check(`criar sorteio com ${n} unidades retorna 201`, criado.status === 201, JSON.stringify(criado.dados).slice(0, 200));
  if (criado.status !== 201) return;
  const id = criado.dados.id;

  const ev = await get(`/api/evento?id=${id}`);
  const unidades = ev.dados.unidades || [];
  check(`evento lista as ${n} unidades`, unidades.length === n, `(${unidades.length})`);
  check('nenhuma unidade escolhida no início', unidades.every((u) => u.reservado === false));

  // Cada pessoa escolhe a sua unidade (em lotes, para ser mais rápido).
  const tokens = new Array(unidades.length);
  let escolhidas = 0;
  for (let i = 0; i < unidades.length; i += LOTE) {
    const lote = unidades.slice(i, i + LOTE);
    await Promise.all(
      lote.map(async (u, j) => {
        const r = await post('/api/pegar', { id, unidade: u.id, pin: '4321' });
        if (r.status === 200) {
          tokens[i + j] = r.dados.token;
          escolhidas++;
        }
      }),
    );
  }
  check(`todas as ${n} unidades foram escolhidas`, escolhidas === n, `(${escolhidas} conseguiram)`);

  // Cada unidade abre o próprio resultado com o PIN.
  const linhas = [];
  let todosAbriram = true;
  for (let i = 0; i < tokens.length; i += LOTE) {
    const lote = tokens.slice(i, i + LOTE);
    const respostas = await Promise.all(lote.map((t) => post('/api/revelar', { token: t, pin: '4321' })));
    respostas.forEach((r, j) => {
      if (r.status !== 200) {
        todosAbriram = false;
        return;
      }
      for (const x of r.dados.resultados) {
        linhas.push({ unidade: unidades[i + j].nome, quem: x.quem, tirou: x.tirou });
      }
    });
  }
  check('todas as revelações abrem com o PIN', todosAbriram);
  check(`há ${todos.length} resultados (um por participante)`, linhas.length === todos.length, `(${linhas.length})`);

  const quems = new Set(linhas.map((l) => l.quem));
  const tirados = new Set(linhas.map((l) => l.tirou));
  check('cada participante aparece como quem tirou exatamente uma vez', quems.size === todos.length);
  check('cada participante é tirado exatamente uma vez', tirados.size === todos.length && todos.every((x) => tirados.has(x)));
  check('ninguém tira a si mesmo', linhas.every((l) => l.quem !== l.tirou));
  check('ninguém tira alguém da própria unidade (mãe e filhos)', linhas.every((l) => unidadeDe.get(l.quem) !== unidadeDe.get(l.tirou)));
  check('nenhum par de exclusão aparece no sorteio', linhas.every((l) => !excl.has(`${l.quem}|${l.tirou}`)));
  check('cada resultado só mostra gente da própria unidade', linhas.every((l) => unidadeDe.get(l.quem) === l.unidade));

  console.log(`  (tempo total: ${((Date.now() - t0) / 1000).toFixed(1)} segundos)`);
}

for (const n of TAMANHOS) {
  await rodar(n);
}

console.log(`\n${falhas === 0 ? 'Tudo passou nos dois testes de escala.' : `${falhas} verificação(ões) falharam.`}`);
process.exit(falhas === 0 ? 0 : 1);
