# -*- coding: utf-8 -*-
"""작업 장면 사진을 시험 삼아 몇 장만 만들어 본다.

전량 재생성 전에 '이 품질이면 되는지' 보기 위한 도구다.
인물 참조로 확정된 얼굴(얼굴후보_NN.png)과 표준인물.png 를 함께 넣는다.

쓰는 법
    python sop_scene_test.py --plan
    python sop_scene_test.py --run                 전부
    python sop_scene_test.py --run --only ladder   하나만
    python sop_scene_test.py --run --face 03       다른 얼굴로
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
FACE_DIR = os.path.join(WORK, "01 표준인물")
OUT_DIR = os.path.join(WORK, "02 장면 시험")

MODEL = "gemini-nano-banana-2.1"

# 모든 장면에 공통으로 붙는 규칙
STYLE = """## 고정 규칙 (모든 사진 공통)

**등장 인물** — 첨부한 얼굴 사진과 전신 사진의 **동일 인물**입니다.
- 얼굴 · 눈매 · 체형 · 피부톤을 그 사진 그대로 씁니다. 다른 사람이 되면 안 됩니다.
- 한국인 남성, 30대 중반, 단정한 짧은 머리, 수염 없음.
- 복장은 **흰색 Samkoo 안전모(턱끈 체결) + 남색 Samkoo 긴팔 폴로셔츠 +
  남색 작업바지 + 검정 안전화**로 고정합니다.

**화풍** — 실사 사진. 일러스트 · 3D · 만화풍 · 과장된 색감 금지.
실제 국내 건물 설비실에서 찍은 교육용 사진처럼 보여야 합니다.

**글자** — 안전모 앞면과 가슴에 들어가는 글자는 반드시 **`Samkoo`** 입니다.
S 는 대문자, 나머지는 소문자. 철자가 하나라도 다르면 안 됩니다.
또렷하게 읽히도록 정면에 가깝게, 번지거나 뭉개지지 않게 그립니다.
그 외의 글자는 화면에 넣지 마세요.

**금지**
- 손가락 · 팔 개수 이상, 얼굴 왜곡, 몸이 잘리거나 겹치는 것
- 화면에 글자 · 자막 · 워터마크를 넣지 마세요. 설비에 원래 있는 명판은 괜찮습니다.
- 보호구를 화면에 따로 늘어놓지 마세요. **사람이 착용한 상태**로만 나옵니다.
"""

SCENES = {
    "ladder": {
        "name": "사다리 작업 (고소작업)",
        "ppe": "안전모 · 안전화 · 안전장갑 · 안전대",
        "refs": ["유니폼.png", "안전모.png", "안전화.png", "안정장갑.png"],
        "scene": """## 이번 사진의 장면 — 사다리 작업

건물 지하 기계실 복도에서 **2인 1조**로 A형 사다리 작업을 하는 장면입니다.

- **주인공**은 A형 사다리의 **가로 디딤대(발판) 위에 양발을 모아 딛고** 서서
  천장 쪽 설비를 점검하고 있습니다. 사다리 **안쪽**을 향해 서 있으며,
  옆 기둥(레일)을 밟고 있지 않습니다.
- 딛고 선 위치는 **맨 위에서 세 번째 디딤대** 정도입니다. 최상단 두 단은
  비어 있습니다.
- **안전대(전신 안전벨트)를 착용**하고, 죔줄 고리를 **천장 슬래브에 고정된
  앵커 또는 케이블 트레이 지지 앵글** 같은 **견고한 구조물**에 걸었습니다.
  **덕트 · 배관 · 전선관에 걸지 마세요.** 그것은 체결 대상이 아닙니다.
- **보조자 한 명**이 사다리 아래에서 양손으로 사다리 기둥을 잡아
  균형을 유지합니다. 보조자는 바닥에 두 발을 딛고 서 있으며,
  사다리를 밟고 있지 않습니다. 같은 복장과 안전모를 착용했고,
  옆모습 또는 뒷모습이라 얼굴이 크게 보이지 않습니다.
- 두 사람 모두 **회색 안전장갑**을 끼고 있습니다.
- 배경은 콘크리트 벽과 천장 배관이 보이는 국내 건물 지하 기계실입니다.

전신이 보이는 구도로, 사다리 전체와 두 사람이 한 화면에 들어오게 찍습니다.
""",
    },
    "ahu": {
        "name": "공조기 일상 점검",
        "ppe": "안전모 · 안전화 · 보호장갑(일반 작업장갑) · 보안경",
        "refs": ["유니폼.png", "안전모.png", "안전화.png", "안정장갑.png"],
        "scene": """## 이번 사진의 장면 — 공조기 일상 점검

건물 공조실에서 대형 공조기(AHU)의 가동 상태를 점검하는 장면입니다.

- **주인공**이 공조기 본체 옆에 서서 **차압계(게이지)를 들여다보며** 확인하고
  있습니다. 한 손은 게이지 쪽을 가리키고 있습니다.
- **회색 일반 작업장갑**(첨부 `안정장갑.png` 와 같은 것)을 착용했습니다.
  **고무장갑 · 절연장갑이 아닙니다.** 이 작업은 충전부를 만지지 않는
  일상 점검이라 전기용 절연장갑이 필요 없습니다.
- **투명 보안경**을 썼습니다. **마스크는 착용하지 않습니다** — 이 작업은
  필터 교체가 아니라 일상 점검이라 호흡 보호구가 필요 없습니다.
- 공조기는 회색 패널로 된 대형 사각 유닛이며, 옆면에 점검구와 차압계가
  달려 있습니다. 상부에는 덕트가 연결되어 있습니다.
- 배경 한쪽에 회색 MCC 패널(배전반)이 보입니다.

상반신에서 무릎까지 들어오는 구도로, 공조기와 사람이 함께 보이게 찍습니다.
""",
    },
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


def refs_for(scene, face):
    """인물 참조(얼굴 + 전신)를 먼저, 그 다음 물체 참조."""
    from PIL import Image
    want = [os.path.join(FACE_DIR, "얼굴후보_%s.png" % face),
            os.path.join(REF_DIR, "표준인물.png")]
    want += [os.path.join(REF_DIR, n) for n in scene["refs"]]
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
    ap.add_argument("--run", action="store_true", help="실제 생성 (유료)")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--only", help="장면 하나만 (ladder / ahu)")
    ap.add_argument("--face", default="01", help="쓸 얼굴 번호")
    ap.add_argument("--model", default=MODEL)
    a = ap.parse_args()

    할것 = [(k, v) for k, v in SCENES.items()
           if not a.only or k == a.only]
    print("모델 : %s" % a.model)
    print("얼굴 : 얼굴후보_%s.png" % a.face)
    print("장면 : %s" % ", ".join(v["name"] for _k, v in 할것))
    print("예상 비용 : 약 $%.2f" % (len(할것) * 0.05))
    print("저장 : %s" % OUT_DIR)
    if not a.run:
        print("\n(계획만 봤습니다. 실제로 만들려면 --run)")
        return

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=load_key())
    os.makedirs(OUT_DIR, exist_ok=True)
    print()

    for key, sc in 할것:
        name = "장면_%s_얼굴%s.png" % (key, a.face)
        path = os.path.join(OUT_DIR, name)
        ref_imgs, 쓴것 = refs_for(sc, a.face)
        prompt = "\n".join([STYLE, sc["scene"],
                            "## 착용 보호구\n%s" % sc["ppe"]])
        print("  %s" % sc["name"])
        print("    참조 %d장 : %s" % (len(ref_imgs), ", ".join(쓴것)))
        try:
            res = client.models.generate_content(
                model=a.model,
                contents=[prompt] + ref_imgs,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="3:2",
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
                print("    실패 — 그림을 받지 못함")
                continue
            with open(path, "wb") as f:
                f.write(데이터)
            print("    완료 : %s (%.0f KB)" % (name, os.path.getsize(path) / 1024))
        except Exception as e:
            print("    실패 — %s" % str(e)[:90])

    print("\n폴더 : %s" % OUT_DIR)


if __name__ == "__main__":
    main()
