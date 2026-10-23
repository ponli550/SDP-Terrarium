#!/usr/bin/env python3
"""Fill the organisers' PowerPoint template with docs/PITCH.md.

    python3 tools/build_pptx.py --template <the organisers' .pptx> [--out docs/SDP-Terrarium-deck.pptx]

Needs python-pptx (pip install python-pptx). The template and the deck it makes are the organisers' artwork and are not committed.
PITCH.md stays the one source: the PDF is built from it by `hackager pdf --slides`, this builds the PPTX, and both follow the template's order.

What it does: keeps template slides 6 to 18 (the cover, Team Information, the eight areas, Visual Concept, Why Your Team Should Win, Thank You),
drops their five instruction slides, writes our text into the template's own placeholders (its fonts, logo and backgrounds stay), puts the
screenshots on Visual Concept, and adds the appendix slides after Thank You. Then it checks what it made.
"""
import argparse, copy, math, os, re, sys
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Emu, Pt

A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
q = lambda t: '{%s}%s' % (A, t)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# template slide numbers (1-based) that our sections fill, in order
FRAME = ['cover', 'team', 'problem', 'target', 'solution', 'innovation', 'how', 'impact', 'feasibility', 'implementation', 'visual', 'win', 'thanks']
TEMPLATE_FIRST = 6                      # slides 1 to 5 are the organisers' instructions and are dropped
CONTENT_MODEL = 8                       # the template slide whose layout and look the appendix slides copy
EXPECT = ['1. The Problem', '2. Target User', '3. Your Solution', '4. Innovation', '5. How it Works', '6. Impact', '7. Feasibility', '8. Implementation', 'Visual Concept', 'Why Your Team Should Win']
LEFTOVERS = ['Presentation Template', 'What related problem', 'Who will benefit', 'What is your proposed', 'What makes your idea', 'Explain in detail', 'Insert sketches', 'In 100 words or less', 'Team Members Details']


def parse(md):
    secs, cur = [], None
    for line in md.splitlines():
        if line.startswith('## '):
            cur = {'title': line[3:].strip(), 'items': []}; secs.append(cur); continue
        s = line.rstrip()
        if cur is None or not s.strip(): continue
        m = re.match(r'^!\[(.*?)\]\((.*?)\)\s*$', s)
        if m: cur['items'].append(('image', m.group(1), m.group(2)))
        elif re.match(r'^- \d+\. ', s): cur['items'].append(('numbered', s[2:]))
        elif s.startswith('- '): cur['items'].append(('bullet', s[2:]))
        else: cur['items'].append(('para', s))
    return secs


def plain(t): return re.sub(r'\*\*(.+?)\*\*', r'\1', t)


def find(slide, name):
    for sh in slide.shapes:
        if sh.name == name: return sh
    return None


def set_runs(p, text, rpr_src, size=None, bold_all=False):
    """Replace a paragraph's runs by runs for `text`, with **bold** honoured, copying the template run's own properties (its font)."""
    for r in list(p):
        if r.tag in (q('r'), q('br')): p.remove(r)
    end = p.find(q('endParaRPr'))
    for part in re.split(r'(\*\*.+?\*\*)', text):
        if not part: continue
        bold = part.startswith('**') and part.endswith('**')
        r_el = copy.deepcopy(rpr_src.getparent())
        for t in r_el.findall(q('t')): r_el.remove(t)
        rpr = r_el.find(q('rPr'));
        if bold or bold_all: rpr.set('b', '1')
        elif 'b' in rpr.attrib: del rpr.attrib['b']
        if size: rpr.set('sz', str(int(size * 100)))
        t = r_el.makeelement(q('t'), {}); t.text = part.strip('*') if bold else part; r_el.append(t)
        if end is not None: end.addprevious(r_el)
        else: p.append(r_el)


def fit_size(paras, width_in, height_in, lo=14, hi=24):
    """The largest font size at which the text should fit the box (Century Gothic is wide: about 0.56 em a character)."""
    for size in range(hi, lo - 1, -1):
        cpl = max(10, int(width_in * 72 / (size * 0.56))); lines = sum(max(1, math.ceil(len(plain(t)) / cpl)) for t in paras)
        if lines * size * 1.2 / 72 + len(paras) * 0.16 <= height_in: return size
    return lo


def write_body(shape, items, width_in=10.8, height_in=4.2):
    tx = shape.text_frame._txBody; ps = tx.findall(q('p'))
    first = ps[0]; run_src = first.find(q('r')).find(q('rPr'))
    texts = [it[1] for it in items]; size = fit_size(texts, width_in, height_in)
    for p in ps: tx.remove(p)
    for kind, text in [(i[0], i[1]) for i in items]:
        p = copy.deepcopy(first)
        for r in list(p):
            if r.tag in (q('r'), q('br'), q('endParaRPr')): p.remove(r)
        end = p.makeelement(q('endParaRPr'), {'lang': 'en-US', 'dirty': '0'}); p.append(end)
        if kind in ('numbered', 'para'):   # a numbered step carries its number in the text, a paragraph is prose: no bullet, no hanging indent
            ppr = p.find(q('pPr'))
            if ppr is None: ppr = p.makeelement(q('pPr'), {}); p.insert(0, ppr)
            ppr.set('marL', '0'); ppr.set('indent', '0')
            for ch in list(ppr):
                if ch.tag.endswith('}buNone') or ch.tag.endswith('}buChar') or ch.tag.endswith('}buAutoNum'): ppr.remove(ch)
            ppr.append(ppr.makeelement(q('buNone'), {}))
            text = text[2:] if text.startswith('- ') else text
        set_runs(p, text, run_src, size)
        tx.append(p)
    return size


def set_title(shape, text, size=None):
    p = shape.text_frame._txBody.findall(q('p'))[0]; rs = p.findall(q('r')); src = rs[0].find(q('rPr'))
    for r in rs[1:]: p.remove(r)
    for br in p.findall(q('br')): p.remove(br)
    rs[0].find(q('t')).text = text
    if size: src.set('sz', str(int(size * 100)))


def duplicate(prs, src):
    new = prs.slides.add_slide(src.slide_layout)
    for sh in list(new.shapes): sh._element.getparent().remove(sh._element)
    for sh in src.shapes: new.shapes._spTree.append(copy.deepcopy(sh._element))
    return new


def drop_first(prs, n):
    lst = prs.slides._sldIdLst
    for sid in list(lst)[:n]:
        prs.part.drop_rel(sid.rId); lst.remove(sid)


def add_pictures(slide, body, items, root):
    pics = [i for i in items if i[0] == 'image']
    body._element.getparent().remove(body._element)
    x0, w_total, gap = 683288, 12192000 - 2 * 683288, 250000
    top, avail_h = 1900000, 3900000
    w_each = (w_total - gap * (len(pics) - 1)) // len(pics); shown = []
    for k, (_, alt, path) in enumerate(pics):
        full = os.path.join(root, path)
        if not os.path.exists(full): sys.exit('missing image: ' + full)
        pic = slide.shapes.add_picture(full, Emu(0), Emu(0), width=Emu(w_each))
        if pic.height > avail_h:
            ratio = avail_h / pic.height; pic.height = Emu(avail_h); pic.width = Emu(int(pic.width * ratio))
        shown.append((pic, alt))
    used = sum(p.width for p, _ in shown) + gap * (len(shown) - 1); left = x0 + (w_total - used) // 2
    for pic, alt in shown:
        pic.left = Emu(left); pic.top = Emu(top); left += pic.width + gap
        pic.name = 'Screenshot'; pic._element.nvPicPr.cNvPr.set('descr', alt)
        cap = slide.shapes.add_textbox(pic.left, Emu(top + pic.height + 60000), pic.width, Emu(420000)); cap.name = 'Caption'
        tf = cap.text_frame; tf.word_wrap = True; run = tf.paragraphs[0].add_run(); run.text = alt.split(':')[0]; run.font.size = Pt(14); run.font.name = 'Century Gothic'; run.font.color.rgb = RGBColor(0x40, 0x40, 0x40)


def build(template, out, md_path):
    root = os.path.dirname(os.path.dirname(os.path.abspath(md_path)))
    secs = parse(open(md_path, encoding='utf-8').read())
    n_frame = len(FRAME)
    if len(secs) < n_frame: sys.exit('PITCH.md has %d sections; the template needs %d before any appendix' % (len(secs), n_frame))
    prs = Presentation(template); slides = list(prs.slides)
    if len(slides) < TEMPLATE_FIRST - 1 + n_frame: sys.exit('this does not look like the organisers\' template (%d slides)' % len(slides))
    base = [slides[TEMPLATE_FIRST - 1 + i] for i in range(n_frame)]; model = slides[CONTENT_MODEL - 1]
    app = [duplicate(prs, model) for _ in secs[n_frame:]]
    report = []

    for key, sec, sl in zip(FRAME, secs, base):
        paras = [i for i in sec['items'] if i[0] != 'image']
        if key == 'cover':
            t = find(sl, 'Title 2'); p = t.text_frame._txBody.findall(q('p'))[0]; rs = p.findall(q('r'))
            rs[0].find(q('t')).text = plain(paras[0][1]); rs[0].find(q('rPr')).set('sz', '3000')
            rs[1].find(q('t')).text = sec['title']; rs[1].find(q('rPr')).set('sz', '3600')
            sub = sl.shapes.add_textbox(Emu(1524000), Emu(3900000), Emu(9144000), Emu(900000)); sub.name = 'Subtitle'
            tf = sub.text_frame; tf.word_wrap = True; pp = tf.paragraphs[0]; pp.alignment = 2; r = pp.add_run(); r.text = plain(paras[1][1]) if len(paras) > 1 else ''
            r.font.size = Pt(18); r.font.name = 'Century Gothic'; r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        elif key == 'thanks':
            t = find(sl, 'Title 2'); p = t.text_frame._txBody.findall(q('p'))[0]; rs = p.findall(q('r'))
            rs[0].find(q('t')).text = sec['title']
            if paras:
                br = p.makeelement(q('br'), {}); rs[0].addnext(br); r2 = copy.deepcopy(rs[0]); r2.find(q('t')).text = plain(paras[0][1]); r2.find(q('rPr')).set('sz', '2000'); br.addnext(r2)
        elif key == 'visual':
            set_title(find(sl, 'Title 1'), sec['title']); add_pictures(sl, find(sl, 'Content Placeholder 2'), sec['items'], root)
        else:
            set_title(find(sl, 'Title 1'), sec['title'])
            size = write_body(find(sl, 'Content Placeholder 2'), paras, height_in=4.2 if key != 'team' else 4.0); report.append((sec['title'], size))

    for sl, sec in zip(app, secs[n_frame:]):
        set_title(find(sl, 'Title 1'), sec['title'], size=32)
        size = write_body(find(sl, 'Content Placeholder 2'), [i for i in sec['items'] if i[0] != 'image'], height_in=4.3); report.append((sec['title'], size))

    drop_first(prs, TEMPLATE_FIRST - 1)
    prs.save(out)
    return secs, report


def check(out, secs):
    prs = Presentation(out); problems = []; texts = []
    for i, sl in enumerate(prs.slides, 1):
        t = '\n'.join(sh.text_frame.text for sh in sl.shapes if sh.has_text_frame); texts.append(t)
        for bad in LEFTOVERS:
            if bad.strip() in t: problems.append('slide %d still has template text: %r' % (i, bad.strip()))
    titles = [secs[i]['title'] for i in range(2, 12)]
    if titles != EXPECT: problems.append('the ten core slides are %r, expected %r' % (titles, EXPECT))
    win = [s for s in secs if s['title'] == 'Why Your Team Should Win'][0]; words = len(' '.join(plain(i[1]) for i in win['items'] if i[0] != 'image').split())
    if words > 100: problems.append('Why Your Team Should Win is %d words; the template allows 100' % words)
    if len(prs.slides) != len(secs): problems.append('%d slides built for %d sections' % (len(prs.slides), len(secs)))
    todo = sorted(set(re.findall(r'\[[^\]]*to add\]', '\n'.join(texts))))
    return problems, words, todo


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--template', required=True); ap.add_argument('--md', default=os.path.join(ROOT, 'docs', 'PITCH.md')); ap.add_argument('--out', default=os.path.join(ROOT, 'docs', 'SDP-Terrarium-deck.pptx'))
    a = ap.parse_args()
    if not os.path.exists(a.template): sys.exit('no template at ' + a.template)
    secs, report = build(a.template, a.out, a.md)
    problems, words, todo = check(a.out, secs)
    print('built %s: %d slides (%d core, framed by the cover, Team Information and Thank You; %d appendix)' % (a.out, len(secs), 10, len(secs) - len(FRAME)))
    for title, size in report: print('  %-44s %dpt' % (title, size))
    print('Why Your Team Should Win: %d words (limit 100)' % words)
    if todo: print('still for you to fill in:', ', '.join(todo))
    if problems:
        print('PROBLEMS:'); [print('  -', p) for p in problems]; sys.exit(1)
