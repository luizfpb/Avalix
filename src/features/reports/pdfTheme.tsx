import { Image, Path, StyleSheet, Svg, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { Text } from './pdfText'
import { BRAND_LOGO, BRAND_MARK } from '../../brand/paths'

// Hex direto porque o renderer não interpreta os tokens CSS do app — mas os
// valores são EXATAMENTE os do tema claro em src/index.css, não aproximações.
// Antes havia deriva em quase todos (violet #6B5A9B vs #66539A, magenta
// #A95D7E vs #AD567B, verde #397D6C vs #287A63, ink #202832 vs #18212B), e é
// isso que fazia o laudo parecer de outro produto. A referência é o modo claro
// porque o papel é branco.
export const palette = {
  plum: '#2A0E52', // --brand
  plumLight: '#ECE3FA', // --brand-foreground
  violet: '#66539A', // --primary / --chart-1
  magenta: '#AD567B', // --brand-magenta / --chart-2
  green: '#287A63', // --success / --chart-3
  amber: '#B77A35', // --chart-4
  blue: '#39779B', // --chart-5
  ink: '#18212B', // --foreground
  muted: '#66717E', // --muted-foreground
  hairline: '#DCE2E8', // --border
  surface: '#F4F6F8', // --background
  paper: '#FFFFFF',
}

// Raio dos cartões: 12pt espelha o --radius: 0.75rem do app. O PDF usava 3-7pt
// e por isso parecia mais duro que a interface.
export const RADIUS = 12

export const pdfTheme = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    color: palette.ink,
    fontFamily: 'Manrope',
    backgroundColor: palette.paper,
  },

  // Cabeçalho: a marca de quem ASSINA (a organização) lidera — é ela que o
  // aluno reconhece —, e o Avalix fica como marca de fabricante, discreto no
  // rodapé. Saiu daqui a régua decorativa de três traços: um risco vertical
  // solto na margem, que não dizia nada e era a primeira coisa que se via.
  header: { paddingBottom: 13 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', maxWidth: 290 },

  // Campo da marca reduzido: o quadrado plum com o "A", igual ao BrandMark do
  // app, usado quando a organização não subiu logo próprio.
  markField: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: palette.plum,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  logo: { height: 34, maxWidth: 168, objectFit: 'contain', marginRight: 11 },
  org: {
    fontSize: 12.5,
    fontFamily: 'Manrope', fontWeight: 700,
    color: palette.ink,
    letterSpacing: -0.1,
  },
  orgKicker: {
    fontSize: 6.8,
    color: palette.violet,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: 2.5,
  },
  // Newsreader aparece exatamente DUAS vezes no documento: aqui e no nome do
  // avaliado. E a mesma restricao do app (h1-h3 serif, resto sans); serif solto
  // em rotulo e tabela viraria ruido.
  title: {
    fontSize: 21,
    fontFamily: 'Newsreader', fontWeight: 600,
    color: palette.plum,
    textAlign: 'right',
    letterSpacing: -0.45,
  },
  subtitle: { fontSize: 8.5, color: palette.muted, marginTop: 4, textAlign: 'right' },
  // O campo da marca reduzido a uma linha: fecha o cabeçalho com a cor da casa
  // em vez do fio cinza genérico de antes.
  ruleThick: {
    height: 2,
    backgroundColor: palette.plum,
    borderRadius: 1,
    marginBottom: 17,
  },

  infoCard: {
    backgroundColor: palette.paper,
    borderRadius: RADIUS,
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
    fontSize: 16,
    fontFamily: 'Newsreader', fontWeight: 600,
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
  infoValue: { fontSize: 10, fontFamily: 'Manrope', fontWeight: 700, marginTop: 1 },

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
    fontFamily: 'Manrope', fontWeight: 700,
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
  footerBrand: { fontFamily: 'Manrope', fontWeight: 700, color: palette.plum, letterSpacing: 0.5 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 },
  footerNote: { marginLeft: 6, color: '#7B8590' },

  methodNote: {
    marginTop: 10,
    padding: 8,
    borderWidth: 0.6,
    borderColor: palette.hairline,
    borderRadius: RADIUS,
    backgroundColor: palette.surface,
  },
  methodNoteText: { fontSize: 7.5, color: palette.muted, lineHeight: 1.45 },
  methodNoteWarn: {
    fontSize: 7.5,
    color: palette.magenta,
    lineHeight: 1.45,
    marginTop: 4,
  },
})

export type InfoItem = { label: string; value: string; wide?: boolean }

// Nota de design: houve aqui uma tentativa de trazer a .measurement-field do
// app (a retícula que desvanece) para o cabeçalho. Renderizada, ficou pior do
// que a régua de três traços que ela substituía — as verticais viravam riscos
// soltos com corte duro atrás do título. Na tela a retícula funciona porque o
// mask CSS a dissolve de verdade; o @react-pdf não tem mask, e imitar à mão
// vira sujeira impressa. O cabeçalho carrega a identidade pelo campo da marca,
// pela cor e pela régua plum, que é o bastante. Fica registrado para ninguém
// tentar de novo achando que é uma boa ideia.

// Wordmark AVALIX como VETOR, o mesmo path que o app desenha (src/brand/paths).
// Antes o PDF escrevia "AVALIX" em Helvetica com letter-spacing, o que é uma
// imitação do logotipo, não o logotipo.
export function BrandWordmark({ height = 11, color = palette.plum }: { height?: number; color?: string }) {
  const [, , w, h] = BRAND_LOGO.viewBox.split(' ').map(Number)
  return (
    <Svg width={height * (w / h)} height={height} viewBox={BRAND_LOGO.viewBox}>
      <Path d={BRAND_LOGO.d} fill={color} />
    </Svg>
  )
}

function BrandMarkField() {
  const [, , w, h] = BRAND_MARK.viewBox.split(' ').map(Number)
  const alt = 17
  return (
    <View style={pdfTheme.markField}>
      <Svg width={alt * (w / h)} height={alt} viewBox={BRAND_MARK.viewBox}>
        <Path d={BRAND_MARK.d} fill={palette.plumLight} />
      </Svg>
    </View>
  )
}

// kicker: rótulo curto acima/abaixo do nome da organização. Existe para dizer
// o que o documento é antes do título grande, na voz da casa.
export function ReportHeader({
  logoUrl,
  orgName,
  title,
  subtitle,
  kicker,
}: {
  logoUrl?: string | null
  orgName: string
  title: string
  subtitle?: string | null
  kicker?: string | null
}) {
  return (
    <View>
      <View style={pdfTheme.header}>
        <View style={pdfTheme.headerRow}>
          <View style={pdfTheme.headerLeft}>
            {logoUrl ? <Image src={logoUrl} style={pdfTheme.logo} /> : <BrandMarkField />}
            <View>
              <Text style={pdfTheme.org}>{orgName}</Text>
              {/* kicker só aparece se disser algo que o título não diz. Sem
                  texto de enfeite: um rótulo generico embaixo do nome da
                  organizacao não ajuda ninguém a ler o documento. */}
              {kicker ? <Text style={pdfTheme.orgKicker}>{kicker}</Text> : null}
            </View>
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

// evaluator: quem assina o documento. Um laudo de saúde sem identificação do
// profissional responsável não é um documento profissional — e o dado já
// existia no banco (evaluator_id), só não chegava ao papel.
export function ReportFooter({ note, evaluator }: { note: string; evaluator?: string | null }) {
  return (
    <View style={pdfTheme.footer} fixed>
      <View style={pdfTheme.footerLeft}>
        {/* O wordmark de verdade, pequeno: marca de fabricante. Quem assina o
            documento é o profissional, e o nome dele vem logo ao lado. */}
        <BrandWordmark height={7} color={palette.plum} />
        <Text style={pdfTheme.footerNote}>
          {note}
          {evaluator ? ` · ${evaluator}` : ''}
        </Text>
      </View>
      <Text render={({ pageNumber, totalPages }) => `pág. ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

// Ressalva obrigatória num documento que trata dado de saúde: avaliação física
// estima, não diagnostica. Também é onde entram as ressalvas de domínio do
// motor (idade extrapolada, soma acima do vértice da parábola), para que a
// limitação viaje junto com o número em vez de ficar só na tela.
export function MethodNote({
  children,
  warnings,
}: {
  children: ReactNode
  warnings?: { code: string; message: string }[] | null
}) {
  return (
    <View style={pdfTheme.methodNote}>
      <Text style={pdfTheme.methodNoteText}>{children}</Text>
      {warnings?.length
        ? warnings.map((w) => (
            <Text key={w.code} style={pdfTheme.methodNoteWarn}>
              Ressalva: {w.message}
            </Text>
          ))
        : null}
    </View>
  )
}

export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso
}
