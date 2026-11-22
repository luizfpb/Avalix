// Guias técnicos (topo/meio de funil) e páginas de comparação/alternativa.
// Seguem exatamente a mesma linguagem sóbria e sem jargão de marketing das
// demais páginas públicas do Avalix.

const DATA_GUIAS = '2026-11-22'

export const CATALOGO_GUIAS = {
  '/guia-avaliacao-fisica': {
    titulo: 'Como fazer avaliação física passo a passo',
    desc: 'Ordem recomendada da coleta: anamnese, peso/altura, circunferências, dobras cutâneas, postura e testes físicos.',
    acao: 'Ler guia →',
  },
  '/guia-pollock-7-dobras': {
    titulo: 'Protocolo Pollock 7 dobras: pontos anatômicos',
    desc: 'Onde pinçar cada uma das 7 dobras, direção do compasso, 3 medidas por ponto e erros comuns na coleta.',
    acao: 'Ler guia →',
  },
  '/guia-volume-semanal-treino': {
    titulo: 'Volume semanal de treino por grupo muscular',
    desc: 'Como contar séries diretas e indiretas, faixas práticas por nível e ajustes semana a semana no mesociclo.',
    acao: 'Ler guia →',
  },
  '/guia-avaliacao-postural': {
    titulo: 'Como fazer avaliação postural com fotos',
    desc: 'Padronização de distância, altura da câmera, vistas anterior/posterior/lateral e o que comparar na reavaliação.',
    acao: 'Ler guia →',
  },
  '/guia-tabela-vo2max': {
    titulo: 'Tabela de VO2máx brasileira (Herdy & Caixeta)',
    desc: 'Como escolher entre Cooper, Rockport e banco de Queens e interpretar o resultado pela referência brasileira.',
    acao: 'Ler guia →',
  },
  '/comparativo-app-personal-trainer': {
    titulo: 'Avalix vs MFIT, Tecnofit e planilhas',
    desc: 'Comparativo direto de avaliação física, postura, treino offline do aluno e preço para escolher sem surpresa.',
    acao: 'Ver comparativo →',
  },
  '/alternativa-sanny-physical-test': {
    titulo: 'Alternativa ao Sanny e Physical Test',
    desc: 'Como avaliar composição corporal, postura e testes físicos no navegador, sem depender de programa só para Windows.',
    acao: 'Ver comparativo →',
  },
}

export function criarGuiasEComparativos({ chamada, relacionadasHtml }) {
  const guiaAvaliacao = {
    arquivo: 'guia-avaliacao-fisica.html',
    rota: '/guia-avaliacao-fisica',
    atualizada: DATA_GUIAS,
    migalha: 'Guia de avaliação física',
    ogImage: '/og-guias.png',
    tipoArtigo: true,
    titulo: 'Como fazer avaliação física passo a passo (guia para personal) · Avalix',
    descricao:
      'Passo a passo completo da avaliação física: anamnese e PAR-Q, peso e estatura, circunferências, dobras cutâneas, avaliação postural e testes físicos.',
    perguntas: [
      ['Quanto tempo dura uma avaliação física completa?',
        'Com a anamnese preenchida antes pelo link, a coleta presencial (peso, estatura, circunferências, dobras, 4 fotos posturais e 1 a 3 testes físicos) costuma levar entre 30 e 45 minutos.'],
      ['Qual a ordem correta das medidas?',
        'Comece em repouso (anamnese e FC/PA se medir), depois massa corporal e estatura, circunferências e dobras cutâneas (antes de suar), fotos posturais e, por último, testes neuromotores e cardiorrespiratórios.'],
      ['De quanto em quanto tempo reavaliar o aluno?',
        'Para composição corporal, intervalos de 60 a 90 dias evitam confundir variação de hidratação com mudança real de gordura. Em iniciantes ou protocolos específicos, 45 a 60 dias também funciona bem.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Como fazer avaliação física passo a passo</h1>
        <p class="lide">Um roteiro objetivo para padronizar a coleta do primeiro atendimento à reavaliação, reduzir erro entre medidas e entregar um laudo claro ao aluno.</p>
        <div class="acoes"><a class="botao" href="/planilha-de-avaliacao-fisica">Baixar ficha para imprimir</a><a class="botao secundario" href="/cadastro">Fazer no Avalix grátis</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>1. Antes do encontro: anamnese, PAR-Q e consentimento</h2>
          <p>Ganhe 15 minutos no presencial enviando a <a href="/modelo-de-anamnese">anamnese</a> e o <a href="/questionario-par-q">PAR-Q</a> antes da sessão. Assim você já recebe dores, lesões, cirurgias, medicamentos e objetivos antes mesmo de o aluno chegar — e identifica se há necessidade de liberação médica.</p>

          <h2>2. Padronização antes de medir</h2>
          <ul>
            <li>Peça roupa leve e justa (top/shorts ou sunga) para dobras e fotos.</li>
            <li>Evite treino intenso imediatamente antes da coleta: o suor dificulta a pinça e a hiperemia altera perímetros.</li>
            <li>Anote o horário do dia e tente repetir o mesmo período na reavaliação.</li>
          </ul>

          <h2>3. Massa corporal, estatura e circunferências</h2>
          <p>Registre peso e estatura primeiro para calcular o <a href="/calculadora-imc">IMC</a>. Em seguida, faça as circunferências com fita inextensível, sempre no mesmo plano horizontal e sem comprimir a pele — começando por pescoço, tórax, cintura, abdômen, quadril e depois membros (direito e esquerdo).</p>

          <h2>4. Composição corporal: escolha um protocolo e mantenha</h2>
          <p>Se você usa adipômetro, <a href="/guia-pollock-7-dobras">Jackson &amp; Pollock 7 dobras</a> é o padrão mais versátil; JP3 (3 dobras) agiliza atendimentos rápidos e Durnin-Womersley (4 dobras) dispensa a dobra da coxa. Sem adipômetro, o protocolo <strong>US Navy</strong> usa apenas circunferências. A regra de ouro é manter o mesmo protocolo na reavaliação para a comparação fazer sentido. Você pode testar os cálculos na <a href="/calculadora-percentual-de-gordura">calculadora de percentual de gordura</a>.</p>

          <h2>5. Avaliação postural por fotos</h2>
          <p>Tire as 4 vistas padrão (anterior, posterior, lateral direita e lateral esquerda) antes de qualquer teste de esforço. Veja o passo a passo de distância e câmera no <a href="/guia-avaliacao-postural">guia de avaliação postural</a>.</p>

          <h2>6. Testes físicos (por último)</h2>
          <p>Feche a sessão com testes funcionais que conversem com o objetivo do aluno: <strong>VO2máx</strong> (Cooper 12 min, Rockport 1 milha ou banco de Queens — veja a <a href="/guia-tabela-vo2max">tabela brasileira de Herdy &amp; Caixeta</a>), flexão de braço, abdominal em 1 minuto, sentar e alcançar (banco de Wells) e preensão manual.</p>

          <h2>7. Entrega do laudo e agendamento da reavaliação</h2>
          <p>O aluno raramente entende milímetros de dobra isolados. Entregue um resumo visual com % de gordura, massa magra, massa gorda, comparação com a coleta anterior e o objetivo do próximo mesociclo — e já deixe a reavaliação prevista para 60–90 dias.</p>
        </div>
      </section>

      ${relacionadasHtml(['/calculadora-percentual-de-gordura', '/planilha-de-avaliacao-fisica', '/calculadora-vo2max', '/modelo-de-anamnese'])}

      PERGUNTAS

      ${chamada('Padronize suas avaliações sem perder tempo em planilhas', 'No Avalix a anamnese vai por link, os cálculos e classificações saem na hora e o laudo em PDF sai pronto com a sua marca.')}`,
  }

  const guiaPollock = {
    arquivo: 'guia-pollock-7-dobras.html',
    rota: '/guia-pollock-7-dobras',
    atualizada: DATA_GUIAS,
    migalha: 'Protocolo Pollock 7 dobras',
    ogImage: '/og-guias.png',
    tipoArtigo: true,
    titulo: 'Protocolo Pollock 7 dobras: pontos anatômicos e como medir · Avalix',
    descricao:
      'Guia prático dos 7 pontos anatômicos de Jackson & Pollock (peitoral, axilar média, tríceps, subescapular, abdominal, supra-ilíaca e coxa), técnica de pinça e cálculo.',
    perguntas: [
      ['Preciso fazer 3 medidas em cada dobra?',
        'Sim. Faça a rodada completa nos 7 pontos e repita 3 vezes (em circuito, não 3 vezes seguidas no mesmo ponto para não comprimir o tecido). Use a mediana ou a média das medidas próximas.'],
      ['Qual a diferença entre Pollock 3 e 7 dobras?',
        'O Pollock 7 mede sete regiões e capta melhor a distribuição de gordura em diferentes biotipos. O Pollock 3 é mais rápido, mas depende mais da distribuição típica da população de referência.'],
      ['Mede-se do lado direito ou esquerdo?',
        'Por convenção (ISAK / ACSM), todas as dobras são medidas no hemicorpo direito. Se precisar usar o esquerdo por cicatriz ou limitação, registre na observação e repita o mesmo lado na reavaliação.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Protocolo Pollock 7 dobras: pontos anatômicos e como medir</h1>
        <p class="lide">Referência rápida das sete dobras de Jackson &amp; Pollock (1978/1980), direção do adipômetro e cuidados para manter a medida reproduzível.</p>
        <div class="acoes"><a class="botao" href="/calculadora-percentual-de-gordura">Abrir calculadora JP7 grátis</a><a class="botao secundario" href="/planilha-de-avaliacao-fisica">Ficha para imprimir</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Os 7 pontos anatômicos (hemicorpo direito)</h2>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Dobra</th><th scope="col">Localização anatômica</th><th scope="col">Direção da pinça</th></tr></thead>
              <tbody>
                <tr><td><strong>Peitoral (tórax)</strong></td><td>Homens: metade da distância entre a linha axilar anterior e o mamilo. Mulheres: 1/3 da distância a partir da axila.</td><td>Diagonal</td></tr>
                <tr><td><strong>Axilar média</strong></td><td>Na linha axilar média, na altura do processo xifoide do esterno.</td><td>Vertical</td></tr>
                <tr><td><strong>Tríceps</strong></td><td>Face posterior do braço, ponto médio entre o acrômio e o olécrano, braço relaxado ao lado do corpo.</td><td>Vertical</td></tr>
                <tr><td><strong>Subescapular</strong></td><td>1 a 2 cm abaixo do ângulo inferior da escápula.</td><td>Diagonal (~45°)</td></tr>
                <tr><td><strong>Abdominal</strong></td><td>2 cm à direita da cicatriz umbilical.</td><td>Vertical</td></tr>
                <tr><td><strong>Supra-ilíaca</strong></td><td>Logo acima da crista ilíaca, seguindo a inclinação natural na linha axilar anterior.</td><td>Diagonal</td></tr>
                <tr><td><strong>Coxa medial</strong></td><td>Face anterior da coxa, ponto médio entre a prega inguinal e a borda superior da patela, peso apoiado na perna esquerda.</td><td>Vertical</td></tr>
              </tbody>
            </table>
          </div>

          <h2>Técnica de coleta para reduzir erro</h2>
          <ul>
            <li>Pince com polegar e indicador a ~8 cm de abertura, destaque a dobra de pele + tecido subcutâneo (sem músculo) e posicione o adipômetro 1 cm abaixo dos dedos.</li>
            <li>Faça a leitura após ~2 segundos de pressão das hastes — segurar tempo demais comprime o líquido intersticial e subestima a dobra.</li>
            <li>Faça 3 rodadas em circuito (todas as 7 dobras, depois repete). Se uma medida divergir mais de 5% ou 2 mm das outras, repita o ponto.</li>
            <li>Não use apenas o % de gordura final: acompanhar o <strong>somatório das 7 dobras em milímetros</strong> mostra evolução real mesmo sem depender de equação.</li>
          </ul>

          <h2>Da soma das dobras ao percentual de gordura</h2>
          <p>A soma das 7 dobras + idade entra na equação de densidade corporal de Jackson &amp; Pollock (1978 para homens; Jackson, Pollock &amp; Ward, 1980 para mulheres) e depois na equação de <strong>Siri (1961)</strong>. Você pode conferir o cálculo instantâneo na <a href="/calculadora-percentual-de-gordura">calculadora de percentual de gordura</a>.</p>
        </div>
      </section>

      ${relacionadasHtml(['/calculadora-percentual-de-gordura', '/planilha-de-avaliacao-fisica', '/calculadora-imc', '/calculadora-tmb'])}

      PERGUNTAS

      ${chamada('Registre as 7 dobras e gere o laudo em PDF na hora', 'No Avalix você digita as medidas no celular, compara com a avaliação anterior e entrega o PDF com a sua marca.')}`,
  }

  const guiaVolume = {
    arquivo: 'guia-volume-semanal-treino.html',
    rota: '/guia-volume-semanal-treino',
    atualizada: DATA_GUIAS,
    migalha: 'Volume semanal de treino',
    ogImage: '/og-guias.png',
    tipoArtigo: true,
    titulo: 'Como calcular volume semanal de treino por grupo muscular · Avalix',
    descricao:
      'Entenda como contar séries válidas diretas e indiretas por grupo muscular, referências práticas para hipertrofia e como distribuir o volume no mesociclo.',
    perguntas: [
      ['Séries de aquecimento entram na conta do volume semanal?',
        'Não. Conte apenas séries válidas (de trabalho), feitas com esforço real (geralmente RIR 0 a 4 ou próximas da falha técnica).'],
      ['Como contar músculos sinérgicos (ex.: tríceps no supino)?',
        'A prática mais comum é contar 1 série para o músculo principal e 0,5 série para os sinérgicos relevantes — ou acompanhar séries diretas e totais separadamente para não inflar o número.'],
      ['Mais séries semanais sempre geram mais hipertrofia?',
        'Não. Existe um ponto de retorno decrescente e limite de recuperação. Volume excessivo com sono ruim ou técnica degradada piora a progressão de carga.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Como calcular o volume semanal de treino por grupo muscular</h1>
        <p class="lide">Um jeito simples e consistente de contar séries semanais, equilibrar a divisão do treino e ajustar o mesociclo conforme a recuperação do aluno.</p>
        <div class="acoes"><a class="botao" href="/modelo-de-ficha-de-treino">Ver modelo de ficha</a><a class="botao secundario" href="/calculadora-1rm">Calculadora de 1RM</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>O que entra na contagem</h2>
          <p>O marcador mais prático de volume para hipertrofia é o número de <strong>séries válidas por grupo muscular por semana</strong>. Séries de aquecimento e de reconhecimento de carga ficam fora. Se o aluno faz 3 séries de supino reto + 3 de supino inclinado na segunda e mais 4 de crucifixo na quinta, o volume direto de peitoral na semana é <strong>10 séries</strong>.</p>

          <h2>Faixas práticas de partida (séries semanais por músculo)</h2>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Perfil / objetivo</th><th scope="col">Faixa inicial sugerida</th><th scope="col">Observação prática</th></tr></thead>
              <tbody>
                <tr><td><strong>Manutenção</strong></td><td>4 a 6 séries / semana</td><td>Útil em semanas corridas, viagens ou fase de foco em outro músculo.</td></tr>
                <tr><td><strong>Iniciante</strong></td><td>8 a 12 séries / semana</td><td>Priorize execução consistente e progressão de carga antes de adicionar exercícios.</td></tr>
                <tr><td><strong>Intermediário</strong></td><td>12 a 18 séries / semana</td><td>Distribua em 2 sessões semanais para manter qualidade nas séries finais.</td></tr>
                <tr><td><strong>Avançado / especialização</strong></td><td>16 a 22+ séries / semana</td><td>Use apenas nos grupos prioritários enquanto reduz os demais para manutenção.</td></tr>
              </tbody>
            </table>
          </div>

          <h2>Séries diretas vs. indiretas</h2>
          <p>Exercícios multiarticulares recrutam mais de um grupo: remadas trabalham dorsais (direto) e bíceps (indireto); supinos trabalham peitoral (direto), deltoide anterior e tríceps (indireto). Controlar o volume direto e o indireto evita sobrecarregar ombros e cotovelos sem perceber.</p>

          <h2>Progressão dentro do mesociclo</h2>
          <p>Em vez de começar já no teto de volume, comece um mesociclo de 4 a 6 semanas na base da faixa (ou com uma <strong>Semana 0 de adaptação</strong>), acompanhe as cargas e repetições realizadas semana a semana e ajuste apenas os músculos que estão recuperando bem — fechando com deload quando a fadiga acumular.</p>
        </div>
      </section>

      ${relacionadasHtml(['/calculadora-1rm', '/modelo-de-ficha-de-treino', '/calculadora-frequencia-cardiaca', '/calculadora-tmb'])}

      PERGUNTAS

      ${chamada('Veja o volume semanal somado automaticamente enquanto monta o treino', 'No Avalix você monta o mesociclo semana a semana, vê o total de séries por grupo muscular ao lado e acompanha o que o aluno realmente executou.')}`,
  }

  const guiaPostural = {
    arquivo: 'guia-avaliacao-postural.html',
    rota: '/guia-avaliacao-postural',
    atualizada: DATA_GUIAS,
    migalha: 'Guia de avaliação postural',
    ogImage: '/og-guias.png',
    tipoArtigo: true,
    titulo: 'Como fazer avaliação postural com fotos: padronização e vistas · Avalix',
    descricao:
      'Aprenda a padronizar fundo, distância, altura da câmera e as 4 vistas da avaliação postural por foto para comparar evoluções com segurança.',
    perguntas: [
      ['Preciso de simetrógrafo físico na parede?',
        'Não é obrigatório. Uma parede lisa, câmera nivelada na altura do umbigo/quadril e uma linha de prumo digital bem posicionada já garantem ótima padronização.'],
      ['A qual altura deve ficar o celular?',
        'Na altura aproximada da pelve/umbigo do aluno, sem inclinar o aparelho para cima ou para baixo. Inclinar a câmera cria distorção de perspectiva que parece desvio postural.'],
      ['Quantas fotos tirar por sessão?',
        'Quatro vistas cobrem a avaliação completa: anterior (frente), posterior (costas), lateral direita e lateral esquerda.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Como fazer avaliação postural com fotos sem distorção</h1>
        <p class="lide">Padronize a captura em 5 minutos para que a comparação entre a avaliação inicial e a reavaliação mostre mudanças reais — e não diferença de ângulo da câmera.</p>
        <div class="acoes"><a class="botao" href="/avaliacao-postural">Ver avaliação postural no Avalix</a><a class="botao secundario" href="/cadastro">Testar 14 dias grátis</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>1. Ambiente e posicionamento da câmera</h2>
          <ul>
            <li><strong>Distância fixa:</strong> posicione o tripé ou o avaliador a cerca de 2,5 a 3 metros do aluno (marque o chão com fita discreta para repetir na reavaliação).</li>
            <li><strong>Altura da lente:</strong> mantenha o celular paralelo à parede, na altura do quadril/umbigo — nunca apontando de baixo para cima.</li>
            <li><strong>Iluminação frontal e parede lisa:</strong> evite contraluz de janela atrás do aluno.</li>
          </ul>

          <h2>2. Postura natural do avaliado</h2>
          <p>Peça ao aluno que caminhe alguns passos no lugar e pare olhando para um ponto fixo à frente, descalço, braços relaxados ao longo do corpo. Não dê comandos como "ajeita os ombros" ou "encolhe a barriga" — você quer registrar a postura habitual.</p>

          <h2>3. O que observar em cada vista</h2>
          <ul>
            <li><strong>Anterior:</strong> alinhamento da cabeça, nível dos ombros, triângulo de Tales, nível das cristas ilíacas, joelhos (valgo/varo) e arco plantar.</li>
            <li><strong>Posterior:</strong> simetria escapular, linha da coluna, pregas glúteas e alinhamento do tendão de Aquiles.</li>
            <li><strong>Laterais (D e E):</strong> anteriorização de cabeça, protração de ombros, curvaturas da coluna (cifose/lordose), inclinação pélvica e hiperextensão de joelhos.</li>
          </ul>

          <h2>4. Anotações e comparação lado a lado</h2>
          <p>Mais importante do que rotular desvios é registrar pontos de referência objetivos (inclinação de ombros e pelve, linha de prumo) e comparar as fotos lado a lado depois de 60 a 90 dias de treino direcionado.</p>
        </div>
      </section>

      ${relacionadasHtml(['/planilha-de-avaliacao-fisica', '/modelo-de-anamnese', '/calculadora-percentual-de-gordura', '/calculadora-imc'])}

      PERGUNTAS

      ${chamada('Marque os pontos posturais com um toque no navegador', 'No Avalix a detecção de pose marca os pontos automaticamente na foto, você ajusta como quiser, mede ângulos e compara sessões lado a lado.')}`,
  }

  const guiaVo2 = {
    arquivo: 'guia-tabela-vo2max.html',
    rota: '/guia-tabela-vo2max',
    atualizada: DATA_GUIAS,
    migalha: 'Tabela de VO2máx brasileira',
    ogImage: '/og-guias.png',
    tipoArtigo: true,
    titulo: 'Tabela de VO2máx brasileira (Herdy & Caixeta): protocolos e faixas · Avalix',
    descricao:
      'Como estimar VO2máx em campo com Cooper 12 min, Rockport 1 milha e banco de Queens e classificar pela tabela brasileira de Herdy & Caixeta (2016).',
    perguntas: [
      ['Por que usar a tabela de Herdy & Caixeta em vez da tabela americana?',
        'A referência de Herdy & Caixeta (Arq Bras Cardiol, 2016) foi construída com quase 4 mil testes cardiopulmonares em adultos brasileiros saudáveis de 15 a 74 anos, refletindo melhor a realidade do público no Brasil.'],
      ['Qual protocolo escolher para aluno sedentário ou iniciante?',
        'O teste de caminhada de 1 milha (Rockport) é submáximo, seguro e não exige corrida — ideal para iniciantes, pessoas com sobrepeso ou retorno de pausa.'],
      ['Quando usar o banco de Queens?',
        'Quando não há pista nem esteira disponível: basta um degrau de 41,3 cm, metrônomo (24 subidas/min para homens, 22 para mulheres) por 3 minutos e a leitura da FC de recuperação.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Tabela de VO2máx brasileira (Herdy &amp; Caixeta): como aplicar e interpretar</h1>
        <p class="lide">Escolha o protocolo de campo certo para o nível do aluno e interprete o VO2máx com uma referência feita no Brasil.</p>
        <div class="acoes"><a class="botao" href="/calculadora-vo2max">Calcular VO2máx grátis</a><a class="botao secundario" href="/calculadora-frequencia-cardiaca">Zonas de FC (Karvonen)</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Qual teste de campo escolher</h2>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Protocolo</th><th scope="col">Esforço / duração</th><th scope="col">Melhor para</th></tr></thead>
              <tbody>
                <tr><td><strong>Cooper (1968)</strong></td><td>Maior distância correndo/caminhando em 12 minutos</td><td>Alunos ativos, corredores e quem já tolera esforço máximo.</td></tr>
                <tr><td><strong>Rockport (Kline, 1987)</strong></td><td>Caminhada rápida de 1 milha (1.609 m) + FC ao final</td><td>Iniciantes, sedentários, sobrepeso e adultos mais velhos.</td></tr>
                <tr><td><strong>Banco de Queens (McArdle, 1972)</strong></td><td>Subir e descer degrau de 41,3 cm por 3 minutos + FC 5–20 s após</td><td>Atendimentos em estúdio ou condomínio sem pista nem esteira.</td></tr>
              </tbody>
            </table>
          </div>

          <h2>Como funciona a classificação brasileira (Herdy &amp; Caixeta, 2016)</h2>
          <p>O estudo publicado nos <em>Arquivos Brasileiros de Cardiologia</em> definiu valores médios de VO2máx por sexo e década de idade (15–24 até 65–74 anos) e classificou o desempenho como percentual da média do grupo:</p>
          <ul>
            <li><strong>Muito fraco:</strong> abaixo de 50% da média de referência</li>
            <li><strong>Fraco:</strong> de 50% a 80% da média</li>
            <li><strong>Regular:</strong> de 80% a 95% da média</li>
            <li><strong>Bom:</strong> de 95% a 105% da média</li>
            <li><strong>Excelente:</strong> acima de 105% da média</li>
          </ul>
          <p>Para ver os pontos de corte exatos em mL/kg/min para a idade e sexo do seu aluno, use a <a href="/calculadora-vo2max">calculadora de VO2máx grátis</a>.</p>
        </div>
      </section>

      ${relacionadasHtml(['/calculadora-vo2max', '/calculadora-frequencia-cardiaca', '/planilha-de-avaliacao-fisica', '/calculadora-imc'])}

      PERGUNTAS

      ${chamada('Guarde o histórico de VO2máx e gere o laudo de testes físicos', 'No Avalix você registra Cooper, Rockport, Queens, flexão, abdominal, sentar e alcançar e preensão manual com evolução automática e PDF com a sua marca.')}`,
  }

  const comparativoApp = {
    arquivo: 'comparativo-app-personal-trainer.html',
    rota: '/comparativo-app-personal-trainer',
    atualizada: DATA_GUIAS,
    migalha: 'Comparativo de apps para personal',
    ogImage: '/og-comparativo.png',
    titulo: 'App para personal trainer: Avalix vs MFIT, Tecnofit e planilhas · Avalix',
    descricao:
      'Comparação direta entre Avalix, plataformas tradicionais de consultoria e planilhas: avaliação física, postural, treino offline do aluno, LGPD e preço.',
    perguntas: [
      ['O Avalix substitui o MFIT ou a Tecnofit para qualquer personal?',
        'Depende da sua operação. Se você precisa de gestão de academia (catraca, venda de planos de sala, financeiro completo de academia), sistemas como Tecnofit fazem mais sentido. Se você é personal trainer ou estúdio focado em avaliação física, postural, prescrição de mesociclos e entrega leve para o aluno, o Avalix foi feito exatamente para isso.'],
      ['Meu aluno precisa instalar aplicativo na loja?',
        'Não. No Avalix o aluno abre o treino e a anamnese por um link no navegador e pode fixar na tela inicial (PWA), funcionando até offline.'],
      ['Qual o custo por aluno no Avalix?',
        'Os planos começam em R$ 19,90/mês (até 30 alunos ativos), R$ 39,90/mês (até 100 alunos) e R$ 100/mês (ilimitado) — todos com todos os recursos liberados e 14 dias grátis sem cartão.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Avalix vs. apps tradicionais de personal trainer e planilhas</h1>
        <p class="lide">Um comparativo direto do que muda na prática entre usar planilhas, plataformas grandes de academia/consultoria e o Avalix.</p>
        <div class="acoes"><a class="botao" href="/cadastro">Testar Avalix 14 dias grátis</a><a class="botao secundario" href="/#precos">Ver preços</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Comparação ponto a ponto</h2>
          <div class="rolagem">
            <table class="tabela">
              <thead><tr><th scope="col">Critério</th><th scope="col">Avalix</th><th scope="col">Apps tradicionais (ex.: MFIT / Tecnofit)</th><th scope="col">Planilhas (Excel / Sheets)</th></tr></thead>
              <tbody>
                <tr><td><strong>Avaliação física + testes físicos</strong></td><td>Protocolos JP7, JP3, DW, US Navy + VO2máx (Herdy &amp; Caixeta), CSEP e EWGSOP2</td><td>Foco principal em treino ou gestão; testes físicos completos variam por plano</td><td>Manual; sujeito a erro de fórmula e difícil no celular</td></tr>
                <tr><td><strong>Avaliação postural por foto</strong></td><td>Detecção de pose no navegador, ângulos, anotações e comparação lado a lado</td><td>Geralmente só galeria de fotos antes/depois ou recurso ausente</td><td>Não possui</td></tr>
                <tr><td><strong>Acesso do aluno</strong></td><td>Link direto sem senha e sem loja; funciona offline</td><td>Exige baixar app, criar conta e manter login</td><td>PDF estático; aluno não registra cargas</td></tr>
                <tr><td><strong>Prescrição por mesociclo</strong></td><td>Semana 0 (adaptação) a N, volume semanal automático, modelos reutilizáveis e histórico de cargas</td><td>Prescrição disponível; volume por músculo e mesociclo variam</td><td>Manual e trabalhoso de atualizar</td></tr>
                <tr><td><strong>Laudo em PDF com sua marca</strong></td><td>Incluído em todos os planos (avaliação, evolução, testes e treino)</td><td>Depende do plano ou layout genérico</td><td>Formatação quebra ao exportar</td></tr>
                <tr><td><strong>LGPD e segurança</strong></td><td>Consentimento versionado, exportação/exclusão do titular e 2FA TOTP</td><td>Varia por plataforma</td><td>Arquivos espalhados sem trilha de consentimento</td></tr>
                <tr><td><strong>Preço inicial</strong></td><td>R$ 19,90/mês (até 30 alunos ativos), sem fidelidade</td><td>Planos mensais geralmente mais altos ou com recursos travados por faixa</td><td>Gratuito, mas custa horas toda semana</td></tr>
              </tbody>
            </table>
          </div>

          <h2>Para quem o Avalix NÃO é a melhor escolha</h2>
          <p>Preferimos ser diretos: se você gerencia uma <strong>academia com catraca, controle de acesso físico, grade de aulas coletivas e emissão de nota fiscal</strong>, um ERP de academia (como Tecnofit ou Evo) atende melhor. O Avalix foi desenhado para <strong>personal trainers, avaliadores físicos e estúdios</strong> que querem avaliação técnica de alto nível, prescrição séria e um fluxo rápido no celular.</p>
        </div>
      </section>

      ${relacionadasHtml(['/calculadora-percentual-de-gordura', '/calculadora-1rm', '/calculadora-vo2max', '/modelo-de-anamnese'])}

      PERGUNTAS

      ${chamada('Teste com um aluno real (ou com o aluno de exemplo)', 'Crie sua conta grátis por 14 dias, sem cartão, e compare na prática com a ferramenta que você usa hoje.')}`,
  }

  const alternativaSanny = {
    arquivo: 'alternativa-sanny-physical-test.html',
    rota: '/alternativa-sanny-physical-test',
    atualizada: DATA_GUIAS,
    migalha: 'Alternativa ao Sanny e Physical Test',
    ogImage: '/og-comparativo.png',
    titulo: 'Alternativa ao Sanny e Physical Test: avaliação física online · Avalix',
    descricao:
      'Procurando alternativa online ao Sanny (Physical Test) que rode no celular, Mac e Windows? Veja como o Avalix reúne dobras, postura, testes físicos e PDF.',
    perguntas: [
      ['O Avalix funciona em Mac, Windows, Android e iPhone?',
        'Sim. Ele roda direto no navegador e pode ser instalado como PWA no celular ou computador, sem instalador exclusivo de Windows nem licença presa a uma máquina.'],
      ['Ele faz os mesmos cálculos de composição e testes físicos?',
        'Sim para os protocolos mais usados na prática: Pollock 3 e 7 dobras, Durnin-Womersley, US Navy, IMC, circunferências, VO2máx (Cooper, Rockport e Queens com tabela brasileira de Herdy & Caixeta), flexão, sentar e alcançar, abdominal e preensão manual.'],
      ['Os dados ficam salvos na nuvem com backup?',
        'Sim. Tudo fica sincronizado na sua conta com criptografia em trânsito, controle de acesso por organização e backups automáticos — sem risco de perder o banco ao formatar o notebook.'],
    ],
    corpo: `<header class="cabeca-pagina envoltorio">
        <h1>Alternativa online ao Sanny e Physical Test</h1>
        <p class="lide">Avaliação física, postural e testes cardiorrespiratórios/neuromotores no navegador — no celular, tablet ou computador, sem ficar preso a um computador Windows.</p>
        <div class="acoes"><a class="botao" href="/cadastro">Testar Avalix 14 dias grátis</a><a class="botao secundario" href="/avaliacao-fisica">Ver protocolos</a></div>
      </header>

      <section class="secao">
        <div class="envoltorio texto">
          <h2>Por que profissionais procuram uma alternativa moderna</h2>
          <p>Softwares clássicos de avaliação física (como Physical Test / Sanny) marcaram época, mas costumam trazer dores comuns na rotina de quem atende em academia, condomínio ou consultoria online:</p>
          <ul>
            <li><strong>Preso ao desktop Windows:</strong> você anota no papel durante o atendimento e depois redigita tudo no computador.</li>
            <li><strong>Sem fluxo do aluno:</strong> não há anamnese por link nem entrega de treino interativo no celular do aluno.</li>
            <li><strong>Risco de arquivo local:</strong> se o notebook quebra ou é formatado, o histórico de anos pode se perder.</li>
          </ul>

          <h2>O que você ganha migrando para o Avalix</h2>
          <ul>
            <li><strong>Coleta direto no celular:</strong> digite dobras, circunferências e testes físicos na hora e veja os resultados calculados ao vivo.</li>
            <li><strong>Protocolos e tabelas auditados:</strong> JP7, JP3, Durnin-Womersley, US Navy, Siri/Brozek, VO2máx pela tabela brasileira de Herdy &amp; Caixeta (2016), CSEP e EWGSOP2.</li>
            <li><strong>Postural integrado:</strong> fotos com detecção automática de pontos, ângulos e comparação entre sessões.</li>
            <li><strong>Laudo limpo em PDF:</strong> pronto para enviar no WhatsApp do aluno com a sua logo e identidade.</li>
            <li><strong>Da avaliação direto para o treino:</strong> os dados da anamnese e da avaliação já alimentam o briefing e a prescrição de treino do mesmo aluno.</li>
          </ul>
        </div>
      </section>

      ${relacionadasHtml(['/calculadora-percentual-de-gordura', '/calculadora-vo2max', '/planilha-de-avaliacao-fisica', '/modelo-de-anamnese'])}

      PERGUNTAS

      ${chamada('Experimente avaliar pelo navegador hoje mesmo', '14 dias grátis com todos os recursos liberados, sem cartão de crédito.')}`,
  }

  return [
    guiaAvaliacao,
    guiaPollock,
    guiaVolume,
    guiaPostural,
    guiaVo2,
    comparativoApp,
    alternativaSanny,
  ]
}
