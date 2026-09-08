import { Image, Path, StyleSheet, Svg, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { sanitizePdfText, Text } from './pdfText'
import { BRAND_LOGO } from '../../brand/paths'

// Clareza, aprovada em docs/design-pdfs/01-clareza.pdf. Os relatórios têm
// tokens próprios de papel; a identidade das telas continua independente.
export const palette = {
  plum: '#2A0E52', plumLight: '#ECE3FA', violet: '#6250A1',
  magenta: '#AC577B', green: '#2B796A', amber: '#94632A', blue: '#39779B',
  ink: '#212334', muted: '#646579', hairline: '#E4E4EE',
  surface: '#F4F2FA', paper: '#FFFFFF',
}
export const RADIUS = 12

export const pdfTheme = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 70,
    paddingHorizontal: 34,
    fontSize: 9,
    color: palette.ink,
    fontFamily: 'Manrope',
    backgroundColor: palette.paper,
  },
  header: {
    marginBottom: 17,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 21,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 16,
  },
  logo: {
    width: 76,
    height: 30,
    objectFit: 'contain',
    marginRight: 10,
    flexShrink: 0,
  },
  org: {
    fontSize: 10,
    fontWeight: 700,
    flex: 1,
  },
  orgKicker: {
    fontSize: 6.5,
    color: palette.violet,
    letterSpacing: 1.1,
  },
  kicker: {
    fontSize: 7,
    letterSpacing: 1.5,
    color: palette.violet,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 31,
    fontWeight: 700,
    letterSpacing: -1.1,
    lineHeight: 1.16,
  },
  subtitle: {
    fontSize: 8,
    color: palette.muted,
    marginTop: 6,
  },
  infoCard: {
    paddingBottom: 13,
    marginBottom: 16,
    borderBottomWidth: 0.8,
    borderBottomColor: palette.hairline,
  },
  infoHeadValue: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: -0.4,
    lineHeight: 1.3,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 9,
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
    fontWeight: 700,
    marginTop: 1,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 9,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: palette.ink,
  },
  sectionDetail: {
    fontSize: 7.5,
    color: palette.muted,
    marginLeft: 10,
  },
  runningHeader: {
    position: 'absolute',
    top: 13,
    left: 34,
    right: 34,
    color: palette.muted,
    fontSize: 6.5,
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
  methodNote: {
    marginTop: 12,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: palette.violet,
  },
  methodNoteText: {
    fontSize: 7.5,
    color: palette.muted,
    lineHeight: 1.5,
  },
  methodNoteWarn: {
    fontSize: 7.5,
    color: palette.magenta,
    lineHeight: 1.5,
    marginTop: 5,
  },
})

export type InfoItem = { label: string; value: string; wide?: boolean }

export function BrandWordmark({ height = 11, color = palette.plum }: { height?: number; color?: string }) {
  const [, , w, h] = BRAND_LOGO.viewBox.split(' ').map(Number)
  return <Svg width={height * (w / h)} height={height} viewBox={BRAND_LOGO.viewBox}><Path d={BRAND_LOGO.d} fill={color} /></Svg>
}

export function ReportHeader({ logoUrl, orgName, title, subtitle, kicker }: {
  logoUrl?: string | null
  orgName: string
  title: string
  subtitle?: string | null
  kicker?: string | null
}) {
  return (
    <View style={pdfTheme.header} wrap={false}>
      <View style={pdfTheme.headerRow}>
        <View style={pdfTheme.headerLeft}>
          {logoUrl ? <Image src={logoUrl} style={pdfTheme.logo} /> : null}
          <Text style={pdfTheme.org}>{orgName}</Text>
        </View>
        <Text style={pdfTheme.orgKicker}>AVALIAÇÃO & MOVIMENTO</Text>
      </View>
      {kicker ? <Text style={pdfTheme.kicker}>{kicker}</Text> : null}
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
