// Conteúdo das páginas públicas. Quem monta o HTML é scripts/gerar-site.mjs.
// Preços: os mesmos de billing_plans (migration 0050). Mudou lá, muda aqui.

export const SITE = {
  origem: 'https://avalixfit.com.br',
  email: 'contato@avalixfit.com.br',
}

const ATUALIZADA = '2026-11-10'
// IMC, frequência cardíaca, PAR-Q e ficha de treino; a landing ganhou os cartões
const NOVAS = '2026-11-11'

function esc(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function perguntasHtml(perguntas, titulo = 'Perguntas frequentes') {
  return `<section class="secao" aria-labelledby="perguntas">
        <div class="envoltorio">
          <div class="cabeca-secao"><h2 id="perguntas">${titulo}</h2></div>
          <div class="perguntas">
            ${perguntas.map(([q, r]) => `<details>
              <summary>${esc(q)}</summary>
              <p>${r}</p>
            </details>`).join('\n            ')}
          </div>
        </div>
      </section>`
}

function chamada(titulo, texto) {
  return `<section class="secao">
        <div class="envoltorio">
          <div class="chamada">
            <div>
              <h2>${titulo}</h2>
              <p>${texto}</p>
            </div>
            <div class="acoes">
              <a class="botao" href="/cadastro">Testar 14 dias grátis</a>
              <span class="nota">Sem cartão de crédito</span>
            </div>
          </div>
        </div>
      </section>`
}

// ------------------------------------------------------------------ planos

const PLANOS = [
  { nome: 'Até 30', alunos: 'Até 30 alunos ativos', mensal: 19.9, anual: 159 },
  { nome: 'Até 100', alunos: 'Até 100 alunos ativos', mensal: 39.9, anual: 319 },
  { nome: 'Ilimitado', alunos: 'Alunos ilimitados', mensal: 100, anual: 799 },
]

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brl = (v) => BRL.format(v).replace(/,00$/, '').replace(/\u00a0/g, ' ')

function planoHtml(p) {
  const mensal = `${brl(p.mensal)} <small>/mês</small>`
  const anual = `${brl(p.anual)} <small>/ano</small>`
  const gratis = Math.round((p.mensal * 12 - p.anual) / p.mensal)
  const detalheMensal = `ou ${brl(p.anual)} no plano anual`
  const detalheAnual = `Equivale a ${brl(Math.round((p.anual / 12) * 100) / 100)} por mês, ${gratis} meses grátis`
  return `<article class="plano">
              <h3>${p.nome}</h3>
              <p class="rotulo">${p.alunos}</p>
              <p class="preco" data-mensal="${esc(mensal)}" data-anual="${esc(anual)}">${mensal}</p>
              <p class="detalhe" data-detalhe-mensal="${esc(detalheMensal)}" data-detalhe-anual="${esc(detalheAnual)}">${detalheMensal}</p>
              <a class="botao" href="/cadastro">Testar grátis</a>
            </article>`
}

// ------------------------------------------------------------------ ficha (assinatura da landing)

// Esqueleto da vista anterior como sai da detecção de pose: pontos de
// referência, linha de prumo e as linhas de nível de ombros e pelve. O ombro
// direito do avaliado (à esquerda de quem olha) está 4 px acima: 3,4°.
const P = {
  cabeca: [100, 40], pescoco: [100, 66],
  ombroD: [66, 88], ombroE: [134, 92],
  cotoveloD: [57, 148], cotoveloE: [145, 150],
  punhoD: [52, 202], punhoE: [150, 204],
  quadrilD: [78, 192], quadrilE: [122, 192],
  joelhoD: [80, 264], joelhoE: [120, 264],
  tornozeloD: [83, 332], tornozeloE: [117, 332],
}
const OSSOS = [
  ['pescoco', 'ombroD'], ['pescoco', 'ombroE'],
  ['ombroD', 'cotoveloD'], ['cotoveloD', 'punhoD'],
  ['ombroE', 'cotoveloE'], ['cotoveloE', 'punhoE'],
  ['ombroD', 'quadrilD'], ['ombroE', 'quadrilE'], ['quadrilD', 'quadrilE'],
  ['quadrilD', 'joelhoD'], ['joelhoD', 'tornozeloD'],
  ['quadrilE', 'joelhoE'], ['joelhoE', 'tornozeloE'],
]

function posturaSvg() {
  const ossos = OSSOS.map(([a, b]) =>
    `<line class="osso" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" />`).join('')
  const pontos = Object.entries(P)
    .filter(([k]) => k !== 'pescoco' && k !== 'cabeca')
    .map(([, [x, y]]) => `<circle class="ponto" cx="${x}" cy="${y}" r="4" />`).join('')
  return `<svg class="postura" viewBox="0 0 200 360" role="img" aria-labelledby="postura-titulo">
                <title id="postura-titulo">Esqueleto da avaliação postural, vista anterior, com linha de prumo e ombro direito mais alto</title>
                <line class="prumo" x1="100" y1="6" x2="100" y2="352" />
                <line class="nivel" x1="40" y1="${P.ombroD[1] - 0.8}" x2="160" y2="${P.ombroE[1] + 0.8}" />
                <line class="nivel" x1="50" y1="192" x2="150" y2="192" />
                <circle class="osso" cx="100" cy="40" r="17" />
                ${ossos}
                ${pontos}
                <text x="163" y="94">3,4°</text>
                <text x="153" y="196">0°</text>
                <text x="104" y="356">prumo</text>
              </svg>`
}

function fichaHtml() {
  return `<figure class="ficha" aria-label="Exemplo de avaliação no Avalix">
            <figcaption class="ficha-cabeca">
              <span><strong>Mariana</strong> · 34 anos · 62,4 kg</span>
              <span class="nota">Exemplo</span>
            </figcaption>
            ${posturaSvg()}
            <div class="leituras">
              <div>
                <p class="rotulo">Postura, vista anterior</p>
                <dl>
                  <dt><span class="marcador" aria-hidden="true"></span>Ombros</dt><dd>3,4°</dd>
                  <dt><span class="marcador" aria-hidden="true"></span>Pelve</dt><dd>0°</dd>
                  <dt>Cabeça</dt><dd>no prumo</dd>
                </dl>
                <p class="nota">Ombro direito mais alto.</p>
              </div>
              <div>
                <p class="rotulo">Dobras, Pollock 7 (mm)</p>
                <dl>
                  <dt>Peitoral</dt><dd>9</dd>
                  <dt>Axilar média</dt><dd>11</dd>
                  <dt>Tríceps</dt><dd>18</dd>
                  <dt>Subescapular</dt><dd>14</dd>
                  <dt>Abdominal</dt><dd>21</dd>
                  <dt>Supra-ilíaca</dt><dd>15</dd>
                  <dt>Coxa</dt><dd>24</dd>
                </dl>
              </div>
              <div class="resultado">
                <strong>22,8%</strong>
                <span>gordura corporal · <span class="nota">massa magra 48,2 kg</span></span>
              </div>
            </div>
          </figure>`
}

// ------------------------------------------------------------------ landing

const PERGUNTAS_LANDING = [
  ['Preciso de cartão de crédito para testar?',
    'Não. São 14 dias com todos os recursos liberados, sem cartão. Você só informa a forma de pagamento se decidir assinar.'],
  ['O que acontece se eu não assinar depois do teste?',
    'Nada é apagado. A conta fica só leitura: você continua vendo e exportando as avaliações e os treinos, mas não cria nem edita até assinar.'],
  ['O aluno precisa baixar aplicativo ou criar conta?',
    'Não. Ele recebe um link (pelo WhatsApp, por exemplo) e abre a anamnese ou o treino direto no navegador do celular. Se quiser, adiciona o treino à tela inicial e ele funciona como um app.'],
  ['Funciona no celular?',
    'Sim. O Avalix roda no navegador do celular, do tablet e do computador, e pode ser instalado como app. O aluno registra o treino até sem internet; as séries sobem quando o sinal volta.'],
  ['Como é feito o pagamento?',
    'Por cartão de crédito, com cobrança automática, ou por Pix, com uma fatura a cada ciclo. Há plano mensal e anual; o anual sai pelo preço de 8 meses.'],
  ['Posso cancelar quando quiser?',
    'Sim, sem multa, pelo próprio app. O acesso continua até o fim do período pago. Em até 7 dias da primeira cobrança você pode pedir o reembolso integral.'],
  ['Como fica a LGPD com dados de saúde dos alunos?',
    'O aluno aceita o termo de consentimento antes de responder a anamnese, e o Avalix guarda o registro do aceite com a versão do texto. Você pode corrigir, exportar e excluir os dados de um aluno, e ativar a verificação em duas etapas na sua conta.'],
]

const landing = {
  arquivo: 'inicio.html',
  rota: '/',
  atualizada: NOVAS,
  titulo: 'Avalix · Avaliação física, postural e treino para personal trainer',
  tituloSocial: 'Avalix · Avaliação física e postural',
  descricao:
    'Anamnese por link, avaliação física por dobras e circunferências, avaliação postural por foto, treino no celular do aluno e laudo em PDF com a sua marca. 14 dias grátis, sem cartão.',
  perguntas: PERGUNTAS_LANDING,
  scripts: ['/site/precos.js'],
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Avalix',
      url: `${SITE.origem}/`,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'Web, Android, iOS',
      inLanguage: 'pt-BR',
      description:
        'Software de avaliação física e postural, anamnese e prescrição de treino para profissionais de Educação Física.',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'BRL',
        lowPrice: '19.90',
        highPrice: '100.00',
        offerCount: 3,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Avalix',
      url: `${SITE.origem}/`,
      logo: `${SITE.origem}/pwa-512.png`,
      email: SITE.email,
    },
  ],
  corpo: `<section class="hero">
        <div class="envoltorio">
          <div class="hero-texto">
            <h1>Avaliação física, postural e treino do aluno num lugar só.</h1>
            <p class="lide">O aluno responde a anamnese pelo link, você mede e o Avalix calcula, compara e monta o laudo com a sua marca. O treino vai para o celular dele, e cada sessão registrada volta para você.</p>
            <div class="acoes">
              <a class="botao" href="/cadastro">Testar 14 dias grátis</a>
              <a class="botao secundario" href="#como-funciona">Ver como funciona</a>
            </div>
            <p class="nota">Sem cartão de crédito. A partir de R$ 19,90 por mês.</p>
          </div>
          ${fichaHtml()}
        </div>
      </section>

      <section class="secao" id="como-funciona" aria-labelledby="como-funciona-titulo">
        <div class="envoltorio">
          <div class="cabeca-secao">
            <h2 id="como-funciona-titulo">Do primeiro contato à reavaliação</h2>
            <p class="lide">O caminho de um aluno no Avalix, na ordem em que ele acontece no seu atendimento.</p>
          </div>
          <ol class="fluxo">
            <li><h3>Anamnese por link</h3><p>Você manda o link pelo WhatsApp. O aluno responde PAR-Q, histórico de saúde, dores e objetivos no celular, e os sinais de alerta chegam destacados para você.</p></li>
            <li><h3>Avaliação física</h3><p>Peso, altura, dobras e circunferências. Escolha o protocolo e o percentual de gordura, a massa magra e o IMC saem na hora.</p></li>
            <li><h3>Avaliação postural</h3><p>Fotos de frente, costas e perfil. Um toque marca os pontos do corpo; você ajusta, mede e anota o que viu.</p></li>
            <li><h3>Treino</h3><p>Monte o mesociclo semana a semana. O Avalix soma o volume por músculo e aponta os exercícios que a anamnese pede para revisar.</p></li>
            <li><h3>Execução e reavaliação</h3><p>O aluno registra cargas e repetições no celular. Você acompanha a adesão, e o painel lembra quem está há 90 dias sem reavaliar.</p></li>
          </ol>
        </div>
      </section>

      <section class="secao" id="recursos" aria-labelledby="recursos-titulo">
        <div class="envoltorio">
          <div class="cabeca-secao">
            <h2 id="recursos-titulo">O que você faz com o Avalix</h2>
          </div>
          <div class="recursos">
            <article class="recurso">
              <h3>Avaliação física com os protocolos de sempre</h3>
              <p>Jackson &amp; Pollock de 3 e 7 dobras, Durnin-Womersley e US Navy, com a equação de Siri. As fórmulas são conferidas contra as fontes publicadas.</p>
              <a class="mais" href="/avaliacao-fisica">Avaliação física no Avalix →</a>
            </article>
            <article class="recurso">
              <h3>Avaliação postural por foto</h3>
              <p>Pontos de referência marcados com um toque, linhas, ângulos e anotações sobre a imagem. A comparação entre avaliações mostra o que mudou.</p>
              <a class="mais" href="/avaliacao-postural">Avaliação postural no Avalix →</a>
            </article>
            <article class="recurso">
              <h3>Treino no celular do aluno</h3>
              <p>O aluno abre o treino pelo link, vê a carga da última vez, marca as séries e o descanso, e o registro chega para você. Funciona sem internet.</p>
              <a class="mais" href="/app-para-personal-trainer">Treino e app do aluno →</a>
            </article>
            <article class="recurso">
              <h3>Laudo e evolução com a sua marca</h3>
              <p>PDF da avaliação e do treino com a sua logo, pronto para mandar ao aluno. A evolução entre avaliações aparece lado a lado, medida por medida.</p>
              <ul>
                <li>Comparação entre avaliações</li>
                <li>Agenda de atendimentos</li>
                <li>Verificação em duas etapas na conta</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section class="secao" id="ferramentas" aria-labelledby="ferramentas-titulo">
        <div class="envoltorio">
          <div class="cabeca-secao">
            <h2 id="ferramentas-titulo">Ferramentas grátis</h2>
            <p class="lide">Sem cadastro, direto no navegador. As mesmas fórmulas que o Avalix usa.</p>
          </div>
          <div class="ferramentas">
            <a class="ferramenta" href="/calculadora-1rm">
              <h3>Calculadora de 1RM</h3>
              <p>Carga máxima estimada por Epley ou Brzycki, com a tabela de percentuais para montar o treino.</p>
              <span class="mais">Calcular 1RM →</span>
            </a>
            <a class="ferramenta" href="/calculadora-percentual-de-gordura">
              <h3>Percentual de gordura</h3>
              <p>Jackson &amp; Pollock 3 ou 7 dobras e US Navy, com massa gorda e massa magra.</p>
              <span class="mais">Calcular percentual →</span>
            </a>
            <a class="ferramenta" href="/modelo-de-anamnese">
              <h3>Modelo de anamnese</h3>
              <p>Roteiro completo para a primeira conversa com o aluno, com PAR-Q e sinais de alerta. Dá para imprimir.</p>
              <span class="mais">Ver o modelo →</span>
            </a>
            <a class="ferramenta" href="/calculadora-imc">
              <h3>IMC e cintura</h3>
              <p>IMC com a faixa da OMS, relação cintura-quadril e cintura-estatura.</p>
              <span class="mais">Calcular IMC →</span>
            </a>
            <a class="ferramenta" href="/calculadora-frequencia-cardiaca">
              <h3>Frequência cardíaca de treino</h3>
              <p>FC máxima por Tanaka ou 220 − idade e as cinco zonas pela FC de reserva (Karvonen).</p>
              <span class="mais">Calcular zonas →</span>
            </a>
            <a class="ferramenta" href="/questionario-par-q">
              <h3>Questionário PAR-Q</h3>
              <p>As 7 perguntas de prontidão para atividade física, com sim, não e assinatura. Para imprimir.</p>
              <span class="mais">Ver o PAR-Q →</span>
            </a>
            <a class="ferramenta" href="/modelo-de-ficha-de-treino">
              <h3>Modelo de ficha de treino</h3>
              <p>Ficha em branco com treinos A, B e C, séries, repetições, carga e descanso.</p>
              <span class="mais">Ver a ficha →</span>
            </a>
          </div>
        </div>
      </section>

      <section class="secao" id="precos" aria-labelledby="precos-titulo">
        <div class="envoltorio">
          <div class="cabeca-secao">
            <h2 id="precos-titulo">Preços</h2>
            <p class="lide">Todos os planos têm todos os recursos. O que muda é quantos alunos ativos você acompanha.</p>
          </div>
          <div class="ciclo" data-ciclo role="group" aria-label="Ciclo de cobrança" hidden>
            <button type="button" data-valor="mensal" aria-pressed="true">Mensal</button>
            <button type="button" data-valor="anual" aria-pressed="false">Anual</button>
          </div>
          <div class="planos">
            ${PLANOS.map(planoHtml).join('\n            ')}
          </div>
          <p class="incluso">Teste grátis de 14 dias, sem cartão. Pagamento por cartão ou Pix. Cancelamento sem multa, pelo próprio app. Aluno inativo não conta no limite do plano.</p>
        </div>
      </section>

      ${perguntasHtml(PERGUNTAS_LANDING)}

      ${chamada('Faça a próxima avaliação no Avalix', 'Cadastre-se, mande o link da anamnese para um aluno e veja o laudo pronto ainda hoje.')}`,
}

// ------------------------------------------------------------------ avaliação física

const avaliacaoFisica = {
  arquivo: 'avaliacao-fisica.html',
  rota: '/avaliacao-fisica',
  atualizada: ATUALIZADA,
  migalha: 'Avaliação física',
  titulo: 'Software de avaliação física para personal trainer · Avalix',
  descricao:
    'Avaliação física com Jackson & Pollock 3 e 7 dobras, Durnin-Womersley e US Navy. Percentual de gordura, massa magra, comparação entre avaliações e laudo em PDF com a sua marca.',
  perguntas: [
    ['Quais protocolos de dobras cutâneas o Avalix tem?',
      'Jackson &amp; Pollock de 7 dobras, Jackson &amp; Pollock de 3 dobras para homens, Jackson, Pollock &amp; Ward de 3 dobras para mulheres e Durnin-Womersley de 4 dobras. A densidade corporal vira percentual de gordura pela equação de Siri.'],
    ['Dá para avaliar sem adipômetro?',
      'Sim. O protocolo da US Navy usa só circunferências (pescoço, abdômen ou cintura e, nas mulheres, quadril) e a altura.'],
    ['O aluno recebe o resultado?',
      'Você gera o laudo em PDF com a sua logo e manda para ele. O laudo mostra as medidas, o percentual de gordura e a evolução desde a avaliação anterior.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Avaliação física sem planilha: mede, calcula e o laudo sai pronto.</h1>
        <p class="lide">Peso, altura, dobras e circunferências entram no Avalix e o percentual de gordura, a massa magra e a evolução saem na hora, no protocolo que você escolher.</p>
        <div class="acoes"><a class="botao" href="/cadastro">Testar 14 dias grátis</a><a class="botao secundario" href="/calculadora-percentual-de-gordura">Usar a calculadora grátis</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Os protocolos que você já usa</h2>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Protocolo</th><th scope="col">Medidas</th><th scope="col">Para quem</th></tr></thead>
              <tbody>
                <tr><td>Jackson &amp; Pollock 7 dobras</td><td>Peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca e coxa</td><td>Homens e mulheres</td></tr>
                <tr><td>Jackson &amp; Pollock 3 dobras</td><td>Peitoral, abdominal e coxa</td><td>Homens</td></tr>
                <tr><td>Jackson, Pollock &amp; Ward 3 dobras</td><td>Tríceps, supra-ilíaca e coxa</td><td>Mulheres</td></tr>
                <tr><td>Durnin-Womersley 4 dobras</td><td>Bíceps, tríceps, subescapular e supra-ilíaca</td><td>Homens e mulheres, por faixa etária</td></tr>
                <tr><td>US Navy</td><td>Altura, pescoço, abdômen ou cintura e quadril</td><td>Sem adipômetro</td></tr>
              </tbody>
            </table>
          </div>
          <p>Os coeficientes de cada equação foram conferidos contra as publicações originais e são testados com valores de referência a cada versão do app.</p>

          <h2>Evolução que o aluno entende</h2>
          <p>Cada avaliação nova fica ao lado da anterior. Você vê, medida por medida, o que subiu e o que desceu, e o Avalix só compara o que é comparável: protocolos diferentes não viram uma linha de gráfico enganosa.</p>

          <h2>Laudo em PDF com a sua marca</h2>
          <p>Envie a sua logo uma vez e todo laudo sai com ela: dados do aluno, medidas, composição corporal e a comparação com a avaliação anterior. É o material que o aluno mostra para os outros.</p>

          <h2>A avaliação conversa com o treino</h2>
          <p>A anamnese e a avaliação ficam no mesmo cadastro do aluno. Na hora de montar o treino, o Avalix destaca os exercícios que pedem cuidado pela queixa de dor, pela lesão anterior ou pela alteração postural registrada.</p>
          <ul>
            <li>Lembrete de reavaliação para quem passou de 90 dias</li>
            <li>Liberação médica registrada quando o PAR-Q pede</li>
            <li>Funciona no celular, no tablet e no computador</li>
          </ul>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Faça a próxima avaliação no Avalix', 'Teste grátis por 14 dias, com todos os recursos e sem cartão.')}`,
}

// ------------------------------------------------------------------ avaliação postural

const avaliacaoPostural = {
  arquivo: 'avaliacao-postural.html',
  rota: '/avaliacao-postural',
  atualizada: ATUALIZADA,
  migalha: 'Avaliação postural',
  titulo: 'Avaliação postural por foto, com marcação dos pontos · Avalix',
  descricao:
    'Avaliação postural por foto nas vistas anterior, posterior e lateral. Pontos do corpo marcados com um toque, linhas, ângulos, anotações e comparação entre avaliações.',
  perguntas: [
    ['Preciso de equipamento especial para a avaliação postural?',
      'Não. Basta o celular: você fotografa e envia a foto pelo próprio Avalix. Um fundo liso e o aluno com roupa justa ajudam a marcação dos pontos.'],
    ['A marcação automática substitui o olhar do profissional?',
      'Não. Ela adianta o trabalho de posicionar os pontos. Você confere, ajusta o que for preciso e registra a sua análise.'],
    ['As fotos ficam guardadas com segurança?',
      'Ficam no cadastro do aluno, acessíveis só para a sua conta, e o aluno aceita o termo de consentimento antes. Você pode excluí-las quando quiser.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Avaliação postural por foto, com os pontos do corpo marcados em um toque.</h1>
        <p class="lide">Fotografe o aluno com o celular. O Avalix encontra ombros, quadris, joelhos e tornozelos, e você ajusta, mede os ângulos e anota.</p>
        <div class="acoes"><a class="botao" href="/cadastro">Testar 14 dias grátis</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Como funciona</h2>
          <ol>
            <li>Fotografe o aluno de frente, de costas e de perfil e envie as fotos pelo Avalix.</li>
            <li>Toque em Detectar pontos: a detecção de pose marca os pontos de referência na foto, direto no aparelho.</li>
            <li>Você confere, ajusta o que precisar e marca pontos, linhas e ângulos sobre a imagem.</li>
            <li>A análise entra no laudo e fica no cadastro do aluno para a próxima comparação.</li>
          </ol>

          <h2>Comparação que mostra o resultado</h2>
          <p>Coloque as fotos de hoje ao lado das da avaliação anterior. A diferença na inclinação dos ombros ou da pelve fica visível, e o aluno enxerga o motivo do trabalho corretivo.</p>

          <h2>Achados que viram prescrição</h2>
          <p>Hipercifose, hiperlordose e escoliose informadas na anamnese aparecem como ênfase sugerida na hora de montar o treino. É uma sugestão para você revisar, não uma regra automática.</p>

          <h2>Privacidade das fotos</h2>
          <p>As fotos ficam no cadastro do aluno, só para a sua conta. O aluno aceita o termo de consentimento antes da avaliação, e o Avalix guarda o registro desse aceite.</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Faça a próxima avaliação postural no Avalix', 'Teste grátis por 14 dias, com todos os recursos e sem cartão.')}`,
}

// ------------------------------------------------------------------ treino e app do aluno

const appPersonal = {
  arquivo: 'app-para-personal-trainer.html',
  rota: '/app-para-personal-trainer',
  atualizada: ATUALIZADA,
  migalha: 'Treino e app do aluno',
  titulo: 'App para personal trainer: treino no celular do aluno · Avalix',
  descricao:
    'Monte o mesociclo por semanas, mande o treino por link e acompanhe cada sessão: o aluno registra cargas, repetições e descanso no celular, até sem internet.',
  perguntas: [
    ['O aluno precisa instalar alguma coisa?',
      'Não. Ele abre o treino pelo link no navegador do celular. Se quiser, adiciona à tela inicial e o treino abre como um app, inclusive sem internet.'],
    ['Consigo ver o que o aluno fez?',
      'Sim. Cada sessão registrada aparece para você com data, cargas, repetições, descanso e como o aluno se sentiu. A adesão ao plano fica visível no painel.'],
    ['Dá para usar o treino com alunos presenciais?',
      'Sim. Você mesmo pode registrar a sessão durante o atendimento, com cronômetro de descanso e a carga da última vez em cada série.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>O treino no celular do aluno, e cada série de volta para você.</h1>
        <p class="lide">Monte o mesociclo, mande o link e acompanhe: o aluno vê o treino do dia, a carga da última vez e o descanso, e registra tudo ali mesmo.</p>
        <div class="acoes"><a class="botao" href="/cadastro">Testar 14 dias grátis</a><a class="botao secundario" href="/calculadora-1rm">Calcular 1RM grátis</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Montagem do treino</h2>
          <ul>
            <li>Divisões (A, B, C…) e a sequência da semana, inclusive repetindo divisão.</li>
            <li>Séries, repetições, RIR, descanso, cadência, bi-set e circuito, e técnicas como drop-set, rest-pause e cluster.</li>
            <li>Ajuste por semana do mesociclo: semana de adaptação, deload, progressão.</li>
            <li>Catálogo de exercícios com vídeo de demonstração, e os seus próprios exercícios.</li>
            <li>Volume semanal por músculo comparado com as faixas de referência (mínimo efetivo e máximo recuperável).</li>
          </ul>

          <h2>O que o aluno vê</h2>
          <p>O link abre o treino do dia na divisão certa. Para cada exercício, a prescrição da semana e o que ele levantou da última vez, série por série. Ele marca as séries, o descanso e se chegou à falha, e no fim diz como se sentiu.</p>
          <p>Sem sinal na academia? O treino continua abrindo e as séries ficam guardadas no aparelho até a internet voltar.</p>

          <h2>O que você acompanha</h2>
          <p>Cada sessão registrada aparece no cadastro do aluno. O painel mostra quem está treinando, quem sumiu e quem precisa de reavaliação, e o PDF do treino sai com a sua marca para quem prefere papel.</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Mande o primeiro treino pelo Avalix', 'Teste grátis por 14 dias, com todos os recursos e sem cartão.')}`,
}

// ------------------------------------------------------------------ calculadora de 1RM

const calc1rm = {
  arquivo: 'calculadora-1rm.html',
  rota: '/calculadora-1rm',
  atualizada: ATUALIZADA,
  migalha: 'Calculadora de 1RM',
  titulo: 'Calculadora de 1RM grátis (Epley e Brzycki) · Avalix',
  descricao:
    'Calcule a carga máxima estimada (1RM) a partir da carga e das repetições, pelas fórmulas de Epley ou Brzycki, com a tabela de percentuais para prescrever o treino.',
  scripts: ['/site/calculadora-1rm.js'],
  perguntas: [
    ['O que é 1RM?',
      'É a maior carga que a pessoa consegue levantar uma única vez, com execução correta. Serve de referência para prescrever a intensidade do treino em percentual.'],
    ['Qual fórmula usar, Epley ou Brzycki?',
      'As duas dão resultados próximos até cerca de 10 repetições. Epley tende a estimar um pouco mais alto em séries longas. O importante é usar sempre a mesma fórmula para acompanhar o mesmo aluno.'],
    ['Até quantas repetições a estimativa é confiável?',
      'A precisão é boa entre 2 e 10 repetições e cai acima de 12. Para estimar a 1RM, use uma série levada perto da falha, com 3 a 8 repetições.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Calculadora de 1RM</h1>
        <p class="lide">Informe a carga e quantas repetições o aluno fez até perto da falha. A carga máxima estimada e a tabela de percentuais aparecem na hora.</p>
      </header>

      <section class="envoltorio">
        <div class="calculadora">
          <form class="painel" id="form-1rm" novalidate>
            <div class="campos">
              <div class="campo">
                <label for="carga">Carga (kg)</label>
                <input id="carga" name="carga" inputmode="decimal" autocomplete="off" placeholder="80" />
              </div>
              <div class="campo">
                <label for="reps">Repetições</label>
                <input id="reps" name="reps" inputmode="numeric" autocomplete="off" placeholder="8" />
              </div>
              <fieldset class="campo inteiro">
                <legend>Fórmula</legend>
                <div class="opcoes">
                  <label><input type="radio" name="formula" value="epley" checked /> Epley</label>
                  <label><input type="radio" name="formula" value="brzycki" /> Brzycki</label>
                </div>
              </fieldset>
            </div>
            <p class="aviso-calc">Epley: 1RM = carga × (1 + reps ÷ 30). Brzycki: 1RM = carga × 36 ÷ (37 − reps).</p>
          </form>
          <div class="painel" aria-live="polite">
            <div class="resultado-calc">
              <span class="rotulo">1RM estimada</span>
              <span class="valor numero" id="valor-1rm">—</span>
              <p class="aviso-calc" id="nota-1rm">Preencha a carga e as repetições.</p>
            </div>
            <div class="rolagem">
              <table class="tabela" id="tabela-1rm" hidden>
                <caption class="rotulo" style="text-align:left;padding-bottom:6px">Carga por percentual, arredondada para 2,5 kg</caption>
                <thead><tr><th scope="col">% da 1RM</th><th scope="col">Carga</th><th scope="col">Repetições aproximadas</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Como usar a tabela no treino</h2>
          <p>Faixas comuns de prescrição: força máxima entre 85% e 100% da 1RM, hipertrofia entre 65% e 85%, e resistência abaixo de 65%. As repetições aproximadas de cada linha saem do inverso da fórmula de Epley e servem de ponto de partida, não de regra.</p>
          <p>Reavalie a 1RM a cada mesociclo. Com o aluno ganhando força, a mesma porcentagem passa a significar mais carga.</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Prescreva o treino com essas cargas no Avalix', 'O aluno vê a carga da última vez em cada série e registra o que fez, no celular.')}`,
}

// ------------------------------------------------------------------ percentual de gordura

const calcGordura = {
  arquivo: 'calculadora-percentual-de-gordura.html',
  rota: '/calculadora-percentual-de-gordura',
  atualizada: ATUALIZADA,
  migalha: 'Calculadora de percentual de gordura',
  titulo: 'Calculadora de percentual de gordura: Pollock e US Navy · Avalix',
  descricao:
    'Calcule o percentual de gordura por Jackson & Pollock de 3 ou 7 dobras ou pelo protocolo US Navy, com massa gorda e massa magra. Grátis e sem cadastro.',
  scripts: ['/site/calculadora-gordura.js'],
  perguntas: [
    ['Qual protocolo de dobras usar?',
      'Jackson &amp; Pollock de 7 dobras é o mais completo e serve para homens e mulheres. O de 3 dobras é mais rápido e usa pontos diferentes para cada sexo. Para acompanhar a evolução, repita sempre o mesmo protocolo, com o mesmo avaliador.'],
    ['Como converter densidade corporal em percentual de gordura?',
      'Esta calculadora usa a equação de Siri: percentual de gordura = 495 ÷ densidade − 450.'],
    ['O US Navy é confiável?',
      'É uma estimativa por circunferências, útil quando não há adipômetro. Costuma variar mais que as dobras, mas é bem reprodutível para acompanhar a mesma pessoa ao longo do tempo.'],
    ['Para qual faixa de idade as equações valem?',
      'As equações de Jackson &amp; Pollock foram desenvolvidas com adultos de 18 a 61 anos. Fora dessa faixa o resultado é menos preciso.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Calculadora de percentual de gordura</h1>
        <p class="lide">Escolha o protocolo, informe as medidas e veja o percentual de gordura, a massa gorda e a massa magra.</p>
      </header>

      <section class="envoltorio">
        <div class="calculadora">
          <form class="painel" id="form-gordura" novalidate>
            <div class="campos">
              <fieldset class="campo inteiro">
                <legend>Sexo</legend>
                <div class="opcoes">
                  <label><input type="radio" name="sexo" value="F" checked /> Feminino</label>
                  <label><input type="radio" name="sexo" value="M" /> Masculino</label>
                </div>
              </fieldset>
              <div class="campo inteiro">
                <label for="protocolo">Protocolo</label>
                <select id="protocolo" name="protocolo">
                  <option value="jp7">Jackson &amp; Pollock 7 dobras</option>
                  <option value="jp3">Jackson &amp; Pollock 3 dobras</option>
                  <option value="navy">US Navy (circunferências)</option>
                </select>
              </div>
              <div class="campo">
                <label for="idade">Idade (anos)</label>
                <input id="idade" name="idade" inputmode="numeric" autocomplete="off" placeholder="34" />
              </div>
              <div class="campo">
                <label for="peso">Peso (kg, opcional)</label>
                <input id="peso" name="peso" inputmode="decimal" autocomplete="off" placeholder="62,4" />
              </div>
            </div>
            <div class="campos" id="medidas"></div>
          </form>
          <div class="painel" aria-live="polite">
            <div class="resultado-calc">
              <span class="rotulo">Gordura corporal</span>
              <span class="valor numero" id="valor-gordura">—</span>
              <p class="aviso-calc" id="nota-gordura">Preencha as medidas.</p>
            </div>
            <table class="tabela" id="detalhe-gordura" hidden>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Onde medir cada dobra</h2>
          <p>Meça do lado direito do corpo, com o aluno em pé e relaxado. Pince a dobra com o polegar e o indicador, coloque o adipômetro 1 cm abaixo dos dedos e leia em 2 segundos. Faça duas ou três medidas por ponto e use a média.</p>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Dobra</th><th scope="col">Direção</th><th scope="col">Local</th></tr></thead>
              <tbody>
                <tr><td>Peitoral</td><td>Diagonal</td><td>Metade da distância entre a linha axilar anterior e o mamilo nos homens; um terço nas mulheres</td></tr>
                <tr><td>Axilar média</td><td>Vertical</td><td>Linha axilar média, na altura do processo xifoide</td></tr>
                <tr><td>Tríceps</td><td>Vertical</td><td>Face posterior do braço, no ponto médio entre o acrômio e o olécrano</td></tr>
                <tr><td>Subescapular</td><td>Diagonal</td><td>1 a 2 cm abaixo do ângulo inferior da escápula</td></tr>
                <tr><td>Abdominal</td><td>Vertical</td><td>2 cm à direita da cicatriz umbilical</td></tr>
                <tr><td>Supra-ilíaca</td><td>Diagonal</td><td>Logo acima da crista ilíaca, na linha axilar anterior</td></tr>
                <tr><td>Coxa</td><td>Vertical</td><td>Face anterior, no ponto médio entre a prega inguinal e a borda superior da patela</td></tr>
              </tbody>
            </table>
          </div>
          <h2>Medidas do US Navy</h2>
          <ul>
            <li><strong>Pescoço:</strong> logo abaixo da laringe, com a fita levemente inclinada para a frente.</li>
            <li><strong>Abdômen (homens):</strong> na altura do umbigo, ao fim de uma expiração normal.</li>
            <li><strong>Cintura (mulheres):</strong> no ponto mais estreito do tronco.</li>
            <li><strong>Quadril (mulheres):</strong> na maior circunferência dos glúteos.</li>
          </ul>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Guarde cada avaliação e veja a evolução', 'No Avalix o percentual sai na hora, fica no cadastro do aluno e vira laudo em PDF com a sua marca.')}`,
}

// ------------------------------------------------------------------ modelo de anamnese

const PARQ = [
  'Algum médico já disse que você tem condição cardíaca ou pressão alta?',
  'Sente dor no peito em repouso, no dia a dia ou durante esforço físico?',
  'Perdeu o equilíbrio por tontura ou perdeu a consciência nos últimos 12 meses?',
  'Tem outra condição crônica diagnosticada além de cardíaca ou pressão alta?',
  'Toma medicação prescrita para condição crônica?',
  'Tem problema ósseo, articular ou de tecido mole que piora com atividade física?',
  'Algum médico já disse que você só deve fazer atividade física sob supervisão médica?',
]

// Espaço de resposta: só aparece no papel (.so-impressao). Na tela a página
// segue como guia de leitura; impressa, vira ficha para preencher à mão.
function linhas(n) {
  return `<span class="resposta so-impressao" aria-hidden="true">${'<span></span>'.repeat(n)}</span>`
}
const SIM_NAO = '<span class="sim-nao so-impressao" aria-hidden="true"><span class="caixa">Sim</span><span class="caixa">Não</span></span>'
const itens = (lista) => lista.map(([t, n]) => `<li>${t}${linhas(n)}</li>`).join('\n            ')

const modeloAnamnese = {
  arquivo: 'modelo-de-anamnese.html',
  rota: '/modelo-de-anamnese',
  atualizada: NOVAS,
  migalha: 'Modelo de anamnese',
  titulo: 'Modelo de anamnese para personal trainer, com PAR-Q · Avalix',
  descricao:
    'Modelo de anamnese completo para a primeira conversa com o aluno: PAR-Q, histórico de saúde, dores e lesões, sinais de alerta, hábitos e objetivos. Grátis para imprimir.',
  scripts: ['/site/imprimir.js'],
  perguntas: [
    ['Qual a diferença entre anamnese e PAR-Q?',
      'O PAR-Q é um questionário curto de prontidão para atividade física, que indica quando pedir liberação médica. A anamnese é mais ampla: inclui o PAR-Q e também histórico, dores, hábitos, rotina e objetivos.'],
    ['Quando pedir liberação médica?',
      'Quando alguma resposta do PAR-Q for “sim”, quando houver sinais de alerta ou doença cardiovascular, metabólica ou renal com sintomas. Nesses casos, o aluno só começa depois da liberação.'],
    ['Com que frequência refazer a anamnese?',
      'Atualize a cada reavaliação, em média a cada 3 meses, e sempre que o aluno relatar dor nova, lesão, gestação, cirurgia ou mudança de medicação.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Modelo de anamnese para personal trainer</h1>
        <p class="lide">Roteiro completo para a primeira conversa com o aluno, na ordem em que as respostas mudam a sua conduta: primeiro a segurança, depois o histórico, por fim os objetivos.</p>
        <div class="acoes nao-imprimir"><button class="botao secundario" type="button" data-imprimir hidden>Imprimir o modelo</button></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>1. Identificação</h2>
          <ul>
            ${itens([
              ['Nome, data de nascimento e sexo', 1],
              ['Telefone e contato de emergência', 1],
              ['Profissão e rotina de trabalho (sentado, em pé, carga física)', 2],
              ['Lateralidade: destro, canhoto ou ambidestro', 1],
            ])}
          </ul>

          <h2>2. Prontidão para atividade física (PAR-Q)</h2>
          <p>Responda sim ou não. Qualquer “sim” pede conversa e, em geral, liberação médica antes de começar.</p>
          <ol>
            ${PARQ.map((q) => `<li>${q}${SIM_NAO}</li>`).join('\n            ')}
          </ol>

          <h2>3. Sinais de alerta</h2>
          <p>Algum destes nos últimos meses? Sinal presente: encaminhe ao médico antes de iniciar o treino.</p>
          <ul class="marcar">
            <li>Dor ou desconforto no peito</li>
            <li>Falta de ar anormal ao esforço ou em repouso, ou ao deitar</li>
            <li>Tontura ou desmaio</li>
            <li>Palpitações ou taquicardia</li>
            <li>Inchaço nos tornozelos</li>
            <li>Dor nas pernas ao caminhar</li>
            <li>Fadiga desproporcional ao esforço</li>
          </ul>

          <h2>4. Histórico de saúde</h2>
          <ul>
            ${itens([
              ['Doenças diagnosticadas: hipertensão, diabetes tipo 1 ou 2, dislipidemia, cardiopatia, doença renal, pulmonar (asma, DPOC), tireoidiana, reumática, osteoporose, neurológica, câncer atual ou prévio', 2],
              ['Medicamentos em uso, com dose', 2],
              ['Cirurgias e internações', 2],
              ['Gestação atual ou recente', 1],
              ['Alteração postural já diagnosticada: escoliose, hipercifose, hiperlordose', 1],
            ])}
          </ul>

          <h2>5. Dores e lesões</h2>
          <ul>
            ${itens([
              ['Região da dor (cervical, ombro, dorsal, lombar, quadril, joelho, tornozelo, cotovelo ou punho, lado direito ou esquerdo) e intensidade de 0 a 10', 2],
              ['Há quanto tempo: aguda (menos de 6 semanas), subaguda (6 a 12) ou crônica (mais de 12)', 1],
              ['Lesões anteriores: ligamento cruzado, menisco, manguito rotador, luxação recidivante, fratura no último ano, hérnia de disco, tendinopatia, estiramento grave', 2],
              ['Na dor de coluna, investigue: dor noturna que não alivia com repouso, perda de peso sem explicação, formigamento ou perda de força, febre, alteração no controle da bexiga ou do intestino, trauma recente', 2],
            ])}
          </ul>

          <h2>6. Hábitos</h2>
          <ul>
            ${itens([
              ['Experiência com treino: nunca treinou, menos de 6 meses, 6 a 24 meses, mais de 2 anos', 1],
              ['Atividade física atual e intensidade (leve, moderada, vigorosa)', 1],
              ['Sono (boa, regular, ruim), nível de estresse, tabagismo e consumo de álcool', 2],
            ])}
          </ul>

          <h2>7. Objetivos e rotina de treino</h2>
          <ul>
            ${itens([
              ['Objetivo principal: hipertrofia, composição corporal, saúde, performance, dor e reabilitação, correção postural, condicionamento, mobilidade, disposição', 2],
              ['Quantas vezes por semana e quanto tempo por sessão', 1],
              ['Onde vai treinar: academia, em casa, condomínio, ao ar livre', 1],
              ['Preferência: sessões curtas e intensas ou mais longas, com mais descanso', 1],
            ])}
          </ul>

          <h2>8. Consentimento</h2>
          <p>Dados de saúde são dados sensíveis pela LGPD. Registre o consentimento do aluno para a coleta e o uso das informações, com data e a versão do texto que ele leu.</p>
          <div class="preencher so-impressao" aria-hidden="true"><span>Assinatura do aluno</span><span>Data</span></div>

          <div class="so-impressao" aria-hidden="true">
            <h2>Observações do profissional</h2>
            ${linhas(8)}
          </div>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Mande este modelo por link e receba tudo organizado', 'No Avalix o aluno responde a anamnese no celular, aceita o termo de consentimento, e os sinais de alerta chegam destacados para você.')}`,
}

// ------------------------------------------------------------------ IMC e cintura

const calcImc = {
  arquivo: 'calculadora-imc.html',
  rota: '/calculadora-imc',
  atualizada: NOVAS,
  migalha: 'Calculadora de IMC',
  titulo: 'Calculadora de IMC, cintura e relação cintura-quadril · Avalix',
  descricao:
    'Calcule o IMC com a classificação da OMS e, com a cintura e o quadril, a relação cintura-quadril e a relação cintura-estatura. Grátis e sem cadastro.',
  scripts: ['/site/calculadora-imc.js'],
  perguntas: [
    ['O IMC serve para avaliar a composição corporal?',
      'Não sozinho. O IMC não separa massa magra de massa gorda: um aluno musculoso pode cair em sobrepeso sem excesso de gordura. Use junto com a cintura e, quando der, com o percentual de gordura por dobras.'],
    ['Quais são as faixas de IMC da OMS?',
      'Para adultos: abaixo de 18,5 é abaixo do peso; de 18,5 a 24,9, peso normal; de 25 a 29,9, sobrepeso; de 30 a 34,9, obesidade grau I; de 35 a 39,9, grau II; a partir de 40, grau III.'],
    ['E para menores de 18 anos?',
      'As faixas de adulto não valem. Dos 5 aos 19 anos a OMS classifica o IMC pela curva de idade e sexo (IMC para idade). Por isso a calculadora não classifica abaixo de 18 anos.'],
    ['Onde medir a cintura e o quadril?',
      'A OMS mede a cintura no ponto médio entre a última costela e a crista ilíaca, ao fim de uma expiração normal, e o quadril na maior circunferência dos glúteos. Use sempre os mesmos pontos para acompanhar o mesmo aluno.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Calculadora de IMC</h1>
        <p class="lide">Informe peso e altura para o IMC com a faixa da OMS. Com a cintura e o quadril, a calculadora mostra também a relação cintura-quadril e a cintura-estatura, que dizem mais sobre a gordura abdominal.</p>
      </header>

      <section class="envoltorio">
        <div class="calculadora">
          <form class="painel" id="form-imc" novalidate>
            <div class="campos">
              <fieldset class="campo inteiro">
                <legend>Sexo</legend>
                <div class="opcoes">
                  <label><input type="radio" name="sexo" value="F" checked /> Feminino</label>
                  <label><input type="radio" name="sexo" value="M" /> Masculino</label>
                </div>
              </fieldset>
              <div class="campo">
                <label for="peso">Peso (kg)</label>
                <input id="peso" name="peso" inputmode="decimal" autocomplete="off" placeholder="72,5" />
              </div>
              <div class="campo">
                <label for="altura">Altura (cm)</label>
                <input id="altura" name="altura" inputmode="decimal" autocomplete="off" placeholder="170" />
              </div>
              <div class="campo inteiro">
                <label for="idade">Idade (anos)</label>
                <input id="idade" name="idade" inputmode="numeric" autocomplete="off" placeholder="34" />
              </div>
              <div class="campo">
                <label for="cintura">Cintura (cm, opcional)</label>
                <input id="cintura" name="cintura" inputmode="decimal" autocomplete="off" placeholder="82" />
              </div>
              <div class="campo">
                <label for="quadril">Quadril (cm, opcional)</label>
                <input id="quadril" name="quadril" inputmode="decimal" autocomplete="off" placeholder="100" />
              </div>
            </div>
            <p class="aviso-calc">IMC = peso ÷ altura², com a altura em metros.</p>
          </form>
          <div class="painel" aria-live="polite">
            <div class="resultado-calc">
              <span class="rotulo">IMC</span>
              <span class="valor numero" id="valor-imc">—</span>
              <p class="aviso-calc" id="nota-imc">Preencha o peso e a altura.</p>
            </div>
            <table class="tabela" id="detalhe-imc" hidden>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Faixas de IMC para adultos (OMS)</h2>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">IMC (kg/m²)</th><th scope="col">Classificação</th></tr></thead>
              <tbody>
                <tr><td>Abaixo de 18,5</td><td>Abaixo do peso</td></tr>
                <tr><td>18,5 a 24,9</td><td>Peso normal</td></tr>
                <tr><td>25 a 29,9</td><td>Sobrepeso</td></tr>
                <tr><td>30 a 34,9</td><td>Obesidade grau I</td></tr>
                <tr><td>35 a 39,9</td><td>Obesidade grau II</td></tr>
                <tr><td>40 ou mais</td><td>Obesidade grau III</td></tr>
              </tbody>
            </table>
          </div>

          <h2>Cintura e relação cintura-quadril</h2>
          <p>A gordura acumulada no abdômen pesa mais no risco cardiometabólico do que o peso total. Por isso a OMS usa a cintura e a relação cintura-quadril junto com o IMC.</p>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Medida</th><th scope="col">Homens</th><th scope="col">Mulheres</th><th scope="col">Indica</th></tr></thead>
              <tbody>
                <tr><td>Cintura</td><td>Acima de 94 cm</td><td>Acima de 80 cm</td><td>Risco aumentado</td></tr>
                <tr><td>Cintura</td><td>Acima de 102 cm</td><td>Acima de 88 cm</td><td>Risco muito aumentado</td></tr>
                <tr><td>Cintura ÷ quadril</td><td>0,90 ou mais</td><td>0,85 ou mais</td><td>Risco muito aumentado</td></tr>
                <tr><td>Cintura ÷ altura</td><td>0,5 ou mais</td><td>0,5 ou mais</td><td>Cintura acima da metade da altura</td></tr>
              </tbody>
            </table>
          </div>
          <p>Os pontos de corte de cintura da OMS foram derivados principalmente de populações europeias, e a própria OMS reconhece valores diferentes para outras etnias. Use-os como triagem e acompanhe a evolução do mesmo aluno, não como diagnóstico.</p>
          <p class="nota">Fontes: OMS, <em>Obesity: preventing and managing the global epidemic</em> (2000); OMS, <em>Waist circumference and waist–hip ratio: report of a WHO expert consultation</em> (2008); Ashwell e Hsieh, <em>International Journal of Food Sciences and Nutrition</em> (2005).</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Acompanhe o IMC e a cintura de cada aluno', 'No Avalix as medidas ficam no cadastro do aluno, a evolução aparece lado a lado e o laudo sai em PDF com a sua marca.')}`,
}

// ------------------------------------------------------------------ frequência cardíaca

const calcFc = {
  arquivo: 'calculadora-frequencia-cardiaca.html',
  rota: '/calculadora-frequencia-cardiaca',
  atualizada: NOVAS,
  migalha: 'Calculadora de frequência cardíaca',
  titulo: 'Calculadora de frequência cardíaca de treino (Karvonen) · Avalix',
  descricao:
    'Calcule a frequência cardíaca máxima (Tanaka ou 220 − idade) e as cinco zonas de treino, pela FC de reserva (Karvonen) ou em percentual da FC máxima. Grátis.',
  scripts: ['/site/calculadora-fc.js'],
  perguntas: [
    ['Qual fórmula de FC máxima usar?',
      'A de Tanaka (208 − 0,7 × idade) saiu de uma grande revisão de estudos e erra menos que 220 − idade, principalmente em adultos mais velhos. As duas são estimativas e podem errar em 10 batimentos ou mais para uma pessoa. Quando houver teste de esforço, use a FC máxima medida.'],
    ['O que é a frequência cardíaca de reserva?',
      'É a diferença entre a FC máxima e a de repouso. O método de Karvonen aplica o percentual de intensidade sobre essa reserva e soma a FC de repouso: FC alvo = FC de repouso + (FC máxima − FC de repouso) × percentual.'],
    ['Quem toma remédio para pressão pode usar as zonas?',
      'Betabloqueadores e outros remédios que mexem na frequência cardíaca deixam as zonas estimadas sem sentido. Nesses casos, oriente pela percepção de esforço e siga a liberação médica.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Calculadora de frequência cardíaca de treino</h1>
        <p class="lide">Informe a idade para estimar a FC máxima. Com a FC de repouso, as zonas saem pela frequência cardíaca de reserva (Karvonen), que considera o condicionamento do aluno.</p>
      </header>

      <section class="envoltorio">
        <div class="calculadora">
          <form class="painel" id="form-fc" novalidate>
            <div class="campos">
              <div class="campo">
                <label for="idade">Idade (anos)</label>
                <input id="idade" name="idade" inputmode="numeric" autocomplete="off" placeholder="34" />
              </div>
              <div class="campo">
                <label for="repouso">FC de repouso (bpm, opcional)</label>
                <input id="repouso" name="repouso" inputmode="numeric" autocomplete="off" placeholder="62" />
              </div>
              <fieldset class="campo inteiro">
                <legend>FC máxima estimada por</legend>
                <div class="opcoes">
                  <label><input type="radio" name="formula" value="tanaka" checked /> Tanaka</label>
                  <label><input type="radio" name="formula" value="fox" /> 220 − idade</label>
                </div>
              </fieldset>
              <div class="campo inteiro">
                <label for="medida">FC máxima medida em teste (bpm, opcional)</label>
                <input id="medida" name="medida" inputmode="numeric" autocomplete="off" placeholder="Substitui a estimativa" />
              </div>
            </div>
            <p class="aviso-calc">Tanaka: 208 − 0,7 × idade. Karvonen: FC de repouso + (FC máxima − FC de repouso) × percentual.</p>
          </form>
          <div class="painel" aria-live="polite">
            <div class="resultado-calc">
              <span class="rotulo">FC máxima</span>
              <span class="valor numero" id="valor-fc">—</span>
              <p class="aviso-calc" id="nota-fc">Preencha a idade.</p>
            </div>
            <div class="rolagem">
              <table class="tabela" id="tabela-fc" hidden>
                <caption class="rotulo" style="text-align:left;padding-bottom:6px">Zonas de treino</caption>
                <thead><tr><th scope="col">Zona</th><th scope="col">Intensidade</th><th scope="col">Percentual</th><th scope="col">Frequência</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Como medir a FC de repouso</h2>
          <p>Ao acordar, ainda deitado e antes de levantar, conte o pulso por 60 segundos no punho ou no pescoço, ou use o relógio. Repita em três manhãs e use a média. Café, má noite de sono e estresse elevam o valor.</p>
          <h2>Como usar as zonas</h2>
          <ul>
            <li><strong>Zonas 1 e 2:</strong> aquecimento, recuperação e treino aeróbio longo. O aluno consegue conversar.</li>
            <li><strong>Zona 3:</strong> ritmo moderado, sustentável por bastante tempo, com a fala mais curta.</li>
            <li><strong>Zonas 4 e 5:</strong> intervalos intensos, de duração curta, para quem já tem base aeróbia.</li>
          </ul>
          <p>A FC demora a subir no começo de cada estímulo e muda com calor, hidratação e cansaço. Use as zonas como referência, junto com a percepção de esforço do aluno.</p>
          <p class="nota">Fontes: Tanaka, Monahan e Seals, <em>Journal of the American College of Cardiology</em> (2001); Karvonen, Kentala e Mustala, <em>Annales Medicinae Experimentalis et Biologiae Fenniae</em> (1957).</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Prescreva e acompanhe o treino no Avalix', 'Monte o treino semana a semana, mande por link e veja cada sessão registrada pelo aluno.')}`,
}

// ------------------------------------------------------------------ PAR-Q

const parq = {
  arquivo: 'questionario-par-q.html',
  rota: '/questionario-par-q',
  atualizada: NOVAS,
  migalha: 'Questionário PAR-Q',
  titulo: 'Questionário PAR-Q para imprimir, com as 7 perguntas · Avalix',
  descricao:
    'Questionário PAR-Q em português, com as 7 perguntas de prontidão para atividade física, campos de sim e não e assinatura. Grátis para imprimir e aplicar com o aluno.',
  scripts: ['/site/imprimir.js'],
  perguntas: [
    ['O que é o PAR-Q?',
      'É um questionário curto de prontidão para atividade física. As respostas indicam se a pessoa pode começar a se exercitar ou se precisa conversar com um médico antes. Esta versão traz as 7 perguntas gerais do PAR-Q+.'],
    ['O que fazer quando o aluno responde sim?',
      'Converse sobre a resposta e, em geral, peça avaliação ou liberação médica antes de começar ou de aumentar a intensidade. Anote a conduta junto com o questionário.'],
    ['Com que frequência refazer o PAR-Q?',
      'A cada reavaliação e sempre que a saúde do aluno mudar: diagnóstico novo, remédio novo, cirurgia, gestação ou sintoma durante o treino.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Questionário PAR-Q</h1>
        <p class="lide">As 7 perguntas de prontidão para atividade física, para o aluno responder antes de começar. Imprima, preencha com ele e guarde junto com a anamnese.</p>
        <div class="acoes nao-imprimir"><button class="botao secundario" type="button" data-imprimir hidden>Imprimir o questionário</button></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <div class="preencher largo">
            <span>Nome</span>
            <span>Data de nascimento</span>
            <span>Data</span>
          </div>
          <div class="rolagem largo">
            <table class="tabela em-branco">
              <thead><tr><th scope="col">Pergunta</th><th scope="col" class="caixa-titulo">Sim</th><th scope="col" class="caixa-titulo">Não</th></tr></thead>
              <tbody>
                ${PARQ.map((q, i) => `<tr><td>${i + 1}. ${q}</td><td class="caixa" aria-label="Sim"></td><td class="caixa" aria-label="Não"></td></tr>`).join('\n                ')}
              </tbody>
            </table>
          </div>

          <h2>Respondeu não a todas</h2>
          <p>O aluno pode começar a se exercitar, de forma gradual. Refaça o questionário a cada reavaliação ou quando a saúde dele mudar.</p>

          <h2>Respondeu sim a alguma</h2>
          <p>Converse sobre a resposta e, em geral, peça avaliação ou liberação médica antes de começar ou de aumentar a intensidade. Febre, gripe ou outra doença passageira: espere melhorar. Gestantes: liberação do obstetra.</p>

          <div class="preencher largo">
            <span>Assinatura do aluno ou do responsável legal</span>
            <span>Profissional e CREF</span>
          </div>
          <p class="nota">Versão em português das perguntas gerais do PAR-Q+ (<em>Physical Activity Readiness Questionnaire for Everyone</em>). Não substitui a avaliação médica.</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Mande o PAR-Q por link e receba a resposta pronta', 'No Avalix o PAR-Q faz parte da anamnese que o aluno responde no celular, e cada “sim” chega destacado para você.')}`,
}

// ------------------------------------------------------------------ ficha de treino

function treinoEmBranco(letra) {
  const linhas = Array.from({ length: 8 }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>')
  return `<h2>Treino ${letra}</h2>
          <div class="rolagem largo">
            <table class="tabela em-branco">
              <thead><tr><th scope="col">Exercício</th><th scope="col">Séries</th><th scope="col">Repetições</th><th scope="col">Carga</th><th scope="col">Descanso</th><th scope="col">Observações</th></tr></thead>
              <tbody>
                ${linhas.join('\n                ')}
              </tbody>
            </table>
          </div>`
}

const fichaTreino = {
  arquivo: 'modelo-de-ficha-de-treino.html',
  rota: '/modelo-de-ficha-de-treino',
  atualizada: NOVAS,
  migalha: 'Modelo de ficha de treino',
  titulo: 'Modelo de ficha de treino para imprimir (A, B e C) · Avalix',
  descricao:
    'Modelo de ficha de treino em branco, com treinos A, B e C, séries, repetições, carga e descanso. Grátis para imprimir e preencher com o aluno.',
  scripts: ['/site/imprimir.js'],
  perguntas: [
    ['Qual divisão de treino escolher?',
      'Com 2 ou 3 treinos por semana, trabalhar o corpo inteiro em cada sessão costuma render mais. Com 4 ou mais, divisões A e B ou A, B e C permitem mais volume por grupo muscular sem alongar a sessão.'],
    ['Quanto tempo de descanso entre as séries?',
      'Nos exercícios multiarticulares com carga alta, de 2 a 3 minutos; nos demais, de 1 a 2 minutos costumam bastar, segundo o posicionamento do American College of Sports Medicine (2009).'],
    ['Quando trocar a ficha?',
      'Não há prazo fixo. Troque quando o aluno parar de progredir ou ao fim do mesociclo, em geral entre 4 e 8 semanas, e sempre depois de uma reavaliação.'],
  ],
  corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Modelo de ficha de treino</h1>
        <p class="lide">Ficha em branco com treinos A, B e C. Imprima, preencha os exercícios e entregue ao aluno, ou use como roteiro para montar o treino.</p>
        <div class="acoes nao-imprimir"><button class="botao secundario" type="button" data-imprimir hidden>Imprimir a ficha</button></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <div class="preencher largo">
            <span>Aluno</span>
            <span>Objetivo</span>
            <span>Início</span>
            <span>Treinos por semana</span>
            <span>Profissional e CREF</span>
          </div>
          ${['A', 'B', 'C'].map(treinoEmBranco).join('\n\n          ')}
        </div>
      </section>

      <section class="secao nao-imprimir">
        <div class="envoltorio texto">
          <h2>Como preencher</h2>
          <ul>
            <li><strong>Ordem:</strong> exercícios multiarticulares (agachamento, supino, remada) antes dos isolados, enquanto o aluno está descansado.</li>
            <li><strong>Repetições e carga:</strong> escreva a faixa de repetições e a carga que leva o aluno perto da falha nessa faixa. A <a href="/calculadora-1rm">calculadora de 1RM</a> ajuda a partir de um teste.</li>
            <li><strong>Progressão:</strong> quando o aluno passar do topo da faixa em todas as séries, aumente a carga na sessão seguinte.</li>
            <li><strong>Observações:</strong> ajuste de máquina, amplitude, cadência, e o que a anamnese pede para evitar.</li>
          </ul>
          <p>Antes de montar o primeiro treino, aplique o <a href="/questionario-par-q">PAR-Q</a> e a <a href="/modelo-de-anamnese">anamnese</a>.</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Troque a ficha de papel pelo celular do aluno', 'No Avalix o aluno abre o treino por link, vê a carga da última vez em cada série e registra o que fez. O registro volta para você.')}`,
}

export const PAGINAS = [
  landing, avaliacaoFisica, avaliacaoPostural, appPersonal,
  calc1rm, calcGordura, modeloAnamnese,
  calcImc, calcFc, parq, fichaTreino,
]
  .map((p) => ({ ...p, corpo: p.corpo.replace('PERGUNTAS', p.perguntas?.length && p.rota !== '/' ? perguntasHtml(p.perguntas) : '') }))
