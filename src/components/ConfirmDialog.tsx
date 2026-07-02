import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

// Confirmação destrutiva padronizada (substitui o window.confirm nativo, que
// exibe chrome do navegador e destoa do app). Casos de altíssimo risco, como a
// exclusão definitiva do avaliado, continuam com confirmação por nome digitado.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  // <dialog> nativo: showModal dá foco preso, camada própria e Esc de graça
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onCancel={onCancel}
      className="m-auto w-full max-w-sm rounded-lg border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/50"
    >
      <div className="space-y-3 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
