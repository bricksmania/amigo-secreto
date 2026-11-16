import { randomInt } from 'node:crypto';

// Embaralhamento Fisher-Yates com aleatoriedade criptográfica.
function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Gera um sorteio válido (emparelhamento perfeito).
 * ids: lista de ids de quem dá e recebe
 * unidadeDe: Map id -> unidade (quem está na mesma unidade não se tira)
 * proibidos: Set com "a|b" (o chamador deve incluir os dois sentidos)
 * Retorna { doador: receptor } ou null se não houver solução possível.
 */
export function sortear(ids, unidadeDe, proibidos) {
  const doadores = embaralhar(ids);
  const receptores = embaralhar(ids);

  const permitido = (d, r) =>
    d !== r &&
    unidadeDe.get(d) !== unidadeDe.get(r) &&
    !proibidos.has(`${d}|${r}`);

  // Algoritmo de caminhos aumentantes (Kuhn) para emparelhamento bipartido.
  const recebeDe = new Map(); // receptor -> doador

  function tentar(d, visitados) {
    for (const r of receptores) {
      if (visitados.has(r) || !permitido(d, r)) continue;
      visitados.add(r);
      if (!recebeDe.has(r) || tentar(recebeDe.get(r), visitados)) {
        recebeDe.set(r, d);
        return true;
      }
    }
    return false;
  }

  for (const d of doadores) {
    if (!tentar(d, new Set())) return null;
  }

  const pares = {};
  for (const [r, d] of recebeDe) pares[d] = r;
  return pares;
}
