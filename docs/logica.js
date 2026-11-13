export const NIVEIS = {
  iniciante: { nome: 'Iniciante', linhas: 9, colunas: 9, minas: 10 },
  intermediario: { nome: 'Intermediário', linhas: 16, colunas: 16, minas: 40 },
  especialista: { nome: 'Especialista', linhas: 16, colunas: 30, minas: 99 },
};

export function criarJogo({ linhas, colunas, minas }) {
  const total = linhas * colunas;
  return {
    linhas,
    colunas,
    minas,
    total,
    mina: new Uint8Array(total),
    numero: new Uint8Array(total),
    aberta: new Uint8Array(total),
    bandeira: new Uint8Array(total),
    estado: 'novo', // 'novo' | 'jogando' | 'venceu' | 'perdeu'
    explodiu: -1,
    abertas: 0,
    bandeiras: 0,
  };
}

export function vizinhos(jogo, i) {
  const { linhas, colunas } = jogo;
  const l = Math.floor(i / colunas);
  const c = i % colunas;
  const r = [];
  for (let dl = -1; dl <= 1; dl++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nl = l + dl;
      const nc = c + dc;
      if ((dl || dc) && nl >= 0 && nl < linhas && nc >= 0 && nc < colunas) r.push(nl * colunas + nc);
    }
  }
  return r;
}

// As minas só são sorteadas no primeiro clique, longe dele, para a primeira jogada nunca perder.
function plantarMinas(jogo, primeira, rng) {
  const proibidas = new Set([primeira, ...vizinhos(jogo, primeira)]);
  let candidatas = [];
  for (let i = 0; i < jogo.total; i++) if (!proibidas.has(i)) candidatas.push(i);
  if (candidatas.length < jogo.minas) {
    candidatas = [];
    for (let i = 0; i < jogo.total; i++) if (i !== primeira) candidatas.push(i);
  }
  for (let k = 0; k < jogo.minas; k++) {
    const j = k + Math.floor(rng() * (candidatas.length - k));
    [candidatas[k], candidatas[j]] = [candidatas[j], candidatas[k]];
    jogo.mina[candidatas[k]] = 1;
  }
  for (let i = 0; i < jogo.total; i++) {
    jogo.numero[i] = vizinhos(jogo, i).filter((v) => jogo.mina[v]).length;
  }
}

const terminou = (jogo) => jogo.estado === 'venceu' || jogo.estado === 'perdeu';

// Devolve os índices das casas que mudaram.
export function abrir(jogo, i, rng = Math.random) {
  if (terminou(jogo) || jogo.aberta[i] || jogo.bandeira[i]) return [];
  if (jogo.estado === 'novo') {
    plantarMinas(jogo, i, rng);
    jogo.estado = 'jogando';
  }
  if (jogo.mina[i]) {
    jogo.aberta[i] = 1;
    jogo.explodiu = i;
    jogo.estado = 'perdeu';
    return [i];
  }

  const mudou = [];
  const pilha = [i];
  while (pilha.length) {
    const a = pilha.pop();
    if (jogo.aberta[a] || jogo.bandeira[a]) continue;
    jogo.aberta[a] = 1;
    jogo.abertas++;
    mudou.push(a);
    if (jogo.numero[a] === 0) pilha.push(...vizinhos(jogo, a));
  }

  if (jogo.abertas === jogo.total - jogo.minas) {
    jogo.estado = 'venceu';
    for (let m = 0; m < jogo.total; m++) {
      if (jogo.mina[m] && !jogo.bandeira[m]) {
        jogo.bandeira[m] = 1;
        jogo.bandeiras++;
      }
    }
  }
  return mudou;
}

export function alternarBandeira(jogo, i) {
  if (terminou(jogo) || jogo.aberta[i]) return false;
  jogo.bandeira[i] ^= 1;
  jogo.bandeiras += jogo.bandeira[i] ? 1 : -1;
  return true;
}

// Clique em um número já aberto: se as bandeiras ao redor batem com o número, abre os outros vizinhos.
export function acorde(jogo, i, rng = Math.random) {
  if (jogo.estado !== 'jogando' || !jogo.aberta[i] || jogo.numero[i] === 0) return [];
  const viz = vizinhos(jogo, i);
  if (viz.filter((v) => jogo.bandeira[v]).length !== jogo.numero[i]) return [];
  const mudou = [];
  for (const v of viz) {
    mudou.push(...abrir(jogo, v, rng));
    if (jogo.estado !== 'jogando') break;
  }
  return mudou;
}
