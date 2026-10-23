# -*- coding: utf-8 -*-
"""표준인물의 '마스크 벗은 얼굴' 후보를 만든다.

왜 필요한가
    지금 표준인물.png 는 마스크로 코·입이 가려져 있다. 참조로 쓰면 AI 가
    얼굴 아래쪽을 매번 다르게 지어낸다. 그래서 먼저 얼굴을 하나로 확정한다.

    눈·눈썹·이마·피부톤·체형·복장은 원본 그대로 두고, 가려진 코·입만
    후보로 여러 장 만든다. 사장이 하나 고르면 그것이 표준 얼굴이 된다.

쓰는 법
    python sop_face_candidates.py --plan          돈 안 씀. 계획만 본다
    python sop_face_candidates.py --run           실제 생성 (유료)
    python sop_face_candidates.py --run --n 6     장수 지정
"""
import argparse
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SOP = (r"C:\Users\user\Desktop\Bio Innovation Hub\01 Projects"
       r"\[안전] 표준운영절차 SOP")
WORK = os.path.join(SOP, "7차 작업")
REF_DIR = os.path.join(WORK, "04 참조 이미지")
OUT_DIR = os.path.join(WORK, "01 표준인물")

MODEL = "gemini-nano-banana-2.1"
# 얼굴을 새로 만들 때는 표준인물.png 를 넣지 않는다 — 넣으면 그 얼굴에 붙잡힌다.
REF_FILES = ["유니폼.png", "안전모.png"]

# 인상을 서로 다르게 여섯 갈래로 만든다. 사장이 하나 고른다.
VARIANTS = [
    "이목구비가 또렷하고 콧날이 오똑한 단정한 도시형 인상. 눈매가 시원합니다.",
    "턱선이 또렷하고 선이 굵은 남성적인 인상. 다부지고 믿음직해 보입니다.",
    "눈매가 부드럽고 인상이 선한 친근한 얼굴. 입꼬리가 살짝 올라가 있습니다.",
    "서른 초반으로 보이는 깔끔하고 스마트한 인상. 피부가 깨끗합니다.",
    "서른 후반의 차분하고 노련한 인상. 눈빛이 침착하고 신뢰감이 있습니다.",
    "전체적으로 균형 잡힌 미남형. 어느 한 곳이 튀지 않고 보기 편합니다.",
]

PROMPT = """안전 교육자료에 계속 등장할 **표준 인물**의 얼굴 사진을 만듭니다.

## 이번 후보의 인상
{인상}

## 공통 조건
- **한국인 남성, 30대 중반.** 외국인처럼 보이면 안 됩니다.
- 단정한 짧은 머리, 수염 없음. **마스크 · 안경 없음** — 얼굴 전체가 보입니다.
- 체격은 보통보다 다부진 편. 어깨가 넓고 자세가 반듯합니다.
- 호감 가는 잘생긴 얼굴이되 **과하게 꾸미지 않은 현장 관리자**로 보여야 합니다.
  모델 화보가 아니라 실제 시설관리 책임자 같은 인상입니다.
- **흰색 Samkoo 안전모**(턱끈 체결), **남색 Samkoo 긴팔 폴로셔츠** 착용.
- 안전모 앞면과 가슴의 글자는 반드시 **`Samkoo`** 입니다. S 만 대문자.
  또렷하게 읽히도록 그립니다. 그 외 글자는 넣지 마세요.

## 구도 · 화질
- 상반신 정면, 어깨 위부터 안전모 끝까지. 카메라를 바라봅니다.
- 표정은 차분하고 자연스럽게. 과한 미소 금지.
- 밝은 회색 무지 벽 배경, 부드러운 실내 조명.
- 실사 사진. 일러스트 · 3D · 만화풍 금지.
- 손 · 글자 · 로고 왜곡 금지. 안전모의 `Samkoo` 글자는 또렷하게.
"""


def refs():
    from PIL import Image
    out = []
    for n in REF_FILES:
        p = os.path.join(REF_DIR, n)
        if os.path.exists(p):
            out.append(Image.open(p).convert("RGB"))
        else:
            print("  ! 참조 없음 : %s" % n)
    return out


def load_key():
    """.env 에서 키를 읽는다. 값은 화면에 찍지 않는다."""
    k = os.environ.get("GEMINI_API_KEY")
    if k:
        return k
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        m = re.search(r"^GEMINI_API_KEY=(\S+)",
                      io.open(p, encoding="utf-8").read(), re.M)
        if m:
            return m.group(1)
    sys.exit(".env 에 GEMINI_API_KEY 가 없습니다.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=6, help="만들 장수")
    ap.add_argument("--run", action="store_true", help="실제 생성 (유료)")
    ap.add_argument("--plan", action="store_true", help="계획만")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--tag", default="", help="파일 이름 앞에 붙일 표시 (예: B)")
    a = ap.parse_args()

    print("모델 : %s" % a.model)
    print("참조 : %s" % ", ".join(REF_FILES))
    print("장수 : %d" % a.n)
    print("저장 : %s" % OUT_DIR)
    print("예상 비용 : 약 $%.2f (1장 $0.034 기준)" % (a.n * 0.034))
    if not a.run:
        print("\n(계획만 봤습니다. 실제로 만들려면 --run)")
        return

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=load_key())
    ref_imgs = refs()
    os.makedirs(OUT_DIR, exist_ok=True)
    print()

    됨, 실패 = 0, []
    for i in range(1, a.n + 1):
        name = "얼굴후보_%s%02d.png" % (a.tag, i)
        path = os.path.join(OUT_DIR, name)
        if os.path.exists(path):
            print("  %-16s 이미 있음 — 건너뜀" % name)
            됨 += 1
            continue
        try:
            글 = PROMPT.format(인상=VARIANTS[(i - 1) % len(VARIANTS)])
            res = client.models.generate_content(
                model=a.model,
                contents=[글] + ref_imgs,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="1:1",
                                                   image_size="1K"),
                ),
            )
            데이터 = None
            for cand in res.candidates or []:
                for part in (cand.content.parts or []):
                    blob = getattr(part, "inline_data", None)
                    if blob and blob.data:
                        데이터 = blob.data
                        break
                if 데이터:
                    break
            if not 데이터:
                실패.append((name, "그림을 받지 못함"))
                print("  %-16s 실패 — 그림 없음" % name)
                continue
            with open(path, "wb") as f:
                f.write(데이터)
            print("  %-16s 완료 (%.0f KB)" % (name, os.path.getsize(path) / 1024))
            됨 += 1
        except Exception as e:
            실패.append((name, str(e)[:80]))
            print("  %-16s 실패 — %s" % (name, str(e)[:60]))

    print("\n만든 것 %d장 / 실패 %d장" % (됨, len(실패)))
    for n, why in 실패:
        print("   %s : %s" % (n, why))
    print("폴더 : %s" % OUT_DIR)


if __name__ == "__main__":
    main()
