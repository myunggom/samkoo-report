# -*- coding: utf-8 -*-
"""
안전 표준운영절차 교육자료 PPT → 웹사이트(safety-sop) 데이터로 바꾼다.

교육자료 PPT 는 작업 하나당 정확히 3장이고, 장마다 자리가 늘 같다.
    1장  각부 명칭 및 점검 포인트   → parts (그림 · 번호표시 · 6개 항목 · 전/기준/금지)
    2장  안전 및 작업 교육자료      → ppe · guide (3묶음 × 4개 조치)
    3장  위험성평가표              → risk (빈도 × 강도 표)

글상자 위치로 묶는다. 같은 칸에 들어 있는 글을 하나로 모으는 방식이라,
PPT 를 조금 손봐도 웬만하면 그대로 읽힌다.

번호 표시(①~⑥ 위치)는 그림 안에서의 비율(%)로 바꿔 둔다. 웹에서는 그림을
늘려서 보여주므로, 절대 좌표가 아니라 비율이라야 점이 제자리에 찍힌다.

맞게 읽었는지 확인하는 법
  이미 사이트에 올라가 있는 소방부문으로 돌려 보고, 기존 data.js 와 같은
  결과가 나오는지 맞춰 본다.  python tools/sop_pptx_to_data.py --verify

사용법
  python tools/sop_pptx_to_data.py <PPT경로> <아이디접두어> <그림저장폴더>
      예)  ... "교육자료_전기부문.pptx" e  "…/assets/img"
  결과(JSON)는 표준출력으로 내보낸다.
"""

import hashlib
import io
import json
import os
import re
import sys

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.oxml.ns import qn

EMU = 914400.0                      # 1인치 = 914400 EMU
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮"


def _group_tf(grp):
    """묶음(그룹) 안의 좌표를 슬라이드 좌표로 바꾸는 식.

    묶음 안 도형의 left/top 은 '묶음 안쪽 좌표' 라서, 그대로 쓰면 엉뚱한
    자리에 있는 것으로 읽힌다. 에폭시 작업(건축 10번) 사진 6장이 묶음으로
    싸여 있어 아예 못 찾은 적이 있다."""
    xf = grp._element.grpSpPr.xfrm
    off, ext = xf.off, xf.ext
    ch_off, ch_ext = xf.chOff, xf.chExt
    sx = (ext.cx / ch_ext.cx) if ch_ext.cx else 1.0
    sy = (ext.cy / ch_ext.cy) if ch_ext.cy else 1.0
    return off.x, off.y, ch_off.x, ch_off.y, sx, sy


def _walk(shapes, tf=None, out=None):
    out = [] if out is None else out
    for sh in shapes:
        if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
            try:
                _walk(sh.shapes, _compose(tf, _group_tf(sh)), out)
            except Exception:
                _walk(sh.shapes, tf, out)
            continue
        txt = ""
        if sh.has_text_frame and sh.text_frame.text.strip():
            txt = sh.text_frame.text.strip()
        elif sh.shape_type != 13:
            continue
        x, y, w, h = _apply(tf, sh.left or 0, sh.top or 0,
                            sh.width or 0, sh.height or 0)
        out.append({"y": y / EMU, "x": x / EMU, "w": w / EMU, "h": h / EMU,
                    "t": txt, "sh": sh, "pic": sh.shape_type == 13})
    return out


def _compose(outer, inner):
    return (outer, inner) if outer else inner


def _apply(tf, x, y, w, h):
    if tf is None:
        return x, y, w, h
    if isinstance(tf[0], tuple):                 # 묶음 안의 묶음
        x, y, w, h = _apply(tf[1], x, y, w, h)
        return _apply(tf[0], x, y, w, h)
    ox, oy, cx, cy, sx, sy = tf
    return (ox + (x - cx) * sx, oy + (y - cy) * sy, w * sx, h * sy)


def _shapes(slide):
    """(y, x, w, h, 글, 도형) 목록. 좌표는 인치. 묶음 안까지 들여다본다."""
    return _walk(slide.shapes)


def _clean(s):
    return re.sub(r"\s+", " ", str(s)).strip()


def _lines(text):
    """한 칸에 여러 항목이 적힌 글을 항목 단위로 쪼갠다.

    주의 — 글상자 폭이 좁아 한 항목이 두 줄로 접혀 있는 경우가 많다.
    ('금속공구 단자대 동시 ⏎ 접촉 금지' 처럼) 그래서 줄바꿈이 아니라
    '•' 나 '①②③' 같은 머리표를 기준으로 쪼갠다. 머리표가 아예 없을 때만
    줄바꿈으로 나눈다."""
    t = str(text or "")
    if "•" in t:
        parts = t.split("•")
    elif re.search(r"[%s]" % CIRCLED, t):
        parts = re.split(r"[%s]" % CIRCLED, t)
    else:
        parts = t.split("\n")
    return [_clean(p) for p in parts if _clean(p)]


def s_c(sh):
    """도형의 한가운데 좌표."""
    return sh["x"] + sh["w"] / 2, sh["y"] + sh["h"] / 2


def _is_num(s):
    return bool(re.fullmatch(r"\d{1,2}", s.strip()))


def _srcrect(shape):
    """파워포인트에서 사진을 잘라 쓴 비율. 안 잘랐으면 None.

    l/t/r/b 는 '천분의 일 퍼센트' 단위다. l=50398 이면 왼쪽에서 50.398% 를
    잘라냈다는 뜻. 이걸 무시하고 원본을 그대로 쓰면 PPT 에 보이는 것과
    다른 부분이 나온다 — 건축부문 사진이 틀어져 보인 원인이 이것이다."""
    fill = shape._element.find(qn("p:blipFill"))
    if fill is None:
        return None
    sr = fill.find(qn("a:srcRect"))
    if sr is None or not sr.attrib:
        return None
    g = lambda k: max(0.0, int(sr.get(k, "0")) / 100000.0)
    box = (g("l"), g("t"), g("r"), g("b"))
    return box if any(box) else None


def _render(shape, dpi=200, box_in=None):
    """PPT 에 보이는 그대로의 그림을 만든다 (잘라낸 영역 + 표시 비율).

    box_in 은 슬라이드에서 실제로 차지하는 크기(인치). 묶음 안의 도형은
    자체 left/top/width 가 묶음 안쪽 값이라, 바깥에서 계산한 크기를 넘겨준다."""
    from PIL import Image as PILImage
    im = PILImage.open(io.BytesIO(shape.image.blob))
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    box = _srcrect(shape)
    if box:
        l, t, r, b = box
        W, H = im.size
        x0, y0 = int(W * l), int(H * t)
        x1, y1 = int(W * (1 - r)), int(H * (1 - b))
        if x1 - x0 >= 2 and y1 - y0 >= 2:
            im = im.crop((x0, y0, x1, y1))
    if box_in:
        w_in, h_in = box_in
    else:
        w_in = (shape.width or 0) / EMU
        h_in = (shape.height or 0) / EMU
    if w_in > 0 and h_in > 0:
        tw, th = w_in * dpi, h_in * dpi
        k = min(1.0, im.width / tw, im.height / th)   # 원본보다 키우지 않는다
        im = im.resize((max(1, int(tw * k)), max(1, int(th * k))),
                       PILImage.LANCZOS)
    return im


def _jpeg(im, quality=90):
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()


class Images(object):
    """그림을 모았다가 폴더에 쓴다. 같은 그림은 한 번만 저장한다."""

    def __init__(self):
        self.files = {}             # 이름 → 바이트

    def put(self, shape, name_no_ext, box_in=None):
        """잘라 쓴 사진이면 잘린 그대로, 아니면 원본 파일 그대로 넣는다."""
        if _srcrect(shape):
            name = name_no_ext + ".jpg"
            self.files[name] = _jpeg(_render(shape, box_in=box_in))
            return name
        img = shape.image
        ext = (img.ext or "jpg").lower()
        if ext == "jpeg":
            ext = "jpg"
        name = "%s.%s" % (name_no_ext, ext)
        self.files[name] = img.blob
        return name

    def put_shared(self, shape, prefix="ppe", box_in=None):
        """여러 작업이 함께 쓰는 그림(보호구 등)은 내용 해시로 이름 짓는다."""
        if _srcrect(shape):
            blob, ext = _jpeg(_render(shape, box_in=box_in)), "jpg"
        else:
            img = shape.image
            blob = img.blob
            ext = (img.ext or "png").lower()
            if ext == "jpeg":
                ext = "jpg"
        name = "%s_%s.%s" % (prefix, hashlib.sha1(blob).hexdigest()[:10], ext)
        self.files[name] = blob
        return name

    def put_merged(self, pics, frame, name_no_ext, dpi=150):
        """여러 장을 원래 배치 그대로 한 장에 합쳐 넣는다."""
        from PIL import Image as PILImage
        W = max(1, int(frame["w"] * dpi))
        H = max(1, int(frame["h"] * dpi))
        canvas = PILImage.new("RGB", (W, H), (255, 255, 255))
        for p in sorted(pics, key=lambda q: (q["y"], q["x"])):
            im = _render(p["sh"], box_in=(p["w"], p["h"])).convert("RGB")
            w = max(1, int(p["w"] * dpi))
            h = max(1, int(p["h"] * dpi))
            canvas.paste(im.resize((w, h), PILImage.LANCZOS),
                         (int((p["x"] - frame["x"]) * dpi),
                          int((p["y"] - frame["y"]) * dpi)))
        buf = io.BytesIO()
        canvas.save(buf, "JPEG", quality=88)
        name = name_no_ext + ".jpg"
        self.files[name] = buf.getvalue()
        return name

    def save(self, folder, skip_existing=True):
        os.makedirs(folder, exist_ok=True)
        wrote = 0
        for name, blob in self.files.items():
            p = os.path.join(folder, name)
            if skip_existing and os.path.exists(p) and os.path.getsize(p) == len(blob):
                continue
            with open(p, "wb") as f:
                f.write(blob)
            wrote += 1
        return wrote


# ─────────────────────────────── 1장 ───────────────────────────────

def parse_parts(slide, tid, images):
    S = _shapes(slide)
    texts = [s for s in S if s["t"]]
    pics = [s for s in S if s["pic"]]

    title = min((s for s in texts if s["y"] < 0.5), key=lambda s: s["y"])["t"]
    name = re.sub(r"^\d+\.\s*", "", title)
    name = re.sub(r"\s*각부 명칭 및 점검 포인트\s*$", "", name).strip()

    sub = [s for s in texts if 0.5 <= s["y"] < 1.05]
    subtitle = max(sub, key=lambda s: s["w"])["t"] if sub else ""

    foot = [s for s in texts if s["y"] > 7.5 and "표준운영절차" in s["t"]]
    sop = docNo = place = ""
    if foot:
        parts = [p.strip() for p in re.split(r"[｜|]", foot[0]["t"])]
        sop = parts[0].strip()
        for p in parts[1:]:
            if p.startswith("문서번호"):
                docNo = p.replace("문서번호", "").strip()
            elif p.startswith("장소"):
                place = p.split(":", 1)[-1].strip()

    # 본문 그림 — 큰 사진 한 장일 때도 있고, 2행 3열 사진 6장일 때도 있다.
    # 번호 표시는 '사진들이 차지한 전체 영역' 을 기준으로 찍혀 있으므로,
    # 왼쪽 사진을 모두 모아 그 바깥 테두리를 기준틀로 삼는다.
    # 사진이 여러 장이면 한 장으로 합쳐서 저장한다 (웹에서는 한 장으로 보여준다).
    body = [p for p in pics if p["y"] > 1.0 and p["x"] < 6.8 and p["w"] > 0.8]
    fig, figure = None, ""
    if body:
        x0 = min(p["x"] for p in body)
        y0 = min(p["y"] for p in body)
        x1 = max(p["x"] + p["w"] for p in body)
        y1 = max(p["y"] + p["h"] for p in body)
        fig = {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}
        if len(body) == 1:
            figure = images.put(body[0]["sh"], "%s_fig" % tid,
                                box_in=(body[0]["w"], body[0]["h"]))
        else:
            figure = images.put_merged(body, fig, "%s_fig" % tid)

    # 숫자 글상자는 두 가지다 — 그림 위의 '번호 표시' 와 오른쪽 '항목 번호'.
    # 그림 테두리로 가르면 번호가 그림 밖으로 조금 삐져나온 장에서 놓친다.
    # 오른쪽 항목 번호는 옆에 이름칸(폭이 넓은 글상자)이 붙어 있다는 점으로 가른다.
    digits = [s for s in texts
              if _is_num(s["t"]) and s["w"] <= 0.45 and 1.2 < s["y"] < 5.7]

    def name_box(nb):
        # 이름칸은 번호 '바로' 오른쪽에 붙어 있다. 멀리 떨어진 글까지 받아주면
        # 그림 위 번호 표시가 오른쪽 항목 이름을 끌어와 항목으로 둔갑한다.
        cands = [s for s in texts
                 if 0 <= s["x"] - (nb["x"] + nb["w"]) <= 0.5 and s["w"] > 1.0
                 and abs(s["y"] - nb["y"]) < 0.12 and not _is_num(s["t"])]
        return cands[0] if cands else None

    items, marks = [], []
    for nb in sorted(digits, key=lambda s: s["y"]):
        row = name_box(nb)
        if row:                                   # 오른쪽 항목
            nxt = [s for s in texts
                   if 0 <= s["x"] - (nb["x"] + nb["w"]) <= 0.5 and s["w"] > 1.0
                   and 0.15 < (s["y"] - nb["y"]) < 0.42 and not _is_num(s["t"])]
            items.append({"n": int(nb["t"]), "name": _clean(row["t"]),
                          "desc": _clean(nxt[0]["t"]) if nxt else ""})
        elif fig:                                 # 그림 위 번호 표시
            cx, cy = s_c(nb)
            marks.append({"n": int(nb["t"]),
                          "x": round((cx - fig["x"]) / fig["w"] * 100, 1),
                          "y": round((cy - fig["y"]) / fig["h"] * 100, 1)})
    items.sort(key=lambda i: i["n"])
    marks.sort(key=lambda m: m["n"])
    seen, uniq = set(), []
    for m in marks:
        if m["n"] in seen:
            sys.stderr.write("   [주의] %s — 번호표시 %d 번이 두 번 찍혀 있어 "
                             "앞의 것만 씁니다 (원본 PPT 확인 필요)\n"
                             % (tid, m["n"]))
            continue
        seen.add(m["n"])
        uniq.append(m)
    marks = uniq

    # 아래 3칸 — 작업 전 점검 / 사용 기준 / 사용 금지
    heads = sorted([s for s in texts if 5.6 < s["y"] < 6.1], key=lambda s: s["x"])
    bodies = sorted([s for s in texts if 6.1 <= s["y"] < 7.4], key=lambda s: s["x"])
    box = [_lines(b["t"]) for b in bodies[:3]] + [[], [], []]

    return {
        "name": name, "sop": sop, "docNo": docNo, "place": place,
        "parts": {
            "title": re.sub(r"^\d+\.\s*", "", title).strip(), "subtitle": subtitle,
            "figure": figure, "figureCaption": "",
            "marks": marks, "items": items,
            "pre": box[0], "use": box[1], "ban": box[2],
        },
        "_heads": [h["t"] for h in heads],
    }


# ─────────────────────────────── 2장 ───────────────────────────────

def parse_guide(slide, tid, images):
    S = _shapes(slide)
    texts = [s for s in S if s["t"]]
    pics = [s for s in S if s["pic"]]

    # 가운데 장비 상세설명도
    mid = [p for p in pics if p["w"] > 2.5 and p["y"] < 4.5]
    guide_fig = ""
    if mid:
        big = max(mid, key=lambda p: p["w"] * p["h"])
        guide_fig = images.put(big["sh"], "%s_gfig" % tid,
                               box_in=(big["w"], big["h"]))

    # 보호구 — 이름글상자 바로 위의 그림
    ppe_names = sorted([s for s in texts if 5.0 < s["y"] < 5.45 and s["w"] < 2.0
                        and not s["t"].startswith(("■", "※", "▲"))],
                       key=lambda s: s["x"])
    ppe = []
    for nm in ppe_names:
        cx = nm["x"] + nm["w"] / 2
        near = [p for p in pics if 4.2 < p["y"] < 5.05 and p["w"] < 1.2
                and abs(p["x"] + p["w"] / 2 - cx) < 1.0]
        if near:
            best = min(near, key=lambda p: abs(p["x"] + p["w"] / 2 - cx))
            ppe.append({"name": nm["t"].strip(),
                        "img": images.put_shared(
                            best["sh"], box_in=(best["w"], best["h"]))})

    # 조치 묶음 제목 — 굵은 띠(높이 0.3~0.4)
    heads = [s for s in texts if 0.30 <= s["h"] <= 0.40 and s["y"] > 1.0
             and not s["t"].startswith(("■", "※", "▲", "•", "⚠"))
             and not _is_num(s["t"])]
    heads.sort(key=lambda s: (round(s["y"], 1), s["x"]))

    # 조치 항목 — 숫자 글상자를 기준으로 같은 칸의 글·그림을 모은다
    nums = sorted([s for s in texts if _is_num(s["t"]) and s["w"] <= 0.32
                   and s["y"] > 1.3 and s["y"] < 7.5],
                  key=lambda s: (s["y"], s["x"]))

    def owner(shape):
        """이 글(그림)이 어느 번호 칸에 속하는지.

        칸이 가로로 2.7인치 간격이라 폭을 넉넉히 잡으면 옆 칸 글까지 끌어온다.
        세로로 맞는 것들 중에서 '가장 가까운 왼쪽 번호' 를 고른다."""
        best = None
        for nb in nums:
            if shape["x"] < nb["x"] - 0.10 or shape["x"] > nb["x"] + 2.85:
                continue
            d = shape["y"] - nb["y"]
            if d < -0.22 or d > 1.15:    # 그림이 번호보다 살짝 위에 놓이기도 한다
                continue
            if best is None or (nb["y"], nb["x"]) > (best["y"], best["x"]):
                best = nb
        return best

    cells = {int(nb["t"]): {"num": nb, "texts": [], "pics": []} for nb in nums}
    for s in texts:
        if _is_num(s["t"]) and s["w"] <= 0.32:
            continue
        nb = owner(s)
        if nb:
            cells[int(nb["t"])]["texts"].append(s)
    for p in pics:
        # 보호구 그림(높이 0.52)과 구분되도록 높이로 거른다. 폭은 들쭉날쭉하다.
        if not (0.55 < p["w"] < 1.30 and 0.70 < p["h"] < 1.20):
            continue
        nb = owner(p)
        if nb:
            cells[int(nb["t"])]["pics"].append(p)

    items = {}
    for n, c in cells.items():
        ts = sorted(c["texts"], key=lambda s: (s["y"], s["x"]))
        nm = must = warn = None
        bullets = []
        for s in ts:
            t = s["t"]
            if t == "필수":
                must = True
            elif t.startswith("⚠"):
                warn = t.lstrip("⚠").strip()
            elif t.startswith("•"):
                bullets = _lines(t)
            elif nm is None:
                nm = t.replace("\n", " ").strip()
        it = {"n": n, "name": nm or ""}
        if must:
            it["must"] = True
        it["warn"] = warn or ""
        it["bullets"] = bullets
        if c["pics"]:
            big = max(c["pics"], key=lambda p: p["w"] * p["h"])
            it["img"] = images.put(big["sh"], "%s_g%02d" % (tid, n),
                                   box_in=(big["w"], big["h"]))
        items[n] = (c["num"], it)

    # 번호 칸의 자리로 어느 묶음인지 정한다 (왼쪽 위 / 오른쪽 위 / 아래)
    def group_of(nb):
        best, bestd = 0, 9e9
        for gi, hd in enumerate(heads):
            if nb["y"] < hd["y"] - 0.15:
                continue
            if not (hd["x"] - 0.3 <= nb["x"] <= hd["x"] + hd["w"] + 0.3):
                continue
            d = nb["y"] - hd["y"]
            if d < bestd:
                best, bestd = gi, d
        return best

    guide = [{"title": h["t"].strip(), "items": []} for h in heads]
    for n in sorted(items):
        nb, it = items[n]
        guide[group_of(nb)]["items"].append(it)
    for g in guide:
        g["items"].sort(key=lambda i: i["n"])
    guide = [g for g in guide if g["items"]]
    note = [t for t in texts if t["t"].startswith("※")]
    out = {"ppe": ppe, "guide": guide, "guideFigure": guide_fig}
    if note:
        out["ppeNote"] = _clean(note[0]["t"].lstrip("※").strip())
    return out


# ─────────────────────────────── 3장 ───────────────────────────────

def parse_risk(slide):
    tables = [sh.table for sh in slide.shapes if sh.has_table]
    target = date = assessor = ""
    if tables:
        head = tables[0]
        cells = [c.text.strip() for c in head.rows[0].cells]
        for i, c in enumerate(cells):
            if c.startswith("평가대상") and i + 1 < len(cells):
                target = cells[i + 1]
            elif c.startswith("평가일자") and i + 1 < len(cells):
                date = cells[i + 1]
            elif c.startswith("평가자") and i + 1 < len(cells):
                assessor = cells[i + 1]

    rows = []
    if len(tables) > 1:
        t = tables[1]
        for r in list(t.rows)[2:]:
            c = [x.text.strip() for x in r.cells]
            if len(c) < 14 or not c[0].strip():
                continue

            def num(v, d=0):
                m = re.search(r"\d+", v or "")
                return int(m.group()) if m else d

            rows.append({
                "step": re.sub(r"\s+", " ", c[1].replace("\n", " ")).strip(),
                "hazards": _lines(c[2]), "results": _lines(c[3]),
                "f": num(c[4]), "s": num(c[5]),
                "measures": _lines(c[7]),
                "due": c[8].replace("\n", " ").strip(),
                "owner": re.sub(r"\s+", " ", c[9].replace("\n", " ")).strip(),
                "done": c[10].strip(),
                "f2": num(c[11], 1), "s2": num(c[12], 2),
            })
    return {"target": target, "date": date, "assessor": assessor, "rows": rows}


# ─────────────────────────────── 전체 ───────────────────────────────

def parse(pptx_path, prefix, color, images=None):
    prs = Presentation(pptx_path)
    images = images or Images()
    tasks = []
    n = len(prs.slides) // 3
    for i in range(n):
        tid = "%s%02d" % (prefix, i + 1)
        a = parse_parts(prs.slides[i * 3], tid, images)
        b = parse_guide(prs.slides[i * 3 + 1], tid, images)
        c = parse_risk(prs.slides[i * 3 + 2])
        t = {"id": tid, "no": str(i + 1), "name": a["name"], "color": color,
             "sop": a["sop"], "docNo": a["docNo"], "place": a["place"],
             "parts": a["parts"], "ppe": b["ppe"],
             "ppeNote": b.get("ppeNote", ""), "guide": b["guide"],
             "risk": c, "report": {"examples": []},
             "guideFigure": b["guideFigure"]}
        tasks.append(t)
    return tasks, images


if __name__ == "__main__":
    if "--verify" in sys.argv:
        from sop_verify import main as verify          # noqa: E402
        sys.exit(verify())
    path, prefix = sys.argv[1], sys.argv[2]
    folder = sys.argv[3] if len(sys.argv) > 3 else None
    color = sys.argv[4] if len(sys.argv) > 4 else "#1d4ed8"
    tasks, imgs = parse(path, prefix, color)
    if folder:
        sys.stderr.write("그림 %d개 저장\n" % imgs.save(folder))
    sys.stdout.write(json.dumps(tasks, ensure_ascii=False, indent=1))
