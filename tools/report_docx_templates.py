# -*- coding: utf-8 -*-
"""보고서 워드 양식 5종을 만든다 — 사장 결재 양식(구매검토서)의 서식 그대로.

Samkoo-Report(report/)의 보고서 탭이 쓰는 양식이다. 사고·완료·점검·보수요청·풍수해
다섯 가지를 한 번에 만들어 `report/public/templates/` 에 넣는다.

만드는 방법: 원본 양식 docx 의 포장(styles·header·footer·numbering·theme·그림)을
**그대로 쓰고** 본문(document.xml)만 보고서별로 새로 짠다. 본문에 쓰는 재료 —
제목 머리, 메타표, 번호 섹션 바, 표 칸, 불릿 한 줄 — 도 원본에서 떼어내 글자만
바꾸므로 색·테두리·여백·글꼴이 원본과 **똑같다**. 손으로 서식을 흉내 내지 않는다.

양식(색·칸 넓이·글꼴)을 바꾸고 싶으면 원본 docx 를 고친 뒤 이것을 다시 돌리면 된다.

쓰는 법
    python report_docx_templates.py              원본 양식으로 5종 만들어 넣는다
    python report_docx_templates.py --base <docx> 다른 양식 문서를 쓴다
    python report_docx_templates.py --out <폴더>  다른 곳에 만든다(확인용)
"""
import argparse
import os
import re
import zipfile
from pathlib import Path

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

# ── 양식 디자인 토큰 (원본에서 읽어낸 값) ──────────────────────────
NAVY = "13294B"
SUBTXT = "D6E3F3"
LABEL_FILL = "EDF2F9"
BODY_W = 9906   # 본문 폭(dxa) — hero/섹션바 표
TABLE_W = 9918  # 데이터 표 폭(dxa)


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def clean(xml: str) -> str:
    """복제 시 중복되면 안 되는 식별자 속성을 지운다."""
    xml = re.sub(r'\s(?:w14:paraId|w14:textId|w:rsidR|w:rsidRPr|w:rsidRDefault|w:rsidP|w:rsidTr|w:rsidDel)="[^"]*"', "", xml)
    return xml


# ── 문단 조작 ─────────────────────────────────────────────────────
def get_ppr(p: str) -> str:
    m = re.search(r"<w:pPr>.*?</w:pPr>", p, re.S)
    return m.group(0) if m else ""


def get_rpr(p: str) -> str:
    m = re.search(r"<w:r\b[^>]*>\s*(<w:rPr>.*?</w:rPr>)", p, re.S)
    return m.group(1) if m else ""


def para(ppr: str, text: str, rpr: str = "") -> str:
    """pPr/rPr 는 원본 조각을 그대로 쓰고 텍스트만 넣은 문단."""
    run = ""
    if text != "":
        run = f'<w:r>{rpr}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'
    return f"<w:p>{ppr}{run}</w:p>"


def set_text(p: str, text: str) -> str:
    """문단의 run 을 모두 지우고 텍스트 하나만 남긴다(pPr·rPr 유지)."""
    return para(get_ppr(p), text, get_rpr(p))


def tag_p(tag: str) -> str:
    """docxtemplater 반복 태그만 담은 문단. 텍스트는 반드시 run 안에 있어야 한다
    (run 없이 쓰면 Word 가 무시하고 반복도 깨진다)."""
    return f'<w:p><w:r><w:t xml:space="preserve">{tag}</w:t></w:r></w:p>'


# ── 셀 조작 ───────────────────────────────────────────────────────
def cell_paras(tc: str) -> list:
    return re.findall(r"<w:p\b(?:(?!</w:p>).)*?</w:p>|<w:p\b[^>]*/>", tc, re.S)


def cell_pr(tc: str) -> str:
    m = re.search(r"<w:tcPr>.*?</w:tcPr>", tc, re.S)
    return m.group(0) if m else ""


def cell(tc_base: str, texts, w=None, span=None, fill="keep", jc="keep"):
    """원본 셀을 틀로 삼아 폭·병합·배경·정렬·내용을 바꾼 셀을 만든다.

    texts: 문자열 또는 문자열 목록(여러 문단). 원본 셀의 첫 문단 서식을 재사용.
    fill:  "keep" 유지 / None 제거 / "RRGGBB" 지정
    """
    pr = cell_pr(tc_base)
    if w is not None:
        pr = re.sub(r'<w:tcW w:w="\d+"', f'<w:tcW w:w="{w}"', pr, count=1)
    # gridSpan
    pr = re.sub(r"<w:gridSpan[^/]*/>", "", pr)
    if span:
        pr = re.sub(r"(</w:tcW>|<w:tcW[^/]*/>)", r"\1" + f'<w:gridSpan w:val="{span}"/>', pr, count=1)
    # 배경
    if fill is None:
        pr = re.sub(r"<w:shd[^/]*/>", "", pr)
    elif fill != "keep":
        shd = f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>'
        if re.search(r"<w:shd[^/]*/>", pr):
            pr = re.sub(r"<w:shd[^/]*/>", shd, pr, count=1)
        else:
            pr = re.sub(r"(</w:tcBorders>)", r"\1" + shd, pr, count=1)

    base_ps = cell_paras(tc_base)
    base_p = base_ps[0] if base_ps else "<w:p/>"
    ppr, rpr = get_ppr(base_p), get_rpr(base_p)
    if jc != "keep":
        ppr = re.sub(r"<w:jc[^/]*/>", "", ppr)
        if jc:
            if ppr:
                ppr = ppr.replace("</w:pPr>", f'<w:jc w:val="{jc}"/></w:pPr>')
            else:
                ppr = f'<w:pPr><w:jc w:val="{jc}"/></w:pPr>'

    if isinstance(texts, str):
        texts = [texts]
    body = "".join(para(ppr, t, rpr) for t in texts) or "<w:p/>"
    return f"<w:tc>{pr}{body}</w:tc>"


def row(cells: str) -> str:
    return f"<w:tr>{cells}</w:tr>"


def table(tbl_pr: str, grid: list, rows: str) -> str:
    g = "".join(f'<w:gridCol w:w="{w}"/>' for w in grid)
    return f"<w:tbl>{tbl_pr}<w:tblGrid>{g}</w:tblGrid>{rows}</w:tbl>"


class Form:
    """원본 양식에서 떼어낸 조립 재료."""

    def __init__(self, docx_path: Path):
        with zipfile.ZipFile(docx_path) as z:
            self.doc = z.read("word/document.xml").decode("utf-8")
        self.head = re.search(r"^.*?<w:body>", self.doc, re.S).group(0)
        self.sectpr = clean(re.search(r"<w:sectPr.*?</w:sectPr>", self.doc, re.S).group(0))
        tbls = [clean(t) for t in re.findall(r"<w:tbl>.*?</w:tbl>", self.doc, re.S)]

        # 1) hero + 메타표 (4열): 행0 = 네이비 제목, 행1~2 = 라벨/값
        hero_tbl = tbls[0]
        self.hero_pr = re.search(r"<w:tblPr>.*?</w:tblPr>", hero_tbl, re.S).group(0)
        hero_rows = re.findall(r"<w:tr\b.*?</w:tr>", hero_tbl, re.S)
        self.hero_cell = re.findall(r"<w:tc>.*?</w:tc>", hero_rows[0], re.S)[0]
        meta_cells = re.findall(r"<w:tc>.*?</w:tc>", hero_rows[1], re.S)
        self.meta_label = meta_cells[0]   # fill EDF2F9 + 가운데 + 굵게
        self.meta_value = meta_cells[1]   # 흰 배경

        # 2) 섹션바 (420/9486): 네이비 번호칸 + 제목칸
        bar = tbls[1]
        self.bar_pr = re.search(r"<w:tblPr>.*?</w:tblPr>", bar, re.S).group(0)
        bar_cells = re.findall(r"<w:tc>.*?</w:tc>", bar, re.S)
        self.bar_no, self.bar_title = bar_cells[0], bar_cells[1]

        # 3) 데이터표 (6열): 테두리 C7D2E0/E3E9F2, 헤더칸 EDF2F9
        data = tbls[3]
        self.data_pr = re.search(r"<w:tblPr>.*?</w:tblPr>", data, re.S).group(0)
        data_rows = re.findall(r"<w:tr\b.*?</w:tr>", data, re.S)
        self.head_cell = re.findall(r"<w:tc>.*?</w:tc>", data_rows[0], re.S)[0]
        self.body_cell = re.findall(r"<w:tc>.*?</w:tc>", data_rows[1], re.S)[0]

        # 4) 불릿 문단(목록 스타일) / 일반 문단 / 빈 문단
        self.bullet_p = clean(
            re.search(r'<w:p\b[^>]*>(?:(?!</w:p>).)*?<w:numPr>.*?</w:p>', self.doc, re.S).group(0)
        )
        # 들여쓰기 없는 일반 문단 — 범례(※)·"끝." 처럼 표 밖에 붙는 한 줄
        self.plain_p = clean(
            re.search(
                r'<w:p\b(?:(?!</w:p>).)*?<w:t[^>]*>끝\.</w:t>(?:(?!</w:p>).)*?</w:p>',
                self.doc, re.S,
            ).group(0)
        )
        self.empty_p = "<w:p/>"

    # ── 조립 블록 ────────────────────────────────────────────────
    def hero(self, title: str, subtitle: str, meta: list) -> str:
        """네이비 제목 + 부제 + 라벨/값 2열 메타표. meta = [(라벨, 값), ...] 짝수개."""
        hero_pr = cell_pr(self.hero_cell)
        ps = cell_paras(self.hero_cell)
        t_ppr, t_rpr = get_ppr(ps[0]), get_rpr(ps[0])
        s_ppr, s_rpr = get_ppr(ps[1]), get_rpr(ps[1])
        hero_body = para(t_ppr, title, t_rpr) + para(s_ppr, subtitle, s_rpr)
        rows = row(f"<w:tc>{hero_pr}{hero_body}</w:tc>")

        for i in range(0, len(meta), 2):
            pair = meta[i:i + 2]
            cs = ""
            for label, value in pair:
                cs += cell(self.meta_label, label, w=1500)
                cs += cell(self.meta_value, value, w=3453)
            if len(pair) == 1:  # 짝이 없으면 값칸을 끝까지 늘림
                cs = cell(self.meta_label, pair[0][0], w=1500) + cell(self.meta_value, pair[0][1], w=8406, span=3)
            rows += row(cs)
        return table(self.hero_pr, [1500, 3453, 1500, 3453], rows)

    def bar(self, no: str, title: str) -> str:
        cs = cell(self.bar_no, no, w=420) + cell(self.bar_title, title, w=9486)
        return table(self.bar_pr, [420, 9486], row(cs))

    def bullet(self, text: str) -> str:
        return set_text(self.bullet_p, text)

    def note(self, text: str) -> str:
        return set_text(self.plain_p, text)

    def data_table(self, grid: list, header: list, body_rows: list, aligns=None) -> str:
        """헤더 1행 + 본문 여러 행. body_rows 는 [(텍스트, ...), ...]."""
        aligns = aligns or ["center"] * len(grid)
        rows = row("".join(cell(self.head_cell, h, w=w) for h, w in zip(header, grid)))
        for r in body_rows:
            rows += row("".join(
                cell(self.body_cell, t, w=w, jc=a) for t, w, a in zip(r, grid, aligns)
            ))
        return table(self.data_pr, grid, rows)

    def kv_table(self, pairs: list, label_w=1800) -> str:
        """라벨/값 2열 표 — 사고 개요·피해 현황처럼 항목이 적은 표."""
        val_w = TABLE_W - label_w
        rows = ""
        for label, value in pairs:
            rows += row(
                cell(self.head_cell, label, w=label_w)
                + cell(self.body_cell, value, w=val_w, jc="left")
            )
        return table(self.data_pr, [label_w, val_w], rows)

    def photo_table(self, cols: int, loop: str, img_keys: list, cap_keys: list) -> str:
        """사진 표 — 한 행에 cols 장. 행 단위로 {#loop} 반복."""
        w = TABLE_W // cols
        cs = ""
        for i in range(cols):
            img = "{%" + img_keys[i] + "}"
            cap = "{" + cap_keys[i] + "}"
            first = "{#" + loop + "}" if i == 0 else ""
            last = "{/" + loop + "}" if i == cols - 1 else ""
            cs += cell(self.body_cell, [first + img, cap + last], w=w)
        return table(self.data_pr, [w] * cols, row(cs))

    def build(self, blocks: list) -> str:
        body = "".join(blocks)
        return self.head + body + self.sectpr + "</w:body></w:document>"


def scrub_props(xml: str, title: str) -> str:
    """원본 양식에 남아 있는 다른 문서의 제목·작성자·이름을 지운다.

    템플릿은 공개 폴더에 올라가고, 여기 적힌 값은 출력되는 보고서에도 그대로
    따라붙는다(워드 속성). 엉뚱한 문서 제목과 개인 이름이 새어 나가지 않게 한다.
    """
    repl = {
        "dc:title": title,
        "dc:creator": "삼구INC",
        "dc:subject": "",
        "dc:description": "",
        "cp:lastModifiedBy": "",
        "cp:keywords": "",
        "cp:revision": "1",
    }
    for tag, val in repl.items():
        xml = re.sub(rf"<{tag}>.*?</{tag}>", f"<{tag}>{esc(val)}</{tag}>", xml, flags=re.S)
    xml = re.sub(r"<cp:lastPrinted>.*?</cp:lastPrinted>", "", xml, flags=re.S)
    # app.xml 쪽 제목 목록
    xml = re.sub(r"<vt:lpstr>(?!목차)[^<]*</vt:lpstr>", f"<vt:lpstr>{esc(title)}</vt:lpstr>", xml)
    return xml


def write_docx(src: Path, out: Path, document_xml: str, title: str):
    # document.xml 만 교체 (zip 안에서 한 항목만 바꿀 수 없으므로 다시 쓴다)
    with zipfile.ZipFile(src) as zin:
        items = [(i, zin.read(i.filename)) for i in zin.infolist()]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for info, data in items:
            if info.filename == "word/document.xml":
                data = document_xml.encode("utf-8")
            elif info.filename in ("docProps/core.xml", "docProps/app.xml"):
                data = scrub_props(data.decode("utf-8"), title).encode("utf-8")
            zout.writestr(info, data)


# ── 보고서별 본문 구성 ────────────────────────────────────────────
def common_blocks(f: Form) -> list:
    """완료·점검·보수요청 — 섹션 반복 + 첨부사진."""
    return [
        f.hero("{제목}", "{부제}", [
            ("작 성 일", "{작성 일자}"), ("작    성", "{작성자}"),
            ("대상 건물", "{대상 건물}"), ("구    분", "{구분}"),
        ]),
        f.empty_p,
        tag_p("{#sections}"),
        f.bar("{no}", "{heading}"),
        f.empty_p,
        tag_p("{#내용}"),
        f.bullet("{.}"),
        tag_p("{/내용}"),
        f.empty_p,
        tag_p("{/sections}"),
        f.bar("{photoNo}", "{photosLabel}"),
        f.empty_p,
        f.photo_table(2, "photoRows", ["c1img", "c2img"], ["c1cap", "c2cap"]),
        f.empty_p,
        f.note("끝."),
    ]


def accident_blocks(f: Form) -> list:
    """사고보고서 — 개요·피해현황 표 + 조치·향후방안 + 첨부사진."""
    return [
        f.hero("{제목}", "{부제}", [
            ("보고 일자", "{보고 일자}"), ("보 고 자", "{보고자 직책}"),
            ("대상 건물", "{대상 건물}"), ("구    분", "{구분}"),
        ]),
        f.empty_p,
        f.bar("1", "사고 개요"),
        f.empty_p,
        f.kv_table([
            ("사고 제목", "{사고 제목}"),
            ("발생 일시", "{사고 발생일자}"),
            ("발생 장소", "{사고 장소}"),
            ("발생 원인", "{사고 발생 원인}"),
            ("피해 범위", "{피해 범위}"),
        ]),
        f.empty_p,
        f.bar("2", "피해 현황"),
        f.empty_p,
        f.kv_table([
            ("인적 피해", "{인적 피해}"),
            ("물적 피해", "{물적 피해}"),
            ("피 해 액", "{피해 금액}"),
        ]),
        f.empty_p,
        f.bar("3", "조치 사항 및 경과"),
        f.empty_p,
        tag_p("{#조치}"),
        f.bullet("{.}"),
        tag_p("{/조치}"),
        f.empty_p,
        f.bar("4", "대응 적합성 및 향후 방안"),
        f.empty_p,
        tag_p("{#향후방안}"),
        f.bullet("{.}"),
        tag_p("{/향후방안}"),
        f.empty_p,
        f.bar("5", "첨부사진"),
        f.empty_p,
        f.photo_table(2, "photoRows", ["c1img", "c2img"], ["c1cap", "c2cap"]),
        f.empty_p,
        f.note("끝."),
    ]


def pungsuhae_blocks(f: Form) -> list:
    """풍수해 예방 점검 — 점검표 + 구간별 사진."""
    grid = [1792, 5938, 2188]
    # 점검표 본문 행은 {#checkRows} 로 행 단위 반복
    body = row(
        cell(f.body_cell, "{#checkRows}{category}", w=grid[0])
        + cell(f.body_cell, "{content}", w=grid[1], jc="left")
        + cell(f.body_cell, "{result}{/checkRows}", w=grid[2])
    )
    check_tbl = table(
        f.data_pr, grid,
        row("".join(cell(f.head_cell, h, w=w) for h, w in zip(["구    분", "점 검 내 용", "점검결과"], grid))) + body
    )
    return [
        f.hero("{제목}", "{부제}", [
            ("점검일자", "{점검일자}"), ("점 검 자", "{점검자}"),
            ("대상 건물", "{대상 건물}"), ("구    분", "{구분}"),
        ]),
        f.empty_p,
        f.bar("1", "점검 결과"),
        f.empty_p,
        check_tbl,
        f.note("{범례}"),
        f.empty_p,
        tag_p("{#photoSections}"),
        f.bar("{no}", "{title}"),
        f.empty_p,
        f.photo_table(3, "rows", ["i1", "i2", "i3"], ["c1", "c2", "c3"]),
        f.empty_p,
        tag_p("{/photoSections}"),
        f.note("끝."),
    ]


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 사장이 양식으로 지정한 문서 (2026-11-06). 이 문서의 서식이 보고서 5종의 기준이다.
BASE = os.path.join(
    r"C:\Users\user\Desktop\Bio Innovation Hub\04 Archives\[보고서]\2026",
    "[검토서] 바이오이노베이션허브_동절기 제설용품 구매_2026.10.28",
    "[구매검토서] 바이오 이노베이션 허브_동절기 제설용품_2026.10.30.docx",
)
OUT = os.path.join(ROOT, "report", "public", "templates")

# 파일마다 (본문 구성, 문서 속성에 넣을 제목)
PLANS = {
    "completion.docx": (common_blocks, "완료 보고서"),
    "inspection.docx": (common_blocks, "점검 보고서"),
    "repair.docx": (common_blocks, "보수 요청서"),
    "accident.docx": (accident_blocks, "사고 보고서"),
    "pungsuhae.docx": (pungsuhae_blocks, "풍수해 예방 점검표"),
}


def main():
    ap = argparse.ArgumentParser(description="보고서 워드 양식 5종 만들기")
    ap.add_argument("--base", default=BASE, help="서식을 가져올 원본 양식 docx")
    ap.add_argument("--out", default=OUT, help="만들어 넣을 폴더")
    args = ap.parse_args()

    src = Path(args.base)
    if not src.is_file():
        raise SystemExit(
            f"양식 문서를 찾지 못했습니다:\n  {src}\n"
            "원본이 옮겨졌다면 --base 로 경로를 알려주세요."
        )
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"양식: {src.name}")
    for name, (fn, title) in PLANS.items():
        # 보고서마다 Form 을 새로 읽는다 — 조립하며 재료를 다듬으므로 섞이면 안 된다
        form = Form(src)
        write_docx(src, outdir / name, form.build(fn(form)), title)
        print(f"  {name}")
    print(f"넣은 곳: {outdir}")


if __name__ == "__main__":
    main()
