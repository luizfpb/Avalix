// Conteúdo das páginas públicas. Quem monta o HTML é scripts/gerar-site.mjs.
// Preços: os mesmos de billing_plans (migration 0050). Mudou lá, muda aqui.

export const SITE = {
  origem: 'https://avalixfit.com.br',
  email: 'contato@avalixfit.com.br',
}

const ATUALIZADA = '2026-11-10'

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
  atualizada: ATUALIZADA,
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

const modeloAnamnese = {
  arquivo: 'modelo-de-anamnese.html',
  rota: '/modelo-de-anamnese',
  atualizada: ATUALIZADA,
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
            <li>Nome, data de nascimento e sexo</li>
            <li>Telefone e contato de emergência</li>
            <li>Profissão e rotina de trabalho (sentado, em pé, carga física)</li>
            <li>Lateralidade: destro, canhoto ou ambidestro</li>
          </ul>

          <h2>2. Prontidão para atividade física (PAR-Q)</h2>
          <p>Responda sim ou não. Qualquer “sim” pede conversa e, em geral, liberação médica antes de começar.</p>
          <ol>
            ${PARQ.map((q) => `<li>${q}</li>`).join('\n            ')}
          </ol>

          <h2>3. Sinais de alerta</h2>
          <p>Algum destes nos últimos meses? Sinal presente: encaminhe ao médico antes de iniciar o treino.</p>
          <ul>
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
            <li>Doenças diagnosticadas: hipertensão, diabetes tipo 1 ou 2, dislipidemia, cardiopatia, doença renal, pulmonar (asma, DPOC), tireoidiana, reumática, osteoporose, neurológica, câncer atual ou prévio</li>
            <li>Medicamentos em uso, com dose</li>
            <li>Cirurgias e internações</li>
            <li>Gestação atual ou recente</li>
            <li>Alteração postural já diagnosticada: escoliose, hipercifose, hiperlordose</li>
          </ul>

          <h2>5. Dores e lesões</h2>
          <ul>
            <li>Região da dor (cervical, ombro, dorsal, lombar, quadril, joelho, tornozelo, cotovelo ou punho, lado direito ou esquerdo) e intensidade de 0 a 10</li>
            <li>Há quanto tempo: aguda (menos de 6 semanas), subaguda (6 a 12) ou crônica (mais de 12)</li>
            <li>Lesões anteriores: ligamento cruzado, menisco, manguito rotador, luxação recidivante, fratura no último ano, hérnia de disco, tendinopatia, estiramento grave</li>
            <li>Na dor de coluna, investigue: dor noturna que não alivia com repouso, perda de peso sem explicação, formigamento ou perda de força, febre, alteração no controle da bexiga ou do intestino, trauma recente</li>
          </ul>

          <h2>6. Hábitos</h2>
          <ul>
            <li>Experiência com treino: nunca treinou, menos de 6 meses, 6 a 24 meses, mais de 2 anos</li>
            <li>Atividade física atual e intensidade (leve, moderada, vigorosa)</li>
            <li>Sono (boa, regular, ruim), nível de estresse, tabagismo e consumo de álcool</li>
          </ul>

          <h2>7. Objetivos e rotina de treino</h2>
          <ul>
            <li>Objetivo principal: hipertrofia, composição corporal, saúde, performance, dor e reabilitação, correção postural, condicionamento, mobilidade, disposição</li>
            <li>Quantas vezes por semana e quanto tempo por sessão</li>
            <li>Onde vai treinar: academia, em casa, condomínio, ao ar livre</li>
            <li>Preferência: sessões curtas e intensas ou mais longas, com mais descanso</li>
          </ul>

          <h2>8. Consentimento</h2>
          <p>Dados de saúde são dados sensíveis pela LGPD. Registre o consentimento do aluno para a coleta e o uso das informações, com data e a versão do texto que ele leu.</p>
        </div>
      </section>

      PERGUNTAS

      ${chamada('Mande este modelo por link e receba tudo organizado', 'No Avalix o aluno responde a anamnese no celular, aceita o termo de consentimento, e os sinais de alerta chegam destacados para você.')}`,
}

export const PAGINAS = [landing, avaliacaoFisica, avaliacaoPostural, appPersonal, calc1rm, calcGordura, modeloAnamnese]
  .map((p) => ({ ...p, corpo: p.corpo.replace('PERGUNTAS', p.perguntas?.length && p.rota !== '/' ? perguntasHtml(p.perguntas) : '') }))
