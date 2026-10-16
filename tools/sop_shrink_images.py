# -*- coding: utf-8 -*-
"""안전SOP 웹사이트 사진을 화면 표시 크기에 맞게 줄인다.

왜 하는가
  사진이 화면에 보이는 크기보다 훨씬 크게 들어 있어 용량이 2GB 를 넘었다.
  그 상태로는 git 저장소에 넣을 수 없어 자동 배포를 붙일 수 없고,
  현장에서 휴대폰으로 열 때도 느리다.

줄이는 기준 (화면 표시 폭의 3배 — 고해상도 화면까지 감안)
  _g01~_g12  조치 사진      화면 약 330px  ->  긴 변 1024px
  _gfig      장비 상세도    화면 약 1060px ->  긴 변 1600px
  _fig       각부 명칭도    화면 약 1600px ->  긴 변 2048px
  ppe_*      보호구 아이콘  화면 약 52px   ->  긴 변  256px

원본은 지우지 않는다. assets/img_원본 으로 통째로 복사해 둔다.

쓰는 법
    python tools/sop_shrink_images.py            # 미리보기 (고치지 않음)
    python tools/sop_shrink_images.py --write    # 실제로 줄이기
"""
import io
import os
import shutil
import sys

from PIL import Image

HOME = os.path.expanduser("~")
SITE = os.path.join(HOME, "Desktop", "Bio Innovation Hub", "01 Projects",
                    "[안전] 표준운영절차 SOP", "웹 배포", "안전SOP_웹사이트")
MIRROR = os.path.join(HOME, "vercel-deploy", "safety-sop")

QUALITY = 82

# (파일 이름 판별, 긴 변 최대 px)
RULES = [
    (lambda n: n.startswith("ppe_"), 256),
    (lambda n: "_fig" in n and "_gfig" not in n, 2048),
    (lambda n: "_gfig" in n, 1600),
    (lambda n: True, 1024),
]


def limit_of(name):
    for test, px in RULES:
        if test(name):
            return px
    return 1024


def shrink(path, px):
    """줄인 결과를 바이트로 돌려준다. 줄일 필요가 없으면 None."""
    im = Image.open(path)
    w, h = im.size
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGB")
    if max(w, h) > px:
        s = px / max(w, h)
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    data = buf.getvalue()
    if len(data) >= os.path.getsize(path):
        return None           # 오히려 커지면 그대로 둔다
    return data


def run(folder, write):
    img = os.path.join(folder, "assets", "img")
    if not os.path.isdir(img):
        return None
    names = sorted(n for n in os.listdir(img)
                   if os.path.isfile(os.path.join(img, n))
                   and n.lower().endswith((".png", ".jpg", ".jpeg")))
    before = sum(os.path.getsize(os.path.join(img, n)) for n in names)

    if write:
        bak = os.path.join(folder, "assets", "img_원본")
        if not os.path.isdir(bak):
            print("   원본 보관 중 …", end="", flush=True)
            shutil.copytree(img, bak)
            print(" 완료")

    after, changed = 0, 0
    for i, n in enumerate(names, 1):
        p = os.path.join(img, n)
        data = shrink(p, limit_of(n))
        if data is None:
            after += os.path.getsize(p)
            continue
        changed += 1
        after += len(data)
        if write:
            with open(p, "wb") as f:
                f.write(data)
        if write and i % 300 == 0:
            print("   %d / %d" % (i, len(names)))
    return len(names), changed, before, after


def main():
    write = "--write" in sys.argv
    for folder in (SITE, MIRROR):
        if not os.path.isdir(folder):
            continue
        print("\n→", os.path.basename(folder))
        r = run(folder, write)
        if not r:
            continue
        n, ch, b, a = r
        print("   사진 %d장 중 %d장 줄임" % (n, ch))
        print("   %.2f GB  ->  %.2f GB   (%.0f%% 감소)"
              % (b / 1024 ** 3, a / 1024 ** 3, (1 - a / b) * 100))
    if not write:
        print("\n(미리보기만 했습니다. 실제로 줄이려면 --write)")


if __name__ == "__main__":
    main()
