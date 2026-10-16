# -*- coding: utf-8 -*-
"""
전기 · 건축 · 기계 부문을 사이트 데이터(data.js)에 넣는다.

하는 일
  1. 교육자료 PPT 3개를 변환기로 읽는다 (tools/sop_pptx_to_data.py)
  2. 그림을 assets/img 에 저장한다 (보호구처럼 이미 있는 그림은 다시 안 쓴다)
  3. data.js 의 groups · taskOrder · TASKS 에 새 부문을 끼워 넣는다
  4. assets/imglist.js 를 다시 만든다

문서 번호 순서(5.건축 → 6.전기 → 7.기계 → 8.소방)에 맞춰 소방부문 앞에 넣는다.

변환기가 맞게 읽는지는 tools/sop_verify.py 로 이미 확인했다 (소방부문 12건 전부 일치).

사용법
  python tools/sop_build_sections.py          # 미리보기만
  python tools/sop_build_sections.py --write  # 실제로 반영
"""

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from sop_pptx_to_data import Images, parse            # noqa: E402

HOME = os.path.expanduser("~")
SITE = os.path.join(HOME, "Desktop", "Bio Innovation Hub", "01 Projects",
                    "[안전] 표준운영절차 SOP", "웹 배포", "안전SOP_웹사이트")
MIRROR = os.path.join(HOME, "vercel-deploy", "safety-sop")
DECKS = os.path.join(HOME, "Desktop", "Bio Innovation Hub", "01 Projects",
                     "[안전] 표준운영절차 SOP", "5차 작업", "입력완료")

# 부문별 묶음(챕터). 색은 소방부문처럼 묶음마다 하나씩 준다.
SECTIONS = [
    {
        "id": "arch", "prefix": "b", "title": "5. 건축부문",
        "deck": "안전 표준운영절차 교육자료_건축부문(전체 15건).pptx",
        "desc": "건축 1 ~ 건축 15 · 15건",
        "chapters": [
            ("Ⅰ. 구체 · 마감 공사", "#b45309", ["b01", "b02", "b03", "b04"]),
            ("Ⅱ. 창호 · 수장 공사", "#c2410c", ["b05", "b06", "b07"]),
            ("Ⅲ. 도장 공사", "#a16207", ["b08", "b09", "b10"]),
            ("Ⅳ. 옥외 · 지붕 공사", "#15803d", ["b11", "b12", "b13"]),
            ("Ⅴ. 철거 · 리모델링", "#92400e", ["b14", "b15"]),
        ],
    },
    {
        "id": "elec", "prefix": "e", "title": "6. 전기부문",
        "deck": "안전 표준운영절차 교육자료_전기부문(전체 10건).pptx",
        "desc": "전기 1 ~ 전기 10 · 10건",
        "chapters": [
            ("Ⅰ. 수배전 설비 점검", "#4338ca", ["e01", "e02"]),
            ("Ⅱ. 고압 개폐기 조작", "#6d28d9", ["e03", "e04"]),
            ("Ⅲ. 변압기 점검 · 정비", "#7c3aed", ["e05", "e06", "e07"]),
            ("Ⅳ. 발전 설비", "#be123c", ["e08", "e09"]),
            ("Ⅴ. 부하 측정", "#0369a1", ["e10"]),
        ],
    },
    {
        "id": "mech", "prefix": "m", "title": "7. 기계부문",
        "deck": "안전 표준운영절차 교육자료_기계부문(전체 15건).pptx",
        "desc": "기계 1 ~ 기계 15 · 15건",
        "chapters": [
            ("Ⅰ. 열원 설비", "#b91c1c", ["m01", "m02", "m03"]),
            ("Ⅱ. 냉동 · 냉각 설비", "#0e7490", ["m04", "m05", "m06", "m07"]),
            ("Ⅲ. 공조 설비", "#0d9488", ["m08", "m11", "m12"]),
            ("Ⅳ. 급수 · 배수 설비", "#0369a1", ["m09", "m10"]),
            ("Ⅴ. 회전체 정비", "#047857", ["m13", "m14", "m15"]),
        ],
    },
    {
        # 미화는 접두어 'm' 이 기계와 겹쳐 'h'(housekeeping) 를 쓴다.
        # 'n' 은 웹의 '공기구 추가' 기능이 쓰므로 피한다.
        "id": "clean", "prefix": "h", "title": "2. 미화부문",
        "deck": "안전 표준운영절차 교육자료_미화부문(전체 15건).pptx",
        "desc": "미화 1 ~ 미화 15 · 15건",
        "chapters": [
            ("Ⅰ. 바닥 청소 · 광택", "#0f766e",
             ["h01", "h04", "h05", "h08", "h09", "h10"]),
            ("Ⅱ. 계단 · 유리창 청소", "#0e7490", ["h02", "h03"]),
            ("Ⅲ. 화장실 · 외곽 청소", "#0891b2", ["h06", "h07", "h11"]),
            ("Ⅳ. 약품 취급", "#b45309", ["h12", "h13", "h14", "h15"]),
        ],
    },
    {
        "id": "sec", "prefix": "s", "title": "3. 보안부문",
        "deck": "안전 표준운영절차 교육자료_보안부문(전체 10건).pptx",
        "desc": "보안 1 ~ 보안 10 · 10건",
        "chapters": [
            ("Ⅰ. 보안 일반", "#4338ca", ["s01"]),
            ("Ⅱ. 순찰 안전", "#6d28d9", ["s02", "s03", "s04", "s05"]),
            ("Ⅲ. 차량 안전", "#7c3aed", ["s06", "s07"]),
            ("Ⅳ. 비상 대응", "#be123c", ["s08", "s09", "s10"]),
        ],
    },
]


def build():
    images = Images()
    out = []
    for sec in SECTIONS:
        color_of = {}
        for _t, c, ids in sec["chapters"]:
            for i in ids:
                color_of[i] = c
        tasks, _ = parse(os.path.join(DECKS, sec["deck"]), sec["prefix"],
                         "#1d4ed8", images)
        for t in tasks:
            t["color"] = color_of.get(t["id"], "#1d4ed8")
        # 원본 PPT 오타 바로잡기 — 전기 3번 문서번호가 '전기 6-3' 으로 적혀 있다.
        for t in tasks:
            m = re.fullmatch(r"(\S+)\s+\d+-(\d+)", t["docNo"] or "")
            if m:
                t["docNo"] = "%s %s" % (m.group(1), m.group(2))
                print("   [바로잡음] %s 문서번호 → %s" % (t["id"], t["docNo"]))
        got = {t["id"] for t in tasks}
        want = {i for _t, _c, ids in sec["chapters"] for i in ids}
        if got != want:
            raise SystemExit("%s 작업 아이디 불일치: 빠짐=%s 남음=%s"
                             % (sec["title"], sorted(want - got), sorted(got - want)))
        out.append((sec, tasks))
    return out, images


def group_obj(sec):
    return {"id": sec["id"], "title": sec["title"], "desc": sec["desc"],
            "open": False,
            "chapters": [{"title": t, "color": c, "tasks": ids}
                         for t, c, ids in sec["chapters"]]}


def task_js(t):
    return "%s: %s" % (t["id"], json.dumps(t, ensure_ascii=False, indent=1))


def _span(s, i, open_ch="[", close_ch="]"):
    """s[i] 의 괄호와 짝이 맞는 닫는 괄호 다음 위치."""
    d = 0
    for k in range(i, len(s)):
        if s[k] == open_ch:
            d += 1
        elif s[k] == close_ch:
            d -= 1
            if d == 0:
                return k + 1
    raise ValueError("괄호 짝이 안 맞습니다")


def _indent(txt, pad):
    lines = txt.split("\n")
    return lines[0] + "".join("\n" + pad + ln for ln in lines[1:])


def _drop_task(s, tid):
    """TASKS 에서 작업 블록을 지운다 — 앞뒤 쉼표까지 같이 정리한다.

    쉼표를 남겨 두면 data.js 가 통째로 깨진다. 한 번 그렇게 만들어 봤다."""
    while True:
        m = re.search(r"\n%s:\s*\{" % re.escape(tid), s)
        if not m:
            return s
        i = s.index("{", m.start())
        j = _span(s, i, "{", "}")
        k = j
        while k < len(s) and s[k] in " \t\r\n":
            k += 1
        if k < len(s) and s[k] == ",":          # 뒤 쉼표를 먹는다
            j = k + 1
        else:                                    # 마지막 항목이면 앞 쉼표를 먹는다
            b = m.start()
            while b > 0 and s[b - 1] in " \t\r\n":
                b -= 1
            if b > 0 and s[b - 1] == ",":
                s = s[:b - 1] + s[j:]
                continue
        s = s[:m.start()] + s[j:]


def patch_data(s, built):
    """새 부문을 data.js 에 끼워 넣는다. 여러 번 돌려도 결과가 같아야 한다."""
    new_ids = [t["id"] for _sec, tasks in built for t in tasks]
    new_gids = set(sec["id"] for sec, _t in built)

    # 1) taskOrder — 소방(f) 앞에 새 작업 아이디를 넣는다
    m = re.search(r"taskOrder:\s*\[", s)
    i = m.end() - 1
    j = _span(s, i)
    order = [x for x in json.loads(s[i:j]) if x not in set(new_ids)]
    cut = next((k for k, x in enumerate(order) if x.startswith("f")), len(order))
    order = order[:cut] + new_ids + order[cut:]
    s = s[:i] + json.dumps(order, ensure_ascii=False) + s[j:]

    # 2) groups — 이미 들어가 있으면 갈아 끼운다
    m = re.search(r"\n  groups:\s*\[", s)
    i = m.end() - 1
    j = _span(s, i)
    groups = [g for g in json.loads(s[i:j]) if g.get("id") not in new_gids]
    at = next((k for k, g in enumerate(groups) if g.get("id") == "fire"),
              len(groups))
    groups = groups[:at] + [group_obj(sec) for sec, _t in built] + groups[at:]
    s = s[:i] + _indent(json.dumps(groups, ensure_ascii=False, indent=2),
                        "  ") + s[j:]

    # 3) TASKS — 기존 블록을 지우고 맨 끝에 다시 붙인다
    for tid in new_ids:
        s = _drop_task(s, tid)
    add = "\n\n" + ",\n\n".join(task_js(t)
                                for _sec, tasks in built for t in tasks)
    tail = s.rstrip()
    assert tail.endswith("};")
    body = tail[:-2].rstrip()
    if not body.endswith(","):
        body += ","
    return body + add + "\n\n};\n"


def write_imglist(folder):
    names = sorted(n for n in os.listdir(os.path.join(folder, "assets", "img"))
                   if not n.startswith("."))
    txt = ("/* assets/img 파일 목록 — 배포할 때 자동으로 다시 만듭니다 */\n"
           "window.IMGLIST = [\n"
           + "\n".join(("," if i else "") + json.dumps(n) for i, n in enumerate(names))
           + "\n];\n")
    io.open(os.path.join(folder, "assets", "imglist.js"), "w",
            encoding="utf-8").write(txt)
    return len(names)


def main():
    built, images = build()
    total = sum(len(t) for _s, t in built)
    print("읽은 작업 %d건 / 그림 %d장" % (total, len(images.files)))
    for sec, tasks in built:
        print("\n■ %s (%d건)" % (sec["title"], len(tasks)))
        for t in tasks:
            print("   %-4s %-30s %-10s 항목%d 조치%d 평가%d"
                  % (t["id"], t["name"][:30], t["docNo"],
                     len(t["parts"]["items"]),
                     sum(len(g["items"]) for g in t["guide"]),
                     len(t["risk"]["rows"])))
    if "--write" not in sys.argv:
        print("\n(미리보기만 했습니다. 반영하려면 --write)")
        return 0

    for folder in (SITE, MIRROR):
        if not os.path.isdir(folder):
            continue
        print("\n→", folder)
        print("   그림 %d장 저장" % images.save(os.path.join(folder, "assets", "img"), skip_existing=False))
        dj = os.path.join(folder, "assets", "data.js")
        # 먼저 다 읽고 고친 다음에 쓴다. 한 줄로 붙여 쓰면 쓰기용으로 파일을
        # 여는 순간 내용이 날아가, 그 뒤에 읽는 쪽은 빈 파일을 보게 된다.
        before = io.open(dj, encoding="utf-8").read()
        after = patch_data(before, built)
        bak = dj + ".bak"
        if not os.path.exists(bak) or os.path.getsize(bak) < 1000:
            io.open(bak, "w", encoding="utf-8").write(before)
        io.open(dj, "w", encoding="utf-8").write(after)
        print("   data.js 갱신 / imglist %d개" % write_imglist(folder))
    return 0


if __name__ == "__main__":
    sys.exit(main())
