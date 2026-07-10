# BarberHQ ordmerke → master-SVG (tekst som paths).
# Krever:  pip install fonttools uharfbuzz
# Kjør:    python build_svg.py      (skriver ../../assets/logo/barberhq.svg + b.svg)
#
# Inter variabel instansieres til wght=800 (ExtraBold), opsz=14 — samme som
# Google Fonts serverer for header-ordmerket. Shaping via uharfbuzz (samme
# HarfBuzz som Chrome) → kerning/vekt matcher nettsiden. letter-spacing -0.03em
# bakes inn som tracking. Tight viewBox, ingen padding, fill="currentColor".
import os
from io import BytesIO
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "Inter.ttf")
OUT  = os.path.normpath(os.path.join(HERE, "..", "..", "assets", "logo"))
UPEM = 2048
WGHT, OPSZ = 800, 14
TRACK = -0.03 * UPEM  # letter-spacing -0.03em i font-units

os.makedirs(OUT, exist_ok=True)

vf = TTFont(FONT)
inst = instancer.instantiateVariableFont(vf, {"wght": WGHT, "opsz": OPSZ}, inplace=False)
buf = BytesIO(); inst.save(buf); data = buf.getvalue()

face = hb.Face(data); hbfont = hb.Font(face); hbfont.scale = (UPEM, UPEM)
glyphSet = inst.getGlyphSet()

def build(text):
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
    hb.shape(hbfont, b)
    pathPen = SVGPathPen(glyphSet)
    boundsPen = BoundsPen(glyphSet)
    x = 0.0
    for info, pos in zip(b.glyph_infos, b.glyph_positions):
        name = inst.getGlyphName(info.codepoint)
        m = (1, 0, 0, -1, x + pos.x_offset, pos.y_offset)  # flipp y: font(up) -> svg(down)
        glyphSet[name].draw(TransformPen(pathPen, m))
        glyphSet[name].draw(TransformPen(boundsPen, m))
        x += pos.x_advance + TRACK
    x0, y0, x1, y1 = boundsPen.bounds
    vb = f"{x0:.1f} {y0:.1f} {x1 - x0:.1f} {y1 - y0:.1f}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
            f'<path d="{pathPen.getCommands()}" fill="currentColor"/></svg>')

for text, fname in [("BarberHQ", "barberhq.svg"), ("B", "b.svg")]:
    with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
        f.write(build(text))
    print("skrev", fname)
