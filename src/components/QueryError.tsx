import { Button } from '@/components/ui/button'

export function QueryError({
  message = 'Não foi possível carregar os dados.',
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4" role="alert">
      <p className="text-sm text-destructive">{message}</p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  )
}
