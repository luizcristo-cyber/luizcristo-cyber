import { NIVEIS, criarJogo, abrir, alternarBandeira, acorde } from './logica.js';

const CHAVE_NIVEL = 'campo-minado:nivel';
const TOQUE_LONGO_MS = 450;

const $ = (id) => document.getElementById(id);
const el = {
  janela: $('janela'),
  tabuleiro: $('tabuleiro'),
  rosto: $('rosto'),
  ledMinas: $('led-minas'),
  ledTempo: $('led-tempo'),
  modoBandeira: $('modo-bandeira'),
  status: $('status'),
  recorde: $('recorde'),
  relogio: $('relogio'),
};
const botoesNivel = [...document.querySelectorAll('[data-nivel]')];

// O armazenamento pode estar bloqueado (aba anônima, política do navegador); o jogo funciona sem ele.
function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: recorde e nível não são lembrados */
  }
}

/* ---------- Contadores LED de sete segmentos ---------- */

const SEGMENTOS = {
  a: '2,1 11,1 9,3 4,3',
  b: '12,2 12,10.5 10,9.5 10,4',
  c: '12,12.5 12,21 10,19 10,13.5',
  d: '2,22 11,22 9,20 4,20',
  e: '1,12.5 1,21 3,19 3,13.5',
  f: '1,2 1,10.5 3,9.5 3,4',
  g: '2.5,11.5 4,10.5 9,10.5 10.5,11.5 9,12.5 4,12.5',
};
const DIGITOS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };

function criarLed(caixa) {
  const poligonos = Object.entries(SEGMENTOS)
    .map(([s, pontos]) => `<polygon data-s="${s}" points="${pontos}"/>`)
    .join('');
  caixa.innerHTML = `<svg viewBox="0 0 13 23" aria-hidden="true">${poligonos}</svg>`.repeat(3);
}

function mostrarLed(caixa, valor, rotulo) {
  const v = Math.max(-99, Math.min(999, valor));
  const texto = v < 0 ? `-${String(-v).padStart(2, '0')}` : String(v).padStart(3, '0');
  [...caixa.children].forEach((svg, k) => {
    const acesos = DIGITOS[texto[k]];
    for (const p of svg.children) p.classList.toggle('aceso', acesos.includes(p.dataset.s));
  });
  caixa.setAttribute('aria-label', `${rotulo}: ${v}`);
}

/* ---------- Carinha ---------- */

const OLHOS = '<rect x="5" y="5.5" width="2" height="2"/><rect x="10" y="5.5" width="2" height="2"/>';
const TRACO = 'fill="none" stroke="#000" stroke-width="1.1"';
const ROSTOS = {
  normal: `${OLHOS}<path d="M4.8 10.2Q8.5 13.6 12.2 10.2" ${TRACO}/>`,
  espanto: `${OLHOS}<circle cx="8.5" cy="11.3" r="1.7" ${TRACO}/>`,
  perdeu: `<path d="M4.6 5l2.8 2.8M7.4 5L4.6 7.8M9.6 5l2.8 2.8M12.4 5L9.6 7.8M5 12.4Q8.5 9.4 12 12.4" ${TRACO}/>`,
  venceu:
    '<path d="M3.2 5.2h4.4v2.2a1.4 1.4 0 0 1-1.4 1.4H4.6a1.4 1.4 0 0 1-1.4-1.4zM9.4 5.2h4.4v2.2a1.4 1.4 0 0 1-1.4 1.4h-1.6a1.4 1.4 0 0 1-1.4-1.4z"/>' +
    `<path d="M1.6 6.6l1.8-1.2M15.4 6.6l-1.8-1.2M7.4 5.6h2.2M5 11Q8.5 13.8 12 11" ${TRACO}/>`,
};
let rostoAtual = '';

function desenharRosto(tipo) {
  if (tipo === rostoAtual) return;
  rostoAtual = tipo;
  el.rosto.innerHTML =
    '<svg viewBox="0 0 17 17" aria-hidden="true">' +
    `<circle cx="8.5" cy="8.5" r="7.6" fill="#ffe100" stroke="#000"/>${ROSTOS[tipo]}</svg>`;
}

/* ---------- Estado da partida ---------- */

let nivelId = NIVEIS[ler(CHAVE_NIVEL)] ? ler(CHAVE_NIVEL) : 'iniciante';
let jogo;
let segundos = 0;
let cronometro = null;
let modoBandeira = false;
let focavel = 0;
let ultimoPonteiro = 'mouse';
let toqueLongo = null;
let ignorarClique = false;

const casa = (i) => el.tabuleiro.children[i];
const terminou = () => jogo.estado === 'venceu' || jogo.estado === 'perdeu';
const chaveRecorde = () => `campo-minado:recorde:${nivelId}`;

function indiceDe(alvo) {
  const botao = alvo.closest?.('.casa');
  return botao ? Number(botao.dataset.i) : -1;
}

function pintar(i) {
  const botao = casa(i);
  const n = jogo.numero[i];
  let classe = 'casa';
  let texto = '';
  let rotulo = 'fechada';

  if (jogo.aberta[i] && jogo.mina[i]) {
    classe += ' aberta mina explodiu';
    rotulo = 'mina que explodiu';
  } else if (jogo.aberta[i]) {
    classe += n ? ` aberta n${n}` : ' aberta';
    texto = n ? String(n) : '';
    rotulo = n ? `${n} ${n === 1 ? 'mina' : 'minas'} ao redor` : 'vazia';
  } else if (jogo.estado === 'perdeu' && jogo.mina[i] && !jogo.bandeira[i]) {
    classe += ' aberta mina';
    rotulo = 'mina';
  } else if (jogo.estado === 'perdeu' && jogo.bandeira[i] && !jogo.mina[i]) {
    classe += ' aberta bandeira-errada';
    rotulo = 'bandeira errada';
  } else if (jogo.bandeira[i]) {
    classe += ' bandeira';
    rotulo = 'bandeira';
  }

  botao.className = classe;
  botao.textContent = texto;
  const linha = Math.floor(i / jogo.colunas) + 1;
  const coluna = (i % jogo.colunas) + 1;
  botao.setAttribute('aria-label', `Linha ${linha}, coluna ${coluna}: ${rotulo}`);
}

function pintarTudo() {
  for (let i = 0; i < jogo.total; i++) pintar(i);
}

function atualizarPainel() {
  mostrarLed(el.ledMinas, jogo.minas - jogo.bandeiras, 'Minas restantes');
  mostrarLed(el.ledTempo, segundos, 'Tempo em segundos');
  desenharRosto(terminou() ? jogo.estado : 'normal');
  el.tabuleiro.classList.toggle('travado', terminou());
}

function mostrarRecorde() {
  const recorde = Number(ler(chaveRecorde()));
  el.recorde.textContent = recorde > 0 ? `Recorde: ${recorde} s` : 'Recorde: —';
}

function registrarRecorde() {
  const anterior = Number(ler(chaveRecorde()));
  const tempo = Math.max(1, segundos);
  if (!(anterior > 0) || tempo < anterior) gravar(chaveRecorde(), String(tempo));
  mostrarRecorde();
}

function pararCronometro() {
  clearInterval(cronometro);
  cronometro = null;
}

function iniciarCronometro() {
  cronometro = setInterval(() => {
    segundos = Math.min(999, segundos + 1);
    mostrarLed(el.ledTempo, segundos, 'Tempo em segundos');
  }, 1000);
}

function tremer() {
  el.janela.classList.remove('tremer');
  void el.janela.offsetWidth; // reinicia a animação
  el.janela.classList.add('tremer');
}

function ajustarTamanho() {
  const area = el.janela.parentElement;
  const estilo = getComputedStyle(area);
  const margens = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
  const moldura = el.janela.offsetWidth - el.tabuleiro.offsetWidth;
  const disponivel = area.clientWidth - margens - moldura;
  const lado = Math.max(20, Math.min(30, Math.floor(disponivel / jogo.colunas)));
  el.janela.style.setProperty('--casa', `${lado}px`);
}

function novoJogo(id = nivelId) {
  nivelId = id;
  gravar(CHAVE_NIVEL, id);
  jogo = criarJogo(NIVEIS[id]);
  pararCronometro();
  segundos = 0;
  focavel = 0;

  botoesNivel.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.nivel === id)));
  el.tabuleiro.style.setProperty('--colunas', jogo.colunas);

  const casas = Array.from({ length: jogo.total }, (_, i) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.dataset.i = i;
    botao.tabIndex = i === 0 ? 0 : -1;
    return botao;
  });
  el.tabuleiro.replaceChildren(...casas);
  ajustarTamanho(); // depois de criar as casas: a medida da moldura depende do tabuleiro montado

  pintarTudo();
  el.status.textContent = '';
  mostrarRecorde();
  atualizarPainel();
}

function depoisDaJogada(mudou) {
  if (jogo.estado === 'jogando' && !cronometro) iniciarCronometro();
  if (terminou()) {
    pararCronometro();
    pintarTudo();
    if (jogo.estado === 'venceu') {
      registrarRecorde();
      el.status.textContent = `Você venceu em ${Math.max(1, segundos)} s!`;
    } else {
      el.status.textContent = 'Fim de jogo. Clique na carinha.';
      tremer();
    }
  } else {
    mudou.forEach(pintar);
  }
  atualizarPainel();
}

function marcar(i) {
  if (!alternarBandeira(jogo, i)) return false;
  pintar(i);
  atualizarPainel();
  return true;
}

/* ---------- Eventos do tabuleiro ---------- */

el.tabuleiro.addEventListener('click', (e) => {
  const i = indiceDe(e.target);
  if (i < 0) return;
  if (ignorarClique) {
    ignorarClique = false;
    return;
  }
  if (jogo.aberta[i]) depoisDaJogada(acorde(jogo, i));
  else if (modoBandeira) marcar(i);
  else depoisDaJogada(abrir(jogo, i));
});

el.tabuleiro.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  // No toque, a bandeira vem do temporizador de toque longo; o contextmenu chegaria em dobro.
  if (ultimoPonteiro === 'touch') return;
  const i = indiceDe(e.target);
  if (i >= 0) marcar(i);
});

function cancelarToqueLongo() {
  if (toqueLongo) clearTimeout(toqueLongo.id);
  toqueLongo = null;
}

el.tabuleiro.addEventListener('pointerdown', (e) => {
  ultimoPonteiro = e.pointerType;
  ignorarClique = false;
  const i = indiceDe(e.target);
  if (i < 0 || terminou()) return;

  if (e.pointerType === 'touch') {
    cancelarToqueLongo();
    const id = setTimeout(() => {
      toqueLongo = null;
      if (marcar(i)) {
        ignorarClique = true;
        navigator.vibrate?.(30);
      }
    }, TOQUE_LONGO_MS);
    toqueLongo = { id, x: e.clientX, y: e.clientY };
  } else if (e.button === 0 && !jogo.aberta[i] && !jogo.bandeira[i]) {
    desenharRosto('espanto');
  }
});

el.tabuleiro.addEventListener('pointermove', (e) => {
  if (toqueLongo && Math.hypot(e.clientX - toqueLongo.x, e.clientY - toqueLongo.y) > 10) cancelarToqueLongo();
});

for (const evento of ['pointerup', 'pointercancel']) {
  window.addEventListener(evento, () => {
    cancelarToqueLongo();
    desenharRosto(terminou() ? jogo.estado : 'normal');
  });
}

el.tabuleiro.addEventListener('focusin', (e) => {
  const i = indiceDe(e.target);
  if (i < 0 || i === focavel) return;
  casa(focavel).tabIndex = -1;
  casa(i).tabIndex = 0;
  focavel = i;
});

el.tabuleiro.addEventListener('keydown', (e) => {
  const i = indiceDe(e.target);
  if (i < 0) return;
  const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -jogo.colunas, ArrowDown: jogo.colunas }[e.key];
  if (passo) {
    e.preventDefault();
    const destino = i + passo;
    const mesmaLinha = Math.floor(destino / jogo.colunas) === Math.floor(i / jogo.colunas);
    if (destino >= 0 && destino < jogo.total && (Math.abs(passo) !== 1 || mesmaLinha)) casa(destino).focus();
  } else if (e.key === 'f' || e.key === 'F') {
    marcar(i);
  }
});

/* ---------- Controles da janela ---------- */

const menuJogo = $('menu-jogo');

el.rosto.addEventListener('click', () => novoJogo());
$('menu-novo').addEventListener('click', () => {
  menuJogo.open = false;
  novoJogo();
});
botoesNivel.forEach((b) =>
  b.addEventListener('click', () => {
    menuJogo.open = false;
    novoJogo(b.dataset.nivel);
  }),
);

// Clicar fora só fecha o menu: se o clique cair no tabuleiro, ele não abre uma casa.
document.addEventListener('pointerdown', (e) => {
  if (!menuJogo.open || menuJogo.contains(e.target)) return;
  menuJogo.open = false;
  if (el.tabuleiro.contains(e.target)) ignorarClique = true;
});

el.modoBandeira.addEventListener('click', () => {
  modoBandeira = !modoBandeira;
  el.modoBandeira.setAttribute('aria-pressed', String(modoBandeira));
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'F2') {
    e.preventDefault();
    novoJogo();
  } else if (e.key === 'Escape') {
    menuJogo.open = false;
  }
});

window.addEventListener('resize', ajustarTamanho);

function atualizarRelogio() {
  el.relogio.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

criarLed(el.ledMinas);
criarLed(el.ledTempo);
atualizarRelogio();
setInterval(atualizarRelogio, 15000);
novoJogo();
