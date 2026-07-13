import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

// Hex direto porque o renderer não interpreta os tokens CSS do app.
export const palette = {
  plum: '#2A0E52',
  plumLight: '#ECE3FA',
  violet: '#6B5A9B',
  magenta: '#A95D7E',
  green: '#397D6C',
  ink: '#202832',
  muted: '#65717E',
  hairline: '#DCE2E8',
  surface: '#F3F6F7',
  paper: '#FCFCFB',
}

export const pdfTheme = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    color: palette.ink,
    fontFamily: 'Helvetica',
    backgroundColor: palette.paper,
  },

  // A régua referencia a antropometria e amarra visualmente app e relatório.
  header: { flexDirection: 'row', alignItems: 'stretch' },
  measureRail: { width: 10, marginRight: 12, position: 'relative' },
  measureLine: { width: 2.2, height: 53, backgroundColor: palette.violet, borderRadius: 2 },
  measureTickLong: {
    position: 'absolute',
    left: 0,
    top: 8,
    width: 7,
    height: 1,
    backgroundColor: palette.violet,
  },
  measureTickMid: {
    position: 'absolute',
    left: 0,
    top: 25,
    width: 5,
    height: 1,
    backgroundColor: palette.violet,
  },
  measureTickShort: {
    position: 'absolute',
    left: 0,
    top: 42,
    width: 3.5,
    height: 1,
    backgroundColor: palette.violet,
  },
  headerBody: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flexDirection: 'column' },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', maxWidth: 300 },
  plate: {
    backgroundColor: palette.plum,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 3,
  },
  plateText: {
    fontSize: 11.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2.2,
    color: palette.plumLight,
  },
  logo: { height: 38, maxWidth: 200, objectFit: 'contain', alignSelf: 'flex-start' },
  org: { fontSize: 8.5, color: palette.muted, marginTop: 6 },
  title: {
    fontSize: 19,
    fontFamily: 'Helvetica-Bold',
    color: palette.plum,
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  subtitle: { fontSize: 8.5, color: palette.muted, marginTop: 4, textAlign: 'right' },
  ruleThick: {
    height: 0.8,
    backgroundColor: palette.hairline,
    marginTop: 12,
    marginBottom: 17,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
    borderWidth: 0.75,
    borderColor: palette.hairline,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  infoHead: {
    marginBottom: 9,
    borderLeftWidth: 2.5,
    borderLeftColor: palette.violet,
    paddingLeft: 9,
  },
  infoHeadLabel: {
    fontSize: 7.5,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoHeadValue: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: palette.plum,
    marginTop: 1.5,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 0.7,
    borderTopColor: palette.hairline,
    paddingTop: 9,
  },
  infoCell: { width: '50%', marginBottom: 6, paddingRight: 10 },
  infoCellWide: { width: '100%', marginBottom: 6, paddingRight: 10 },
  infoLabel: {
    fontSize: 7,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 1 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionAccent: {
    width: 18,
    height: 2.2,
    borderRadius: 2,
    backgroundColor: palette.violet,
    marginRight: 7,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: palette.plum,
    textTransform: 'uppercase',
    letterSpacing: 0.65,
  },

  footer: {
    position: 'absolute',
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.6,
    borderTopColor: palette.hairline,
    paddingTop: 5,
    fontSize: 7.5,
    color: '#7B8590',
  },
  footerBrand: { fontFamily: 'Helvetica-Bold', color: palette.plum, letterSpacing: 0.5 },
})

export type InfoItem = { label: string; value: string; wide?: boolean }

export function ReportHeader({
  logoUrl,
  orgName,
  title,
  subtitle,
}: {
  logoUrl?: string | null
  orgName: string
  title: string
  subtitle?: string | null
}) {
  return (
    <View>
      <View style={pdfTheme.header}>
        <View style={pdfTheme.measureRail}>
          <View style={pdfTheme.measureLine} />
          <View style={pdfTheme.measureTickLong} />
          <View style={pdfTheme.measureTickMid} />
          <View style={pdfTheme.measureTickShort} />
        </View>
        <View style={pdfTheme.headerBody}>
          <View style={pdfTheme.headerLeft}>
            {logoUrl ? (
              <Image src={logoUrl} style={pdfTheme.logo} />
            ) : (
              <View style={pdfTheme.plate}>
                <Text style={pdfTheme.plateText}>AVALIX</Text>
              </View>
            )}
            <Text style={pdfTheme.org}>{orgName}</Text>
          </View>
          <View style={pdfTheme.headerRight}>
            <Text style={pdfTheme.title}>{title}</Text>
            {subtitle ? <Text style={pdfTheme.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      </View>
      <View style={pdfTheme.ruleThick} />
    </View>
  )
}

export function InfoCard({ items }: { items: InfoItem[] }) {
  const [head, ...rest] = items
  return (
    <View style={pdfTheme.infoCard}>
      {head ? (
        <View style={pdfTheme.infoHead}>
          <Text style={pdfTheme.infoHeadLabel}>{head.label}</Text>
          <Text style={pdfTheme.infoHeadValue}>{head.value}</Text>
        </View>
      ) : null}
      {rest.length > 0 ? (
        <View style={pdfTheme.infoGrid}>
          {rest.map((item, index) => (
            <View key={index} style={item.wide ? pdfTheme.infoCellWide : pdfTheme.infoCell}>
              <Text style={pdfTheme.infoLabel}>{item.label}</Text>
              <Text style={pdfTheme.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <View style={pdfTheme.sectionHead} wrap={false} minPresenceAhead={112}>
      <View style={pdfTheme.sectionAccent} />
      <Text style={pdfTheme.sectionTitle}>{children}</Text>
    </View>
  )
}

export function ReportFooter({ note }: { note: string }) {
  return (
    <View style={pdfTheme.footer} fixed>
      <Text>
        <Text style={pdfTheme.footerBrand}>AVALIX</Text> · {note}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `pág. ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}
