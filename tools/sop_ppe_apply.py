# -*- coding: utf-8 -*-
"""보호구 점검에서 '빠짐' 으로 나온 것을 data.js 에 실제로 넣는다.

어떻게 고치나
    data.js 를 다시 쓰지 않는다. 해당 작업의 ppe 목록 안에서 **마지막 항목의
    글자 모양을 그대로 복제**해 이름과 그림만 바꿔 끼워 넣는다.
    들여쓰기 · 따옴표 · 줄바꿈 방식이 파일마다 섞여 있어도 안전하다.

    넣을 그림은 이미 쓰이고 있는 것 중 그 보호구에 가장 많이 쓰인 파일을 쓴다.

원본은 항상 백업한다. 고친 뒤 되읽어 보고, 깨졌으면 스스로 되돌린다.

쓰는 법
    python sop_ppe_apply.py                  무엇을 넣을지만 보여준다
    python sop_ppe_apply.py --run            실제로 고친다
    python sop_ppe_apply.py --run --mirror   사본까지 맞춘다
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import sop_ppe_audit as A                                      # noqa: E402

SITE = A.SITE
DATA = os.path.join(SITE, "assets", "data.js")
IMGDIR = os.path.join(SITE, "assets", "img")
MIRRORS = [
    r"C:\Users\user\Desktop\content-report\content-report\sop\assets\data.js",
    r"C:\Users\user\vercel-deploy\safety-sop\assets\data.js",
]

적을이름 = {
    "안전대": "안전대",
    "절연장갑": "절연장갑",
    "고무장갑": "고무장갑",
    "차광보안면": "용접용 보안면",
    "가죽장갑": "용접용 가죽장갑",
    "송기마스크": "송기마스크",
    "공기호흡기": "공기호흡기",
    "귀마개": "귀마개",
    "방진마스크": "방진마스크",
    "방독마스크": "방독마스크",
    "보안경": "보안경",
}

작업키 = re.compile(r"(?m)^([a-z][a-z0-9]*): \{")
PPE열기 = re.compile(r'(?m)^[ \t]*"?ppe"?: \[')


def 읽기():
    js = ("global.window={};require(%s);"
          "process.stdout.write(JSON.stringify(window.TASKS))"
          % json.dumps(DATA.replace("\\", "/")))
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True,
                                     check=True).stdout.decode("utf-8"))


def 그림찾기(T):
    있는것 = set(os.listdir(IMGDIR))
    표 = {}
    for t in T.values():
        for q in (t.get("ppe") or []):
            img = q.get("img") or ""
            if os.path.basename(img) in 있는것:
                표.setdefault(q["name"], Counter())[img] += 1
    return {k: v.most_common(1)[0][0] for k, v in 표.items()}


def 괄호끝(글, 여는자리, 열기="[", 닫기="]"):
    깊이, i = 0, 여는자리
    while i < len(글):
        if 글[i] == 열기:
            깊이 += 1
        elif 글[i] == 닫기:
            깊이 -= 1
            if not 깊이:
                return i
        i += 1
    return -1


def ppe자리(글):
    """작업마다 ppe 목록의 (여는 [ 자리, 닫는 ] 자리) 를 찾는다."""
    키들 = [(m.start(), m.group(1)) for m in 작업키.finditer(글)]
    out = {}
    for n, (시작, tid) in enumerate(키들):
        끝 = 키들[n + 1][0] if n + 1 < len(키들) else len(글)
        m = PPE열기.search(글, 시작, 끝)
        if not m:
            continue
        여는 = 글.index("[", m.start())
        닫는 = 괄호끝(글, 여는)
        if 닫는 > 0:
            out[tid] = (여는, 닫는)
    return out


def 마지막항목(글, 여는, 닫는):
    """목록 안 마지막 {...} 덩어리의 글자를 그대로 돌려준다."""
    i = 글.rfind("{", 여는, 닫는)
    if i < 0:
        return None
    j = 괄호끝(글, i, "{", "}")
    return 글[i:j + 1] if j > 0 else None


def 새항목(본, 이름, 그림):
    """마지막 항목을 복제해 이름·그림만 바꾼다."""
    새 = re.sub(r'("?name"?\s*:\s*)([\'"])(.*?)\2',
                lambda m: "%s%s%s%s" % (m.group(1), m.group(2), 이름,
                                        m.group(2)), 본, count=1)
    새 = re.sub(r'("?img"?\s*:\s*)([\'"])(.*?)\2',
                lambda m: "%s%s%s%s" % (m.group(1), m.group(2), 그림,
                                        m.group(2)), 새, count=1)
    return 새


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--mirror", action="store_true")
    a = ap.parse_args()

    T = 읽기()
    그림 = 그림찾기(T)
    R = A.보다(T)
    이름표 = {r["id"]: r["name"] for r in R}

    계획, 못찾음, 총 = {}, set(), 0
    for r in R:
        줄 = []
        for 표준 in r["빠짐"]:
            이름 = 적을이름.get(표준, 표준)
            if 이름 in [q["name"] for q in (T[r["id"]].get("ppe") or [])]:
                continue
            img = 그림.get(이름)
            if not img:
                못찾음.add(이름)
                continue
            줄.append((이름, img))
        if 줄:
            계획[r["id"]] = 줄
            총 += len(줄)

    print("작업 %d건 중 %d건에 보호구 %d개를 넣습니다.\n"
          % (len(R), len(계획), 총))
    for tid in sorted(계획):
        print("  %-6s %-30s + %s"
              % (tid, 이름표[tid][:30],
                 ", ".join(n for n, _ in 계획[tid])))
    if 못찾음:
        print("\n! 그림이 없어 건너뛴 보호구 : %s" % ", ".join(sorted(못찾음)))

    if not a.run:
        print("\n(보여주기만 했습니다. 실제로 고치려면 --run)")
        return

    # 줄바꿈 방식을 그대로 두려고 newline="" 로 읽고 쓴다
    글 = io.open(DATA, encoding="utf-8", newline="").read()
    백업 = DATA + ".bak_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(DATA, 백업)
    print("\n백업 : %s" % os.path.basename(백업))

    자리 = ppe자리(글)
    없는것 = [t for t in 계획 if t not in 자리]
    if 없는것:
        print("  ! ppe 목록을 못 찾은 작업 : %s" % ", ".join(없는것))

    줄바꿈 = "\r\n" if "\r\n" in 글 else "\n"
    일감 = sorted(((자리[t][1], t) for t in 계획 if t in 자리), reverse=True)
    넣은수 = 0
    for 닫는, tid in 일감:
        여는 = 자리[tid][0]
        본 = 마지막항목(글, 여는, 닫는)
        if 본 is None:
            print("  ! %s : 본뜰 항목이 없어 건너뜀" % tid)
            continue
        마지막시작 = 글.rfind("{", 여는, 닫는)
        줄머리 = 글[글.rfind("\n", 0, 마지막시작) + 1:마지막시작]   # 들여쓰기
        뒤 = 글.rfind("}", 여는, 닫는) + 1                      # 마지막 항목 끝
        덧 = ""
        for 이름, img in 계획[tid]:
            덧 += "," + 줄바꿈 + 줄머리 + 새항목(본, 이름, img)
            넣은수 += 1
        글 = 글[:뒤] + 덧 + 글[뒤:]

    io.open(DATA, "w", encoding="utf-8", newline="").write(글)
    print("고침 : %d개 넣음" % 넣은수)

    try:
        새 = 읽기()
    except Exception as e:
        shutil.copy2(백업, DATA)
        sys.exit("파일이 깨져 백업으로 되돌렸습니다 : %s" % str(e)[:90])
    print("확인 : 작업 %d건 정상 (되읽기 성공)" % len(새))

    if a.mirror:
        for m in MIRRORS:
            if os.path.isdir(os.path.dirname(m)):
                shutil.copy2(DATA, m)
                print("사본 반영 : %s" % m)


if __name__ == "__main__":
    main()
