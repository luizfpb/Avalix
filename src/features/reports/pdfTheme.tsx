import { Image, Path, StyleSheet, Svg, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { sanitizePdfText, Text } from './pdfText'
import { BRAND_LOGO } from '../../brand/paths'

// A estrutura é a da Clareza, aprovada em 08/09/2026 (docs/PDFS_CLAREZA.md).
// Desde out/2026 o papel fala a mesma língua das telas: Inter, cinzas neutros e
// o roxo da marca só onde ele informa (séries dos gráficos e links). Nada de
// faixa lilás, barra lateral, rótulo em caixa alta ou frase de efeito.
export const palette = {
  plum: '#2A0E52', violet: '#66539A', magenta: '#AD567B',
  green: '#287A63', amber: '#885019', blue: '#39779B',
  ink: '#18181B', muted: '#5F5F69', hairline: '#E4E4E7', rule: '#D4D4D8',
  surface: '#F4F4F5', paper: '#FFFFFF',
}

export const pdfTheme = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 70,
    paddingHorizontal: 34,
    fontSize: 9,
    color: palette.ink,
    fontFamily: 'Inter',
    backgroundColor: palette.paper,
  },
  header: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 76,
    height: 30,
    objectFit: 'contain',
    marginRight: 10,
    flexShrink: 0,
  },
  org: {
    fontSize: 9.5,
    fontWeight: 600,
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: -0.4,
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 8.5,
    color: palette.muted,
    marginTop: 4,
    lineHeight: 1.4,
  },
  infoCard: {
    paddingBottom: 14,
    marginBottom: 18,
    borderBottomWidth: 0.6,
    borderBottomColor: palette.hairline,
  },
  infoHeadValue: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: -0.2,
    lineHeight: 1.3,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  infoCell: {
    width: '33.333%',
    paddingRight: 12,
    marginBottom: 5,
  },
  infoCellWide: {
    width: '100%',
    paddingRight: 12,
    marginBottom: 5,
  },
  infoLabel: {
    fontSize: 7,
    color: palette.muted,
  },
  infoValue: {
    fontSize: 8.5,
    fontWeight: 600,
    marginTop: 1.5,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: palette.ink,
  },
  sectionDetail: {
    fontSize: 7.5,
    color: palette.muted,
    marginLeft: 10,
  },
  runningHeader: {
    position: 'absolute',
    top: 14,
    left: 34,
    right: 34,
    color: palette.muted,
    fontSize: 7,
    lineHeight: 1.2,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 34,
    right: 34,
    height: 36,
    borderTopWidth: 0.6,
    borderTopColor: palette.hairline,
    paddingTop: 8,
    color: palette.muted,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 14,
    flexShrink: 0,
  },
  footerEvaluator: {
    flex: 1,
    paddingHorizontal: 15,
    fontSize: 7,
    textAlign: 'center',
    lineHeight: 1.3,
  },
  footerPages: {
    fontSize: 7,
    width: 39,
    textAlign: 'right',
    flexShrink: 0,
  },
  footerNote: {
    fontSize: 6.5,
    marginTop: 4,
    lineHeight: 1.3,
  },
  // Nota de método no fim do documento: texto de rodapé, separado do
  // conteúdo por um fio, como uma nota de laudo.
  methodNote: {
    marginTop: 14,
    paddingTop: 9,
    borderTopWidth: 0.6,
    borderTopColor: palette.hairline,
  },
  methodNoteText: {
    fontSize: 7.5,
    color: palette.muted,
    lineHeight: 1.5,
  },
  methodNoteWarn: {
    fontSize: 7.5,
    color: palette.amber,
    lineHeight: 1.5,
    marginTop: 5,
  },
})

export type InfoItem = { label: string; value: string; wide?: boolean }

export function BrandWordmark({ height = 11, color = palette.plum }: { height?: number; color?: string }) {
  const [, , w, h] = BRAND_LOGO.viewBox.split(' ').map(Number)
  return <Svg width={height * (w / h)} height={height} viewBox={BRAND_LOGO.viewBox}><Path d={BRAND_LOGO.d} fill={color} /></Svg>
}

// Título é o tipo do documento ("Avaliação física"); a linha de baixo diz o
// método ou o nome do plano. Quem recebe o PDF arquiva junto com outros e
// precisa reconhecer o que é pela primeira linha.
export function ReportHeader({ logoUrl, orgName, title, subtitle }: {
  logoUrl?: string | null
  orgName: string
  title: string
  subtitle?: string | null
}) {
  return (
    <View style={pdfTheme.header} wrap={false}>
      <View style={pdfTheme.headerRow}>
        {logoUrl ? <Image src={logoUrl} style={pdfTheme.logo} /> : null}
        <Text style={pdfTheme.org}>{orgName}</Text>
      </View>
      <Text style={pdfTheme.title}>{title}</Text>
      {subtitle ? <Text style={pdfTheme.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

export function InfoCard({ items }: { items: InfoItem[] }) {
  const [head, ...rest] = items
  return (
    <View style={pdfTheme.infoCard}>
      {head ? <Text style={pdfTheme.infoHeadValue} minPresenceAhead={rest.length ? 35 : 0}>{head.value}</Text> : null}
      {rest.length ? (
        <View style={pdfTheme.infoGrid}>
          {rest.map((item, index) => (
            <View key={index} style={item.wide ? pdfTheme.infoCellWide : pdfTheme.infoCell} wrap={false}>
              <Text style={pdfTheme.infoLabel}>{item.label}</Text>
              <Text style={pdfTheme.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function SectionTitle({ children, detail, minPresenceAhead = 48 }: {
  children: ReactNode
  detail?: string
  minPresenceAhead?: number
}) {
  return (
    <View style={pdfTheme.sectionHead} wrap={false} minPresenceAhead={minPresenceAhead}>
      <Text style={pdfTheme.sectionTitle}>{children}</Text>
      {detail ? <Text style={pdfTheme.sectionDetail}>{detail}</Text> : null}
    </View>
  )
}

// O cabeçalho compacto ocupa apenas a margem das continuações. O render
// dinâmico exige saneamento explícito: não passa pelos children do Text.
export function ReportRunningHeader({ title, subject }: { title: string; subject: string }) {
  return <Text style={pdfTheme.runningHeader} fixed render={({ pageNumber }) =>
    pageNumber > 1 ? sanitizePdfText(`${title} · ${subject}`) : ''
  } />
}

// Data de emissão no rodapé: o PDF circula por WhatsApp e impressão, e quem o
// lê semanas depois precisa saber de quando é aquela versão.
export function issueNote(now: Date = new Date()): string {
  const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(now)
  return `Gerado no Avalix em ${data}`
}

export function ReportFooter({ note, evaluator, evaluatorLabel = 'Responsável' }: {
  note: string
  evaluator?: string | null
  evaluatorLabel?: string
}) {
  return (
    <View style={pdfTheme.footer} fixed>
      <View style={pdfTheme.footerRow}>
        <BrandWordmark height={8} color={palette.muted} />
        <Text style={pdfTheme.footerEvaluator}>{evaluator ? `${evaluatorLabel}: ${evaluator}` : ''}</Text>
        <Text style={pdfTheme.footerPages} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
      <Text style={pdfTheme.footerNote}>{note}</Text>
    </View>
  )
}

export function MethodNote({ children, warnings }: {
  children: ReactNode
  warnings?: { code: string; message: string }[] | null
}) {
  return (
    <View style={pdfTheme.methodNote}>
      <Text style={pdfTheme.methodNoteText} orphans={2} widows={2}>{children}</Text>
      {warnings?.map(w => (
        <Text key={w.code} style={pdfTheme.methodNoteWarn} orphans={2} widows={2}>Ressalva: {w.message}</Text>
      ))}
    </View>
  )
}

export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}
