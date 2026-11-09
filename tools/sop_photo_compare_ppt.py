# -*- coding: utf-8 -*-
"""
교육자료 사진 전/후 비교 자료를 만든다 (보고용 PPT).

무엇을 비교하나
  기존 : 지금 교육자료 PPT 에 들어 있는 사진 (해상도가 낮고 장면이 제각각)
  신규 : 같은 조치를 같은 인물 · 같은 복장 · 같은 구도 규칙으로 다시 만든 사진

짝 맞추기
  1번     = 각부 명칭 사진 (기존은 작은 사진 6장을 모아 붙인 것)
  2~13번  = 교육자료 조치 1~12번

한 장에 좌/우로 놓고, 아래에 그 조치가 무슨 내용인지 적는다.
보는 사람이 '무엇을 보여주는 사진이어야 하는가' 를 알아야 판단할 수 있다.

사용법
  python tools/sop_photo_compare_ppt.py b01
"""

import os
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Cm, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sop_image_prompts as P                                  # noqa: E402

FONT = "맑은 고딕"
NAVY = RGBColor(0x0F, 0x25, 0x44)
GREEN = RGBColor(0x6C, 0xB4, 0x3C)
GRAY = RGBColor(0x54, 0x54, 0x54)
LIGHT = RGBColor(0xF2, 0xF2, 0xF2)

OLD_DIR = os.path.join(P.SITE, "assets", "img")
NEW_DIR = os.path.join(P.OUT, "건축부문")
W, H = Cm(33.87), Cm(19.05)          # 16:9


def _txt(slide, x, y, w, h, text, size=14, bold=False, color=GRAY,
         align=PP_ALIGN.LEFT, wrap=True):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = wrap
    tf.margin_left = tf.margin_right = Cm(0.1)
    tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(str(text).split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run()
        r.text = line
        r.font.name = FONT
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
    return box


def _band(slide, x, y, w, h, color):
    from pptx.enum.shapes import MSO_SHAPE
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()
    s.shadow.inherit = False
    return s


def _fit(slide, path, cx, top, max_w, max_h):
    """가운데 맞춰 넣되, 사진 비율은 그대로 둔다."""
    from PIL import Image
    w, h = Image.open(path).size
    k = min(max_w / w, max_h / h)
    nw, nh = int(w * k), int(h * k)
    slide.shapes.add_picture(path, int(cx - nw / 2), int(top + (max_h - nh) / 2),
                             nw, nh)
    return w, h


def pairs(tid):
    """(번호, 제목, 설명, 기존경로, 신규경로)"""
    d = P.load()
    t = d["tasks"][tid]
    out = []

    old_fig = os.path.join(OLD_DIR, t.get("parts", {}).get("figure") or "")
    items = [it for g in t.get("guide", []) for it in g.get("items", [])]
    desc = " · ".join(x.get("name", "")
                      for x in t.get("parts", {}).get("items", []))
    out.append((1, "각부 명칭 사진",
                "장비 각부를 보여주는 대표 사진\n" + desc,
                old_fig if os.path.exists(old_fig) else None,
                os.path.join(NEW_DIR, "1.png")))

    for k, it in enumerate(items, start=2):
        old = os.path.join(OLD_DIR, it.get("img") or "")
        out.append((k, "조치 %d. %s" % (it["n"], it.get("name", "")),
                    "\n".join("· " + b for b in it.get("bullets", [])),
                    old if os.path.exists(old) else None,
                    os.path.join(NEW_DIR, "%d.png" % k)))
    return t, out


def build(tid, out_path):
    task, rows = pairs(tid)
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    blank = prs.slide_layouts[6]

    # 표지
    s = prs.slides.add_slide(blank)
    _band(s, 0, 0, W, Cm(5.6), NAVY)
    _txt(s, Cm(2), Cm(1.5), Cm(29), Cm(1.6),
         "안전 표준운영절차 교육자료 — 사진 개선 전/후 비교",
         26, True, RGBColor(0xFF, 0xFF, 0xFF))
    _txt(s, Cm(2), Cm(3.4), Cm(29), Cm(1.0),
         "%s  %s  (%s · 문서번호 %s)"
         % (tid, task["name"], task.get("sop", ""), task.get("docNo", "")),
         15, False, RGBColor(0xB7, 0xCB, 0xE6))
    lines = [
        "비교 대상",
        "    기존 — 현재 교육자료 PPT 에 들어 있는 사진",
        "    신규 — 같은 조치를 동일 인물 · 동일 복장 · 동일 구도 규칙으로 재생성한 사진",
        "",
        "개선한 점",
        "    1. 해상도 — 기존 사진 다수가 170~180픽셀. 화면에서 뭉개져 보임",
        "    2. 인물 통일 — 사진마다 다르던 작업자를 한 사람으로 고정",
        "    3. 복장 통일 — 안전모 · 유니폼 · 장갑 · 안전화를 전 사진 동일하게",
        "    4. 구도 통일 — 작업자가 설비를 실제로 다루는 장면, 설비가 화면 절반",
        "    5. 글자 제거 — 사진 속 한글이 깨져 보이던 문제 해소",
        "",
        "총 %d장 비교 (각부 명칭 1장 + 교육자료 조치 12장)" % len(rows),
    ]
    _txt(s, Cm(2), Cm(6.8), Cm(29), Cm(10), "\n".join(lines), 14)

    for no, title, desc, old, new in rows:
        s = prs.slides.add_slide(blank)
        _band(s, 0, 0, W, Cm(1.9), NAVY)
        _txt(s, Cm(1), Cm(0.45), Cm(24), Cm(1.0),
             "%d / %d    %s" % (no, len(rows), title),
             17, True, RGBColor(0xFF, 0xFF, 0xFF))
        _txt(s, Cm(25), Cm(0.5), Cm(8), Cm(0.9),
             "%s  %s" % (tid, task["name"]), 11, False,
             RGBColor(0xB7, 0xCB, 0xE6), PP_ALIGN.RIGHT)

        half, top, ih = Cm(16.4), Cm(3.0), Cm(10.6)
        for i, (label, path, color) in enumerate(
                [("기 존", old, GRAY), ("신 규", new, GREEN)]):
            x0 = Cm(0.6) + i * (half + Cm(0.3))
            _band(s, x0, Cm(2.2), half, Cm(0.7), LIGHT if i == 0 else GREEN)
            _txt(s, x0, Cm(2.3), half, Cm(0.6), label, 12, True,
                 GRAY if i == 0 else RGBColor(0xFF, 0xFF, 0xFF), PP_ALIGN.CENTER)
            if path and os.path.exists(path):
                w, h = _fit(s, path, x0 + half / 2, Cm(3.2), half, ih)
                _txt(s, x0, Cm(14.1), half, Cm(0.6), "%d × %d" % (w, h),
                     11, False, color, PP_ALIGN.CENTER)
            else:
                _txt(s, x0, Cm(8), half, Cm(0.8), "(해당 사진 없음)", 12,
                     False, GRAY, PP_ALIGN.CENTER)

        _band(s, Cm(0.6), Cm(15.0), W - Cm(1.2), Cm(3.4), LIGHT)
        _txt(s, Cm(1.1), Cm(15.3), W - Cm(2.2), Cm(2.8),
             "이 사진이 보여줘야 하는 내용\n" + desc, 12, False, GRAY)

    prs.save(out_path)
    return out_path, len(rows)


if __name__ == "__main__":
    tid = sys.argv[1] if len(sys.argv) > 1 else "b01"
    out = os.path.join(P.OUT, "[비교] %s 사진 개선 전후.pptx" % tid)
    path, n = build(tid, out)
    print("저장 : %s" % path)
    print("비교 %d쌍 (표지 1장 + 비교 %d장)" % (n, n))
