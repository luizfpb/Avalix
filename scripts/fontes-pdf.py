# Gera public/fonts/inter-{400,600}.ttf, as fontes dos PDFs, a partir dos
# TTF completos da Inter (Google Fonts). Requer Python com fontTools:
#
#   pip install fonttools
#   python scripts/fontes-pdf.py <pasta com inter-400-full.ttf e inter-600-full.ttf>
#
# Dois cuidados, os dois por causa do @react-pdf:
#
# 1. Repertório: só o que pdfText.tsx garante (ASCII, Latin-1 e a pontuação do
#    CP1252). A fonte cai de ~320 KB para ~40 KB por peso.
#
# 2. Glifos compostos desmontados. Na Inter, "Ú" é um "U" com um acento por
#    cima. Ao embutir a fonte num PDF que usa "Ú", o fontkit guarda em cache o
#    glifo "U" sem a letra que ele representa; nos PDFs seguintes da mesma
#    sessão, todo "U" sai sem correspondência de texto e a quebra de linha
#    desloca uma posição (aparecia "P | ercentual" no relatório de evolução).
#    Com cada glifo desenhado por inteiro, não há componente a guardar.
#
# Sem recursos de substituição (calt, liga): só o kerning. O "->" que o
# saneamento produz viraria uma seta por ligadura, e ligadura desalinha a
# conta de quebra de linha do renderer.
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

UNICODES = (
    'U+0020-007E,U+00A0-00FF,U+0152-0153,U+0160-0161,U+0178,U+017D-017E,U+0192,'
    'U+02C6,U+02DC,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,'
    'U+2039-203A,U+20AC,U+2122,U+2212'
)


def desmontar_compostos(font: TTFont) -> int:
    glyf = font['glyf']
    glyph_set = font.getGlyphSet()
    feitos = 0
    for nome in font.getGlyphOrder():
        if not glyf[nome].isComposite():
            continue
        gravado = DecomposingRecordingPen(glyph_set)
        glyph_set[nome].draw(gravado)
        caneta = TTGlyphPen(None)
        gravado.replay(caneta)
        glyf[nome] = caneta.glyph()
        feitos += 1
    return feitos


def main() -> None:
    origem = Path(sys.argv[1])
    destino = Path(__file__).resolve().parents[1] / 'public' / 'fonts'
    for peso in (400, 600):
        font = TTFont(origem / f'inter-{peso}-full.ttf')
        opcoes = subset.Options()
        opcoes.layout_features = ['kern']
        subsetter = subset.Subsetter(opcoes)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(font)
        feitos = desmontar_compostos(font)
        saida = destino / f'inter-{peso}.ttf'
        font.save(saida)
        print(f'{saida.name}: {feitos} glifos desmontados, {saida.stat().st_size} bytes')


if __name__ == '__main__':
    main()
