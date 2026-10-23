# -*- coding: utf-8 -*-
"""한 작업의 교육자료 사진을 캐릭터 시트를 참조로 한 번에 만든다.

메인(주인공)과 서브(보조자)의 기준 사진을 함께 넣으므로 사람이 바뀌지 않는다.
장면 설명은 data.js 에 적힌 그 작업의 실제 문구에서 만든다.

쓰는 법
    python sop_task_photos.py --plan
    python sop_task_photos.py --run
    python sop_task_photos.py --run --only 3,7
"""
import argparse
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SOP = (r"C:\Users\user\Desktop\Bio Innovation Hub\01 Projects"
       r"\[안전] 표준운영절차 SOP")
REF_DIR = os.path.join(SOP, "7차 작업", "04 참조 이미지")
SITE = os.path.join(ROOT, "sop-new")
DATA = os.path.join(SITE, "assets", "data.js")
OUT_DIR = os.path.join(SITE, "assets", "img")

MODEL = "gemini-3-pro-image"
TASK = "c02"

메인 = ["표준인물_메인_01_정면.png", "표준인물_메인_02_좌34.png",
       "표준인물_메인_05_전신.png"]
서브 = ["표준인물_서브_01_정면.png", "표준인물_서브_03_전신.png"]
물체 = ["안전모_로고.png", "유니폼.png", "안전화.png", "안정장갑.png"]

STYLE = """실제 국내 건물 지하 기계실에서 찍은 **안전 교육용 사진**입니다.

## 사람 (인원 수를 반드시 지키세요)
- **주인공(관리자)** : 첨부한 '메인' 기준 사진의 **그 사람**. 얼굴 · 체형 그대로.
- **보조자** : 첨부한 '서브' 기준 사진의 **그 사람**. 주인공과 **다른 사람**입니다.
- 둘 다 한국인 남성. **마스크 · 안경 없음.**
- 아래 '등장 인원' 에 적힌 수만 나옵니다. 배경에 지나가거나 구경하는
  사람도 넣지 않습니다.

## 복장 (두 사람 모두 똑같이)
- 흰색 안전모, 턱끈을 턱 아래에 제대로 체결.
  안전모 앞면에 진회색 `Samkoo` 글자와 그 오른쪽 위 녹색 민들레 심볼.
- 남색 긴팔 폴로셔츠(왼쪽 가슴에 같은 로고), 남색 작업바지, 회색 작업장갑.
- 신발은 **검정색 안전화**입니다. 첨부 안전화 사진과 같은 것이며,
  베이지 · 갈색 워크부츠나 운동화가 아닙니다.

## 사다리
- 알루미늄 **A형 사다리**. 네 다리를 완전히 펴고 바닥에 세웠습니다.
- 발판은 가로로 놓인 넓은 디딤판이고, 아래쪽 다리 끝에 검은 고무발이 있습니다.

## 화풍
- 실사 사진. 일러스트 · 3D · 만화풍 금지.
- 콘크리트 벽과 천장 배관이 보이는 지하 기계실. 조명은 고르게.
- 손가락 · 팔 개수 이상, 얼굴 왜곡 금지.
- **화면에 글자나 자막을 넣지 마세요.** 설비에 원래 붙어 있는 명판은 괜찮습니다.
"""

# 번호 → (장면, 두 사람인가, 가로세로)
SCENES = {
    1: ("주인공이 사다리 앞에 서서 **안전모 턱끈을 양손으로 조이고** 있습니다. "
        "안전대(전신 안전벨트)를 이미 착용했고 고리가 허리 옆에 걸려 있습니다. "
        "상반신 위주로 크게 잡습니다.", False, "3:2"),
    2: ("주인공이 사다리 세 번째 발판에 올라서 있고, **보조자가 바닥에 서서 "
        "양손으로 사다리 기둥을 잡고** 있습니다. 보조자는 주인공을 올려다봅니다. "
        "두 사람과 사다리 전체가 한 화면에 들어옵니다.", True, "3:2"),
    3: ("주인공이 **사다리 기둥에 붙은 인증 라벨을 손가락으로 짚으며** 들여다보고 "
        "있습니다. 사다리는 접힌 채 벽에 기대어 세워져 있습니다. "
        "상반신과 라벨 부분이 크게 보입니다.", False, "3:2"),
    4: ("주인공이 **무릎을 굽히고 앉아 사다리 아래쪽 고무발과 기둥을 손으로 만지며** "
        "살펴보고 있습니다. 사다리는 바닥에 눕혀 놓았습니다.", False, "3:2"),
    5: ("주인공이 **평평한 콘크리트 바닥을 손바닥으로 짚어 보며** 사다리를 세울 "
        "자리를 고르고 있습니다. 옆에 접힌 사다리를 세워 두었습니다. "
        "바닥과 사람이 함께 보이는 구도.", False, "3:2"),
    6: ("주인공이 **무릎을 굽히고 사다리 전도방지대(아웃트리거)를 옆으로 펴고** "
        "있습니다. 펼쳐진 전도방지대 다리가 또렷하게 보입니다.", False, "3:2"),
    7: ("주인공이 벽에 기대 세운 **일자형 사다리의 기대는 각도를 확인**하고 "
        "있습니다. 한 손으로 기둥을 잡고 아래쪽 고무발이 바닥에 닿은 부분을 "
        "내려다봅니다. 사다리 전체 기울기가 보이는 옆쪽 구도.", False, "3:2"),
    8: ("주인공이 **A형 사다리를 올라가는 중**입니다. 양손으로 위쪽 발판을 "
        "잡고 한 발을 올려 디디고 있어 **세 곳이 사다리에 닿아** 있습니다. "
        "바닥에는 공구주머니가 놓여 있습니다. 보조자가 아래에서 잡아 줍니다.",
        True, "3:2"),
    9: ("주인공이 **A형 사다리의 중간 발판에 두 발을 모아 딛고** 서서 천장 쪽 "
        "배관을 점검하고 있습니다. 안전대 고리를 천장 구조물에 걸었습니다. "
        "**맨 위 발판 세 단은 비어** 있습니다. 보조자가 아래에서 잡아 줍니다.",
        True, "3:2"),
    10: ("주인공이 사다리 발판에 서서 **사다리를 정면으로 마주본 자세**로 바로 앞 "
         "벽면 설비를 다루고 있습니다. 어깨가 사다리와 나란하고 몸이 비틀리지 "
         "않았습니다. 보조자가 아래에서 잡아 줍니다.", True, "3:2"),
    11: ("보조자가 **사다리 아래에서 양손으로 기둥을 잡고 위를 올려다보며** "
         "지켜보고 있습니다. 보조자가 화면 앞쪽에 크게, 사다리 위 주인공은 "
         "뒤쪽에 보입니다.", True, "3:2"),
    12: ("주인공이 **접은 사다리를 벽면 보관 자리에 세워 정리**하고 있습니다. "
         "통로는 비어 있고 바닥이 깨끗합니다. 전신이 보이는 구도.", False, "3:2"),
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


def task():
    s = io.open(DATA, encoding="utf-8").read()
    m = re.search(r"window\.TASKS = (\{.*\});\s*$", s, re.S)
    return json.loads(m.group(1))[TASK]


def refs(two):
    from PIL import Image
    names = list(메인) + (list(서브) if two else []) + list(물체)
    out, got = [], []
    for n in names:
        p = os.path.join(REF_DIR, n)
        if os.path.exists(p):
            out.append(Image.open(p).convert("RGB"))
            got.append(n)
    return out, got


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--only", help="번호 (예: 3,7)")
    ap.add_argument("--model", default=MODEL)
    a = ap.parse_args()

    t = task()
    items = [(it, sec["title"]) for sec in t["guide"] for it in sec["items"]]
    if a.only:
        want = {int(x) for x in a.only.split(",")}
        items = [x for x in items if x[0]["n"] in want]

    print("작업 : %s" % t["name"])
    print("모델 : %s" % a.model)
    print("만들 사진 : %d장  (약 %d원)" % (len(items), len(items) * 190))
    print("저장 : %s" % OUT_DIR)
    if not a.run:
        for it, _ in items:
            print("  %2d. %s" % (it["n"], it["name"]))
        print("\n(계획만 봤습니다. 실제로 만들려면 --run)")
        return

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=load_key())
    print()
    됨, 실패 = 0, []
    for it, sec in items:
        n = it["n"]
        장면, two, 비율 = SCENES.get(n, ("", False, "3:2"))
        if not 장면:
            continue
        ref_imgs, got = refs(two)
        인원 = ("## 등장 인원 : **두 사람**. 주인공 1명 + 보조자 1명."
              " 세 번째 사람을 넣지 마세요."
              if two else
              "## 등장 인원 : **한 사람**. 주인공 혼자입니다."
              " 다른 사람을 넣지 마세요.")
        글 = "\n".join([
            STYLE,
            인원,
            "",
            "## 이번 사진의 장면",
            장면,
            "",
            "## 이 장면이 가르치려는 것",
            "제목 : %s" % it["name"],
            "\n".join("- " + b for b in it.get("bullets") or []),
        ])
        path = os.path.join(OUT_DIR, it["img"])
        try:
            res = client.models.generate_content(
                model=a.model, contents=[글] + ref_imgs,
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
                실패.append((n, "그림 없음"))
                print("  %2d. %-20s 실패 (그림 없음)" % (n, it["name"][:20]))
                continue
            with open(path, "wb") as f:
                f.write(데이터)
            print("  %2d. %-20s 완료 %s (참조 %d장)"
                  % (n, it["name"][:20], it["img"], len(ref_imgs)))
            됨 += 1
        except Exception as e:
            실패.append((n, str(e)[:70]))
            print("  %2d. %-20s 실패 %s" % (n, it["name"][:20], str(e)[:50]))

    print("\n만든 것 %d장 / 실패 %d장" % (됨, len(실패)))
    for n, why in 실패:
        print("   %d : %s" % (n, why))


if __name__ == "__main__":
    main()
