import { describe, it, expect } from 'vitest'
import { buildAssessmentPrompt, buildAssessmentSeriesPrompt, seriesConsistency } from './assessment'
import { SUBJECT, point, pointWith, SKINFOLDS } from './fixtures'

const serie = [pointWith('2026-01-15', 92, 26.1), pointWith('2026-04-20', 89.5, 24.4), pointWith('2026-08-20', 88, 22.3)]

function isolada(overrides = {}) {
  return buildAssessmentPrompt({
    subject: SUBJECT,
    point: point('2026-08-20'),
    skinfolds: SKINFOLDS,
    ...overrides,
  })
}

describe('buildAssessmentPrompt — avaliação isolada', () => {
  it('publica protocolo, motor e as medidas de entrada', () => {
    const p = isolada()
    expect(p).toContain('Protocolo: Jackson-Pollock 7 dobras')
    expect(p).toContain('Versão do motor de cálculo: 1.1.0')
    expect(p).toContain('Peso: 88.0 kg')
    expect(p).toContain('Altura: 178.0 cm')
  })

  it('acompanha cada número da referência que o classifica', () => {
    const p = isolada()
    expect(p).toContain('IMC: 27.8 — Sobrepeso (faixas OMS para adultos)')
    expect(p).toContain('22.3% — Aceitável (faixas ACE por sexo, sem ajuste por idade)')
  })

  it('mostra as duas conversões e diz qual o app usa', () => {
    const p = isolada()
    expect(p).toContain('Siri 22.3% · Brozek 22.0% (o app usa Siri como principal)')
  })

  it('traz as aferições cruas e a amplitude, não só a média', () => {
    const p = isolada()
    expect(p).toContain('Peitoral: 14.0 / 15.0 / 14.0 mm (média 14.3 mm, amplitude 1.0 mm)')
    // ponto com uma aferição só não inventa amplitude
    expect(p).toContain('Coxa: 18.0 mm (média 18.0 mm)')
  })

  it('carrega as premissas de método e proíbe substituí-las por memória', () => {
    const p = isolada()
    expect(p).toContain('PREMISSAS METODOLÓGICAS')
    expect(p).toContain('erro-padrão de estimativa da ordem de 3 a 4 pontos percentuais')
    expect(p).toContain('Se você não souber com segurança o erro do protocolo citado')
  })

  it('deixa explícito que não há série para comparar', () => {
    expect(isolada()).toContain('Não há comparação com outras datas neste material')
  })

  it('repassa as ressalvas gravadas no cálculo', () => {
    const comRessalva = point('2026-08-20', {
      results: {
        ...point('2026-08-20').results!,
        warnings: [{ code: 'idade-fora-da-faixa', message: 'Este protocolo foi validado em pessoas de 18 a 61 anos.' }],
      },
    })
    const p = buildAssessmentPrompt({ subject: SUBJECT, point: comRessalva, skinfolds: [] })
    expect(p).toContain('[idade-fora-da-faixa]')
    expect(p).toContain('Este protocolo foi validado em pessoas de 18 a 61 anos.')
  })

  it('sem ressalva, diz que não houve em vez de omitir o bloco', () => {
    expect(isolada()).toContain('Ressalvas do protocolo: nenhuma registrada no cálculo.')
  })

  it('avaliação sem protocolo de composição não quebra e informa a ausência', () => {
    const p = buildAssessmentPrompt({
      subject: SUBJECT,
      point: point('2026-08-20', { protocolId: null, results: null, engineVersion: null }),
      skinfolds: [],
    })
    expect(p).toContain('Percentual de gordura: não calculado')
    expect(p).toContain('IMC: 27.8')
  })

  it('inclui medicamentos e observações do avaliador quando existirem', () => {
    const p = isolada({ medications: 'levotiroxina 75mcg', notes: 'coleta em jejum' })
    expect(p).toContain('REGISTRO DO AVALIADOR')
    expect(p).toContain('levotiroxina 75mcg')
    expect(p).toContain('coleta em jejum')
    expect(isolada()).not.toContain('REGISTRO DO AVALIADOR')
  })
})

describe('seriesConsistency', () => {
  it('detecta protocolo constante', () => {
    const c = seriesConsistency(serie)
    expect(c.protocoloMudou).toBe(false)
    expect(c.motoresMudaram).toBe(false)
  })

  it('detecta troca de protocolo e de motor', () => {
    const misto = [serie[0], { ...serie[1], protocolId: 'usNavy', engineVersion: '1.0.0' }, serie[2]]
    const c = seriesConsistency(misto)
    expect(c.protocoloMudou).toBe(true)
    expect(c.motoresMudaram).toBe(true)
    expect(c.protocolos).toContain('usNavy')
  })

  it('ignora avaliações sem resultado ao comparar protocolos', () => {
    const comVazia = [...serie, point('2026-10-01', { protocolId: null, results: null })]
    expect(seriesConsistency(comVazia).protocoloMudou).toBe(false)
  })
})

describe('buildAssessmentSeriesPrompt', () => {
  it('monta uma linha por avaliação, em ordem cronológica', () => {
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: serie })
    expect(p).toContain('SÉRIE DE AVALIAÇÕES — 3 registros')
    expect(p).toContain('15/01/2026 | 92.0 | 29.0 | 26.1')
    expect(p).toContain('20/08/2026 | 88.0 | 27.8 | 22.3')
    expect(p.indexOf('15/01/2026 | 92.0')).toBeLessThan(p.indexOf('20/08/2026 | 88.0'))
  })

  it('calcula os intervalos e a variação total com sinal explícito', () => {
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: serie })
    expect(p).toContain('15/01/2026 → 20/04/2026: 95 dias')
    expect(p).toContain('intervalo de 217 dias')
    expect(p).toContain('Peso: -4.0 kg')
    expect(p).toContain('Massa magra: +0.4 kg')
    expect(p).toContain('Percentual de gordura: -3.8 pontos percentuais')
  })

  it('alerta quando o protocolo muda no meio da série', () => {
    const misto = [serie[0], { ...serie[1], protocolId: 'usNavy' }, serie[2]]
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: misto })
    expect(p).toContain('ATENÇÃO — o protocolo mudou ao longo da série')
    expect(p).toContain('não é diretamente comparável')
    expect(p).toContain('US Navy (circunferências)')
  })

  it('não inventa alerta quando o protocolo é o mesmo', () => {
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: serie })
    expect(p).not.toContain('ATENÇÃO — o protocolo mudou')
  })

  it('registra a troca de motor sem transformar em motivo para descartar', () => {
    const misto = [serie[0], { ...serie[1], engineVersion: '1.0.0' }, serie[2]]
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: misto })
    expect(p).toContain('versão do motor de cálculo difere')
    expect(p).toContain('Não é motivo para descartar a comparação')
  })

  it('tabela de circunferências marca ponto não medido sem confundir com zero', () => {
    const semCintura = point('2026-10-01', { circumferences: [{ site: 'arm_relaxed_r', valueCm: 34 }] })
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: [...serie, semCintura] })
    expect(p).toContain('não foi medido naquela data, não que o valor seja zero')
    expect(p).toMatch(/Cintura \| 92\.0 \| 92\.0 \| 92\.0 \| —/)
  })

  it('exige que a tarefa separe mudança real de ruído de medição', () => {
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: serie })
    expect(p).toContain('quais estão dentro do ruído de medição')
    expect(p).toContain('5. Fatores de confusão')
    expect(p).toContain('7. O que esta série não permite concluir')
  })

  it('série de dois pontos ainda funciona', () => {
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: serie.slice(0, 2) })
    expect(p).toContain('SÉRIE DE AVALIAÇÕES — 2 registros')
    expect(p).toContain('intervalo de 95 dias')
  })
})

describe('buildAssessmentSeriesPrompt — lacunas na série', () => {
  it('omite a variação de composição quando falta protocolo numa ponta e diz por quê', () => {
    const semResultado = point('2026-12-01', { protocolId: null, results: null })
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: [...serie, semResultado] })
    // peso e IMC saem das colunas da avaliação, então continuam
    expect(p).toContain('Peso: -4.0 kg')
    // "Percentual de gordura: não respondido" seria uma frase sem sentido aqui
    expect(p).not.toContain('Percentual de gordura: não respondido')
    expect(p).not.toContain('Massa magra: não respondido')
    expect(p).toContain('uma das pontas da série não tem protocolo de composição calculado')
  })

  it('série completa não ganha a ressalva de lacuna', () => {
    const p = buildAssessmentSeriesPrompt({ subject: SUBJECT, points: serie })
    expect(p).not.toContain('uma das pontas da série')
  })
})
