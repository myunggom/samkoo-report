# -*- coding: utf-8 -*-
"""
사장 원본 사고보고서 양식(scripts/source/accident_source.docx)으로
웹 출력용 워드 템플릿 4종을 만든다.

  public/templates/accident.docx    사고보고서 (원본 구조 그대로, 값만 태그로)
  public/templates/completion.docx  완료보고서  ┐ 같은 디자인(로고 머리글·네이비 제목바·정보표·
  public/templates/inspection.docx  점검보고서  │ 번호 소제목 섹션·2열 사진표·서명)을
  public/templates/repair.docx      보수요청서  ┘ 원본 표를 복제해 구성

태그 문법은 docxtemplater(+무료 이미지 모듈). 데이터는 lib/docxExport.ts 가 만든다.
  · {-w:tr 목록} … {/목록}  → 표 행을 개수만큼 반복(0개면 행 삭제)
  · {#tone_xx}{값}{/tone_xx} → 같은 칸에 색별 런을 두고 조건으로 하나만 보이게(글자색 자동)
  · {%c1img}                → 사진

원본 양식을 바꾸면: 새 파일을 scripts/source/accident_source.docx 로 덮어쓰고
  python scripts/build_report_templates.py
를 실행. (표 순서·개수가 바뀌면 아래 인덱스 확인 필요)
"""
import copy
import os
import re
import sys
import zipfile

from lxml import etree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "source", "accident_source.docx")
OUT_DIR = os.path.join(ROOT, "public", "templates")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def q(tag):
    return W + tag


# 글자색 톤 (lib/docxExport.ts 의 toneOf 와 이름 일치)
TONES = {
    "green": "1E7A46",
    "blue": "1F5FA9",
    "orange": "B5721A",
    "red": "B03A2E",
    "gray": "5B6675",
    "navy": "13294B",
}


# ── 기본 도우미 ─────────────────────────────────────────────
def rows(tbl):
    return tbl.findall(q("tr"))


def cells(tr):
    return tr.findall(q("tc"))


def paras(tc):
    return tc.findall(q("p"))


def first_rpr(p):
    for r in p.iter(q("r")):
        rp = r.find(q("rPr"))
        if rp is not None and "".join(r.itertext()).strip():
            return copy.deepcopy(rp)
    for r in p.iter(q("r")):
        rp = r.find(q("rPr"))
        if rp is not None:
            return copy.deepcopy(rp)
    return None


def clear_runs(p):
    """문단 속성(pPr)만 남기고 런·교정표시 등 내용 전부 제거."""
    for ch in list(p):
        if ch.tag != q("pPr"):
            p.remove(ch)


def make_run(text, rpr=None):
    r = ET.Element(q("r"))
    if rpr is not None:
        r.append(copy.deepcopy(rpr))
    t = ET.SubElement(r, q("t"))
    t.text = text
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    return r


def set_para(p, text, rpr="keep"):
    """문단 내용을 한 개 런(text)으로 교체. rpr='keep'이면 원래 첫 런 서식 사용."""
    if isinstance(rpr, str) and rpr == "keep":
        rpr = first_rpr(p)
    clear_runs(p)
    p.append(make_run(text, rpr))
    return p


def set_cell(tc, text, rpr="keep", para_index=0):
    """칸을 문단 하나(text)로 만든다. para_index 문단의 서식 유지, 나머지 문단 삭제."""
    ps = paras(tc)
    keep = ps[para_index]
    if isinstance(rpr, str) and rpr == "keep":
        rpr = first_rpr(keep)
    for p in ps:
        if p is not keep:
            tc.remove(p)
    set_para(keep, text, rpr)
    return keep


def with_color(rpr, color):
    rpr = copy.deepcopy(rpr) if rpr is not None else ET.Element(q("rPr"))
    c = rpr.find(q("color"))
    if c is None:
        c = ET.Element(q("color"))
        # rPr 자식 순서: rFonts, b, bCs, ... color 는 sz 앞
        sz = rpr.find(q("sz"))
        if sz is not None:
            sz.addprevious(c)
        else:
            rpr.append(c)
    c.set(q("val"), color)
    return rpr


def tone_para(p, field, prefix, rpr="keep", before="", after=""):
    """같은 문단에 톤별 런을 두고 {#prefix_tone}{field}{/prefix_tone} 조건으로 하나만 표시."""
    if isinstance(rpr, str) and rpr == "keep":
        rpr = first_rpr(p)
    clear_runs(p)
    if before:
        p.append(make_run(before, rpr))
    for name, color in TONES.items():
        p.append(make_run("{#%s_%s}{%s}{/%s_%s}" % (prefix, name, field, prefix, name), with_color(rpr, color)))
    if after:
        p.append(make_run(after, rpr))


def para_after(el, text="", ppr_from=None):
    p = ET.Element(q("p"))
    if ppr_from is not None and ppr_from.find(q("pPr")) is not None:
        p.append(copy.deepcopy(ppr_from.find(q("pPr"))))
    if text:
        p.append(make_run(text))
    el.addnext(p)
    return p


def para_before(el, text=""):
    p = ET.Element(q("p"))
    if text:
        p.append(make_run(text))
    el.addprevious(p)
    return p


def add_keep_next(tr):
    """제목 행이 페이지 끝에 홀로 남지 않도록 다음 행과 붙임."""
    for p in tr.iter(q("p")):
        ppr = p.find(q("pPr"))
        if ppr is None:
            ppr = ET.Element(q("pPr"))
            p.insert(0, ppr)
        if ppr.find(q("keepNext")) is None:
            kn = ET.Element(q("keepNext"))
            # pPr 첫 자식이 pStyle이면 그 뒤, 아니면 맨 앞
            ps = ppr.find(q("pStyle"))
            if ps is not None:
                ps.addnext(kn)
            else:
                ppr.insert(0, kn)


def cant_split(tr):
    """행이 페이지 경계에서 쪼개지지 않게."""
    trpr = tr.find(q("trPr"))
    if trpr is None:
        trpr = ET.Element(q("trPr"))
        tcs = tr.find(q("tc"))
        tcs.addprevious(trpr)
    if trpr.find(q("cantSplit")) is None:
        trpr.insert(0, ET.Element(q("cantSplit")))


def ensure_bottom_border(tc, like):
    """세로병합 라벨칸: 그룹이 1행뿐이어도 아래 테두리가 보이도록."""
    b = tc.find(q("tcPr")).find(q("tcBorders"))
    if b is None or b.find(q("bottom")) is not None:
        return
    nb = ET.Element(q("bottom"))
    for k, v in like.attrib.items():
        nb.set(k, v)
    right = b.find(q("right"))
    if right is not None:
        right.addprevious(nb)
    else:
        b.append(nb)


def strip_page_breaks(el):
    for br in list(el.iter(q("br"))):
        if br.get(q("type")) == "page":
            br.getparent().remove(br)
    for lr in list(el.iter(q("lastRenderedPageBreak"))):
        lr.getparent().remove(lr)
    for pb in list(el.iter(q("pageBreakBefore"))):
        pb.getparent().remove(pb)


def remove_proof(root):
    for pe in list(root.iter(q("proofErr"))):
        pe.getparent().remove(pe)


# ── 공통 블록 편집 ───────────────────────────────────────────
def build_title_table(tbl, common):
    r0, r1, r2 = rows(tbl)
    c = cells(r0)[0]
    ps = paras(c)
    set_para(ps[0], "{문서제목}")
    set_para(ps[1], "제목 : {제목}")
    for extra in ps[2:]:
        c.remove(extra)
    c1 = cells(r1)
    set_cell(c1[1], "{보고자}")
    set_cell(c1[3], "{보고일}")
    c2 = cells(r2)
    plain = first_rpr(paras(c1[1])[0])
    set_cell(c2[1], "{보고대상}")
    if common:
        set_cell(c2[2], "{항목4라벨}")
        set_cell(c2[3], "{항목4}", rpr=plain)
    else:
        # 사고 등급: 등급(색 자동, 굵게) + 설명(회색 작은 글씨)
        p = paras(c2[3])[0]
        runs = [r for r in p.iter(q("r")) if "".join(r.itertext()).strip()]
        grade_rpr = copy.deepcopy(runs[0].find(q("rPr")))
        note_rpr = copy.deepcopy(runs[-1].find(q("rPr")))
        tone_para(p, "등급", "g", rpr=grade_rpr)
        p.append(make_run("{#등급비고}   {등급비고}{/등급비고}", note_rpr))


def set_section_number(tbl, text):
    set_cell(cells(rows(tbl)[0])[0], text)


def build_photo_table(tbl):
    """2열 사진표: 첫 행을 반복 템플릿으로, 나머지 행 삭제. 샘플 사진 제거."""
    rs = rows(tbl)
    for extra in rs[1:]:
        tbl.remove(extra)
    tr = rs[0]
    cant_split(tr)
    for side, tc in zip(("c1", "c2"), cells(tr)):
        ps = paras(tc)
        img, label, cap, sub = ps[0], ps[1], ps[2], ps[3]
        clear_runs(img)
        open_tag = "{-w:tr photoRows}" if side == "c1" else ""
        img.append(make_run(open_tag + "{%%%simg}" % side))
        set_para(label, "{%slabel}" % side)
        set_para(cap, "{%scap}" % side)
        close_tag = "{/photoRows}" if side == "c2" else ""
        set_para(sub, "{%ssub}%s" % (side, close_tag))
        for extra in ps[4:]:
            tc.remove(extra)


def keep_heading_with_photos(t_att):
    """첨부 제목표와 사진표 사이 빈 문단까지 keepNext → 제목이 페이지 끝에 홀로 남지 않음."""
    add_keep_next(rows(t_att)[0])
    nxt = t_att.getnext()
    while nxt is not None and nxt.tag == q("p"):
        ppr = nxt.find(q("pPr"))
        if ppr is None:
            ppr = ET.Element(q("pPr"))
            nxt.insert(0, ppr)
        if ppr.find(q("keepNext")) is None:
            ppr.insert(0, ET.Element(q("keepNext")))
        nxt = nxt.getnext()


def wrap_condition(first_el, last_el, name):
    """first_el~last_el 을 {#name}…{/name} 조건 문단으로 감싼다(paragraphLoop로 문단 자체는 사라짐)."""
    para_before(first_el, "{#%s}" % name)
    para_after(last_el, "{/%s}" % name)


# ── 사고보고서 ──────────────────────────────────────────────
def build_accident(body):
    els = list(body)
    t_title, t_sum, t_one, t_ov, t_dmg, t_tl, t_plan, t_att, t_photo = (
        els[0], els[3], els[5], els[8], els[11], els[13], els[16], els[21], els[23])
    sign = els[28]

    build_title_table(t_title, common=False)

    # 1 핵심 요약 (4칸)
    r1 = rows(t_sum)[1]
    cs = cells(r1)
    set_para(paras(cs[0])[1], "{요약일시}")
    set_para(paras(cs[1])[1], "{요약장소}")
    tone_para(paras(cs[2])[1], "피해규모", "d")
    set_para(paras(cs[3])[1], "{임시조치}")

    # 한 줄 요약
    set_cell(cells(rows(t_one)[0])[1], "{한줄요약}")

    # 2 사고 개요
    for tr, tag in zip(rows(t_ov)[1:], ["제목", "발생일시", "발생장소", "발생원인", "영향범위", "신고경로"]):
        set_cell(cells(tr)[1], "{%s}" % tag)

    # 3 피해 현황
    r2 = rows(t_dmg)[2]
    for tc, (field, pre) in zip(cells(r2), [("인적피해", "h"), ("물적피해", "m"), ("피해금액", "c")]):
        ps = paras(tc)
        rpr = first_rpr(ps[0])
        for extra in ps[1:]:
            tc.remove(extra)
        tone_para(ps[0], field, pre, rpr=rpr)
    note_tc = cells(rows(t_dmg)[3])[0]
    set_cell(note_tc, "{-w:tr 피해비고}{피해비고}{/피해비고}")

    # 4 조치 사항 및 경과 (시각/구분/조치내용/담당 행 반복)
    strip_page_breaks(t_tl)
    rs = rows(t_tl)
    tpl = rs[2]
    for extra in rs[3:]:
        t_tl.remove(extra)
    c = cells(tpl)
    set_cell(c[0], "{-w:tr 경과}{시각}")
    tone_para(paras(c[1])[0], "구분", "t")
    set_cell(c[2], "{내용}")
    set_cell(c[3], "{담당}{/경과}")
    cant_split(tpl)

    # 5 조치 계획 및 재발 방지 대책 (그룹별: 첫 행=세로병합 시작+라벨, 나머지=병합 계속)
    set_section_number(t_plan, "5")
    rs = rows(t_plan)
    plan_first, plan_rest, prev_first, prev_rest = rs[2], rs[3], rs[5], rs[6]
    bottom_like = cells(rs[4])[0].find(q("tcPr")).find(q("tcBorders")).find(q("bottom"))
    for extra in (rs[4], rs[7]):
        t_plan.remove(extra)
    for tr in (plan_first, plan_rest, prev_first, prev_rest):
        ensure_bottom_border(cells(tr)[0], bottom_like)
        cant_split(tr)
    for tr, loop in [(plan_first, "조치첫"), (plan_rest, "조치나머지"), (prev_first, "재발첫"), (prev_rest, "재발나머지")]:
        c = cells(tr)
        set_cell(c[1], "{-w:tr %s}{내용}" % loop)
        p = paras(c[2])[0]
        tone_para(p, "결과", "r")
        p.append(make_run("{/%s}" % loop))

    # 6 첨부 사진
    set_section_number(t_att, "6")
    strip_page_breaks(t_att)
    build_photo_table(t_photo)
    keep_heading_with_photos(t_att)
    wrap_condition(t_att, t_photo, "hasPhotos")

    set_para(sign, "{발신}")

    # 원본에서 남는 빈 문단 정리(첨부 앞 <w:p/> 3개 → 1개)
    for el in els[19:21]:
        if el.getparent() is not None:
            body.remove(el)

    for t in (t_sum, t_ov, t_dmg, t_tl, t_plan, t_att):
        add_keep_next(rows(t)[0])
    add_keep_next(rows(t_tl)[1])
    add_keep_next(rows(t_plan)[1])


# ── 완료·점검·보수요청 공통 ─────────────────────────────────
def build_common(body):
    els = list(body)
    t_title, t_one, t_ov, t_att, t_photo = els[0], els[5], els[8], els[21], els[23]
    ends, sign = els[26], els[28]
    blank = els[1]

    build_title_table(t_title, common=True)

    # 한 줄 요약 (입력 시에만)
    set_cell(cells(rows(t_one)[0])[0], "{요약라벨}")
    set_cell(cells(rows(t_one)[0])[1], "{한줄요약}")

    # 본문 섹션: [번호][소제목] + 내용 칸(줄마다 문단)
    sec = copy.deepcopy(t_ov)
    rs = rows(sec)
    for extra in rs[2:]:
        sec.remove(extra)
    set_section_number(sec, "{no}")
    set_cell(cells(rs[0])[1], "{heading}")
    add_keep_next(rs[0])
    # 내용 행: 라벨칸+값칸 → 전체폭 한 칸
    r1 = rs[1]
    lab, val = cells(r1)
    r1.remove(lab)
    tcpr = val.find(q("tcPr"))
    tcw = tcpr.find(q("tcW"))
    tcw.set(q("w"), str(sum(int(g.get(q("w"))) for g in sec.find(q("tblGrid")).findall(q("gridCol")))))
    gs = ET.Element(q("gridSpan"))
    gs.set(q("val"), "3")
    tcw.addnext(gs)
    vp = paras(val)[0]
    plain = first_rpr(vp)
    set_para(vp, "{#lines}", rpr=plain)
    line_p = copy.deepcopy(vp)
    set_para(line_p, "{.}", rpr=plain)
    end_p = copy.deepcopy(vp)
    set_para(end_p, "{/lines}", rpr=plain)
    vp.addnext(line_p)
    line_p.addnext(end_p)

    # 문서 재구성: 제목표, 빈줄, (요약), 섹션 반복, 첨부, 끝, 서명
    for el in list(body):
        if el.tag != q("sectPr"):
            body.remove(el)
    sect = body.find(q("sectPr"))

    def add(el):
        sect.addprevious(el)
        return el

    add(t_title)
    add(copy.deepcopy(blank))
    add(copy.deepcopy(blank))
    add(t_one)
    wrap_condition(t_one, t_one, "has요약")
    add(copy.deepcopy(blank))
    start = add(copy.deepcopy(blank))
    set_para(start, "{#sections}", rpr=None)
    add(sec)
    add(copy.deepcopy(blank))
    end = add(copy.deepcopy(blank))
    set_para(end, "{/sections}", rpr=None)

    set_section_number(t_att, "{photoNo}")
    strip_page_breaks(t_att)
    add(t_att)
    add(copy.deepcopy(blank))
    add(t_photo)
    build_photo_table(t_photo)
    keep_heading_with_photos(t_att)
    wrap_condition(t_att, t_photo, "hasPhotos")
    add(copy.deepcopy(blank))
    add(ends)
    add(copy.deepcopy(blank))
    add(sign)
    set_para(sign, "{발신}")
    add_keep_next(rows(t_att)[0])


# ── 패키지 저장 (본문 샘플 사진 제거) ──────────────────────────
def used_rids(xml_bytes):
    return set(re.findall(rb'r:(?:embed|id|link)="([^"]+)"', xml_bytes))


def write_package(src_zip, doc_xml_bytes, out_path):
    rels_name = "word/_rels/document.xml.rels"
    rels = ET.fromstring(src_zip.read(rels_name))
    used = used_rids(doc_xml_bytes)
    drop_targets = set()
    for rel in list(rels):
        if rel.get("Type", "").endswith("/image") and rel.get("Id").encode() not in used:
            drop_targets.add("word/" + rel.get("Target"))
            rels.remove(rel)
    # 머리글 등 다른 파트가 쓰는 이미지는 남긴다
    keep_media = set()
    for name in src_zip.namelist():
        if name.startswith("word/_rels/") and name != rels_name:
            for m in re.findall(rb'Target="([^"]+)"', src_zip.read(name)):
                keep_media.add("word/" + m.decode())
    drop_targets -= keep_media

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in src_zip.infolist():
            if item.filename in drop_targets:
                continue
            if item.filename == "word/document.xml":
                data = doc_xml_bytes
            elif item.filename == rels_name:
                data = ET.tostring(rels, xml_declaration=True, encoding="UTF-8", standalone=True)
            else:
                data = src_zip.read(item.filename)
            zout.writestr(item, data)


def build(kind):
    src = zipfile.ZipFile(SRC)
    root = ET.fromstring(src.read("word/document.xml"))
    remove_proof(root)
    body = root.find(q("body"))
    if kind == "accident":
        build_accident(body)
    else:
        build_common(body)
    xml = ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    out = os.path.join(OUT_DIR, "%s.docx" % kind)
    write_package(src, xml, out)
    src.close()
    tags = sorted(set(re.findall(r"\{[^{}]*\}", xml.decode("utf-8"))))
    print("%-11s %7d bytes  tags=%d" % (kind, os.path.getsize(out), len(tags)))


if __name__ == "__main__":
    kinds = sys.argv[1:] or ["accident", "completion", "inspection", "repair"]
    for k in kinds:
        build(k)
