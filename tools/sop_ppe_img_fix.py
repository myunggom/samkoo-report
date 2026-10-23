# -*- coding: utf-8 -*-
"""보호구 이름에 맞는 **사진**을 붙여준다.

왜 필요한가
    보호구 이름은 54종인데 사진은 46종뿐이라, 한 장이 여러 이름에 돌려 쓰이고
    있었다. 보호장갑 · 고무장갑 · 절연장갑이 전부 같은 코팅장갑 사진인 식이다.
    아래 '맞는사진' 표는 사진을 하나씩 눈으로 확인해서 적은 것이다.

무엇을 고치나
    이미 있는 보호구 칸의 img 값만 바꾼다. 이름은 건드리지 않고, 칸을 늘리거나
    줄이지도 않는다. data.js 를 다시 쓰지 않고 해당 글자만 갈아끼우므로
    들여쓰기 · 따옴표 방식이 섞여 있어도 안전하다.

    원본은 항상 백업한다. 고친 뒤 되읽어 보고, 깨졌으면 스스로 되돌린다.

쓰는 법
    python sop_ppe_img_fix.py                무엇을 바꿀지만 보여준다
    python sop_ppe_img_fix.py --run          실제로 고친다
    python sop_ppe_img_fix.py --run --mirror 사본까지 맞춘다
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

try:                                  # 윈도우 명령창이 cp949 라도 한글이 안 깨지게
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

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

# ── 보호구 이름 → 맞는 사진 (사진을 하나씩 눈으로 확인하고 적음)
#    오른쪽 주석은 그 사진에 실제로 찍혀 있는 물건이다.
맞는사진 = {
    # 손
    "보호장갑":       "ppe_415978a0e5.png",   # 니트릴 코팅 작업장갑
    "안전장갑":       "ppe_415978a0e5.png",   # 〃
    "미끄럼 방지 장갑": "ppe_415978a0e5.png",   # 〃 (코팅면이 곧 미끄럼방지)
    "절연장갑":       "ppe_003633a193.png",   # 전기용 절연장갑 (긴 커프)
    "고무장갑":       "ppe_rgloves.png",      # 검정 고무장갑 (긴팔)
    "불침투성장갑":    "ppe_17d9981ce4.png",   # 녹색 내화학 장갑
    "내화학 보호장갑":  "ppe_17d9981ce4.png",   # 〃
    "용접용 가죽장갑":  "ppe_83351264e9.png",   # 황색 용접용 가죽장갑
    "내열장갑":       "ppe_83351264e9.png",   # 〃
    "내열 보호장갑":   "ppe_83351264e9.png",   # 〃
    "절단방지 장갑":   "ppe_61075cf524.png",   # 회색 절단방지(HPPE) 장갑
    "베임방지장갑":    "ppe_61075cf524.png",   # 〃
    "내진동장갑":     "ppe_7f9f67a70f.png",   # OTOS 내진동 장갑

    # 눈 · 얼굴 · 호흡
    "보안경":        "ppe_30bf9ef8db.png",   # 투명 오버글라스 보안경
    "보안면":        "ppe_9295325eed.png",   # 보안면
    "용접용 보안면":   "ppe_9295325eed.png",   # 〃
    "방독마스크":     "ppe_0ad790179f.png",   # 3M 2중 정화통 방독마스크
    "방진마스크":     "ppe_47c501afea.png",   # 3M 8822 방진마스크
    "송기마스크":     "ppe_2b723433e8.png",   # 송기마스크
    "안면보호구":     "ppe_171745b4b0.png",   # 안면보호대
    "안면보호대":     "ppe_171745b4b0.png",   # 〃

    # 귀
    "귀마개":        "ppe_49f72fd9fd.png",   # 발포 귀마개
    "소음 귀마개":    "ppe_6eaa10e475.png",   # 소음 귀마개
    "귀덮개":        "ppe_e73cc8195f.png",   # 귀덮개

    # 머리
    "안전모":        "ppe_390a4a7520.png",   # Samkoo 흰색 안전모
    "차양 안전모":    "ppe_cc45ba99d8.png",   # 차양 · 햇빛가리개 안전모

    # 발
    "안전화":        "ppe_d551966660.png",   # K2 베이지 안전화
    "논슬립 안전화":   "ppe_e19735ab85.png",   # mountia 검정 논슬립 안전화
    "논슬립 장화":    "ppe_boots.png",        # 검정 고무장화 (황색 밑창)
    "불침투성장화":    "ppe_boots.png",        # 〃

    # 추락 · 기타
    "안전대":        "ppe_f426544443.png",   # 전신 안전벨트
    "구명줄":        "ppe_ea0e2d085c.png",   # 구명줄
    "손목용 검전기":   "ppe_tester.png",       # 검전기
    "용접용 앞치마":   "ppe_326bc426b0.png",   # 용접용 앞치마
    "불침투성 앞치마":  "ppe_4f3fece1c0.png",   # 불침투성 앞치마
    "보호의":        "ppe_38246fd71d.png",   # 보호의
    "조끼":          "ppe_92677e7acd.png",   # 안전 조끼
    "신호봉":        "ppe_ccb087f9de.png",   # 신호봉
    "호각":          "ppe_09791b0140.png",   # 호각
    "마스크":        "ppe_mask.png",         # 일회용 마스크
    "팔, 무릎보호대":  "ppe_3a49171aef.png",   # 팔 · 무릎보호대
    "다리보호대":     "ppe_def6530999.png",   # 다리보호대
}

# ── 전용 사진이 아직 없는 보호구.
#    제대로 된 사진을 구하기 전까지는 **같은 종류 중 가장 가까운 것**으로
#    통일해 둔다. 장화 자리에 안전화가 나오는 일만은 없게 하려는 것이다.
#    (사진을 구하면 위 '맞는사진' 표로 옮기고 여기서 지운다.)
임시사진 = {
    "방한장갑":    ("ppe_415978a0e5.png", "코팅 작업장갑으로 대신 나감"),
    "절연 안전화":  ("ppe_d551966660.png", "일반 안전화로 대신 나감"),
    "절연화":      ("ppe_d551966660.png", "일반 안전화로 대신 나감"),
    "절연장화":    ("ppe_boots.png",      "일반 고무장화로 대신 나감"),
    "절연 장화":   ("ppe_boots.png",      "일반 고무장화로 대신 나감"),
    "절연안전모":   ("ppe_390a4a7520.png", "일반 안전모로 대신 나감"),
}

작업키 = re.compile(r"(?m)^([a-z][a-z0-9]*): \{")
PPE열기 = re.compile(r'(?m)^[ \t]*"?ppe"?: \[')
이름값 = re.compile(r'"?name"?\s*:\s*([\'"])(.*?)\1')
그림값 = re.compile(r'("?img"?\s*:\s*)([\'"])(.*?)\2')


def 읽기():
    js = ("global.window={};require(%s);"
          "process.stdout.write(JSON.stringify(window.TASKS))"
          % json.dumps(DATA.replace("\\", "/")))
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True,
                                     check=True).stdout.decode("utf-8"))


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


def 항목들(글, 여는, 닫는):
    """ppe 목록 안의 {...} 덩어리 자리를 앞에서부터 모은다."""
    out, i = [], 여는 + 1
    while True:
        s = 글.find("{", i, 닫는)
        if s < 0:
            return out
        e = 괄호끝(글, s, "{", "}")
        if e < 0 or e > 닫는:
            return out
        out.append((s, e))
        i = e + 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--mirror", action="store_true")
    a = ap.parse_args()

    있는사진 = set(os.listdir(IMGDIR))
    빠진파일 = sorted({v for v in 맞는사진.values() if v not in 있는사진}
                  | {v for v, _ in 임시사진.values() if v not in 있는사진})
    if 빠진파일:
        sys.exit("표에 적은 사진 파일이 없습니다 : %s" % ", ".join(빠진파일))

    글 = io.open(DATA, encoding="utf-8", newline="").read()
    자리 = ppe자리(글)

    계획, 건너뜀, 모르는이름 = [], Counter(), Counter()
    for tid, (여는, 닫는) in 자리.items():
        for s, e in 항목들(글, 여는, 닫는):
            덩어리 = 글[s:e + 1]
            mn, mi = 이름값.search(덩어리), 그림값.search(덩어리)
            if not mn or not mi:
                continue
            이름, 지금 = mn.group(2), mi.group(3)
            맞는 = 맞는사진.get(이름)
            if 맞는 is None and 이름 in 임시사진:
                맞는 = 임시사진[이름][0]
                건너뜀[이름] += 1
            if not 맞는:
                모르는이름[이름] += 1
                continue
            if 맞는 != 지금:
                계획.append((tid, 이름, 지금, 맞는, s, e))

    바뀜 = Counter((이름, 지금, 맞는) for _, 이름, 지금, 맞는, _, _ in 계획)
    print("보호구 칸 중 사진이 틀린 것 : %d개\n" % len(계획))
    for (이름, 지금, 맞는), n in sorted(바뀜.items(), key=lambda x: -x[1]):
        print("  %4d개  %-14s %s  →  %s" % (n, 이름, 지금, 맞는))

    if 건너뜀:
        print("\n! 전용 사진이 없어 비슷한 것으로 통일해 둔 보호구 (사진 필요)")
        for 이름, n in 건너뜀.most_common():
            print("  %4d개  %-14s %s" % (n, 이름, 임시사진[이름][1]))
    if 모르는이름:
        print("\n! 표에 없는 보호구 이름 (사람이 판단해야 함)")
        for 이름, n in 모르는이름.most_common():
            print("  %4d개  %s" % (n, 이름))

    if not a.run:
        print("\n(보여주기만 했습니다. 실제로 고치려면 --run)")
        return
    if not 계획:
        print("\n고칠 것이 없습니다.")
        return

    백업 = DATA + ".bak_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copy2(DATA, 백업)
    print("\n백업 : %s" % os.path.basename(백업))

    # 뒤에서부터 바꿔야 앞쪽 자리가 밀리지 않는다
    for tid, 이름, 지금, 맞는, s, e in sorted(계획, key=lambda x: -x[4]):
        덩어리 = 글[s:e + 1]
        새덩어리 = 그림값.sub(
            lambda m: "%s%s%s%s" % (m.group(1), m.group(2), 맞는, m.group(2)),
            덩어리, count=1)
        글 = 글[:s] + 새덩어리 + 글[e + 1:]

    io.open(DATA, "w", encoding="utf-8", newline="").write(글)
    print("고침 : 사진 %d개 바로잡음" % len(계획))

    try:
        새 = 읽기()
    except Exception as e:
        shutil.copy2(백업, DATA)
        sys.exit("파일이 깨져 백업으로 되돌렸습니다 : %s" % str(e)[:90])

    기대 = dict(맞는사진, **{k: v for k, (v, _) in 임시사진.items()})
    남은 = [(t.get("name"), q["name"], q["img"])
           for t in 새.values() for q in (t.get("ppe") or [])
           if q["name"] in 기대 and q["img"] != 기대[q["name"]]]
    print("확인 : 작업 %d건 정상 / 남은 불일치 %d개" % (len(새), len(남은)))

    if a.mirror:
        for m in MIRRORS:
            if os.path.isdir(os.path.dirname(m)):
                shutil.copy2(DATA, m)
                print("사본 반영 : %s" % m)


if __name__ == "__main__":
    main()
