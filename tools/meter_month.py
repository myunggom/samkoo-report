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


def 중수달인가(검침폴더):
    """중수는 두 달에 한 번 고지된다. 이번 달이 그 달인지 검침자료로 판단한다.

    중수 검침자료만 두 달치(약 60일) 기간으로 나온다. 전기·열·수도는 한 달치다.
    돌려주는 값 : True(중수 달) / False(아닌 달) / None(판단 못 함)
    """
    import datetime as dt

    가장긴날수 = None
    for n in os.listdir(검침폴더):
        if not n.lower().endswith(".xls") or n.startswith("~$"):
            continue
        try:
            종류, 기간 = MF.feed_info(os.path.join(검침폴더, n))
        except Exception:
            continue
        if 종류 == "전기" or not 기간:
            continue
        (y1, m1, d1), (y2, m2, d2) = 기간
        try:
            날수 = (dt.date(y2, m2, d2) - dt.date(y1, m1, d1)).days
        except ValueError:
            continue
        가장긴날수 = 날수 if 가장긴날수 is None else max(가장긴날수, 날수)
    if 가장긴날수 is None:
        return None
    return 가장긴날수 >= 45


def 번호있는폴더(보고자료, 앞, 빼는폴더=None):
    """그 앞번호 파일이 실제로 들어 있는 월 폴더를 오래된 것부터 늘어놓는다."""
    빼기 = os.path.abspath(빼는폴더) if 빼는폴더 else None
    out = []
    for q in 월폴더목록(보고자료):
        if 빼기 and os.path.abspath(q) == 빼기:
            continue
        for n in os.listdir(q):
            if n.startswith(앞) and n.endswith(".xlsx") \
                    and not n.startswith("~$") and "원격검침DB" not in n:
                out.append(q)
                break
    return out


def 지난중수파일(보고자료, 빼는폴더):
    """중수 회입분(04번)이 들어 있는 가장 최근 월 폴더에서 그 파일을 찾는다."""
    폴더들 = 번호있는폴더(보고자료, "04", 빼는폴더)
    if not 폴더들:
        return None
    최근 = 폴더들[-1]
    for n in sorted(os.listdir(최근)):
        if n.startswith("04") and n.endswith(".xlsx") \
                and not n.startswith("~$") and "원격검침DB" not in n:
            return os.path.join(최근, n)
    return None


def 폴더준비(양식폴더, 새폴더, y, m, 보고자료=None, 중수=None):
    """양식 폴더의 회입분·종합표를 새 폴더로 복사하고 이름의 달을 바꾼다.

    중수(04번)는 두 달에 한 번뿐이라 양식 폴더에 없을 수 있다. 중수 달이면
    중수가 들어 있는 가장 최근 달에서 따로 가져오고, 중수 달이 아니면
    양식 폴더에 있어도 가져오지 않는다.
    """
    os.makedirs(새폴더, exist_ok=True)
    만든것 = []
    쓴앞번호 = set()
    알림 = []
    for n in sorted(os.listdir(양식폴더)):
        if not n.endswith(".xlsx") or n.startswith("~$"):
            continue
        앞 = n[:2]
        if 앞 not in ("00", "01", "02", "03", "04"):
            continue
        if 앞 in 쓴앞번호:          # 같은 번호가 여러 개면 첫 것만 (수정본 중복)
            continue
        if 앞 == "04" and 중수 is False:
            알림.append("  중수는 이번 달 고지 대상이 아니라 넣지 않았습니다.")
            continue
        쓴앞번호.add(앞)
        새이름 = 월바꾸기(n, y, m)
        dst = os.path.join(새폴더, 새이름)
        if not os.path.exists(dst):
            shutil.copy2(os.path.join(양식폴더, n), dst)
        만든것.append(새이름)

    # 중수 달인데 양식 폴더에 중수가 없으면 — 두 달 전 폴더에서 가져온다
    if 중수 and "04" not in 쓴앞번호:
        원본 = 지난중수파일(보고자료, 새폴더) if 보고자료 else None
        if 원본:
            새이름 = 월바꾸기(os.path.basename(원본), y, m)
            dst = os.path.join(새폴더, 새이름)
            if not os.path.exists(dst):
                shutil.copy2(원본, dst)
            만든것.append(새이름)
            알림.append("  중수는 양식 폴더에 없어 %s 에서 가져왔습니다."
                        % os.path.basename(os.path.dirname(원본)))
        else:
            알림.append("  ! 중수 달인데 중수 회입분(04번)을 어느 달에서도"
                        " 못 찾았습니다. 손으로 넣어 주세요.")
    return 만든것, 알림


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

def 바뀌는칸(이전폴더, 양식폴더, 보고자료=None, 새폴더=None):
    """두 달의 '고지서' 시트를 견주어, 달마다 바뀌는 칸을 찾는다.

    중수처럼 두 달에 한 번뿐인 항목은 바로 앞 달에 없다. 그럴 때는
    그 항목이 실제로 들어 있는 최근 두 달을 찾아 견준다.
    """
    from openpyxl import load_workbook

    def 고르기(folder, 앞):
        if not folder or not os.path.isdir(folder):
            return None
        for n in sorted(os.listdir(folder)):
            if n.startswith(앞) and n.endswith(".xlsx") \
                    and not n.startswith("~$") and "원격검침DB" not in n:
                return os.path.join(folder, n)
        return None

    본문끝 = 11                 # K 칸까지가 고지서 본문
    결과 = {}
    for 앞, 항목 in MF.FEED_OF.items():
        pa, pb = 고르기(이전폴더, 앞), 고르기(양식폴더, 앞)
        if not (pa and pb) and 보고자료:
            폴더들 = 번호있는폴더(보고자료, 앞, 새폴더)
            if len(폴더들) >= 2:
                pa, pb = 고르기(폴더들[-2], 앞), 고르기(폴더들[-1], 앞)
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
         "# ※ 12개월 추이표와 종합표(00번)는 이 표를 채워 다시 돌리면 함께 채워집니다.",
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


def 적을값(t):
    """입력표에 적힌 글자를 엑셀에 넣을 값으로 바꾼다.

    '2026-12-01' 처럼 날짜로 적은 것은 날짜로 넣는다. 글자로 넣으면
    납부일자 칸의 날짜 서식이 깨지고 계산에도 쓰이지 못한다.
    """
    import datetime as dt

    m = re.match(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$", t)
    if m:
        try:
            return dt.datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    return MF.num(t)


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
        out.setdefault(항목, []).append((칸, 적을값(이번달)))
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


# ────────────────────────────────── 12개월 추이표

def 추이표채우기(폴더, y, m):
    """회입분마다 12개월 추이표의 이번 달 줄(요금·사용량)을 채운다.

    이 표는 다음 달 '전월·전년동월 비교' 가 찾아보는 자료다. 비워 두면
    다음 달 분석 칸이 '데이터 없음' 으로 나온다.
    """
    import datetime as dt
    import xlwings as xw

    말 = []
    짝 = {}
    for n in sorted(os.listdir(폴더)):
        if not n.endswith(".xlsx") or n.startswith(("~$", "00")):
            continue
        항목 = MF.FEED_OF.get(n[:2])
        if 항목 and 항목 not in 짝:
            짝[항목] = os.path.join(폴더, n)

    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    try:
        for 항목, path in 짝.items():
            wb = app.books.open(os.path.abspath(path))
            try:
                g = wb.sheets["고지서"]
                격자 = g.range("A1:AH60").value or []

                def 칸(r, c):
                    try:
                        return 격자[r - 1][c - 1]
                    except IndexError:
                        return None

                금액, 사용량 = 당월값(칸, len(격자))
                머리 = 추이표머리(칸, len(격자))
                if not 머리:
                    말.append("  ! %s 추이표를 못 찾았습니다" % 항목)
                    continue
                머리행, 날짜칸 = 머리
                줄 = None
                for r in range(머리행 + 1, 머리행 + 40):
                    v = 칸(r, 날짜칸)
                    if isinstance(v, dt.datetime) and (v.year, v.month) == (y, m):
                        줄 = r
                        break
                if not 줄:
                    말.append("  ! %s 추이표에 %04d.%02d 줄이 없습니다" % (항목, y, m))
                    continue
                적음 = []
                if 금액 is not None:
                    g.range((줄, 날짜칸 + 1)).value = 금액
                    적음.append("요금 %s" % format(round(금액), ","))
                if 사용량 is not None:
                    g.range((줄, 날짜칸 + 2)).value = 사용량
                    적음.append("사용량 %s" % round(사용량, 2))
                app.calculate()
                wb.save()
                말.append("  %-3s %04d.%02d 줄 ← %s"
                          % (항목, y, m, " / ".join(적음) if 적음 else "(넣을 값 없음)"))
            finally:
                wb.close()
    finally:
        app.quit()
    return 말


def 추이표머리(칸, 줄수):
    """'납부년월 | ○○요금 | ○○사용량' 머리글의 (행, 납부년월 칸번호)."""
    for r in range(1, min(줄수, 30) + 1):
        for c in range(10, 34):
            v = 칸(r, c)
            if isinstance(v, str) and "납부년월" in v:
                옆 = str(칸(r, c + 1) or "")
                if "요금" in 옆:          # 전기는 'Peak 값' 표가 따로 있다
                    return r, c
    return None


def 당월값(칸, 줄수):
    """'4. 사용량 및 금액 분석' 표에서 (당월 금액, 당월 사용량) 을 읽는다."""
    시작 = None
    for r in range(1, min(줄수, 60) + 1):
        for c in range(2, 13):
            v = 칸(r, c)
            if isinstance(v, str) and v.strip().startswith("4."):
                시작 = r
                break
        if 시작:
            break
    if not 시작:
        return None, None
    for r in range(시작, min(시작 + 6, 줄수) + 1):
        자리 = [c for c in range(2, 15)
                if str(칸(r, c) or "").strip() == "당월"]
        if len(자리) >= 2:
            금액, 사용량 = 칸(r + 1, 자리[0]), 칸(r + 1, 자리[1])
            return (금액 if isinstance(금액, (int, float)) else None,
                    사용량 if isinstance(사용량, (int, float)) else None)
    return None, None


# ────────────────────────────────── 종합표 채우기

회사들 = ("프로젠", "제넥신", "셀리드")


def 짧은기간(s):
    """'2026.09.10 ~ 2026.10.09' → '26.09.10 ~ 26.10.09' (종합표 표기)."""
    return re.sub(r"\b20(\d{2})\.", r"\1.", str(s or "").strip())


def 돈만(s):
    """'1,107,310원 정 (VAT포함)' → 1107310."""
    m = re.search(r"[\d,]+", str(s or ""))
    if not m:
        return None
    try:
        return int(m.group(0).replace(",", ""))
    except ValueError:
        return None


def 각사표읽기(path):
    """회입분에서 {회사: {항목: (사용량, 요금)}}, 사용기간, 고지서 금액을 읽는다."""
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True)
    try:
        이름 = [s for s in wb.sheetnames if s.startswith("각 사")]
        표 = {}
        if 이름:
            ws = wb[이름[0]]
            지금 = None
            for r in range(1, ws.max_row + 1):
                b = ws.cell(r, 2).value
                c = ws.cell(r, 3).value
                if isinstance(b, str) and b.strip() in 회사들:
                    지금 = b.strip()
                    표.setdefault(지금, {})
                if not 지금 or not isinstance(c, str) or not c.strip():
                    continue
                항목 = c.strip()
                표[지금][항목] = (ws.cell(r, 4).value, ws.cell(r, 5).value)
                if 항목 == "합계":      # 한 회사 끝. 다음 회사까지 줍지 않는다
                    지금 = None
        기간, 금액 = None, None
        if "고지서" in wb.sheetnames:
            g = wb["고지서"]
            for r in range(1, 20):
                for c in range(1, 12):
                    v = g.cell(r, c).value
                    if not isinstance(v, str):
                        continue
                    if 기간 is None and "사용기간" in v:
                        for k in range(1, 5):
                            got = g.cell(r, c + k).value
                            if got:
                                기간 = got
                                break
                    if 금액 is None and "납부금액" in v:
                        for k in range(1, 5):
                            got = 돈만(g.cell(r, c + k).value)
                            if got:
                                금액 = got
                                break
        return 표, 기간, 금액
    finally:
        wb.close()


def 종합표채우기(폴더):
    """회입분들의 '각 사' 시트를 읽어 00번 종합표의 사용량·요금 칸을 채운다.

    종합표의 부가세·합계 칸은 수식이므로 건드리지 않는다. 손으로 옮겨
    적던 사용량(D열)·요금(E열)과 사용기간·고지서 금액만 넣는다.
    """
    import xlwings as xw

    말 = []
    종합 = None
    짝 = {}
    for n in sorted(os.listdir(폴더)):
        if not n.endswith(".xlsx") or n.startswith("~$"):
            continue
        if n.startswith("00") and 종합 is None:
            종합 = os.path.join(폴더, n)
            continue
        항목 = MF.FEED_OF.get(n[:2])
        if 항목 and 항목 not in 짝:
            짝[항목] = os.path.join(폴더, n)
    if not 종합:
        return ["  ! 종합표(00번) 파일이 없어 건너뜀"]

    자료 = {}
    for 항목, path in 짝.items():
        try:
            자료[항목] = 각사표읽기(path)
        except Exception as e:
            말.append("  ! %s 회입분을 못 읽었습니다 : %s" % (항목, e))

    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    try:
        wb = app.books.open(os.path.abspath(종합))
        try:
            ws = wb.sheets[0]
            격자 = ws.range("A1:J120").value or []

            def 글(r, c):
                try:
                    v = 격자[r - 1][c - 1]
                except IndexError:
                    return ""
                return str(v).strip() if v is not None else ""

            줄수 = len(격자)
            지금항목, 지금회사 = None, None
            넣은수 = 0
            for r in range(1, 줄수 + 1):
                b, c = 글(r, 2), 글(r, 3)
                m = re.match(r"■\s*(전기|열|수도|중수)", b)
                if m:
                    지금항목, 지금회사 = m.group(1), None
                    기간 = (자료.get(지금항목) or (None, None, None))[1]
                    if 기간:
                        ws.range((r, 8)).value = 짧은기간(기간)
                        말.append("  %s 기간 ← %s" % (지금항목, 짧은기간(기간)))
                    continue
                if not 지금항목:
                    continue
                m = re.match(r"(전기|열|수도|중수)\s*요금 합계", b)
                if m:
                    지금회사 = None
                    continue
                if b.startswith("고지서"):
                    금액 = (자료.get(지금항목) or (None, None, None))[2]
                    if 금액 is not None:
                        ws.range((r, 7)).value = 금액
                        말.append("  %s 고지서 금액 ← %s" % (지금항목, format(금액, ",")))
                    지금항목 = None
                    continue
                if b in 회사들:
                    지금회사 = b
                if not 지금회사 or not c:
                    continue
                표 = (자료.get(지금항목) or ({}, None, None))[0]
                값 = (표.get(지금회사) or {}).get(c)
                if 값 is None:
                    continue
                사용량, 요금 = 값
                if 사용량 is not None:
                    ws.range((r, 4)).value = 사용량
                if 요금 is not None:
                    ws.range((r, 5)).value = 요금
                넣은수 += 1
                if c == "합계":
                    지금회사 = None
            app.calculate()
            말.append("  %d 칸 채움 (사용량·요금). 부가세·합계는 수식이 계산합니다."
                      % 넣은수)
            말.extend(종합표대조(ws))
            wb.save()
        finally:
            wb.close()
    finally:
        app.quit()
    return 말


def 종합표대조(ws):
    """종합표의 '합계 = 고지서' 검산 칸(H열)을 읽어 알린다."""
    말 = []
    격자 = ws.range("A1:J120").value or []
    for i, line in enumerate(격자):
        b = line[1] if len(line) > 1 else None
        if not isinstance(b, str):
            continue
        m = re.match(r"(전기|열|수도|중수)\s*요금 합계", b.strip())
        if not m:
            continue
        합계 = line[6] if len(line) > 6 else None
        차이 = line[7] if len(line) > 7 else None
        고지, 검산 = None, None
        if i + 1 < len(격자):
            뒷줄 = 격자[i + 1]
            고지 = 뒷줄[6] if len(뒷줄) > 6 else None
            검산 = 뒷줄[7] if len(뒷줄) > 7 else None   # 양식이 스스로 하는 판정
        맞음 = bool(검산) if isinstance(검산, bool) else \
            (isinstance(차이, (int, float)) and abs(차이) < 10)
        말.append("    %s %s  회입분 %s / 고지서 %s%s"
                  % ("○" if 맞음 else "!", m.group(1),
                     format(round(합계), ",") if isinstance(합계, (int, float)) else 합계,
                     format(round(고지), ",") if isinstance(고지, (int, float)) else 고지,
                     "" if 맞음 else "   ← 양식 검산 불일치 (차이 %s 원). 확인 필요"
                     % (round(차이, 1) if isinstance(차이, (int, float)) else 차이)))
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

    중수 = 중수달인가(a.검침)
    print("  중수 : %s" % {True: "이번 달 고지 대상 (두 달치 검침자료 있음)",
                         False: "이번 달 대상 아님",
                         None: "판단 못 함 — 양식 폴더를 그대로 따름"}[중수])

    새폴더 = a.출력 or os.path.join(a.보고자료, "%d년" % 해, 이름)
    처음 = not os.path.isdir(새폴더)
    만든것, 알림 = 폴더준비(양식, 새폴더, y, m, a.보고자료, 중수)
    print("  %s : %s" % ("새로 만듦" if 처음 else "이미 있음", 새폴더))
    for n in 만든것:
        print("     %s" % n)
    for x in 알림:
        print(x)
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
        칸들 = 바뀌는칸(앞달, 양식, a.보고자료, 새폴더)
        if 앞달:
            print("   (%s 와 %s 를 견주어 달마다 바뀌는 칸을 찾았습니다)"
                  % (os.path.basename(앞달), os.path.basename(양식)))
        입력표쓰기(표, 칸들, y, m)
        print("■ 고지서 값은 아직 비어 있습니다.")
        print("   받아 적을 값 목록을 만들었습니다 :")
        print("     %s" % 표)
        print("   고지서를 보고 맨 오른쪽 칸만 채운 뒤, 같은 명령을 다시 돌리세요.")
    print()

    # 5단계 — 추이표·종합표 (고지서 값이 들어간 뒤라야 뜻이 있다)
    if 값들:
        print("■ 12개월 추이표에 이번 달 줄 넣기")
        for x in 추이표채우기(새폴더, y, m):
            print(x)
        print()
        print("■ 종합표 채우기")
        for x in 종합표채우기(새폴더):
            print(x)
        print()

    print("※ 양식으로 쓴 폴더와 검침자료는 읽기만 했습니다.")


if __name__ == "__main__":
    main()
