// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import PosturaSessaoDetalhe from './PosturaSessaoDetalhe'
import type { PosturePhotoRow } from '../features/posture/api'

const mocks = vi.hoisted(() => ({
  signedUrls: vi.fn(),
  useSession: vi.fn(),
  usePhotos: vi.fn(),
  useAddPhoto: vi.fn(),
  useDeletePhoto: vi.fn(),
  useDeleteSession: vi.fn(),
  useAnnotatedPhotoIds: vi.fn(),
  useAnnotation: vi.fn(),
  useSignedUrls: vi.fn(),
}))

vi.mock('../features/posture/api', () => ({
  signedUrls: mocks.signedUrls,
  categoryLabel: (category: string) =>
    ({ frente: 'Frente', costas: 'Costas' })[category] ?? category,
  PHOTO_CATEGORIES: [
    { value: 'frente', label: 'Frente' },
    { value: 'costas', label: 'Costas' },
  ],
}))

vi.mock('../features/posture/hooks', () => ({
  useSession: mocks.useSession,
  usePhotos: mocks.usePhotos,
  useAddPhoto: mocks.useAddPhoto,
  useDeletePhoto: mocks.useDeletePhoto,
  useDeleteSession: mocks.useDeleteSession,
  useAnnotatedPhotoIds: mocks.useAnnotatedPhotoIds,
  useAnnotation: mocks.useAnnotation,
  useSignedUrls: mocks.useSignedUrls,
}))

vi.mock('../features/organization/context', () => ({
  useOrganization: () => ({ organization: { id: 'org-1' } }),
}))

vi.mock('../components/AnnotationCanvas', () => ({
  AnnotationCanvas: ({ src }: { src: string }) => <div data-testid="annotation-canvas" data-src={src} />,
}))

function photo(id: string, category: 'frente' | 'costas'): PosturePhotoRow {
  return {
    id,
    category,
    created_at: '2026-08-20T10:00:00Z',
    custom_label: null,
    format: 'webp',
    height: 1200,
    org_id: 'org-1',
    session_id: 'session-1',
    size_bytes: 100,
    storage_path: `${id}.webp`,
    thumb_path: `${id}_thumb.webp`,
    width: 800,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/avaliados/subject-1/postural/session-1']}>
      <Routes>
        <Route
          path="/avaliados/:id/postural/:sessionId"
          element={<PosturaSessaoDetalhe />}
        />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mocks.useSession.mockReturnValue({
    data: {
      id: 'session-1',
      taken_at: '2026-08-20',
      notes: null,
    },
    isPending: false,
    isError: false,
  })
  mocks.usePhotos.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  mocks.useAddPhoto.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
  mocks.useDeletePhoto.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null })
  mocks.useDeleteSession.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, error: null })
  mocks.useAnnotatedPhotoIds.mockReturnValue({
    data: new Set<string>(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  mocks.useAnnotation.mockReturnValue({
    data: { doc: { shapes: [] } },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  mocks.useSignedUrls.mockReturnValue({
    data: {},
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  mocks.signedUrls.mockReset()

  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  })
})

afterEach(cleanup)

describe('PosturaSessaoDetalhe', () => {
  it('não fica presa no carregamento quando a sessão não tem fotos', () => {
    mocks.useSignedUrls.mockReturnValue({ data: {}, isPending: true, isError: false })
    mocks.useAnnotatedPhotoIds.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })

    renderPage()

    expect(screen.getByText('Nenhuma foto nesta sessão ainda.')).toBeTruthy()
    expect(screen.queryByText('Carregando...')).toBeNull()
    expect(screen.getByLabelText('Adicionar foto')).toBeTruthy()
  })

  it('ignora a URL atrasada de uma foto fechada ao abrir outra', async () => {
    const first = photo('photo-a', 'frente')
    const second = photo('photo-b', 'costas')
    const firstRequest = deferred<Record<string, string>>()
    const secondRequest = deferred<Record<string, string>>()
    mocks.usePhotos.mockReturnValue({
      data: [first, second],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    mocks.useSignedUrls.mockReturnValue({
      data: {
        [first.thumb_path]: 'thumb-a',
        [second.thumb_path]: 'thumb-b',
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })
    mocks.signedUrls
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)

    renderPage()
    fireEvent.click(screen.getByAltText('Frente').closest('button') as HTMLButtonElement)
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }))
    fireEvent.click(screen.getByAltText('Costas').closest('button') as HTMLButtonElement)

    secondRequest.resolve({ [second.storage_path]: 'full-b' })
    await waitFor(() =>
      expect(screen.getByTestId('annotation-canvas').getAttribute('data-src')).toBe('full-b')
    )

    firstRequest.resolve({ [first.storage_path]: 'full-a' })
    await waitFor(() =>
      expect(screen.getByTestId('annotation-canvas').getAttribute('data-src')).toBe('full-b')
    )
  })

  it('expõe falha de exclusão de foto como alerta', () => {
    mocks.useDeletePhoto.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: new Error('falha ao excluir foto'),
    })

    renderPage()

    expect(screen.getByRole('alert').textContent).toContain('falha ao excluir foto')
  })
})
