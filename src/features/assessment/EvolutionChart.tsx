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
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="date" fontSize={11} tickMargin={6} />
        <YAxis yAxisId="left" fontSize={11} width={36} />
        <YAxis yAxisId="right" orientation="right" fontSize={11} width={36} />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          formatter={(value, name) => {
            if (value == null) return ['—', name]
            const n = Number(value)
            if (name === 'Peso') return [`${n.toFixed(1)} kg`, name]
            if (name === '% Gordura') return [`${n.toFixed(1)}%`, name]
            return [n.toFixed(1), name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="bodyFatPct"
          name="% Gordura"
          stroke="#ef4444"
          strokeWidth={2}
          connectNulls
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="bmi"
          name="IMC"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="weightKg"
          name="Peso"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
