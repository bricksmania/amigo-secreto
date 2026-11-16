import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// Código de 6 dígitos gerado com aleatoriedade criptográfica.
export function gerarCodigo() {
  return String(randomInt(100000, 1000000));
}

// Guardamos só o hash, com o token como sal, para que o código não fique legível no banco.
export function hashCodigo(token, codigo) {
  return createHash('sha256').update(`${token}:${codigo}`).digest('hex');
}

export function codigoConfere(token, codigo, hashGuardado) {
  const a = Buffer.from(hashCodigo(token, codigo));
  const b = Buffer.from(String(hashGuardado));
  return a.length === b.length && timingSafeEqual(a, b);
}
