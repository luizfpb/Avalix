import { describe, it, expect } from 'vitest'
import { buildAnamnesePrompt } from './anamnese'
import { computeGate } from '../anamnesis/gate'
import { PARQ_ITEMS } from '../anamnesis/spec'
import { SUBJECT, anamneseBase, anamneseCompleta } from './fixtures'

function prompt(answers = anamneseCompleta(), subject = SUBJECT) {
  return buildAnamnesePrompt({ subject, assessedAt: '2026-08-20', answers })
}

describe('buildAnamnesePrompt — completude', () => {
  it('traz as sete perguntas do PAR-Q na íntegra, não só as chaves', () => {
    const p = prompt()
    for (const item of PARQ_ITEMS) expect(p).toContain(item.label)
  })

  it('traz todas as seções do formulário', () => {
    const p = prompt()
    for (const titulo of [
      'A1. TRIAGEM DE PRONTIDÃO',
      'A2. REFINAMENTO (ACSM)',
      'B1. OBJETIVO E CONTEXTO',
      'B1b. LOGÍSTICA E PREFERÊNCIAS DE TREINO',
      'B2. HISTÓRIA CLÍNICA',
      'B3. DOR E SISTEMA MUSCULOESQUELÉTICO',
      'B4. HÁBITOS DE VIDA',
      'B5. POSTURAL / OCUPACIONAL',
    ]) {
      expect(p).toContain(titulo)
    }
  })

  it('preserva o texto livre do aluno palavra por palavra', () => {
    const p = prompt()
    expect(p).toContain('voltei a sentir dor nas costas no trabalho')
    expect(p).toContain('nada de corrida, tenho medo do joelho')
    expect(p).toContain('operei em 2019, médico liberou, mas às vezes trava')
    expect(p).toContain('tem pressa pra começar, viagem em 3 meses')
  })

  it('leva a narrativa da dor ao briefing, e antes da lista de regiões', () => {
    // Um briefing é lido de cima para baixo. Enterrar a história, o que a
    // pessoa já tentou e o que ela teme depois da lista de regiões devolveria
    // o recorte puramente biológico que a spec 1.2 abandonou.
    const p = prompt()
    expect(p).toContain('mudei de setor')
    expect(p).toContain('fisioterapia por dois meses e ajudou')
    expect(p).toContain('medo de ter uma hernia')
    expect(p.indexOf('mudei de setor')).toBeLessThan(p.indexOf('Queixa 1 — Lombar'))
  })

  it('detalha cada queixa de dor com intensidade, evolução e fatores', () => {
    const p = prompt()
    expect(p).toContain('Queixa 1 — Lombar')
    expect(p).toContain('Intensidade (escala 0 a 10): 6')
    expect(p).toContain('Crônica (mais de 12 semanas)')
    expect(p).toContain('Piora com: ficar sentado muito tempo e no fim do dia')
    expect(p).toContain('Queixa 2 — Joelho direito')
  })
})

describe('buildAnamnesePrompt — semântica das ausências', () => {
  it('campo de texto em branco vira "não respondido", nunca some', () => {
    const p = prompt()
    expect(p).toContain('Esporte/modalidade: não respondido')
  })

  it('ausência na A2 só aparece como confirmada depois da ação explícita', () => {
    const p = prompt()
    expect(p).toContain('Sinais/sintomas atuais: Nenhum (ausência confirmada)')
    expect(p).not.toContain('Sinais/sintomas atuais: não respondido')

    const incomplete = anamneseBase()
    incomplete.sinais_sintomas_confirmados = false
    expect(prompt(incomplete)).toContain('Sinais/sintomas atuais: não respondido')
  })

  it('explica as duas convenções no cabeçalho das respostas', () => {
    const p = prompt()
    expect(p).toContain('"não respondido" significa campo deixado em branco')
    expect(p).toContain('Não é confirmação ativa de ausência')
  })

  it('não lista campos que o formulário não pergunta', () => {
    // o detalhamento IPAQ existe no tipo e não tem UI: listá-lo como "não
    // respondido" sugeriria pergunta feita e ignorada
    expect(prompt()).not.toContain('Atividade física atual — tipo')
  })

  it('mostra o detalhamento IPAQ quando um payload antigo o traz preenchido', () => {
    const a = anamneseCompleta()
    a.atividade_tipo = 'caminhada'
    expect(prompt(a)).toContain('Atividade física atual — tipo: caminhada')
  })
})

describe('buildAnamnesePrompt — pseudonimização', () => {
  it('abrevia o nome e não vaza o nome completo', () => {
    const p = prompt()
    expect(p).toContain('Avaliado: Luiz F. B. B.')
    expect(p).not.toContain('Luiz Felipe Brum Boy')
  })

  it('não vaza data de nascimento; publica só a idade na data do registro', () => {
    const p = prompt()
    expect(p).not.toContain('1985-03-12')
    expect(p).toContain('Idade na data do registro: 41 anos')
  })

  it('instrui a IA a não pedir identificador', () => {
    expect(prompt()).toContain('Não peça nome completo, contato')
  })
})

describe('buildAnamnesePrompt — triagem como entrada fixa', () => {
  it('publica o resultado do gate e proíbe recálculo', () => {
    const answers = anamneseCompleta()
    const gate = computeGate(answers)
    const p = prompt(answers)
    expect(p).toContain('RESULTADO DA TRIAGEM — JÁ CALCULADO PELO SISTEMA')
    expect(p).toContain(`Liberado na triagem: ${gate.liberado ? 'sim' : 'não'}`)
    expect(p).toContain('É entrada fixa: explique, não recalcule')
    for (const motivo of gate.motivos) expect(p).toContain(motivo)
  })

  it('caso liberado sai sem motivos, e não omitido', () => {
    const p = prompt(anamneseBase())
    expect(p).toContain('Liberado na triagem: sim')
    expect(p).toContain('Motivos registrados pelo sistema: nenhum')
  })

  it('triagem incompleta não publica liberação ou encaminhamento calculados', () => {
    const p = prompt({ ...anamneseBase(), ativo_regular: null })
    expect(p).toContain('Estado da triagem: incompleta — liberação não calculada')
    expect(p).toContain('Liberado na triagem: não calculado')
    expect(p).toContain('Nível de encaminhamento: não calculado')
  })

  // Sem estas linhas a IA leria um encaminhamento já resolvido como aberto e
  // devolveria "procure um médico" para quem acabou de voltar de um.
  it('declara explicitamente quando não há parecer médico registrado', () => {
    expect(prompt()).toContain('Parecer médico registrado depois da triagem: nenhum.')
  })

  it('separa autorrelato de parecer registrado', () => {
    expect(prompt()).toContain(
      'Avaliado declara liberação médica recente (autorrelato): não respondido'
    )
    expect(
      prompt({ ...anamneseCompleta(), liberacao_declarada: true, liberacao_declarada_em: '2026-07-10' })
    ).toContain(
      'Avaliado declara liberação médica recente (autorrelato): sim em 10/07/2026 — NÃO confirmado por documento'
    )
  })

  it('publica o parecer registrado como entrada fixa', () => {
    const p = buildAnamnesePrompt({
      subject: SUBJECT,
      assessedAt: '2026-08-20',
      answers: anamneseCompleta(),
      liberacao: {
        status: 'liberado_com_restricoes',
        em: '2026-08-25',
        validade: '2027-02-25',
        obs: 'Sem exercício vigoroso por 60 dias',
        registradaEm: '2026-08-25T12:00:00.000Z',
      },
    })
    expect(p).toContain('Parecer médico registrado depois da triagem: liberado pelo médico, com restrições.')
    expect(p).toContain('Data do parecer: 25/08/2026')
    expect(p).toContain('Validade do parecer: 25/02/2027')
    expect(p).toContain('Restrições/observações do parecer: Sem exercício vigoroso por 60 dias')
    expect(p).toContain('trate-o como entrada fixa')
  })

  it('parecer vencido não é publicado como liberação vigente', () => {
    const p = buildAnamnesePrompt({
      subject: SUBJECT,
      assessedAt: '2026-08-20',
      answers: anamneseCompleta(),
      liberacao: {
        status: 'liberado',
        em: '2020-01-01',
        validade: '2020-06-01',
        obs: null,
        registradaEm: '2020-01-02T12:00:00.000Z',
      },
    })
    expect(p).toContain('Parecer médico registrado depois da triagem: liberação médica VENCIDA.')
  })

  it('recusa médica aparece em letras próprias', () => {
    const p = buildAnamnesePrompt({
      subject: SUBJECT,
      assessedAt: '2026-08-20',
      answers: anamneseCompleta(),
      liberacao: {
        status: 'nao_liberado',
        em: '2026-08-25',
        validade: null,
        obs: 'Reavaliar em 90 dias',
        registradaEm: '2026-08-25T12:00:00.000Z',
      },
    })
    expect(p).toContain('o médico avaliou e NÃO liberou a prática')
    expect(p).toContain('Validade do parecer: sem validade declarada')
  })
})

describe('buildAnamnesePrompt — blocos condicionais', () => {
  it('saúde da mulher só entra para sexo feminino', () => {
    expect(prompt()).not.toContain('B6. SAÚDE DA MULHER')
    expect(prompt(anamneseCompleta(), { ...SUBJECT, sex: 'F' })).toContain('B6. SAÚDE DA MULHER')
  })

  it('sinaliza quando o aluno não declarou veracidade', () => {
    const a = anamneseCompleta()
    a.declaracao_veracidade = false
    expect(prompt(a)).toContain('NÃO marcou a declaração')
  })

  it('repassa os sinais que o próprio app derivou', () => {
    expect(prompt()).toContain('Hiperlordose: considere fortalecer abdômen')
  })
})

describe('buildAnamnesePrompt — travas de qualidade', () => {
  it('carrega as regras de rigor e a tarefa', () => {
    const p = prompt()
    expect(p).toContain('REGRAS DE RIGOR')
    expect(p).toContain('[dado]')
    expect(p).toContain('[inferência]')
    expect(p).toContain('[hipótese]')
    expect(p).toContain('não é possível concluir com os dados disponíveis')
    expect(p).toContain('O QUE EU PRECISO DE VOCÊ')
    expect(p).toContain('7. O que este material não permite concluir')
  })

  it('fecha proibindo prescrição de treino e reafirmando quem decide', () => {
    const p = prompt()
    expect(p).toContain('Não monte treino')
    expect(p).toContain('LIMITE DESTE MATERIAL')
    expect(p).toContain('não conduta a ser seguida como está')
  })

  it('não deixa linha em branco dupla nem espaço sobrando nas pontas', () => {
    const p = prompt()
    expect(p).toBe(p.trim())
    expect(p).not.toMatch(/\n{3,}/)
  })
})
