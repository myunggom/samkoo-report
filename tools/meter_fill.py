# -*- coding: utf-8 -*-
"""원격검침 자료를 수도광열비 '회입분' 엑셀의 원격검침 DB 칸에 넣는다.

하는 일
    원격검침 프로그램이 내보낸 '그룹별 기간별' 파일(.xls, 실제는 XML)에서
    계량기별 '시작지침·종료지침'을 읽어, 회입분 엑셀의 '전월검침·당월검침'
    칸에 넣는다. 나머지 계산은 회입분 엑셀의 수식이 알아서 한다.

왜 엑셀을 직접 띄우는가
    회입분 파일에는 표·수식·서식이 얽혀 있다. 파이썬 라이브러리로 고치면
    손대지 않은 부분까지 망가질 수 있다. 실제 엑셀을 띄워 내가 넣을 칸만
    고치고, 엑셀이 수식을 다시 계산하게 한 뒤 저장한다.

원본은 절대 고치지 않는다
    항상 사본을 만들어 사본에만 쓴다.

쓰는 법
    python meter_fill.py --검침 "<검침자료 폴더>" --회입분 "<월 폴더>" --출력 "<새 폴더>"
    python meter_fill.py ... --대조        원본과 값이 같은지 대조만 (쓰지 않음)
"""
import argparse
import io
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET

SS = "urn:schemas-microsoft-com:office:spreadsheet"
NS = {"ss": SS}
NUL = bytes([0])

# 회입분 파일 앞번호 → 어느 검침자료를 쓰는지
FEED_OF = {"01": "전기", "02": "열", "03": "수도", "04": "중수"}

# 회입분 DB 시트의 묶음 이름 → 검침자료의 묶음 이름
ALIAS = {
    "전기": "전기",
    "수도": "수도/중수", "중수": "수도/중수", "수도/중수": "수도/중수",
    "온수": "온수",
    "환수": "환탕", "환탕": "환탕",
    "냉난방": "냉난방",
    "가스": "가스",
}

DASH = "-"


# ────────────────────────────────── 검침자료 읽기

def _attr(el, name):
    return el.get("{%s}%s" % (SS, name))


def read_feed(path):
    """검침자료 한 장을 읽어 (묶음칸정보, 행목록) 으로 돌려준다.

    돌려주는 행은 {'no':…, '동':…, '호':…, '값':{묶음:(시작,종료,사용량)}}.
    """
    raw = io.open(path, "rb").read().replace(NUL, b"").rstrip()
    root = ET.fromstring(raw)
    ws = root.find("ss:Worksheet", NS)
    table = ws.find("ss:Table", NS)

    grid, r = [], 0
    for tr in table.findall("ss:Row", NS):
        idx = _attr(tr, "Index")
        if idx:
            r = int(idx) - 1
        while len(grid) <= r:
            grid.append([])
        line, c = grid[r], 0
        for td in tr.findall("ss:Cell", NS):
            ci = _attr(td, "Index")
            if ci:
                c = int(ci) - 1
            span = _attr(td, "MergeAcross")
            while len(line) <= c:
                line.append(None)
            d = td.find("ss:Data", NS)
            line[c] = None if d is None else (d.text or "")
            c += 1 + (int(span) if span else 0)
        r += 1

    # 머리글 : '시작지침' 이 있는 줄을 찾고, 그 위에서 묶음 이름을 집는다
    hrow = None
    for i, line in enumerate(grid[:8]):
        if any(v == "시작지침" for v in line if v):
            hrow = i
            break
    if hrow is None:
        raise SystemExit("%s : '시작지침' 줄을 못 찾았습니다." % path)

    names = {}                      # 칸번호 → 묶음 이름
    for up in range(hrow - 1, -1, -1):
        for j, v in enumerate(grid[up]):
            if v and v not in ("검침값", "사용량") and j >= 3:
                names.setdefault(j, v.strip())
    groups = {}
    for j, v in enumerate(grid[hrow]):
        if v == "시작지침":
            # 이 칸 왼쪽(또는 같은 칸)에서 가장 가까운 묶음 이름
            nm = None
            for k in range(j, 2, -1):
                if k in names:
                    nm = names[k]
                    break
            if nm:
                groups[norm(nm)] = (j, j + 1, j + 2)

    rows = []
    for line in grid[hrow + 1:]:
        if len(line) < 3 or not line[0] or not str(line[0]).strip().isdigit():
            continue
        vals = {}
        for nm, (a, b, u) in groups.items():
            vals[nm] = (cell(line, a), cell(line, b), cell(line, u))
        rows.append({"no": int(str(line[0]).strip()),
                     "동": (line[1] or "").strip(),
                     "호": (line[2] or "").strip(),
                     "값": vals})
    return groups, rows


def cell(line, i):
    return line[i] if i < len(line) else None


def dates(text):
    """글에서 날짜 두 개를 뽑는다. '2026.07.25.00 ∼ 2026.08.24.24' → (…, …)"""
    got = re.findall(r"(\d{2,4})[.\-/](\d{1,2})[.\-/](\d{1,2})", str(text or ""))
    out = []
    for y, m, d in got:
        y = int(y)
        out.append((y + 2000 if y < 100 else y, int(m), int(d)))
    return (out[0], out[-1]) if len(out) >= 2 else None


def feed_info(path):
    """검침자료 한 장의 성격을 알아낸다 → (종류, 기간)

    종류는 '전기' 또는 '물'(수도·중수·열이 같은 양식을 쓴다).
    """
    raw = io.open(path, "rb").read().replace(NUL, b"").rstrip()
    root = ET.fromstring(raw)
    ws = root.find("ss:Worksheet", NS)
    name = _attr(ws, "Name")
    table = ws.find("ss:Table", NS)
    글 = []
    for tr in table.findall("ss:Row", NS)[:4]:
        for td in tr.findall("ss:Cell", NS):
            d = td.find("ss:Data", NS)
            if d is not None and d.text:
                글.append(d.text)
    종류 = "전기" if any("전기" in x for x in 글) else "물"
    return 종류, (dates(name) or dates(os.path.basename(path)))


def book_period(path):
    """회입분 '고지서' 시트의 사용기간을 읽는다."""
    from openpyxl import load_workbook
    try:
        wb = load_workbook(path, data_only=True, read_only=True)
    except Exception:
        return None
    try:
        if "고지서" not in wb.sheetnames:
            return None
        ws = wb["고지서"]
        for r in range(1, 20):
            for c in range(1, 12):
                v = ws.cell(r, c).value
                if v and "사용기간" in str(v):
                    for k in range(1, 5):
                        got = dates(ws.cell(r, c + k).value)
                        if got:
                            return got
        return None
    finally:
        wb.close()


def read_fix(folder):
    """검침자료 폴더의 '보정.txt' 를 읽는다.

    원격검침 값이 틀렸을 때(통신 오류·계기 교체 등) 실제 계량기 값으로
    바꿔 넣기 위한 표다. 한 줄에 하나씩 이렇게 적는다.

        계량기명 | 시작지침 | 종료지침        (빈칸은 검침자료 값 그대로)
        24시간 냉각탑 보급수 |  | 697.26
    """
    path = os.path.join(folder, "보정.txt")
    if not os.path.exists(path):
        return []
    out = []
    for raw in io.open(path, encoding="utf-8-sig"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        part = [x.strip() for x in line.split("|")]
        while len(part) < 5:
            part.append("")
        항목, 이름, s1, s2, 묶음 = part[:5]
        if 항목 not in FEED_OF.values():
            print("  보정.txt : 항목을 못 알아봄 → %s" % line)
            continue
        # '계량률 19.42%' : 계량기가 실제보다 적게 잴 때. 사용량을 역산한다.
        비율 = None
        for x in (s1, s2):
            if x and "계량률" in x:
                m = re.search(r"([\d.]+)", x)
                if m:
                    비율 = float(m.group(1)) / 100.0
        if 비율:
            s1 = s2 = ""
        if 비율 is not None and not (0 < 비율 <= 1):
            print("  보정.txt : 계량률이 이상합니다 → %s" % line)
            continue
        out.append({"항목": 항목, "이름": 이름, "묶음": norm(묶음) if 묶음 else None,
                    "시작": num(s1) if s1 else None,
                    "종료": num(s2) if s2 else None,
                    "계량률": 비율})
    return out


def norm(s):
    """묶음 이름을 견주기 쉽게 다듬는다. '수도 / 중수[㎥]' → '수도/중수'"""
    s = re.sub(r"\[[^\]]*\]", "", str(s or ""))
    s = s.replace(" ", "").replace("（", "(").strip()
    s = re.sub(r"\(.*?\)", "", s)
    return s


def num(v):
    """'1,234.5' → 1234.5 / '-' → '-' / 빈칸 → None"""
    if v is None:
        return None
    t = str(v).strip().replace(",", "")
    if t in ("", DASH, "—", "–"):
        return DASH if t else None
    try:
        return float(t)
    except ValueError:
        return t


# ────────────────────────────────── 회입분 DB 시트 읽기 (칸 위치 알아내기)

def db_layout(ws):
    """DB 시트에서 어느 칸이 무엇인지 알아낸다.

    DB 시트에는 표가 둘 이상 있다. 두 번째 표부터는 전부 수식이므로
    **첫 번째 표만** 다룬다. 표 경계는 머리글 줄의 'NO' 위치로 가른다.

    돌려주는 것 : (첫자료행, 이름칸, 용도칸, 번호칸, [(묶음, 전월칸, 당월칸, 사용량칸)])
    """
    used = ws.used_range
    nrow = min(used.last_cell.row, 12)
    ncol = min(used.last_cell.column, 60)
    vals = ws.range((1, 1), (nrow, ncol)).value or []

    def at(r, c):
        try:
            v = vals[r - 1][c - 1]
        except (IndexError, TypeError):
            return None
        return None if v is None else str(v).strip()

    hrow = None
    for r in range(1, nrow + 1):
        if any(at(r, c) == "전월검침" for c in range(1, ncol + 1)):
            hrow = r
            break
    if hrow is None:
        return None

    # 표 경계 : 머리글 줄들에 나오는 'NO' 칸 번호
    nos = sorted({c for r in range(1, hrow + 1)
                  for c in range(1, ncol + 1) if at(r, c) == "NO"})
    if not nos:
        return None
    noc = nos[0]
    끝 = (nos[1] - 1) if len(nos) > 1 else ncol      # 첫 표가 차지하는 끝 칸

    namec = usec = None
    for r in range(1, hrow + 1):
        for c in range(noc, 끝 + 1):
            v = at(r, c)
            if v in ("계량기명", "분전반명") and namec is None:
                namec = c
            elif v == "용도" and usec is None:
                usec = c
    if namec is None:
        return None

    # 묶음 이름은 전월검침 줄 위쪽에서 찾는다
    labels = {}
    for r in range(1, hrow + 1):
        for c in range(noc, 끝 + 1):
            v = at(r, c)
            if v and v not in ("NO", "용도", "계량기명", "분전반명", "사용처",
                               "전월검침", "당월검침", "당월사용량", "CT"):
                labels.setdefault(c, v)

    # 묶음 이름('온수 [㎥]' 같은 것)은 언제나 '전월검침' 과 같은 칸의 윗줄에 있다.
    # 옆 칸까지 뒤지면 '1. 원격검침 DB 자료 입력' 같은 안내문을 집게 된다.
    groups = []
    for c in range(noc, 끝 + 1):
        if at(hrow, c) == "전월검침":
            nm = labels.get(c)
            groups.append((norm(nm) if nm else "", c, c + 1, c + 2))

    return hrow + 1, namec, usec, noc, groups


# ────────────────────────────────── 채우기

def similar(a, b):
    """이름이 사실상 같은지 본다. 띄어쓰기·괄호·한 글자 차이는 넘긴다."""
    def k(s):
        return re.sub(r"[\s·\-()\[\]]", "", str(s or ""))
    x, y = k(a), k(b)
    if x == y:
        return True
    if x in y or y in x:
        return True
    short, long = sorted((x, y), key=len)
    if not long:
        return False
    same = sum(1 for ch in short if ch in long)
    return same / max(len(long), 1) >= 0.8


def fill_book(src, dst, feed_path, 항목, 보정=(), 대조=False):
    """회입분 한 권을 채운다. 보고할 내용을 글 목록으로 돌려준다."""
    import xlwings as xw

    말 = []
    _groups, rows = read_feed(feed_path)
    by_no = {r["no"]: r for r in rows}

    if not 대조 and os.path.abspath(src) != os.path.abspath(dst):
        shutil.copy2(src, dst)
    target = src if 대조 else dst

    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    app.screen_updating = False
    try:
        wb = app.books.open(os.path.abspath(target))
        try:
            for ws in wb.sheets:
                if "원격검침" not in ws.name:
                    continue
                lay = db_layout(ws)
                if not lay:
                    말.append("  [%s] 머리글을 못 읽어 건너뜀" % ws.name)
                    continue
                first, namec, usec, noc, groups = lay

                last = ws.used_range.last_cell.row
                ncols = max(namec, noc, max(g[3] for g in groups))
                block = ws.range((first, 1), (last, ncols)).value or []

                plan = {}           # 칸번호 → [값, ...]
                for g in groups:
                    plan[g[1]] = []
                    plan[g[2]] = []
                안맞음, 이름다름, 거꾸로, 없음 = 0, [], [], []
                덧붙인행, 쓴번호, 고친것 = [], set(), []

                for i, line in enumerate(block):
                    r = first + i

                    def g(c):
                        try:
                            return line[c - 1]
                        except (IndexError, TypeError):
                            return None

                    no = g(noc)
                    nm = g(namec)
                    if no is None or str(no).strip() == "":
                        # 번호 없이 값만 들어 있으면 사람이 손으로 덧붙인 줄이다.
                        if any(g(c) not in (None, "") for gr in groups
                               for c in (gr[1], gr[2])):
                            덧붙인행.append("%d행 %s" % (r, nm or ""))
                        for c in plan:
                            plan[c].append(None)
                        continue
                    try:
                        no = int(float(no))
                    except (TypeError, ValueError):
                        for c in plan:
                            plan[c].append(None)
                        continue

                    fr = by_no.get(no)
                    if fr is None:
                        없음.append("%d행 NO %s %s" % (r, no, nm))
                        for c in plan:
                            plan[c].append(None)
                        continue
                    쓴번호.add(no)
                    if nm and not similar(nm, fr["호"]):
                        이름다름.append("%d행 NO %s : 회입분 '%s' / 검침자료 '%s'"
                                      % (r, no, nm, fr["호"]))

                    for grp, c1, c2, c3 in groups:
                        # 전기 DB 처럼 묶음 이름이 없으면 그 자료의 항목 이름을 쓴다
                        key = ALIAS.get(grp or 항목, grp or 항목)
                        got = fr["값"].get(key)
                        if got is None:
                            안맞음 += 1
                            plan[c1].append(None)
                            plan[c2].append(None)
                            continue
                        a, b = num(got[0]), num(got[1])
                        for 줄 in 보정:
                            if 줄["항목"] != 항목:
                                continue
                            # 묶음을 안 적으면 그 항목의 기본 묶음에만 적용한다
                            원하는 = 줄["묶음"] or ALIAS.get(항목, 항목)
                            if key != 원하는:
                                continue
                            if not (similar(줄["이름"], nm)
                                    or similar(줄["이름"], fr["호"])):
                                continue
                            if 줄["계량률"]:
                                # 계량기가 실제의 n% 만 재므로 사용량을 되돌린다
                                if isinstance(a, float) and isinstance(b, float):
                                    쓴양 = (b - a) / 줄["계량률"]
                                    b = round(a + 쓴양, 2)
                                    고친것.append(
                                        "%d행 %s : 계량률 %.2f%% 역산 → %s ~ %s "
                                        "(사용량 %.2f)"
                                        % (r, nm, 줄["계량률"] * 100, a, b, 쓴양))
                                else:
                                    고친것.append(
                                        "%d행 %s : 계량률을 쓸 수 없는 값(%s~%s)"
                                        % (r, nm, a, b))
                                break
                            if 줄["시작"] is not None:
                                a = 줄["시작"]
                            if 줄["종료"] is not None:
                                b = 줄["종료"]
                            고친것.append("%d행 %s → %s ~ %s" % (r, nm, a, b))
                            break
                        plan[c1].append(a)
                        plan[c2].append(b)
                        if isinstance(a, float) and isinstance(b, float) \
                                and b < a - 1e-9:
                            거꾸로.append("%d행 NO %s %s : %s → %s (줄어듦)"
                                        % (r, no, nm, a, b))

                if not 대조:
                    for c, col in plan.items():
                        ws.range((first, c)).value = [[v] for v in col]

                말.append("  [%s] %d행 처리" % (ws.name, len(block)))
                안쓴것 = ["NO %s %s" % (x["no"], x["호"])
                        for x in rows if x["no"] not in 쓴번호
                        and any(v not in (None, "", DASH)
                                for g2 in x["값"].values() for v in g2[:2])]
                if 고친것:
                    말.append("    · 보정표 적용 %d건" % len(고친것))
                    for x in 고친것:
                        말.append("        %s" % x)
                for 제목, 목록 in (("검침자료에 없는 계량기", 없음),
                                 ("회입분에 칸이 없어 못 넣은 계량기", 안쓴것),
                                 ("번호 없이 값만 있는 줄(손으로 덧붙인 듯)", 덧붙인행),
                                 ("이름이 다름", 이름다름),
                                 ("검침값이 줄어듦(계기 교체·고장 의심)", 거꾸로)):
                    if 목록:
                        말.append("    ! %s %d건" % (제목, len(목록)))
                        for x in 목록[:5]:
                            말.append("        %s" % x)
                if 안맞음:
                    말.append("    ! 검침자료에 해당 묶음이 없는 칸 %d건" % 안맞음)

            if not 대조:
                app.calculate()
                말.extend(check_gap(wb))
                wb.save()
        finally:
            wb.close()
    finally:
        app.quit()
    return 말


def check_gap(wb):
    """'작성방법' 시트의 미검침분을 읽어 알린다.

    미검침분이 음수면 원격검침 합계가 고지서 사용량보다 크다는 뜻이다.
    계기 오류·중복 집계 신호이므로 그대로 쓰면 안 된다.
    """
    말 = []
    try:
        ws = wb.sheets["작성방법"]
    except Exception:
        return 말
    vals = ws.range("A1:P30").value or []
    for line in vals:
        for c, v in enumerate(line or []):
            if not v or "미검침" not in str(v):
                continue
            try:
                got = line[c + 1]
            except IndexError:
                continue
            if not isinstance(got, (int, float)):
                continue
            꼬리 = ""
            if got < 0:
                꼬리 = "   ← 음수. 원격검침 합계가 고지서보다 큽니다(확인 필요)"
            if "률" in str(v):
                말.append("    · %s %.1f%%%s" % (v, got * 100, 꼬리))
            else:
                말.append("    · %s %s%s" % (v, round(got, 2), 꼬리))
    return 말


def feed_role(기간):
    """물 자료의 기간 모양으로 어느 항목인지 짐작한다.

    열   : 달의 1일 ~ 말일 (한 달 꽉)
    수도 : 25일 ~ 다음달 24일
    중수 : 두 달 걸침 (45일 넘음)
    """
    if not 기간:
        return None
    import datetime as dt
    (y1, m1, d1), (y2, m2, d2) = 기간
    try:
        날수 = (dt.date(y2, m2, d2) - dt.date(y1, m1, d1)).days
    except ValueError:
        return None
    if 날수 > 45:
        return "중수"
    if d1 == 1 and m1 == m2:
        return "열"
    if d1 >= 20:
        return "수도"
    return None


def 기간글(기간):
    if not 기간:
        return "기간 모름"
    (y1, m1, d1), (y2, m2, d2) = 기간
    return "%04d.%02d.%02d~%04d.%02d.%02d" % (y1, m1, d1, y2, m2, d2)


# ────────────────────────────────── 실행

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--검침", required=True, help="검침자료 폴더")
    ap.add_argument("--회입분", required=True, help="그 달 회입분 폴더")
    ap.add_argument("--출력", help="사본을 만들 폴더 (없으면 회입분폴더_자동)")
    ap.add_argument("--기간무시", action="store_true",
                    help="양식에서 갓 복사해 사용기간이 지난달일 때 쓴다")
    ap.add_argument("--대조", action="store_true",
                    help="쓰지 않고 원본과 값이 같은지만 본다")
    a = ap.parse_args()

    cands = []
    for n in sorted(os.listdir(a.검침)):
        if not n.lower().endswith(".xls") or n.startswith("~$"):
            continue
        p = os.path.join(a.검침, n)
        try:
            종류, 기간 = feed_info(p)
        except Exception as e:
            print("! %s 를 못 읽었습니다 : %s" % (n[:30], str(e)[:50]))
            continue
        cands.append({"경로": p, "이름": n, "종류": 종류, "기간": 기간})
    if not cands:
        sys.exit("검침자료(.xls)를 못 찾았습니다 : %s" % a.검침)

    보정 = read_fix(a.검침)
    if 보정:
        print("보정표(보정.txt) %d건 읽음" % len(보정))

    out = a.출력 or os.path.join(os.path.dirname(a.회입분.rstrip("\\/")),
                               os.path.basename(a.회입분.rstrip("\\/")) + "_자동")
    if not a.대조:
        os.makedirs(out, exist_ok=True)

    print("검침자료 %d개 :" % len(cands))
    for c in cands:
        print("   %-2s %-34s %s" % (c["종류"], c["이름"][:34], 기간글(c["기간"])))
    print()

    books = [n for n in sorted(os.listdir(a.회입분))
             if n.endswith(".xlsx") and not n.startswith("~$")
             and FEED_OF.get(n[:2])]
    쓴것 = set()

    for n in books:
        key = FEED_OF[n[:2]]
        원하는종류 = "전기" if key == "전기" else "물"
        가능 = [c for c in cands
                if c["종류"] == 원하는종류 and c["경로"] not in 쓴것]
        기간 = book_period(os.path.join(a.회입분, n))

        고른것, 어떻게 = None, ""
        맞는것 = [c for c in 가능 if 기간 and c["기간"] == 기간]
        if len(맞는것) == 1:
            고른것, 어떻게 = 맞는것[0], "기간 일치"
        else:
            모양 = [c for c in 가능 if feed_role(c["기간"]) == key]
            이름힌트 = [c for c in 가능 if c["이름"].startswith(key)]
            if len(이름힌트) == 1:
                고른것, 어떻게 = 이름힌트[0], "파일 이름"
            elif len(모양) == 1:
                고른것, 어떻게 = 모양[0], "기간 모양"
            else:
                남은항목 = [m for m in books if m not in
                          [x for x in books if x[:2] < n[:2]]]
                if len(가능) == 1 and len(남은항목) == 1:
                    고른것, 어떻게 = 가능[0], "하나만 남아서"

        if 고른것 is None:
            print("# %s" % n)
            print("   ! 어느 검침자료를 쓸지 정할 수 없어 건너뜁니다.")
            print("     회입분 사용기간 : %s" % 기간글(기간))
            print("     고를 수 있는 것 : %s"
                  % ", ".join(c["이름"][:24] for c in 가능) or "없음")
            print()
            continue

        print("# %s" % n)
        print("   검침자료 : %s   (%s, %s)"
              % (고른것["이름"][:40], 기간글(고른것["기간"]), 어떻게))
        if 어떻게 != "기간 일치":
            print("   · 회입분에 적힌 사용기간 %s 와 다릅니다 (%s 으로 골랐습니다)"
                  % (기간글(기간), 어떻게))
            if not a.기간무시:
                print("     ! 다른 달 자료가 아닌지 확인하세요.")
        쓴것.add(고른것["경로"])
        말 = fill_book(os.path.join(a.회입분, n), os.path.join(out, n),
                      고른것["경로"], key, 보정=보정, 대조=a.대조)
        for x in 말:
            print(x)
        print()

    if not a.대조:
        print("사본 저장 : %s" % out)
        print("※ 원본은 손대지 않았습니다.")


if __name__ == "__main__":
    main()
