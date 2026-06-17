import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Carregado sob demanda (React.lazy) pra Recharts não entrar no bundle inicial,
// mesmo padrão do PDF. Recebe os pontos já prontos e ordenados.
export type EvolutionPoint = {
  date: string // dd/mm pra eixo
  bodyFatPct: number | null // null nas avaliações sem protocolo
  weightKg: number
  bmi: number
}

// % gordura e IMC compartilham o eixo da esquerda (mesma ordem de grandeza);
// peso fica na direita, em kg.
export default function EvolutionChart({ data }: { data: EvolutionPoint[] }) {
  const tick = { fill: 'var(--color-muted-foreground)', fontSize: 11 }
  const axis = { stroke: 'var(--color-border)' }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tick={tick} tickMargin={6} axisLine={axis} tickLine={axis} />
        <YAxis yAxisId="left" tick={tick} width={36} axisLine={axis} tickLine={axis} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={tick}
          width={36}
          axisLine={axis}
          tickLine={axis}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--color-popover-foreground)' }}
          formatter={(value, name) => {
            if (value == null) return ['—', name]
            const n = Number(value)
            if (name === 'Peso') return [`${n.toFixed(1)} kg`, name]
            if (name === '% Gordura') return [`${n.toFixed(1)}%`, name]
            return [n.toFixed(1), name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted-foreground)' }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="bodyFatPct"
          name="% Gordura"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          connectNulls
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="bmi"
          name="IMC"
          stroke="var(--color-chart-3)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="weightKg"
          name="Peso"
          stroke="var(--color-chart-5)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
