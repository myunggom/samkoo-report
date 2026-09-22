# -*- coding: utf-8 -*-
"""
촬영 완료보고서 PPT 양식 만들기.

표지 = 사장 원본 "ppt 겉지 양식.pptx"(scripts/source/shoot_cover_source.pptx) 그대로 쓰고,
나머지 페이지는 웹 PDF(components/shoot/ReportDocument.tsx)와 같은 배치로 PPT 도형·표로 만든다.

  1  표지        (원본 겉지 — 제목 문구만 촬영 보고서용으로)
  2  촬영 개요   (개요 표 + 촬영 회차 표)
  3  구역 사진   (정보표 + 구역 배지 + 사진 4×2 + 특이사항·비고)  ← 웹에서 구역·8장 단위로 복제
  4  특이사항    (정보표 + 사진 2×2 + 특이사항 설명)

출력
  python scripts/build_shoot_pptx.py            → public/templates/shoot.pptx (웹 출력용, {태그} 포함)
  python scripts/build_shoot_pptx.py blank OUT  → OUT (사람이 직접 쓰는 빈 양식, 태그 없음, 구역 3장)

웹 채우기는 lib/shoot/pptx.ts (docxtemplater + 슬라이드 복제).
"""
import copy
import os
import sys

from lxml import etree as ET
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "source", "shoot_cover_source.pptx")
LOGO = os.path.join(ROOT, "public", "samkoo.png")
OUT = os.path.join(ROOT, "public", "templates", "shoot.pptx")

FONT = "맑은 고딕"
NAVY = RGBColor(0x0F, 0x2C, 0x5C)
GRAY = RGBColor(0x64, 0x74, 0x8B)
LIGHT = RGBColor(0x94, 0xA3, 0xB8)
TH_FILL = RGBColor(0xEE, 0xF2, 0xF7)
TH_TEXT = RGBColor(0x33, 0x41, 0x55)
BORDER = "CBD5E1"
CELL_BG = RGBColor(0xF8, 0xFA, 0xFC)
CELL_LINE = RGBColor(0xE2, 0xE8, 0xF0)
BLACK = RGBColor(0x11, 0x11, 0x11)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

SECTIONS = ["보양 및 세팅", "촬영", "철수 및 정리"]

# 슬라이드 A4 가로 1040×720px(96dpi). 좌표는 px로 쓰고 EMU로 변환.
def px(v):
    return Emu(int(round(v * 9525)))


MODE = "template"  # or "blank"


def T(tag, blank=""):
    """템플릿 모드면 {태그}, 빈 양식 모드면 blank 문자열."""
    return "{%s}" % tag if MODE == "template" else blank


# ── 도형 도우미 ─────────────────────────────────────────────
def text(slide, x, y, w, h, s, size=12, bold=False, color=BLACK, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, wrap=True):
    tb = slide.shapes.add_textbox(px(x), px(y), px(w), px(h))
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = px(4)
    tf.margin_top = tf.margin_bottom = px(2)
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = s
    style_run(r, size, bold, color)
    return tb


def style_run(r, size, bold=False, color=BLACK):
    f = r.font
    f.size = Pt(size)
    f.bold = bold
    f.name = FONT
    f.color.rgb = color
    rpr = r._r.get_or_add_rPr()
    ea = rpr.find(qn("a:ea"))
    if ea is None:
        ea = ET.SubElement(rpr, qn("a:ea"))
    ea.set("typeface", FONT)


def rect(slide, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(shape, px(x), px(y), px(w), px(h))
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(0.75)
    s.shadow.inherit = False
    return s


def cell_border(cell, color=BORDER, w=9525):
    tcPr = cell._tc.get_or_add_tcPr()
    for tag in ("a:lnL", "a:lnR", "a:lnT", "a:lnB"):
        old = tcPr.find(qn(tag))
        if old is not None:
            tcPr.remove(old)
        ln = ET.SubElement(tcPr, qn(tag), w=str(w), cap="flat", cmpd="sng", algn="ctr")
        sf = ET.SubElement(ln, qn("a:solidFill"))
        ET.SubElement(sf, qn("a:srgbClr"), val=color)
        ET.SubElement(ln, qn("a:prstDash"), val="solid")
    # 스키마 순서: 테두리(ln*) 다음에 채우기(noFill/solidFill)
    for tag in ("a:noFill", "a:solidFill"):
        f = tcPr.find(qn(tag))
        if f is not None:
            tcPr.remove(f)
            tcPr.append(f)


def set_cell(cell, s, size=10, bold=False, color=BLACK, fill=None, align=PP_ALIGN.LEFT):
    cell.text = ""
    tf = cell.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = s
    style_run(r, size, bold, color)
    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
    cell.margin_left = cell.margin_right = px(8)
    cell.margin_top = cell.margin_bottom = px(3)
    if fill is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = fill
    else:
        cell.fill.solid()
        cell.fill.fore_color.rgb = WHITE
    cell_border(cell)


def table(slide, x, y, widths, heights):
    shp = slide.shapes.add_table(len(heights), len(widths), px(x), px(y), px(sum(widths)), px(sum(heights)))
    tbl = shp.table
    # 기본 표 스타일(줄무늬·머리행 강조) 끄기
    tblPr = tbl._tbl.tblPr
    for a in ("firstRow", "bandRow", "firstCol", "lastRow", "lastCol", "bandCol"):
        tblPr.set(a, "0")
    # 표 스타일 ID 제거(스타일 없음). ID의 {…}를 docxtemplater가 태그로 오인하므로 두지 않음
    sid = tblPr.find(qn("a:tableStyleId"))
    if sid is not None:
        tblPr.remove(sid)
    for i, w in enumerate(widths):
        tbl.columns[i].width = px(w)
    for i, h in enumerate(heights):
        tbl.rows[i].height = px(h)
    return tbl


def page_header(slide, title, subtitle):
    # 원본 PPT 마스터의 파란 머리띠(로고 포함) 안에 흰 제목, 아래 회색 부제
    text(slide, 20, 1, 700, 36, title, size=18, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
    text(slide, 24, 48, 800, 20, subtitle, size=10, color=GRAY)


def info_compact(slide, y):
    th_w, td_w = 100, (992 - 100 * 3) / 3
    tbl = table(slide, 24, y, [th_w, td_w, th_w, td_w, th_w, td_w], [28, 28])
    rows = [
        [("촬영종류", True), (T("촬영종류"), False), ("촬영명", True), (T("촬영명"), False), ("제작사", True), (T("제작사"), False)],
        [("관리자", True), (T("관리자"), False), ("보양 및 세팅", True), (T("보양세팅"), False), ("촬영 및 철수", True), (T("촬영철수"), False)],
    ]
    for ri, row in enumerate(rows):
        for ci, (s, is_th) in enumerate(row):
            c = tbl.cell(ri, ci)
            if is_th:
                set_cell(c, s, size=9, bold=True, color=TH_TEXT, fill=TH_FILL, align=PP_ALIGN.CENTER)
            else:
                set_cell(c, s, size=9.5)


def photo_cell(slide, x, y, w, h, n, tag, cap_tag):
    """사진칸: 배경 틀 + (템플릿) {%사진} 자리 + 번호 배지 + 아래 캡션."""
    ph = h - 22
    rect(slide, x, y, w, ph, fill=CELL_BG, line=CELL_LINE)
    if MODE == "template":
        # docxtemplater 이미지 모듈이 이 글상자 자리에 사진을 넣음 (크기는 lib/shoot/pptx.ts getSize)
        text(slide, x, y, w, ph, "{%%%s}" % tag, size=8, color=LIGHT)
    else:
        text(slide, x, y + ph / 2 - 10, w, 20, "사진", size=9, color=LIGHT, align=PP_ALIGN.CENTER)
    b = rect(slide, x + 5, y + 5, 20, 18, fill=NAVY)
    tf = b.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    style_run(r, 9, True, WHITE)
    text(slide, x, y + ph, w, 22, T(cap_tag), size=9, color=BLACK, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def blank_slide(prs):
    layout = prs.slide_layouts[6]  # 빈 화면
    s = prs.slides.add_slide(layout)
    for ph in list(s.placeholders):
        ph._element.getparent().remove(ph._element)
    return s


# ── 슬라이드 구성 ───────────────────────────────────────────
def build_cover(prs):
    s = prs.slides[0]
    for sh in s.shapes:
        if sh.shape_type == 6:  # 그룹 안 글상자
            for g in sh.shapes:
                # 제목·부제를 30px 올려 아래에 촬영명·정보 자리 확보(사진 영역과 겹치지 않게)
                if g.has_text_frame and ("프로젠" in g.text_frame.text or "운영계획서" in g.text_frame.text):
                    g.top = g.top - px(30)
                if g.has_text_frame and "운영계획서" in g.text_frame.text:
                    p = g.text_frame.paragraphs[0]
                    runs = p.runs
                    runs[0].text = "촬영 완료보고서"
                    for extra in runs[1:]:
                        extra._r.getparent().remove(extra._r)
                    # 글상자 폭을 제목 폭에 맞춰 오른쪽 정렬
                    g.left, g.width = px(359), px(633)
                    p.alignment = PP_ALIGN.RIGHT
    # 촬영명·정보 (흰 여백 영역, 오른쪽 정렬)
    text(s, 359, 316, 633, 36, T("촬영명", ""), size=20, bold=True, color=NAVY, align=PP_ALIGN.RIGHT)
    text(s, 359, 352, 633, 26, T("표지정보", ""), size=11, color=GRAY, align=PP_ALIGN.RIGHT)


def build_overview(prs):
    s = blank_slide(prs)
    page_header(s, "촬영 개요", "촬영 완료보고서 · 개요 안내")
    tbl = table(s, 24, 76, [140, 356, 140, 356], [44, 44, 44, 44])
    rows = [
        ("촬영종류", "촬영종류", "촬영명", "촬영명"),
        ("제작사", "제작사", "관리자", "관리자"),
        ("촬영 일시", "촬영일시", "촬영 기간", "촬영기간"),
        ("보양 및 세팅", "보양세팅", "촬영 및 철수", "촬영철수"),
    ]
    for ri, (a, ta, b, tb) in enumerate(rows):
        set_cell(tbl.cell(ri, 0), a, size=12, bold=True, color=TH_TEXT, fill=TH_FILL, align=PP_ALIGN.CENTER)
        set_cell(tbl.cell(ri, 1), T(ta), size=12)
        set_cell(tbl.cell(ri, 2), b, size=12, bold=True, color=TH_TEXT, fill=TH_FILL, align=PP_ALIGN.CENTER)
        set_cell(tbl.cell(ri, 3), T(tb), size=12)

    # 촬영 회차
    rect(s, 24, 284, 5, 18, fill=NAVY)
    text(s, 34, 278, 300, 30, "촬영 회차", size=14, bold=True, color=NAVY, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 516, 278, 500, 30, T("회차요약", "총    회차 · 이번은    번째 촬영"), size=10, color=GRAY, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    n_rows = 2 if MODE == "template" else 6
    tb = table(s, 24, 314, [80, 332, 330, 130, 120], [30] + [30] * (n_rows - 1))
    for ci, h in enumerate(["회차", "촬영 일시", "촬영 및 철수", "관리자", "비고"]):
        set_cell(tb.cell(0, ci), h, size=10, bold=True, color=TH_TEXT, fill=TH_FILL, align=PP_ALIGN.CENTER)
    if MODE == "template":
        # 행 반복: {#회차} … {/회차}. 이번 회차는 굵게({#now}) — 한 칸에 굵은/보통 런 두 개
        vals = ["{#회차}", "{일시}", "{철수}", "{관리자}", "{비고}{/회차}"]
        for ci, v in enumerate(vals):
            c = tb.cell(1, ci)
            set_cell(c, "", size=10, align=PP_ALIGN.LEFT if ci in (1, 2) else PP_ALIGN.CENTER)
            p = c.text_frame.paragraphs[0]
            for r in list(p.runs):
                r._r.getparent().remove(r._r)
            inner = v.replace("{#회차}", "").replace("{/회차}", "")
            if ci == 0:
                inner = "{회차명}"
            lead = "{#회차}" if ci == 0 else ""
            tail = "{/회차}" if ci == 4 else ""
            r1 = p.add_run()
            r1.text = lead + "{#now}" + inner + "{/now}"
            style_run(r1, 10, True, NAVY if ci == 0 else BLACK)
            r2 = p.add_run()
            r2.text = "{^now}" + inner + "{/now}" + tail
            style_run(r2, 10, ci == 0, NAVY if ci == 0 else BLACK)
    else:
        for ri in range(1, n_rows):
            for ci in range(5):
                set_cell(tb.cell(ri, ci), "", size=10)


def build_section(prs, section_name=None):
    s = blank_slide(prs)
    page_header(s, "촬영 완료보고서", "촬영 기간 : " + T("촬영기간"))
    info_compact(s, 72)
    # 구역 배지
    b = rect(s, 24, 140, 120, 24, fill=NAVY)
    tf = b.text_frame
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = T("구역", section_name or "")
    style_run(r, 11, True, WHITE)
    text(s, 150, 140, 200, 24, T("쪽"), size=9, color=LIGHT, anchor=MSO_ANCHOR.MIDDLE)
    # 사진 4×2
    gx, gy, gw, gh, gap = 24, 174, 992, 436, 8
    cw, ch = (gw - gap * 3) / 4, (gh - gap) / 2
    for i in range(8):
        cx = gx + (i % 4) * (cw + gap)
        cy = gy + (i // 4) * (ch + gap)
        photo_cell(s, cx, cy, cw, ch, i + 1, "p%d" % (i + 1), "c%d" % (i + 1))
    # 특이사항·비고
    rect(s, 24, 620, 992, 82, fill=None, line=CELL_LINE)
    rect(s, 24, 620, 992, 22, fill=TH_FILL)
    text(s, 30, 620, 600, 22, "촬영 중 특이사항 · 비고", size=10, bold=True, color=TH_TEXT, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 30, 644, 980, 56, T("비고"), size=10)


def build_special(prs):
    s = blank_slide(prs)
    page_header(s, "특이사항", "촬영 기간 : " + T("촬영기간"))
    info_compact(s, 72)
    gx, gy, gw, gh, gap = 24, 140, 632, 562, 10
    cw, ch = (gw - gap) / 2, (gh - gap) / 2
    for i in range(4):
        cx = gx + (i % 2) * (cw + gap)
        cy = gy + (i // 2) * (ch + gap)
        photo_cell(s, cx, cy, cw, ch, i + 1, "s%d" % (i + 1), "sc%d" % (i + 1))
    rect(s, 668, 140, 348, 562, fill=None, line=CELL_LINE)
    rect(s, 668, 140, 348, 28, fill=TH_FILL)
    text(s, 676, 140, 330, 28, "특이사항 설명", size=11, bold=True, color=TH_TEXT, anchor=MSO_ANCHOR.MIDDLE)
    text(s, 676, 174, 332, 522, T("특이설명"), size=10.5)


def build(out_path):
    prs = Presentation(SRC)
    build_cover(prs)
    build_overview(prs)
    if MODE == "template":
        build_section(prs)
    else:
        for name in SECTIONS:
            build_section(prs, name)
    build_special(prs)
    prs.save(out_path)
    print("saved", out_path, os.path.getsize(out_path))


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "blank":
        MODE = "blank"
        build(sys.argv[2])
    else:
        build(OUT)
