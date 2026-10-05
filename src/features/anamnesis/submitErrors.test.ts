import { describe, expect, it } from 'vitest'
import { intakeSubmitErrorMessage } from './submitErrors'

const contexto = { orgName: 'Estúdio Teste', subjectFirstName: 'Marta' }

describe('recusas do envio público da anamnese', () => {
  it('nome diferente do cadastro diz o que fazer, sem expor o nome completo', () => {
    const mensagem = intakeSubmitErrorMessage(
      { message: 'quem assina como titular deve ser o avaliado cadastrado' }, contexto)
    expect(mensagem).toMatch(/igual ao nome completo cadastrado por Estúdio Teste/)
    expect(mensagem).toMatch(/começa com "Marta"/)
    expect(mensagem).toMatch(/acentos e sobrenomes/)
  })

  it('responsável e menor sem responsável apontam para o cadastro do profissional', () => {
    expect(intakeSubmitErrorMessage({ message: 'quem assina deve ser o responsavel legal cadastrado' }, contexto))
      .toMatch(/nome do responsável legal cadastrado/)
    expect(intakeSubmitErrorMessage({ message: 'menor de idade exige aceite e cadastro do responsavel legal' }, contexto))
      .toMatch(/peça a Estúdio Teste para incluí-lo/)
  })

  it('reenvio depois de uma resposta perdida não parece perda das respostas', () => {
    expect(intakeSubmitErrorMessage({ message: 'link invalido, expirado ou ja utilizado' }, contexto))
      .toMatch(/suas respostas já foram recebidas/)
  })

  it('falha de rede continua com a mensagem de conexão', () => {
    expect(intakeSubmitErrorMessage({ message: 'TypeError: Failed to fetch' }, contexto))
      .toMatch(/Falha de conexão/)
  })
})
