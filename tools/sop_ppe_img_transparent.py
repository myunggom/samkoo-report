# -*- coding: utf-8 -*-
"""보호구 사진을 전부 '배경 없는 PNG' 로 만든다.

왜 필요한가
    보호구 사진 일부가 흰 배경 사진(JPEG)이었다. 사이트 배경이 흰색이 아니거나
    카드 색이 바뀌면 사진마다 흰 네모가 드러나 보인다. 배경을 지워 두면
    어떤 배경 위에 올려도 물건만 떠 보인다.

어떻게 지우나
    사진 테두리에서 안쪽으로 '흰색과 이어진 부분' 만 따라 들어가며 지운다.
    (물건 안쪽의 흰색 — 장갑의 흰 무늬, 안전모의 흰 몸통 — 은 테두리와
    이어져 있지 않으므로 지워지지 않는다.)
    지운 경계는 살짝 부드럽게 해 톱니가 보이지 않게 한다.

    파일 이름이 .jpg 인 것은 .png 로 바꾸고, 그 이름을 쓰는 곳도 같이 고친다.

원본은 통째로 백업한다. 되읽어 확인하고, 깨졌으면 알려준다.

쓰는 법
    python sop_ppe_img_transparent.py            무엇을 바꿀지만 보여준다
    python sop_ppe_img_transparent.py --run      실제로 고친다
    python sop_ppe_img_transparent.py --run --mirror  사본까지 맞춘다
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import sop_ppe_audit as A                                      # noqa: E402

SITE = A.SITE
DATA = os.path.join(SITE, "assets", "data.js")
IMGLIST = os.path.join(SITE, "assets", "imglist.js")
IMGDIR = os.path.join(SITE, "assets", "img")
MIRRORS = [
    r"C:\Users\user\Desktop\content-report\content-report\sop",
    r"C:\Users\user\vercel-deploy\safety-sop",
]

흰색기준 = 238        # 이보다 밝으면 배경 후보
허용오차 = 32         # 흰색에서 이만큼 어두워도 같은 배경으로 본다
부드럽게 = 0.7        # 경계 번짐 정도 (픽셀)
부스러기비율 = 0.02   # 가장 큰 덩어리의 2% 미만인 조각은 털어낸다


def 읽기(path=None):
    p = path or DATA
    js = ("global.window={};require(%s);"
          "process.stdout.write(JSON.stringify(window.TASKS))"
          % json.dumps(p.replace("\\", "/")))
    return json.loads(subprocess.run(["node", "-e", js], capture_output=True,
                                     check=True).stdout.decode("utf-8"))


def 쓰이는사진():
    """img 폴더의 ppe_ 사진 **전부**. 값은 그 사진을 쓰는 보호구 이름이다.

    지금 안 쓰이는 사진도 포함한다. edit.html 의 사진 고르기 목록에 그대로
    나오므로, 나중에 누가 고르면 흰 배경이 드러나기 때문이다.
    """
    표 = {f: set() for f in os.listdir(IMGDIR) if f.startswith("ppe_")}
    for t in 읽기().values():
        for q in (t.get("ppe") or []):
            표.setdefault(q["img"], set()).add(q["name"])
    return 표


def 배경있나(path):
    """테두리 네 모서리가 불투명한 흰색이면 '배경 있음' 으로 본다."""
    a = np.array(Image.open(path).convert("RGBA"))
    h, w = a.shape[:2]
    모서리 = [a[0, 0], a[0, w - 1], a[h - 1, 0], a[h - 1, w - 1]]
    return all(c[3] >= 16 and min(c[:3]) >= 흰색기준 - 허용오차 for c in 모서리)


def 부스러기털기(남길것):
    """물건에서 떨어져 나온 자잘한 조각(워터마크 글씨 등)을 지운다.

    가장 큰 덩어리의 부스러기비율 미만인 조각만 털어낸다. 장갑 두 짝처럼
    떨어져 있어도 크기가 비슷하면 둘 다 남는다.
    """
    딱지, 개수 = ndimage.label(남길것)
    if 개수 <= 1:
        return 남길것
    크기 = ndimage.sum(남길것, 딱지, range(1, 개수 + 1))
    기준 = 크기.max() * 부스러기비율
    살릴딱지 = {n for n, s in enumerate(크기, 1) if s >= 기준}
    return np.isin(딱지, list(살릴딱지))


def 배경지우기(path):
    """테두리와 이어진 흰 배경만 투명하게 만든 RGBA 이미지를 돌려준다."""
    원 = Image.open(path).convert("RGBA")
    w, h = 원.size

    # 채울 자리를 찾기 위한 흑백 사본 (밝기만 본다)
    밝기 = 원.convert("L")
    표시 = 밝기.copy()
    목표 = 1                                   # 배경을 칠할 값 (거의 검정)
    for 씨앗 in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if 표시.getpixel(씨앗) >= 흰색기준 - 허용오차:
            ImageDraw.floodfill(표시, 씨앗, 목표, thresh=허용오차)

    # 값이 1 인 곳을 배경으로 보면 안 된다. 원래 새까만 부분(밝기 1)까지
    # 배경으로 몰려 물건에 구멍이 뚫린다. '칠해져서 값이 바뀐 자리' 만 배경이다.
    배경 = np.array(표시) != np.array(밝기)
    if not 배경.any():
        return None

    남길것 = ~배경
    남길것 = 부스러기털기(남길것)

    알파 = np.where(남길것, 255, 0).astype(np.uint8)
    알파그림 = Image.fromarray(알파, "L")
    if 부드럽게:
        알파그림 = 알파그림.filter(ImageFilter.GaussianBlur(부드럽게))

    # 원래 투명했던 곳은 그대로 투명하게 둔다
    기존 = np.array(원)[..., 3]
    합친 = np.minimum(np.array(알파그림), 기존).astype(np.uint8)

    새 = np.array(원)
    새[..., 3] = 합친
    # 배경이던 자리의 색을 가장자리 색으로 눕혀 흰 테두리가 비치지 않게 한다
    새[배경, :3] = 새[배경, :3]
    return Image.fromarray(새, "RGBA")


def 글읽기(path):
    """파일마다 저장된 글자 방식이 달라서(utf-8 / cp949) 맞춰 읽는다."""
    for 방식 in ("utf-8", "cp949"):
        try:
            return io.open(path, encoding=방식, newline="").read(), 방식
        except UnicodeDecodeError:
            continue
    raise SystemExit("글자 방식을 모르겠습니다 : %s" % path)


def 글고치기(path, 바뀐이름):
    글, 방식 = 글읽기(path)
    원본 = 글
    for 옛, 새 in 바뀐이름.items():
        글 = 글.replace(옛, 새)
    if 글 != 원본:
        io.open(path, "w", encoding=방식, newline="").write(글)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--mirror", action="store_true")
    a = ap.parse_args()

    표 = 쓰이는사진()
    지울것, 이름바꿈, 이미됨 = [], {}, []
    for f in sorted(표):
        p = os.path.join(IMGDIR, f)
        if not os.path.isfile(p):
            print("  ! 파일 없음 : %s" % f)
            continue
        if 배경있나(p):
            지울것.append(f)
        else:
            이미됨.append(f)
        if f.lower().endswith((".jpg", ".jpeg")):
            이름바꿈[f] = os.path.splitext(f)[0] + ".png"

    print("보호구 사진 %d종" % len(표))
    print("  이미 배경 없음 : %d종" % len(이미됨))
    print("  배경 지울 것   : %d종" % len(지울것))
    for f in 지울것:
        print("      %-24s (%s)" % (f, ", ".join(sorted(표[f]))[:46]))
    if 이름바꿈:
        print("  이름 바꿀 것   : %d종" % len(이름바꿈))
        for 옛, 새 in 이름바꿈.items():
            print("      %s  →  %s" % (옛, 새))

    if not a.run:
        print("\n(보여주기만 했습니다. 실제로 고치려면 --run)")
        return
    if not 지울것 and not 이름바꿈:
        # 사진은 멀쩡해도 목록 · 사본이 어긋나 있을 수 있으므로 계속 간다
        print("\n사진은 이미 다 되어 있습니다. 목록과 사본만 확인합니다.")

    도장 = datetime.now().strftime("%Y%m%d_%H%M%S")
    # 백업은 사이트 폴더 **밖**에 둔다. 배포 스크립트가 사이트 폴더를 통째로
    # 미러링하므로, 안에 두면 백업까지 공개 사이트에 올라간다.
    백업 = os.path.join(os.path.dirname(SITE), "_백업_보호구사진_" + 도장)
    os.makedirs(백업, exist_ok=True)
    for f in set(지울것) | set(이름바꿈):
        shutil.copy2(os.path.join(IMGDIR, f), os.path.join(백업, f))
    print("\n사진 백업 : %s" % os.path.basename(백업))

    # 1) 배경 지우기 (아직 원래 이름으로 저장)
    실패 = []
    for f in 지울것:
        p = os.path.join(IMGDIR, f)
        새그림 = 배경지우기(p)
        if 새그림 is None:
            실패.append(f)
            continue
        낼이름 = os.path.join(IMGDIR, 이름바꿈.get(f, f))
        새그림.save(낼이름, "PNG", optimize=True)
        if 낼이름 != p:
            os.remove(p)
    # 2) 배경은 멀쩡한데 확장자만 .jpg 인 것
    for 옛, 새 in 이름바꿈.items():
        옛p, 새p = os.path.join(IMGDIR, 옛), os.path.join(IMGDIR, 새)
        if os.path.isfile(옛p) and not os.path.isfile(새p):
            Image.open(옛p).convert("RGBA").save(새p, "PNG", optimize=True)
            os.remove(옛p)

    print("배경 지움 : %d종%s"
          % (len(지울것) - len(실패),
             (" / 실패 " + ", ".join(실패)) if 실패 else ""))

    # 3) 이름이 바뀐 사진을 가리키던 글 고치기
    if 이름바꿈:
        for p in (DATA, IMGLIST):
            짝 = os.path.join(백업, os.path.basename(p) + ".bak")
            if not os.path.isfile(짝):
                shutil.copy2(p, 짝)
            if 글고치기(p, 이름바꿈):
                print("이름 반영 : %s" % os.path.basename(p))

    # 3-2) 사진 목록이 실제 폴더와 어긋났으면 맞춘다 (배포 .bat 이 하는 일과 같다)
    글, 방식 = 글읽기(IMGLIST)
    적힌것 = set(re.findall(r'"(ppe_[^"]+)"', 글))
    실제 = {f for f in os.listdir(IMGDIR) if f.startswith("ppe_")}
    if 적힌것 != 실제:
        # 확장자만 다른 같은 사진이면 짝을 지어 이름을 바꿔준다
        새것 = {os.path.splitext(f)[0]: f for f in 실제 - 적힌것}
        바꿀것 = {옛: 새것[os.path.splitext(옛)[0]]
               for 옛 in 적힌것 - 실제 if os.path.splitext(옛)[0] in 새것}
        for 옛 in 적힌것 - 실제 - set(바꿀것):
            print("   ! 목록에만 있고 파일은 없음 : %s" % 옛)
        for 새 in 실제 - 적힌것 - set(바꿀것.values()):
            print("   ! 파일만 있고 목록에는 없음 : %s" % 새)
        if 바꿀것 and 글고치기(IMGLIST, 바꿀것):
            print("목록 맞춤 : %s" % os.path.basename(IMGLIST))

    # 4) 되읽어 확인
    try:
        새T = 읽기()
    except Exception as e:
        sys.exit("data.js 가 깨졌습니다. 백업으로 되돌리세요 : %s" % str(e)[:90])
    없는것 = sorted({q["img"] for t in 새T.values() for q in (t.get("ppe") or [])
                   if not os.path.isfile(os.path.join(IMGDIR, q["img"]))})
    남은배경 = [f for f in {q["img"] for t in 새T.values()
                        for q in (t.get("ppe") or [])}
             if os.path.isfile(os.path.join(IMGDIR, f))
             and 배경있나(os.path.join(IMGDIR, f))]
    print("확인 : 작업 %d건 정상 / 없는 사진 %d개 / 배경 남은 사진 %d개"
          % (len(새T), len(없는것), len(남은배경)))
    for f in 없는것:
        print("   ! 가리키는데 파일이 없음 : %s" % f)
    for f in 남은배경:
        print("   ! 배경이 아직 남음 : %s" % f)

    if a.mirror:
        for 뿌리 in MIRRORS:
            if not os.path.isdir(뿌리):
                continue
            shutil.copy2(DATA, os.path.join(뿌리, "assets", "data.js"))
            shutil.copy2(IMGLIST, os.path.join(뿌리, "assets", "imglist.js"))
            목적 = os.path.join(뿌리, "assets", "img")
            원본목록 = {f for f in os.listdir(IMGDIR) if f.startswith("ppe_")}
            for f in sorted(원본목록):
                shutil.copy2(os.path.join(IMGDIR, f), os.path.join(목적, f))
            # 원본에서 사라진(이름이 바뀐) 사진은 사본에서도 지운다
            지운수 = 0
            for f in os.listdir(목적):
                if f.startswith("ppe_") and f not in 원본목록:
                    os.remove(os.path.join(목적, f))
                    지운수 += 1
            print("사본 반영 : %s (사진 %d개%s)"
                  % (뿌리, len(원본목록),
                     ", 묵은 사진 %d개 지움" % 지운수 if 지운수 else ""))


if __name__ == "__main__":
    main()
