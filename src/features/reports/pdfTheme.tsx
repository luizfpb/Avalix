// Tema visual compartilhado dos PDFs (avaliação e treino). Centraliza a
// identidade da marca, o cabeçalho tipo papel-timbrado, o cartão de
// informações, os títulos de seção com filete de acento e o rodapé fixo com
// numeração de página — pra os dois relatórios saírem com cara de documento
// profissional (a "vitrine") sem duplicar estilo entre os arquivos.

import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'

// Paleta da marca (hex; @react-pdf não lê CSS var). Espelha os tokens do app.
export const palette = {
  plum: '#2A0E52', // campo da marca
  plumLight: '#ECE3FA', // texto claro sobre o campo
  violet: '#8b5cf6', // acento primário
  magenta: '#d4537e', // acento secundário
  ink: '#1a1a1a',
  muted: '#666',
  hairline: '#e5e0ee',
  surface: '#f6f3fb', // fundo sutil dos cartões
}

export const pdfTheme = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    color: palette.ink,
    fontFamily: 'Helvetica',
  },

  // Cabeçalho: logo/plaqueta + org à esquerda, título + subtítulo à direita.
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'column' },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', maxWidth: 280 },
  plate: {
    backgroundColor: palette.plum,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  plateText: { fontSize: 12, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: palette.plumLight },
  logo: { height: 38, maxWidth: 200, objectFit: 'contain', alignSelf: 'flex-start' },
  org: { fontSize: 9, color: palette.muted, marginTop: 5 },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: palette.plum, textAlign: 'right' },
  subtitle: { fontSize: 9, color: palette.muted, marginTop: 3, textAlign: 'right' },
  // filete único sob o cabeçalho, na cor da marca
  ruleThick: { height: 2.5, backgroundColor: palette.plum, marginTop: 10, marginBottom: 16 },

  // Cartão de informações: nome em destaque no topo + grade de pares abaixo.
  infoCard: {
    backgroundColor: palette.surface,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: palette.violet,
    padding: 12,
    marginBottom: 16,
  },
  infoHead: { marginBottom: 8 },
  infoHeadLabel: { fontSize: 7.5, color: palette.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoHeadValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: palette.plum, marginTop: 1 },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 0.7,
    borderTopColor: '#ddd4f0',
    paddingTop: 8,
  },
  infoCell: { width: '50%', marginBottom: 6, paddingRight: 10 },
  infoCellWide: { width: '100%', marginBottom: 6, paddingRight: 10 },
  infoLabel: { fontSize: 7, color: palette.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 1 },

  // Título de seção: rótulo da marca com filete inferior de acento.
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: palette.plum,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    paddingBottom: 3,
    marginBottom: 7,
  },

  // Rodapé fixo: atribuição à esquerda, numeração à direita, com filete acima.
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
    color: '#999',
  },
})

export type InfoItem = { label: string; value: string; wide?: boolean }

// Cabeçalho de todo relatório. Sem logo da org → plaqueta AVALIX.
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
      <View style={pdfTheme.ruleThick} />
    </View>
  )
}

// Cartão com os dados-chave: o 1º item (nome do avaliado) vira destaque no
// topo; os demais formam uma grade rótulo/valor abaixo de um filete.
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
          {rest.map((it, i) => (
            <View key={i} style={it.wide ? pdfTheme.infoCellWide : pdfTheme.infoCell}>
              <Text style={pdfTheme.infoLabel}>{it.label}</Text>
              <Text style={pdfTheme.infoValue}>{it.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={pdfTheme.sectionTitle}>{children}</Text>
}

// Rodapé fixo em toda página: atribuição + "pág X/Y".
export function ReportFooter({ note }: { note: string }) {
  return (
    <View style={pdfTheme.footer} fixed>
      <Text>{note}</Text>
      <Text render={({ pageNumber, totalPages }) => `pág ${pageNumber}/${totalPages}`} />
    </View>
  )
}

// dd/mm/aaaa a partir de ISO; null → null (deixa o chamador decidir o fallback).
export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
