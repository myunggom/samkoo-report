# -*- coding: utf-8 -*-
"""현장 사진을 메일 첨부용으로 줄인다.

왜 하는가
  폰·카메라 원본은 한 장에 3~12MB 다. 현장 사진 예닐곱 장만 붙여도
  지메일 한도 25MB 를 넘어 첨부가 막힌다. 실제로 엘림조경 하자 치유 사진
  6장이 24.3MB 라 한도에 걸렸다.

  그런데 메일로 받아 보는 사진은 아무리 크게 띄워도 긴 변 1600px 안쪽이다.
  그보다 큰 픽셀은 용량만 먹고 눈에는 안 보인다. 그래서 1600px 로 맞추면
  보이는 건 그대로인데 용량만 열 몇 분의 일로 떨어진다. (실측 88% 감소)

  EXIF 를 넘기지 않으므로 위치정보·촬영기기 정보도 함께 빠진다.
  외부로 나가는 사진에는 이게 낫다.

원칙
  원본은 절대 건드리지 않는다. 줄인 사본을 새 폴더에 따로 만든다.

쓰는 법
  python tools/photo_for_mail.py <폴더 또는 파일...> [옵션]

  --out  <폴더>   저장 위치 (기본: 바탕화면\\메일용_사진)
  --px   <숫자>   긴 변 최대 픽셀 (기본 1600)
                    1024  최대한 작게. 장수가 아주 많을 때
                    1600  현장 사진 보고 — 보통 이걸 쓴다
                    2400  도면·작은 글씨를 확대해 읽어야 할 때
  --q    <숫자>   JPEG 품질 1~95 (기본 82)
  --max-mb <숫자> 전체 합계 상한. 넘으면 품질·크기를 자동으로 더 낮춘다.
  --recurse       하위 폴더까지 훑는다 (기본은 한 겹만)
  --dry           실제로 만들지 않고 결과만 미리 본다

  예)
    python tools/photo_for_mail.py "C:\\...\\하자 치유_2026.11.25"
    python tools/photo_for_mail.py "C:\\...\\도면" --px 2400
    python tools/photo_for_mail.py "C:\\...\\사진" --max-mb 20

주의
  아이폰 HEIC 사진은 다루지 못한다. 필요해지면 pillow-heif 를 설치하고
  이 파일 위쪽의 register_heif_opener() 주석을 풀면 된다.
"""
import argparse
import io
import os
import sys

from PIL import Image, ImageOps

# 아이폰 HEIC 를 다뤄야 할 때 풀 것 (pip install pillow-heif)
# from pillow_heif import register_heif_opener
# register_heif_opener()

# Pillow 는 기본적으로 1억 7천만 픽셀이 넘는 그림을 '공격일 수 있다'며 거부한다.
# 인터넷에서 받은 파일에는 맞는 보호지만 여기서 다루는 건 내 PC 의 도면·사진이고,
# 도면 스캔은 2~3억 픽셀이 예사다(실제로 조경토 반입 도면이 2.8억이었다).
# 그래서 한도를 넉넉히 올려 둔다.
Image.MAX_IMAGE_PIXELS = 600_000_000

EXT = (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp")
HEIC = (".heic", ".heif")

GMAIL_LIMIT = 25 * 1024 * 1024      # 지메일 첨부 한도
DEFAULT_OUT = os.path.join(os.path.expanduser("~"), "Desktop", "메일용_사진")


def human(n):
    """바이트를 사람이 읽는 단위로."""
    if n >= 1024 * 1024:
        return "%.1fMB" % (n / 1024 / 1024)
    return "%dKB" % round(n / 1024)


def collect(targets, recurse=False):
    """사진 파일만 골라낸다. (사진목록, 건너뛴 HEIC 목록)"""
    found, heic = [], []

    def take(p):
        low = p.lower()
        if low.endswith(EXT):
            found.append(p)
        elif low.endswith(HEIC):
            heic.append(p)

    for t in targets:
        t = t.rstrip('"')                      # 탐색기에서 복사한 경로 보정
        if os.path.isdir(t):
            if recurse:
                for root, _dirs, names in os.walk(t):
                    for n in sorted(names):
                        take(os.path.join(root, n))
            else:
                for n in sorted(os.listdir(t)):
                    p = os.path.join(t, n)
                    if os.path.isfile(p):
                        take(p)
        elif os.path.isfile(t):
            take(t)
        else:
            print("  건너뜀(없는 경로): %s" % t)
    return found, heic


def has_alpha(im):
    """투명한 배경이 있는 그림인지. 이런 걸 JPEG 로 바꾸면 그 자리가 까맣게 된다."""
    if im.mode in ("RGBA", "LA", "PA"):
        return im.getchannel("A").getextrema()[0] < 255
    return im.mode == "P" and "transparency" in im.info


def convert(path, px, q):
    """줄인 사본을 (바이트, 확장자) 로 돌려준다."""
    with Image.open(path) as im:
        # 폰 사진은 '세로로 찍었다'는 표시만 붙어 있고 데이터는 가로로 들어 있다.
        # 이걸 먼저 바로 세우지 않으면 줄인 사진이 옆으로 눕는다.
        im = ImageOps.exif_transpose(im)

        keep = has_alpha(im)
        im = im.convert("RGBA" if keep else "RGB")

        w, h = im.size
        if max(w, h) > px:
            s = px / float(max(w, h))
            im = im.resize((max(1, round(w * s)), max(1, round(h * s))),
                           Image.LANCZOS)

        buf = io.BytesIO()
        if keep:
            im.save(buf, "PNG", optimize=True)
            return buf.getvalue(), ".png"
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        return buf.getvalue(), ".jpg"


def plan(files, px, q):
    """각 사진을 줄여 보고 (원본경로, 바이트, 확장자, 원본크기) 목록을 만든다."""
    out = []
    for p in files:
        try:
            data, ext = convert(p, px, q)
        except Exception as e:
            print("  실패: %s (%s)" % (os.path.basename(p), e))
            continue
        out.append((p, data, ext, os.path.getsize(p)))
    return out


def report(rows, px, q):
    """줄이기 전후를 표로 보여주고 (원본합계, 줄인합계) 를 돌려준다."""
    before = sum(s for _, _, _, s in rows)
    after = sum(len(d) for _, d, _, _ in rows)

    print("")
    print("  기준: 긴 변 %dpx / 품질 %d" % (px, q))
    print("  %-40s %10s    %10s" % ("파일", "원본", "줄인 뒤"))
    print("  " + "-" * 66)
    for p, data, _ext, size in rows:
        name = os.path.basename(p)
        if len(name) > 38:
            name = name[:35] + "..."
        print("  %-40s %10s -> %10s" % (name, human(size), human(len(data))))
    print("  " + "-" * 66)
    pct = (1 - after / before) * 100 if before else 0
    print("  %-40s %10s -> %10s  (%d%% 감소)"
          % ("합계 %d 장" % len(rows), human(before), human(after), pct))
    print("")
    return before, after


def save(rows, out_dir):
    """사본을 저장한다. 같은 이름이 있으면 (2), (3) 을 붙여 덮어쓰지 않는다."""
    os.makedirs(out_dir, exist_ok=True)
    used = set()
    for p, data, ext, _ in rows:
        stem = os.path.splitext(os.path.basename(p))[0]
        name = stem + ext
        n = 2
        while name.lower() in used or os.path.exists(os.path.join(out_dir, name)):
            name = "%s (%d)%s" % (stem, n, ext)
            n += 1
        used.add(name.lower())
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(data)


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("targets", nargs="+", help="사진 폴더 또는 사진 파일들")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--px", type=int, default=1600)
    ap.add_argument("--q", type=int, default=82)
    ap.add_argument("--max-mb", type=float, default=None)
    ap.add_argument("--recurse", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    files, heic = collect(a.targets, a.recurse)

    if heic:
        print("아이폰 HEIC 사진 %d 장은 다루지 못합니다." % len(heic))
        print("  (pillow-heif 설치 후 이 파일 위쪽 주석을 풀면 됩니다)")
        for p in heic[:5]:
            print("    %s" % os.path.basename(p))
        print("")

    if not files:
        print("줄일 사진이 없습니다.")
        return 1

    px, q = a.px, a.q
    rows = plan(files, px, q)
    if not rows:
        return 1

    # 합계 상한이 있으면 들어갈 때까지 품질 -> 크기 순으로 낮춘다
    if a.max_mb:
        cap = a.max_mb * 1024 * 1024
        for spx, sq in [(px, q), (px, 72), (1280, 72), (1024, 70), (800, 68)]:
            if sum(len(d) for _, d, _, _ in rows) <= cap:
                break
            px, q = spx, sq
            rows = plan(files, px, q)

    _before, after = report(rows, px, q)

    if after > GMAIL_LIMIT:
        print("  경고: 아직 지메일 한도 25MB 를 넘습니다(%s)." % human(after))
        print("        --max-mb 20 을 붙이거나 나눠서 보내세요.")
        print("")

    if a.dry:
        print("미리보기만 했습니다. 실제로 만들려면 --dry 를 빼고 다시 실행하세요.")
        return 0

    save(rows, a.out)
    print("저장했습니다: %s" % a.out)
    print("원본은 그대로 있습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
