import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const LADO = 8;
export const MINAS = 10;
const ARQ_README = 'README.md';
const MARCA_INICIO = '<!--CAMPO:INICIO-->';
const MARCA_FIM = '<!--CAMPO:FIM-->';
const SIMBOLOS = ['⬜', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

export function vizinhos(i) {
  const l = Math.floor(i / LADO);
  const c = i % LADO;
  const r = [];
  for (let dl = -1; dl <= 1; dl++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nl = l + dl;
      const nc = c + dc;
      if ((dl || dc) && nl >= 0 && nl < LADO && nc >= 0 && nc < LADO) r.push(nl * LADO + nc);
    }
  }
  return r;
}

function sortear(rng) {
  const total = LADO * LADO;
  const minas = new Set();
  while (minas.size < MINAS) minas.add(Math.floor(rng() * total));
  const numeros = Array.from({ length: total }, (_, i) => vizinhos(i).filter((v) => minas.has(v)).length);

  // O README não tem como abrir casas vizinhas sozinho, então uma região sem minas
  // já vem aberta, como o primeiro clique de um campo minado comum.
  const zeros = numeros.flatMap((n, i) => (n === 0 && !minas.has(i) ? [i] : []));
  const abertas = new Set();
  if (zeros.length) {
    const fila = [zeros[Math.floor(rng() * zeros.length)]];
    while (fila.length) {
      const i = fila.pop();
      if (abertas.has(i)) continue;
      abertas.add(i);
      if (numeros[i] === 0) fila.push(...vizinhos(i));
    }
  }
  return { minas, numeros, abertas };
}

// Sorteia até a área inicial dar pistas suficientes sem entregar o jogo.
export function gerar(rng = Math.random) {
  let campo;
  for (let tentativa = 0; tentativa < 500; tentativa++) {
    campo = sortear(rng);
    if (campo.abertas.size >= 8 && campo.abertas.size <= 28) break;
  }
  return campo;
}

export function renderizar({ minas, numeros, abertas }, data) {
  const conteudo = (i) => (minas.has(i) ? '💥' : SIMBOLOS[numeros[i]]);
  const tabela = (celula) =>
    Array.from({ length: LADO }, (_, l) => {
      const colunas = Array.from({ length: LADO }, (_, c) => `<td align="center">${celula(l * LADO + c)}</td>`);
      return `<tr>${colunas.join('')}</tr>`;
    }).join('\n');

  const jogo = tabela((i) => (abertas.has(i) ? conteudo(i) : `<details><summary>🟩</summary>${conteudo(i)}</details>`));
  const gabarito = tabela((i) => (minas.has(i) ? '💣' : SIMBOLOS[numeros[i]]));
  const restantes = LADO * LADO - MINAS - abertas.size;

  // Sem linhas em branco: assim o GitHub trata tudo como um único bloco de HTML.
  return [
    '<div align="center">',
    '<table>',
    jogo,
    '</table>',
    `<sub>Campo de ${data} · ${MINAS} minas · ${restantes} casas seguras para abrir · um campo novo todo dia</sub>`,
    '<details>',
    '<summary>Ver gabarito</summary>',
    '<table>',
    gabarito,
    '</table>',
    '</details>',
    '</div>',
  ].join('\n');
}

export function atualizarReadme(readme, bloco) {
  const ini = readme.indexOf(MARCA_INICIO);
  const fim = readme.indexOf(MARCA_FIM);
  if (ini === -1 || fim === -1 || fim < ini) {
    throw new Error(`Marcadores ${MARCA_INICIO} / ${MARCA_FIM} não encontrados no README.`);
  }
  return `${readme.slice(0, ini + MARCA_INICIO.length)}\n${bloco}\n${readme.slice(fim)}`;
}

function principal() {
  const data = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const bloco = renderizar(gerar(), data);
  writeFileSync(ARQ_README, atualizarReadme(readFileSync(ARQ_README, 'utf8'), bloco));
  console.log(`Campo minado de ${data} gerado.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
