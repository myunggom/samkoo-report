# -*- coding: utf-8 -*-
"""검침자료 폴더 하나만 주면 그 달 수도광열비 회입분을 만들어 준다.

하는 일 (순서대로)
    1. 검침자료의 기간을 보고 어느 달 사용분인지 알아낸다.
    2. 가장 최근 달 회입분을 양식으로 삼아 새 달 폴더를 만든다.
       (파일 이름의 월만 바꾼다. 원본 폴더는 손대지 않는다.)
    3. 원격검침 DB 를 채운다.                      → meter_fill.py
    4. 고지서에서 받아 적을 값 목록을 '고지서_입력표.txt' 로 내놓는다.
       그 파일을 채워서 다시 돌리면 고지서 값까지 넣는다.

쓰는 법
    python meter_month.py --검침 "<검침자료 폴더>"
    python meter_month.py --검침 "<...>" --보고자료 "<2026년 폴더>"
    python meter_month.py --검침 "<...>" --양식 "<양식으로 쓸 월 폴더>"
"""
import argparse
import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import meter_fill as MF                                        # noqa: E402

기본보고자료 = (r"C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\관리"
            r"\[관리] 수광비\01 수도광열비 보고자료")

입력표이름 = "고지서_입력표.txt"


# ────────────────────────────────── 달 알아내기

def 사용월(검침폴더):
    """검침자료들의 기간을 모아 '몇 월 사용분'인지 정한다.

    전기는 10일~다음달 9일처럼 걸쳐 있으므로, 가장 많이 겹치는 달을 고른다.
    폴더 이름에 '08월' 처럼 적혀 있으면 그것을 먼저 믿는다.
    """
    m = re.search(r"(\d{4})[.\s]*(\d{1,2})\s*월", os.path.basename(검침폴더))
    if m:
        return int(m.group(1)), int(m.group(2))
    표 = {}
    for n in os.listdir(검침폴더):
        if not n.lower().endswith(".xls") or n.startswith("~$"):
            continue
        try:
            _종류, 기간 = MF.feed_info(os.path.join(검침폴더, n))
        except Exception:
            continue
        if not 기간:
            continue
        (y1, m1, _d1), (_y2, m2, _d2) = 기간
        표[(y1, m1)] = 표.get((y1, m1), 0) + 1
        if m2 != m1:
            표[(y1, m2)] = 표.get((y1, m2), 0) + 0.5
    if not 표:
        return None
    return max(표.items(), key=lambda x: x[1])[0]


def 월폴더이름(y, m):
    """'09월 (08월 사용분)' — 사용월 다음 달에 작성한다는 사장님 방식."""
    작성 = m + 1
    해 = y
    if 작성 > 12:
        작성, 해 = 1, y + 1
    return "%02d월 (%02d월 사용분)" % (작성, m), 해


def 월폴더목록(보고자료):
    """'○○월 (○○월 사용분)' 폴더를 오래된 것부터 늘어놓는다."""
    후보 = []
    for 해 in os.listdir(보고자료):
        p = os.path.join(보고자료, 해)
        if not os.path.isdir(p):
            continue
        for d in sorted(os.listdir(p)):
            q = os.path.join(p, d)
            m = re.match(r"(\d{2})월\s*\((\d{2})월", d)
            if os.path.isdir(q) and m:
                후보.append(((해, int(m.group(1))), q))
    후보.sort(key=lambda x: x[0])
    return [q for _k, q in 후보]


def 이전월폴더(보고자료, 기준):
    """기준 폴더 바로 앞 달의 폴더."""
    목록 = 월폴더목록(보고자료)
    기준 = os.path.abspath(기준)
    for i, q in enumerate(목록):
        if os.path.abspath(q) == 기준:
            return 목록[i - 1] if i > 0 else None
    return 목록[-2] if len(목록) >= 2 else None


def 최근월폴더(보고자료):
    """연도 폴더들 안에서 가장 최근 '○○월 (○○월 사용분)' 폴더."""
    후보 = []
    for 해 in os.listdir(보고자료):
        p = os.path.join(보고자료, 해)
        if not os.path.isdir(p):
            continue
        for d in os.listdir(p):
            q = os.path.join(p, d)
            m = re.match(r"(\d{2})월\s*\((\d{2})월", d)
            if os.path.isdir(q) and m:
                후보.append(((해, int(m.group(1))), q))
    if not 후보:
        return None
    return max(후보, key=lambda x: x[0])[1]


# ────────────────────────────────── 새 달 폴더 만들기

def 월바꾸기(이름, y, m):
    """파일 이름의 '2026.08월' 을 새 달로 바꾼다."""
    out = re.sub(r"\d{4}\.\d{2}월", "%04d.%02d월" % (y, m), 이름)
    return re.sub(r"_수정[^.]*|_추가 수정|_단가수정[^.]*|\s*-\s*원격검침DB", "", out)


def 폴더준비(양식폴더, 새폴더, y, m):
    """양식 폴더의 회입분·종합표를 새 폴더로 복사하고 이름의 달을 바꾼다."""
    os.makedirs(새폴더, exist_ok=True)
    만든것 = []
    쓴앞번호 = set()
    for n in sorted(os.listdir(양식폴더)):
        if not n.endswith(".xlsx") or n.startswith("~$"):
            continue
        앞 = n[:2]
        if 앞 not in ("00", "01", "02", "03", "04"):
            continue
        if 앞 in 쓴앞번호:          # 같은 번호가 여러 개면 첫 것만 (수정본 중복)
            continue
        쓴앞번호.add(앞)
        새이름 = 월바꾸기(n, y, m)
        dst = os.path.join(새폴더, 새이름)
        if not os.path.exists(dst):
            shutil.copy2(os.path.join(양식폴더, n), dst)
        만든것.append(새이름)
    return 만든것


def 월첫날넣기(폴더, y, m):
    """회입분마다 '작성방법' 시트의 '작성하는 월의 첫 날'(B7) 을 넣는다.

    이 한 칸에서 고지서 사용기간·납부일자가 모두 계산되어 나온다.
    """
    import datetime as dt
    import xlwings as xw

    말 = []
    첫날 = dt.datetime(y, m, 1)
    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    try:
        for n in sorted(os.listdir(폴더)):
            if not n.endswith(".xlsx") or n.startswith(("~$", "00")):
                continue
            wb = app.books.open(os.path.abspath(os.path.join(폴더, n)))
            try:
                if "작성방법" not in [x.name for x in wb.sheets]:
                    continue
                wb.sheets["작성방법"].range("B7").value = 첫날
                app.calculate()
                기간 = ""
                if "고지서" in [x.name for x in wb.sheets]:
                    기간 = wb.sheets["고지서"].range("D5").value or ""
                말.append("  %-3s 작성 월 %04d.%02d.01  →  사용기간 %s"
                          % (n[:2], y, m, 기간))
                wb.save()
            finally:
                wb.close()
    finally:
        app.quit()
    return 말


# ────────────────────────────────── 고지서 입력표

def 바뀌는칸(이전폴더, 양식폴더):
    """두 달의 '고지서' 시트를 견주어, 달마다 바뀌는 칸을 찾는다."""
    from openpyxl import load_workbook

    def 고르기(folder, 앞):
        for n in sorted(os.listdir(folder)):
            if n.startswith(앞) and n.endswith(".xlsx") \
                    and not n.startswith("~$") and "원격검침DB" not in n:
                return os.path.join(folder, n)
        return None

    본문끝 = 11                 # K 칸까지가 고지서 본문
    결과 = {}
    for 앞, 항목 in MF.FEED_OF.items():
        pa, pb = 고르기(이전폴더, 앞), 고르기(양식폴더, 앞)
        if not (pa and pb):
            continue
        try:
            wa = load_workbook(pa)
            wb = load_workbook(pb)
        except Exception:
            continue
        if "고지서" not in wa.sheetnames or "고지서" not in wb.sheetnames:
            continue
        sa, sb = wa["고지서"], wb["고지서"]
        칸 = []
        for r in range(1, 60):
            for c in range(1, 본문끝 + 1):
                x, y = sa.cell(r, c).value, sb.cell(r, c).value
                if isinstance(x, str) and x.startswith("="):
                    continue
                if isinstance(y, str) and y.startswith("="):
                    continue
                if x is None and y is None:
                    continue
                if str(x) != str(y):
                    칸.append((sb.cell(r, c).coordinate, 이름표(sb, r, c), y))
        # 사용기간·납부금액은 달마다 반드시 바뀌므로 늘 넣는다
        있는칸 = {co for co, _l, _v in 칸}
        for r in range(1, 20):
            for c in range(1, 본문끝 + 1):
                v = sb.cell(r, c).value
                if not isinstance(v, str):
                    continue
                if "사용기간" in v or "납부금액" in v:
                    for k in range(1, 5):
                        칸이름 = sb.cell(r, c + k).coordinate
                        값 = sb.cell(r, c + k).value
                        if 값 in (None, "") or 칸이름 in 있는칸:
                            continue
                        if isinstance(값, str) and 값.startswith("="):
                            continue
                        칸.append((칸이름, v.strip(), 값))
                        있는칸.add(칸이름)
                        break
        if 칸:
            결과[항목] = sorted(칸, key=lambda x: (x[0][0], len(x[0]), x[0]))
    return 결과


def 이름표(ws, r, c):
    """그 칸이 무슨 값인지 왼쪽·위쪽에서 가장 가까운 글자로 짐작한다."""
    for k in range(c - 1, max(c - 6, 0), -1):
        v = ws.cell(r, k).value
        if isinstance(v, str) and v.strip() and not v.startswith("="):
            return v.strip()
    for k in range(r - 1, max(r - 6, 0), -1):
        v = ws.cell(k, c).value
        if isinstance(v, str) and v.strip() and not v.startswith("="):
            return v.strip()
    return "?"


def 입력표쓰기(path, 칸들, y, m):
    글 = ["# %04d년 %02d월 사용분 — 고지서에서 받아 적을 값" % (y, m),
         "#",
         "# 오른쪽 빈칸에 이번 달 고지서 값을 적고 저장한 뒤,",
         "# meter_month.py 를 같은 명령으로 다시 돌리면 엑셀에 들어갑니다.",
         "# 지난달과 같은 값이면 그냥 비워 두세요 (지난달 값을 그대로 씁니다).",
         "#",
         "# ※ 12개월 추이표(오른쪽 월별 기록)는 아직 손으로 한 줄 추가해야 합니다.",
         "#",
         "# 형식 :  항목 | 칸 | 설명 | 지난달값 | 이번달값",
         ""]
    for 항목 in ("전기", "열", "수도", "중수"):
        칸 = 칸들.get(항목)
        if not 칸:
            continue
        글.append("# ───── %s ─────" % 항목)
        for co, lb, v in 칸:
            글.append("%s | %s | %s | %s | " % (항목, co, lb, 보기좋게(v)))
        글.append("")
    io.open(path, "w", encoding="utf-8", newline="\r\n").write("\n".join(글))


def 보기좋게(v):
    if v is None:
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v)


def 입력표읽기(path):
    """채워진 입력표를 읽어 {항목: [(칸, 값), ...]} 로 돌려준다."""
    if not os.path.exists(path):
        return {}
    out = {}
    for raw in io.open(path, encoding="utf-8-sig"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        part = [x.strip() for x in line.split("|")]
        if len(part) < 5:
            continue
        항목, 칸, _설명, _지난달, 이번달 = part[:5]
        if not 이번달:
            continue
        out.setdefault(항목, []).append((칸, MF.num(이번달)))
    return out


def 고지서넣기(폴더, 값들):
    """고지서 시트의 지정한 칸에 값을 넣는다. 엑셀을 띄워 수식을 다시 계산한다."""
    import xlwings as xw

    말 = []
    짝 = {}
    for n in sorted(os.listdir(폴더)):
        if n.endswith(".xlsx") and not n.startswith("~$"):
            항목 = MF.FEED_OF.get(n[:2])
            if 항목 and 항목 not in 짝:
                짝[항목] = os.path.join(폴더, n)

    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    try:
        for 항목, 칸들 in 값들.items():
            path = 짝.get(항목)
            if not path:
                말.append("  ! %s 회입분 파일이 없어 건너뜀" % 항목)
                continue
            wb = app.books.open(os.path.abspath(path))
            try:
                ws = wb.sheets["고지서"]
                for 칸, 값 in 칸들:
                    ws.range(칸).value = 값
                    말.append("  %s %s ← %s" % (항목, 칸, 값))
                app.calculate()
                말.extend(MF.check_gap(wb))
                wb.save()
            finally:
                wb.close()
    finally:
        app.quit()
    return 말


# ────────────────────────────────── 실행

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--검침", required=True, help="그 달 검침자료 폴더")
    ap.add_argument("--보고자료", default=기본보고자료,
                    help="'01 수도광열비 보고자료' 폴더")
    ap.add_argument("--양식", help="양식으로 쓸 월 폴더 (없으면 가장 최근 달)")
    ap.add_argument("--출력", help="새로 만들 폴더 (없으면 보고자료 안에 만든다)")
    a = ap.parse_args()

    달 = 사용월(a.검침)
    if not 달:
        sys.exit("검침자료에서 기간을 못 읽었습니다 : %s" % a.검침)
    y, m = 달
    이름, 해 = 월폴더이름(y, m)
    print("■ %04d년 %02d월 사용분  →  폴더 이름 '%s'" % (y, m, 이름))

    양식 = a.양식 or 최근월폴더(a.보고자료)
    if not 양식 or not os.path.isdir(양식):
        sys.exit("양식으로 쓸 월 폴더를 못 찾았습니다. --양식 으로 알려주세요.")
    print("  양식 : %s" % 양식)

    새폴더 = a.출력 or os.path.join(a.보고자료, "%d년" % 해, 이름)
    처음 = not os.path.isdir(새폴더)
    만든것 = 폴더준비(양식, 새폴더, y, m)
    print("  %s : %s" % ("새로 만듦" if 처음 else "이미 있음", 새폴더))
    for n in 만든것:
        print("     %s" % n)
    print()

    # 2단계 — 작성 월 넣기 (여기서 사용기간이 전부 계산된다)
    print("■ 작성 월 넣기")
    for x in 월첫날넣기(새폴더, y, m):
        print(x)
    print()

    # 3단계 — 원격검침 채우기
    print("■ 원격검침 DB 채우기")
    sys.argv = ["meter_fill", "--검침", a.검침, "--회입분", 새폴더,
                "--출력", 새폴더]
    MF.main()
    print()

    # 4단계 — 고지서
    표 = os.path.join(새폴더, 입력표이름)
    값들 = 입력표읽기(표)
    if 값들:
        print("■ 고지서 값 넣기 (%s 에서 읽음)" % 입력표이름)
        for x in 고지서넣기(새폴더, 값들):
            print(x)
    else:
        앞달 = 이전월폴더(a.보고자료, 양식)
        칸들 = 바뀌는칸(앞달, 양식) if 앞달 else {}
        if 앞달:
            print("   (%s 와 %s 를 견주어 달마다 바뀌는 칸을 찾았습니다)"
                  % (os.path.basename(앞달), os.path.basename(양식)))
        입력표쓰기(표, 칸들, y, m)
        print("■ 고지서 값은 아직 비어 있습니다.")
        print("   받아 적을 값 목록을 만들었습니다 :")
        print("     %s" % 표)
        print("   고지서를 보고 맨 오른쪽 칸만 채운 뒤, 같은 명령을 다시 돌리세요.")
    print()
    print("※ 양식으로 쓴 폴더와 검침자료는 읽기만 했습니다.")


if __name__ == "__main__":
    main()
