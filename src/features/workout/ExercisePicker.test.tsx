// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExercisePicker } from './ExercisePicker'
import type { ExerciseRow } from './api'

vi.mock('./ExerciseForm', () => ({ ExerciseForm: () => null }))

afterEach(cleanup)

function row(id: string, name: string, aliases: string[] = []): ExerciseRow {
  return {
    id,
    name,
    aliases,
    org_id: null,
    primary_muscle: 'triceps',
    additional_primary_muscles: [],
    secondary_muscles: [],
    equipment: 'cable',
    movement_pattern: 'isolation',
    is_unilateral: false,
    cues: null,
    catalog_video_url: null,
    own_video_url: null,
    created_at: '',
    created_by: null,
    updated_at: '',
  }
}

const catalogo = [
  row('corda', 'Tríceps na polia (corda)', ['tríceps corda']),
  row('reta', 'Tríceps na polia (barra reta)', ['tríceps pulley']),
  row('puxada', 'Puxada frontal pronada', ['pulley']),
]

function abrir(props: Partial<Parameters<typeof ExercisePicker>[0]> = {}) {
  const onPick = vi.fn()
  render(
    <MemoryRouter>
      <ExercisePicker exercises={catalogo} orgId="org" onPick={onPick} {...props} />
    </MemoryRouter>
  )
  fireEvent.click(screen.getByRole('button', { name: /adicionar exercício/i }))
  return onPick
}

const buscar = (texto: string) =>
  fireEvent.change(screen.getByLabelText('Buscar exercício'), { target: { value: texto } })

describe('ExercisePicker', () => {
  it('acha sem acento e fora de ordem', () => {
    abrir()
    buscar('triceps corda')
    expect(screen.getByRole('button', { name: /Tríceps na polia \(corda\)/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /barra reta/ })).toBeNull()
  })

  it('acha pelo apelido e mostra o apelido que bateu', () => {
    abrir()
    buscar('pulley')
    expect(screen.getByText('também chamado: pulley')).toBeTruthy()
    expect(screen.getByText('também chamado: tríceps pulley')).toBeTruthy()
  })

  it('no editor, continua aberto depois de escolher e diz o que entrou', () => {
    const onPick = abrir({ stayOpen: true })
    buscar('corda')
    fireEvent.click(screen.getByRole('button', { name: /Tríceps na polia \(corda\)/ }))
    expect(onPick).toHaveBeenCalledWith('corda')
    expect(screen.getByText(/Tríceps na polia \(corda\) adicionado/)).toBeTruthy()
    expect((screen.getByLabelText('Buscar exercício') as HTMLInputElement).value).toBe('')
  })

  it('sem stayOpen, fecha depois de escolher', () => {
    const onPick = abrir()
    fireEvent.click(screen.getByRole('button', { name: /Puxada frontal pronada/ }))
    expect(onPick).toHaveBeenCalledWith('puxada')
    expect(screen.queryByLabelText('Buscar exercício')).toBeNull()
  })

  it('o que já está na lista aparece apagado com o motivo, em vez de sumir', () => {
    const onPick = abrir({ excludedExerciseIds: new Set(['reta']), excludedLabel: 'já está nesta divisão' })
    const botao = screen.getByRole('button', { name: /barra reta/ }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(botao.textContent).toContain('já está nesta divisão')
    fireEvent.click(botao)
    expect(onPick).not.toHaveBeenCalled()
  })
})
