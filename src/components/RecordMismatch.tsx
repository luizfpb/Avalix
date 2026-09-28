import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

// A URL diz de qual avaliado é a tela, mas o registro (plano, sessão postural,
// foto) vem pelo próprio id. Anamnese e avaliação já recusavam o par trocado;
// treino e postura montavam a tela misturando os dois — no editor de treino,
// com as restrições da anamnese do avaliado da URL sobre o plano de outro.
// Nenhum dado era gravado no lugar errado (as RPCs usam o id do registro), mas
// a tela afirmava algo falso sobre de quem era o que estava aberto.
export function RecordMismatch({ what, backTo }: { what: string; backTo: string }) {
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">
        {what} não pertence a este avaliado. Abra-o pela página do avaliado correto.
      </p>
      <Button asChild variant="outline">
        <Link to={backTo}>Voltar</Link>
      </Button>
    </div>
  )
}
