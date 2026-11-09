# -*- coding: utf-8 -*-
"""
변환기가 제대로 읽는지 확인한다.

소방부문은 이미 사이트에 올라가 있다. 같은 PPT 를 변환기로 돌려서 기존
data.js 의 f01~f12 와 맞춰 보면, 변환기를 믿어도 되는지 알 수 있다.
여기서 어긋나는 게 없어야 전기 · 건축 · 기계 부문에 돌린다.
"""

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

SITE = os.path.join(
    os.path.expanduser("~"), "Desktop", "Bio Innovation Hub", "01 Projects",
    "[안전] 표준운영절차 SOP", "웹 배포", "안전SOP_웹사이트")
DECKS = os.path.join(
    os.path.expanduser("~"), "Desktop", "Bio Innovation Hub", "01 Projects",
    "[안전] 표준운영절차 SOP", "5차 작업", "입력완료")


def load_existing(data_js, ids):
    """data.js 에서 지정한 작업들을 꺼내 온다 (JSON 형태로 적힌 것만)."""
    s = io.open(data_js, encoding="utf-8").read()
    out = {}
    for tid in ids:
        m = re.search(r"^%s: (\{)" % re.escape(tid), s, re.M)
        if not m:
            continue
        i, d = m.start(1), 0
        for k in range(i, len(s)):
            if s[k] == "{":
                d += 1
            elif s[k] == "}":
                d -= 1
                if d == 0:
                    out[tid] = json.loads(s[i:k + 1])
                    break
    return out


def diff(a, b, path=""):
    """두 값의 차이를 경로와 함께 모아 돌려준다."""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append("%s.%s  새 자료에만 없음 (기존=%r)" % (path, k, b[k]))
            elif k not in b:
                out.append("%s.%s  기존에만 없음 (새=%r)" % (path, k, a[k]))
            else:
                out += diff(a[k], b[k], "%s.%s" % (path, k))
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append("%s  개수 다름 (새=%d, 기존=%d)" % (path, len(a), len(b)))
        for i in range(min(len(a), len(b))):
            out += diff(a[i], b[i], "%s[%d]" % (path, i))
    elif a != b:
        out.append("%s\n     새   = %r\n     기존 = %r" % (path, a, b))
    return out


def main():
    from sop_pptx_to_data import parse

    deck = os.path.join(DECKS, "안전 표준운영절차 교육자료_소방부문(전체 12건).pptx")
    tasks, _imgs = parse(deck, "f", "#dc2626")
    old = load_existing(os.path.join(SITE, "assets", "data.js"),
                        ["f%02d" % i for i in range(1, 13)])

    print("변환 %d건 / 기존 %d건" % (len(tasks), len(old)))
    bad = 0
    for t in tasks:
        o = old.get(t["id"])
        if not o:
            print("  %s  기존 자료 없음 — 건너뜀" % t["id"])
            continue
        # 그림 파일명은 확장자가 달라질 수 있어 이름만 비교한다
        ds = [d for d in diff(t, o) if ".img" not in d and "figure" not in d.lower()]
        if ds:
            bad += 1
            print("\n■ %s  %s — 다른 곳 %d" % (t["id"], t["name"], len(ds)))
            for d in ds[:8]:
                print("   ", d)
        else:
            print("  %s  %-34s 일치" % (t["id"], t["name"][:34]))
    print("\n결과: %d건 중 %d건 불일치" % (len(tasks), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
