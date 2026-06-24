import { Link } from 'react-router-dom'
import { OneRmCalculator } from '../features/workout/OneRmCalculator'
import { Card, CardContent } from '@/components/ui/card'

export default function Calculadora1RM() {
  return (
    <div className="max-w-md space-y-5">
      <div>
        <Link to="/configuracoes" className="text-sm text-muted-foreground hover:text-foreground">
          ← Configurações
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Calculadora de carga (1RM)</h1>
        <p className="text-sm text-muted-foreground">
          Estime o 1RM a partir de uma série e use a tabela de %1RM para prescrever a carga-alvo.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <OneRmCalculator />
        </CardContent>
      </Card>
    </div>
  )
}
