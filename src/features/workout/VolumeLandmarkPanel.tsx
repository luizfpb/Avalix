import {
  VOLUME_LANDMARKS_NOTE,
  VOLUME_METHOD_NOTE,
  ZONE_LABELS,
  landmarkBar,
  type LandmarkZone,
  type VolumeItem,
} from './volume'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Cor da zona via tokens da marca (inline, pra não depender de geração de
// utilitário Tailwind a partir de var custom).
const ZONE_FILL: Record<LandmarkZone, { color: string; opacity: number }> = {
  below: { color: 'var(--warning)', opacity: 1 },
  effective: { color: 'var(--primary)', opacity: 0.5 },
  optimal: { color: 'var(--primary)', opacity: 1 },
  high: { color: 'var(--chart-2)', opacity: 1 },
  above: { color: 'var(--destructive)', opacity: 1 },
}

function zoneTextClass(zone: LandmarkZone | null): string {
  if (zone === 'below') return 'text-warning'
  if (zone === 'above') return 'text-destructive'
  if (zone === 'optimal') return 'text-primary'
  return 'text-muted-foreground'
}

function fmtSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function Row({ item }: { item: VolumeItem }) {
  const bar = landmarkBar(item.muscle, item.sets)
  const fill = bar.zone ? ZONE_FILL[bar.zone] : { color: 'var(--primary)', opacity: 0.45 }
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs">{item.label}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded bg-muted">
        {/* faixa MAV (zona ótima) */}
        {bar.zone ? (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${bar.mavLowPct * 100}%`,
              width: `${Math.max(0, bar.mavHighPct - bar.mavLowPct) * 100}%`,
              backgroundColor: 'var(--primary)',
              opacity: 0.16,
            }}
          />
        ) : null}
        {/* preenchimento (séries) */}
        <div
          className="absolute inset-y-0 left-0 rounded-r"
          style={{ width: `${bar.fillPct * 100}%`, backgroundColor: fill.color, opacity: fill.opacity }}
        />
        {/* teto MRV */}
        {bar.zone && bar.mrvPct < 1 ? (
          <div
            className="absolute inset-y-0 w-px"
            style={{ left: `${bar.mrvPct * 100}%`, backgroundColor: 'var(--foreground)', opacity: 0.4 }}
          />
        ) : null}
      </div>
      <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums">
        {fmtSets(item.sets)}
      </span>
      <span className={`w-24 shrink-0 text-right text-[11px] ${zoneTextClass(bar.zone)}`}>
        {bar.zone ? ZONE_LABELS[bar.zone] : 'sem referência'}
      </span>
    </div>
  )
}

export function VolumeLandmarkPanel({
  items,
  typicalWeek,
  emptyHint,
}: {
  items: VolumeItem[]
  typicalWeek: number
  emptyHint?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Volume semanal por grupo{' '}
          <span className="font-normal text-muted-foreground">· semana {typicalWeek}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyHint ?? 'Sem volume ainda.'}
          </p>
        ) : (
          <>
            {items.map((it) => (
              <Row key={it.muscle} item={it} />
            ))}
            {/* legenda das zonas */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
              <LegendDot color="var(--warning)" label="abaixo do mínimo" />
              <LegendDot color="var(--primary)" label="efetivo / ótimo" />
              <LegendDot color="var(--chart-2)" label="alto" />
              <LegendDot color="var(--destructive)" label="acima do máximo" />
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-px bg-foreground/40" /> teto (MRV)
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{VOLUME_METHOD_NOTE}</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{VOLUME_LANDMARKS_NOTE}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
