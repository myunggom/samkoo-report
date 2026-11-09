# -*- coding: utf-8 -*-
"""
SOP 교육자료용 현장 촬영 목록을 엑셀로 만든다.

왜 만드나
  AI 가 그린 설비 사진은 '산업설비처럼 생긴 것'이지 우리 설비가 아니다.
  냉동기와 흡수식 냉동기가 거의 같은 그림으로 나오는 식이다.
  설비 사진만큼은 현장에서 직접 찍는 수밖에 없다.

무엇이 들어가나
  data.js 에 작업마다 장소와 각부 명칭 6개가 이미 들어 있다.
  그걸 '어느 방에서 무엇을 찍어야 하는지' 목록으로 펴 놓는다.
  작업 하나당 설비 전체 1장 + 부위 6장 = 7장.

왜 방 기준인가
  사람을 보낼 때는 작업 단위가 아니라 방 단위로 보내야 한다.
  기계실에 한 번 들어가서 그 방 사진을 다 찍고 나오는 게 맞다.

사용법
  python tools/sop_photo_checklist.py
"""

import os
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sop_image_prompts as S                                  # noqa: E402

FONT = "맑은 고딕"
HEAD = "D9E1F2"
BAND = "F2F2F2"
THIN = Side(style="thin", color="B4C6E7")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

OUT = os.path.join(S.OUT, "00_현장촬영_목록.xlsx")

COLS = [("방 (장소)", 20), ("부문", 11), ("작업", 8), ("작업명", 26),
        ("번호", 6), ("찍을 것", 30), ("무엇을 확인하는 사진인가", 30),
        ("촬영", 7), ("담당", 10), ("비고", 18)]

# 설비가 고정 설치되어 있어 '들어가서 찍으면 되는' 부문
GEAR_SECTIONS = ("6. 전기부문", "7. 기계부문", "8. 소방부문")

GUIDE = [
    ("촬영 기준", ""),
    ("", "아래 7가지만 지키면 됩니다. 사진 잘 찍을 필요 없습니다. 정확하면 됩니다."),
    ("1. 가로로", "휴대폰을 눕혀서 찍습니다. 세로 사진은 자료에 못 씁니다."),
    ("2. 밝게", "실내등을 다 켜고 찍습니다. 어두우면 플래시를 켜세요."),
    ("3. 설비 전체 1장", "그 기계가 어떻게 생겼는지 한 장에 다 들어오게. 조금 떨어져서."),
    ("4. 부위 6장", "목록의 1~6번을 하나씩 가까이. 그 부위가 화면의 절반 이상 되게."),
    ("5. 사람 없이", "설비만 찍습니다. 사람이 나오면 안 됩니다."),
    ("6. 순서대로", "한 작업은 전체 → 1번 → 2번 … 6번 순으로 찍습니다. 순서가 중요합니다."),
    ("7. 가리지 말 것", "손·공구·대차로 설비를 가리지 마세요. 문은 열어서 안이 보이게."),
    ("", ""),
    ("찍은 뒤", "작업 단위로 폴더를 나눠 주시면 제일 좋습니다. (예: m02 폴더에 7장)"),
    ("", "폴더를 못 나누시면 순서만 지켜 주세요. 순서로 맞출 수 있습니다."),
    ("", ""),
    ("주의", "번호표(①②③)를 설비에 붙이거나 사진에 적지 마세요. 나중에 따로 올립니다."),
]


def _cell(ws, r, c, v, bold=False, fill=None, wrap=False, align="left", size=10):
    cell = ws.cell(r, c, v)
    cell.font = Font(name=FONT, size=size, bold=bold)
    cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=wrap)
    cell.border = BOX
    if fill:
        cell.fill = PatternFill("solid", fgColor=fill)
    return cell


def rows():
    """(방, 부문, 작업id, 작업명, 번호, 찍을것, 확인포인트)"""
    d = S.load()
    T, out = d["tasks"], []
    for g in d["site"]["groups"]:
        if g["id"] == "ex":
            continue
        for tid in [x for c in g["chapters"] for x in c["tasks"] if x in T]:
            t = T[tid]
            place = (t.get("place") or "미지정").strip()
            out.append((place, g["title"], tid, t["name"], "전체",
                        "설비 전체가 한 장에 들어오게", "이 작업이 어떤 기계인지"))
            for it in t.get("parts", {}).get("items", []):
                out.append((place, g["title"], tid, t["name"], str(it.get("n", "")),
                            it.get("name", ""), it.get("desc", "")))
    # 설비가 고정된 부문부터, 그 다음 방 이름, 작업 순
    out.sort(key=lambda r: (0 if r[1] in GEAR_SECTIONS else 1, r[0], r[2],
                            0 if r[4] == "전체" else int(r[4] or 0)))
    return out


def build():
    wb = Workbook()

    ws = wb.active
    ws.title = "촬영 안내"
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 78
    _cell(ws, 1, 1, "SOP 교육자료 현장 촬영 안내", True, HEAD, size=14)
    ws.merge_cells("A1:B1")
    for i, (a, b) in enumerate(GUIDE, start=3):
        _cell(ws, i, 1, a, bool(a), BAND if a and not a[0].isdigit() else None)
        _cell(ws, i, 2, b, wrap=True)
        ws.row_dimensions[i].height = 22

    ws = wb.create_sheet("촬영 목록")
    for i, (name, w) in enumerate(COLS, start=1):
        _cell(ws, 1, i, name, True, HEAD, align="center")
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"

    data = rows()
    prev_task = None
    for r, row in enumerate(data, start=2):
        new_task = row[2] != prev_task
        prev_task = row[2]
        fill = BAND if row[4] == "전체" else None
        for c, v in enumerate(row, start=1):
            _cell(ws, r, c, v, bold=(row[4] == "전체" and c <= 4), fill=fill,
                  wrap=(c in (6, 7)), align="center" if c in (3, 5, 8) else "left")
        for c in (8, 9, 10):
            _cell(ws, r, c, "", fill=fill)
        ws.row_dimensions[r].height = 26 if new_task else 20

    dv = DataValidation(type="list", formula1='"완료,재촬영,해당없음"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("H2:H%d" % (len(data) + 1))
    ws.auto_filter.ref = "A1:J%d" % (len(data) + 1)

    # 방별 요약 — 사람 배정용
    ws = wb.create_sheet("방별 요약")
    for i, (name, w) in enumerate([("방 (장소)", 24), ("작업 수", 9),
                                   ("사진 수", 9), ("담당", 12), ("완료일", 12)], start=1):
        _cell(ws, 1, i, name, True, HEAD, align="center")
        ws.column_dimensions[get_column_letter(i)].width = w
    agg = {}
    for place, sec, tid, _n, no, _a, _b in data:
        a = agg.setdefault(place, [set(), 0, sec in GEAR_SECTIONS])
        a[0].add(tid)
        a[1] += 1
    for r, (place, (tids, shots, gear)) in enumerate(
            sorted(agg.items(), key=lambda kv: (not kv[1][2], -kv[1][1])), start=2):
        _cell(ws, r, 1, place, fill=BAND if gear else None)
        _cell(ws, r, 2, len(tids), align="center", fill=BAND if gear else None)
        _cell(ws, r, 3, shots, align="center", fill=BAND if gear else None)
        _cell(ws, r, 4, "")
        _cell(ws, r, 5, "")
    r = len(agg) + 3
    _cell(ws, r, 1, "회색 칸은 설비가 고정 설치된 방입니다 — 들어가서 바로 찍으면 됩니다.",
          size=9)
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)

    os.makedirs(S.OUT, exist_ok=True)
    wb.save(OUT)
    return OUT, len(data), len(agg)


if __name__ == "__main__":
    path, shots, places = build()
    print("저장 : %s" % path)
    print("사진 %d장 / 방 %d곳" % (shots, places))
