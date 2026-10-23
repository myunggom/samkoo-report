# -*- coding: utf-8 -*-
"""표준 인물의 '캐릭터 시트'를 만든다 — 모든 사진의 기준이 되는 참조.

왜 필요한가
    Gemini 이미지 API 는 인물 참조를 4~5장까지 받는다. 한 장만 넣으면
    얼굴이 흔들린다. 그래서 같은 사람을 여러 각도로 미리 만들어 두고,
    이후 모든 장면 생성에 그 묶음을 통째로 첨부한다.

    메인(주인공)과 서브(보조자)를 따로 만든다. 두 사람이 나오는 장면에서
    서브가 메인과 같은 얼굴이 되거나 매번 달라지는 것을 막는다.

쓰는 법
    python sop_character_sheet.py --plan
    python sop_character_sheet.py --run --face B04 --role main
    python sop_character_sheet.py --run --face B02 --role sub
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
FACE_DIR = os.path.join(WORK, "01 표준인물")
REF_DIR = os.path.join(WORK, "04 참조 이미지")
OUT_DIR = os.path.join(WORK, "04 참조 이미지")

MODEL = "gemini-3-pro-image"
# 안전모_로고.png 는 실제 로고를 합성해 만든 것. 모델이 이걸 보고 베낀다.
REF_FILES = ["안전모_로고.png", "유니폼.png", "Samkoo.png"]

# 로고는 참조 사진(안전모.png)에 없다. 글로 정확히 일러 준다.
LOGO = """## Samkoo 로고 — 첨부한 참조 사진을 그대로 베낍니다

- **안전모**: 첨부 `안전모_로고.png` 의 로고를 **그대로** 씁니다.
  글자 `Samkoo` 는 **진회색**, 그 오른쪽 위에 **연두빛 녹색 민들레 심볼**
  (가느다란 초승달 조각이 둥글게 퍼진 모양)이 있고 글자 끝에서
  가는 줄기가 위로 휘어 올라갑니다. 네잎클로버가 아닙니다.
- **폴로셔츠 왼쪽 가슴**: 첨부 `유니폼.png` 처럼 **흰색 `Samkoo` 글자 +
  녹색 민들레 심볼**을 작게 자수로 넣습니다.
- 철자는 **S 만 대문자**. 하나라도 다르거나 번지면 안 됩니다.
- 화면에 그 밖의 글자는 넣지 마세요.
"""

BASE = """안전 교육자료에 계속 등장할 **표준 인물**의 기준 사진을 만듭니다.
첨부한 얼굴 사진의 **그 사람**입니다. 다른 사람이 되면 안 됩니다.

## 인물
- 첨부 얼굴 사진과 **동일 인물** — 얼굴 · 눈매 · 머리 · 피부톤 그대로.
- 한국인 남성. 단정한 짧은 머리, 수염 없음, **마스크 · 안경 없음**.
- 체격은 보통보다 다부지고 어깨가 넓으며 자세가 반듯합니다.

## 복장 (모든 각도에서 똑같이)
- **흰색 안전모** — 턱끈을 턱 아래에 제대로 체결했습니다.
- **남색 긴팔 폴로셔츠**, **남색 작업바지**, **검정 안전화**.
- **회색 작업장갑**은 전신 사진에서만 착용합니다.

{로고}

## 화풍
- 실사 사진. 일러스트 · 3D · 만화풍 금지.
- **밝은 회색 무지 벽** 배경, 부드럽고 고른 실내 조명, 그림자 적게.
- 참조용 기준 사진이므로 배경에 설비나 소품을 넣지 마세요.
- 손가락 · 팔 개수 이상, 얼굴 왜곡 금지.

## 이번 장의 구도
{구도}
"""

ANGLES = {
    "main": [
        ("01_정면", "상반신 정면. 카메라를 똑바로 바라봅니다. 어깨 위부터 안전모 끝까지.", "1:1"),
        ("02_좌34", "상반신. 몸을 왼쪽으로 45도 돌린 3/4 각도. 시선은 카메라 쪽.", "1:1"),
        ("03_우34", "상반신. 몸을 오른쪽으로 45도 돌린 3/4 각도. 시선은 카메라 쪽.", "1:1"),
        ("04_측면", "상반신 완전 옆모습(90도). 얼굴 윤곽과 안전모 옆선이 보입니다.", "1:1"),
        ("05_전신", "전신 정면. 머리끝부터 안전화까지 다 들어옵니다. 팔은 자연스럽게 내립니다.", "3:4"),
    ],
    "sub": [
        ("01_정면", "상반신 정면. 카메라를 똑바로 바라봅니다.", "1:1"),
        ("02_좌34", "상반신. 몸을 왼쪽으로 45도 돌린 3/4 각도.", "1:1"),
        ("03_전신", "전신 정면. 머리끝부터 안전화까지. 팔은 자연스럽게 내립니다.", "3:4"),
    ],
}


def load_key():
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


def refs(face):
    from PIL import Image
    want = [os.path.join(FACE_DIR, "얼굴후보_%s.png" % face)]
    want += [os.path.join(REF_DIR, n) for n in REF_FILES]
    out, 쓴것 = [], []
    for p in want:
        if os.path.exists(p):
            out.append(Image.open(p).convert("RGB"))
            쓴것.append(os.path.basename(p))
        else:
            print("  ! 참조 없음 : %s" % os.path.basename(p))
    return out, 쓴것


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--face", default="B04", help="쓸 얼굴 번호 (예: B04)")
    ap.add_argument("--role", default="main", choices=["main", "sub"])
    ap.add_argument("--run", action="store_true", help="실제 생성 (유료)")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--only", help="한 각도만 (예: 01_정면)")
    a = ap.parse_args()

    목록 = [x for x in ANGLES[a.role] if not a.only or x[0] == a.only]
    이름 = "표준인물_메인" if a.role == "main" else "표준인물_서브"
    print("모델 : %s" % a.model)
    print("얼굴 : 얼굴후보_%s.png  →  %s" % (a.face, 이름))
    print("각도 : %s" % ", ".join(x[0] for x in 목록))
    print("예상 비용 : 약 $%.2f" % (len(목록) * 0.134))
    print("저장 : %s" % OUT_DIR)
    if not a.run:
        print("\n(계획만 봤습니다. 실제로 만들려면 --run)")
        return

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=load_key())
    ref_imgs, 쓴것 = refs(a.face)
    os.makedirs(OUT_DIR, exist_ok=True)
    print("참조 %d장 : %s\n" % (len(ref_imgs), ", ".join(쓴것)))

    for 꼬리, 구도, 비율 in 목록:
        name = "%s_%s.png" % (이름, 꼬리)
        path = os.path.join(OUT_DIR, name)
        if os.path.exists(path):
            print("  %-26s 이미 있음 — 건너뜀" % name)
            continue
        글 = BASE.format(로고=LOGO, 구도=구도)
        try:
            res = client.models.generate_content(
                model=a.model,
                contents=[글] + ref_imgs,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=비율,
                                                   image_size="2K"),
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
                print("  %-26s 실패 — 그림 없음" % name)
                continue
            with open(path, "wb") as f:
                f.write(데이터)
            print("  %-26s 완료 (%.0f KB)" % (name, os.path.getsize(path) / 1024))
        except Exception as e:
            print("  %-26s 실패 — %s" % (name, str(e)[:70]))

    print("\n폴더 : %s" % OUT_DIR)


if __name__ == "__main__":
    main()
