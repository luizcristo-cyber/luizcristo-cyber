import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ARQ_ESTADO = 'jogo/estado.json';
const ARQ_README = 'README.md';
const MARCA_INICIO = '<!--JOGO:INICIO-->';
const MARCA_FIM = '<!--JOGO:FIM-->';

const LINHAS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const estadoInicial = () => ({
  tabuleiro: Array(9).fill(''),
  fim: null, // null | 'X' | 'O' | 'empate'
  placar: { visitantes: 0, bot: 0, empates: 0 },
  ultimo: null, // { usuario, casa }
});

export function resultado(t) {
  for (const [a, b, c] of LINHAS) {
    if (t[a] && t[a] === t[b] && t[a] === t[c]) return t[a];
  }
  return t.every(Boolean) ? 'empate' : null;
}

export function jogadaDoBot(t, rng = Math.random) {
  const vazias = t.flatMap((v, i) => (v ? [] : [i]));
  const completa = (peca) =>
    vazias.find((i) => {
      const copia = [...t];
      copia[i] = peca;
      return resultado(copia) === peca;
    });
  const escolha = completa('O') ?? completa('X') ?? (t[4] ? undefined : 4);
  return escolha ?? vazias[Math.floor(rng() * vazias.length)];
}

function encerrar(estado, fim) {
  estado.fim = fim;
  if (fim === 'X') estado.placar.visitantes++;
  else if (fim === 'O') estado.placar.bot++;
  else estado.placar.empates++;
}

// Recebe o estado atual e o título da issue; devolve o novo estado e a resposta.
export function processar(estado, titulo, usuario, rng = Math.random) {
  const e = structuredClone(estado);

  if (titulo === 'reiniciar') {
    if (!e.fim) return { estado, resposta: '⏳ O jogo atual ainda está em andamento. Termine a partida antes de reiniciar.' };
    e.tabuleiro = Array(9).fill('');
    e.fim = null;
    return { estado: e, resposta: '🔄 Novo jogo iniciado! Volte ao perfil e faça sua jogada.' };
  }

  const m = /^jogada-([0-8])$/.exec(titulo);
  if (!m) return { estado, resposta: '❓ Não entendi essa jogada. Use os links do tabuleiro no perfil.' };
  const casa = Number(m[1]);

  if (e.fim) return { estado, resposta: '🏁 Essa partida já terminou. Use o link "Jogar novamente" no perfil.' };
  if (e.tabuleiro[casa]) return { estado, resposta: `🚫 A casa ${casa + 1} já está ocupada (alguém jogou antes de você). Veja o tabuleiro atualizado no perfil.` };

  e.tabuleiro[casa] = 'X';
  e.ultimo = { usuario, casa: casa + 1 };

  let fim = resultado(e.tabuleiro);
  if (fim) {
    encerrar(e, fim);
    return { estado: e, resposta: fim === 'X' ? '🎉 Você venceu!' : '🤝 Deu velha!' };
  }

  const resposta = jogadaDoBot(e.tabuleiro, rng);
  e.tabuleiro[resposta] = 'O';
  fim = resultado(e.tabuleiro);
  if (fim) {
    encerrar(e, fim);
    return {
      estado: e,
      resposta: fim === 'O' ? `🤖 O bot jogou na casa ${resposta + 1} e venceu desta vez!` : '🤝 Deu velha!',
    };
  }
  return { estado: e, resposta: `✅ Você jogou na casa ${casa + 1} e o bot respondeu na casa ${resposta + 1}. Sua vez de novo!` };
}

export function renderizar(e, repo) {
  const href = (titulo, corpo) =>
    `https://github.com/${repo}/issues/new?title=${encodeURIComponent(titulo)}&amp;body=${encodeURIComponent(corpo)}`;
  const corpoPadrao = 'Basta clicar em "Submit new issue". Não altere o título.';
  const simbolo = { X: '❌', O: '⭕' };

  const celula = (v, i) => {
    const conteudo = v
      ? simbolo[v]
      : e.fim
        ? '⬜'
        : `<a href="${href(`jogada-${i}`, corpoPadrao)}" title="Jogar na casa ${i + 1}">⬜</a>`;
    return `<td align="center" width="64" height="64">${conteudo}</td>`;
  };
  const linha = (r) => `    <tr>${[0, 1, 2].map((c) => celula(e.tabuleiro[r * 3 + c], r * 3 + c)).join('')}</tr>`;

  const novoJogo = `<a href="${href('reiniciar', corpoPadrao)}">Jogar novamente</a>`;
  const status = {
    null: 'Sua vez! Você joga com ❌. Clique em um ⬜ e depois em <b>Submit new issue</b> (é preciso estar logado no GitHub).',
    X: `🎉 <b>Você venceu o bot!</b> ${novoJogo}`,
    O: `🤖 <b>O bot venceu.</b> ${novoJogo}`,
    empate: `🤝 <b>Deu velha!</b> ${novoJogo}`,
  }[e.fim];

  const ultimo = e.ultimo
    ? `Última jogada: casa ${e.ultimo.casa} por <a href="https://github.com/${e.ultimo.usuario}">@${e.ultimo.usuario}</a> · `
    : '';
  const { visitantes, bot, empates } = e.placar;

  return [
    '<div align="center">',
    '',
    '<table>',
    linha(0),
    linha(1),
    linha(2),
    '</table>',
    '',
    status,
    '',
    `<sub>${ultimo}Placar: visitantes ${visitantes} · bot ${bot} · empates ${empates}</sub>`,
    '',
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

function lerEstado() {
  try {
    return JSON.parse(readFileSync(ARQ_ESTADO, 'utf8'));
  } catch {
    return estadoInicial();
  }
}

function principal() {
  const repo = process.env.REPO ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Variável REPO inválida (esperado: dono/repositorio).');

  const usuario = process.env.ISSUE_USER ?? '';
  const titulo = process.env.ISSUE_TITLE?.trim();
  const estado = lerEstado();

  let novo = estado;
  let resposta = '';
  if (titulo !== undefined) {
    // O título da issue é entrada não confiável: só chega aqui validado pelo regex em processar().
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\[bot\])?$/.test(usuario)) {
      throw new Error('Usuário da issue inválido.');
    }
    ({ estado: novo, resposta } = processar(estado, titulo, usuario));
  }

  writeFileSync(ARQ_ESTADO, `${JSON.stringify(novo, null, 2)}\n`);
  writeFileSync(ARQ_README, atualizarReadme(readFileSync(ARQ_README, 'utf8'), renderizar(novo, repo)));

  if (process.env.RESPOSTA_FILE && resposta) {
    writeFileSync(process.env.RESPOSTA_FILE, `${resposta}\n\nVeja o tabuleiro no perfil: https://github.com/${repo.split('/')[0]}`);
  }
  console.log(resposta || 'README re-renderizado.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
