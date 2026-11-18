# -*- coding: utf-8 -*-
"""
분전반 회로 정리.xlsx → panel-glass/data.json (스마트글래스 회로표 사이트용 자료).

사용법:  python panel-glass/build_data.py [엑셀경로]
  엑셀경로를 안 주면 바탕화면의 '분전반 회로 정리.xlsx' 를 읽는다.
  (그 엑셀은 tools/panel_schedule_excel.py · tools/mcc_excel.py 로 만든 것)

엑셀이 바뀌면 이 스크립트를 다시 돌리고 사이트를 다시 배포하면 된다.
"""

import json
import os
import re
import sys

from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_XLSX = os.path.join(os.path.expanduser("~"), "Desktop", "분전반 회로 정리.xlsx")


def clean_name(v):
    """도면 추출 때 'RA4/RA4' 처럼 같은 글자가 두 번 붙은 것을 하나로."""
    s = str(v or "").strip()
    parts = [p.strip() for p in s.split("/")]
    if len(parts) == 2 and parts[0] == parts[1]:
        s = parts[0]
    return s


def num(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return str(v)


def is_spare(name):
    return bool(re.fullmatch(r"(SP|SPARE|예비)(/(SP|SPARE|예비))?", name.upper()))


def build(xlsx):
    wb = load_workbook(xlsx, read_only=True, data_only=True)
    sheets = wb.worksheets
    if len(sheets) < 3:
        sys.exit("시트가 3개(회로 상세 / 분전반 요약 / 동력 회로) 이상이어야 합니다.")

    # 분전반 요약 시트의 '확인 필요' 메모
    flags = {}
    for r in sheets[1].iter_rows(min_row=2, values_only=True):
        if r and r[2] and len(r) > 10 and r[10]:
            flags[str(r[2]).strip()] = str(r[10]).strip()

    panels = {}

    # 1) 전등·전열 분전반 회로
    for r in sheets[0].iter_rows(min_row=2, values_only=True):
        if not r or not r[2]:
            continue
        pname = str(r[2]).strip()
        p = panels.get(pname)
        if p is None:
            p = panels[pname] = {
                "name": pname, "type": "LN", "dwg": r[0], "page": r[1],
                "main": {"kind": r[3], "pole": r[4], "af": num(r[5]), "at": num(r[6])},
                "flag": flags.get(pname, ""), "circuits": [],
            }
        name = clean_name(r[9])
        p["circuits"].append({
            "side": r[7] or "", "no": num(r[8]), "name": name,
            "kind": r[10] or "", "pole": r[11] or "",
            "af": num(r[12]), "at": num(r[13]), "note": r[14] or "",
            "spare": is_spare(name),
        })

    # 2) 동력(MCC) 반 회로
    for r in sheets[2].iter_rows(min_row=2, values_only=True):
        if not r or not r[2]:
            continue
        pname = str(r[2]).strip()
        p = panels.get(pname)
        if p is None:
            p = panels[pname] = {
                "name": pname, "type": "MCC", "dwg": r[0], "page": r[1],
                "main": None, "flag": "", "circuits": [],
            }
        feeder = str(r[3] or "").strip()
        if feeder.upper() == "MAIN":
            p["main"] = {"kind": "MCCB", "pole": r[7], "af": num(r[8]),
                         "at": num(r[9]), "ka": r[10] or ""}
            continue
        name = clean_name(r[5])
        p["circuits"].append({
            "side": "", "no": feeder, "equip": r[4] or "", "name": name,
            "kw": num(r[6]), "pole": r[7] or "", "af": num(r[8]),
            "at": num(r[9]), "ka": r[10] or "", "model": r[11] or "",
            "spare": is_spare(name) or "SPARE" in name.upper() or "예비" in name,
        })

    out = sorted(panels.values(), key=lambda p: (p["type"] != "LN", p["name"]))
    return out


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    if not os.path.exists(xlsx):
        sys.exit("엑셀 파일이 없습니다: %s" % xlsx)
    data = build(xlsx)
    path = os.path.join(HERE, "data.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"panels": data}, f, ensure_ascii=False, separators=(",", ":"))
    ln = sum(1 for p in data if p["type"] == "LN")
    print("분전반 %d개 (전등·전열 %d / 동력 %d), 회로 %d개 → %s" % (
        len(data), ln, len(data) - ln, sum(len(p["circuits"]) for p in data), path))


if __name__ == "__main__":
    main()
