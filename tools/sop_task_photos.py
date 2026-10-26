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

MODEL = "gemini-3-pro-image"      # 안전모 글자가 정확. 장당 약 190원
SAVER = "gemini-nano-banana-2.1"  # 글자가 깨짐. 장당 약 48원

# --mix 일 때 Pro 를 쓰는 장면.
# 사람이 크게 나와 안전모 · 가슴 로고 글자가 읽히는 장면만 고른다.
프로장면 = {
    "c02": {1, 3, 4, 8, 11},
    "m06": {1, 3, 4, 8, 10},
}
TASK = "c02"          # --task 로 바꾼다

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
- 남색 긴팔 폴로셔츠(왼쪽 가슴에 같은 로고), 남색 작업바지, {장갑}.
- 신발은 **검정색 안전화**입니다. 첨부 안전화 사진과 같은 것이며,
  베이지 · 갈색 워크부츠나 운동화가 아닙니다.

{설비}
## 밝기 (중요)
- **밝고 또렷한 사진**입니다. 어둡거나 그늘지면 안 됩니다.
- 천장의 형광등 · LED 등기구가 켜져 있어 바닥과 벽이 **고르게 밝습니다.**
- 사람의 얼굴과 보호구에 그림자가 지지 않습니다.
- 영화 같은 어두운 분위기, 역광, 강한 명암 대비를 만들지 마세요.
  교육자료이므로 **무엇을 하고 있는지 한눈에 보이는 것**이 가장 중요합니다.

## 배경 — 국내 건물 설비실의 실제 모습
- 흰색 또는 밝은 회색으로 칠한 콘크리트 벽, **밝은 회색 또는 녹색
  에폭시 바닥**. 어두운 콘크리트 날것 그대로가 아닙니다.
- 천장에 보온재를 감은 배관, 케이블 트레이, 스프링클러 배관이 지나갑니다.
- 설비는 **한국 건물에서 실제로 쓰는 형태**여야 합니다.
  상상해서 만든 기계나 외국 공장 설비를 넣지 마세요.
- 배경의 설비가 무엇인지 모르겠으면 **단순한 벽과 배관만** 두세요.
  그럴듯해 보이는 가짜 계기판을 만들어 넣는 것보다 낫습니다.

## 화풍
- 실사 사진. 일러스트 · 3D · 만화풍 금지.
- 손가락 · 팔 개수 이상, 얼굴 왜곡 금지.
- **화면에 글자나 자막을 넣지 마세요.** 설비에 원래 붙어 있는 명판은 괜찮습니다.
  읽을 수 없는 가짜 글자를 명판에 채워 넣지 마세요.
"""

설비설명 = {
    "c02": """## 사다리
- 알루미늄 **A형 사다리**. 네 다리를 완전히 펴고 바닥에 세웠습니다.
- 발판은 가로로 놓인 넓은 디딤판이고, 아래쪽 다리 끝에 검은 고무발이 있습니다.
""",
    "m06": """## 냉동기실 설비 (국내 건물에서 실제로 쓰는 모습)
- **흡수식 냉동기** : 가로로 길게 누운 커다란 원통형 본체.
  밝은 회색 또는 연한 하늘색으로 도장돼 있고, 옆면에 은색 보온재를 감은
  굵은 배관이 여러 줄 붙어 있습니다. 앞면에 둥근 압력계와 점검구가 있습니다.
- **고온재생기** : 본체 한쪽 끝의 두꺼운 보온재로 감싼 부분. 뜨겁습니다.
- **MCC 판넬** : 벽면에 세워진 밝은 회색 철제 배전반. 앞면에 작은 표시등과
  셀렉터 스위치, 전류계가 달려 있습니다. 문은 닫혀 있습니다.
- **배관** : 냉수와 냉각수 배관. 굵고 보온재를 감았으며 바닥 가까이와
  천장을 따라 지나갑니다. 중간에 나비밸브와 압력계가 붙어 있습니다.
- 상상해서 만든 기계나 외국 공장 설비를 넣지 마세요.
""",
}

장갑설명 = {
    "c02": "회색 작업장갑",
    "m06": "두꺼운 회색 내열장갑",
}

# 번호 → (장면, 두 사람인가, 가로세로)
SCENES_ALL = {"m06": {
    1: ("주인공이 냉동기 앞에서 **내열장갑을 양손에 끼며** 보호구를 갖추고 "
        "있습니다. 허리춤에 귀마개를 걸었습니다. 상반신 위주로 크게 잡습니다.",
        False, "3:2"),
    2: ("주인공이 냉동기 본체 앞에서 점검하고, **보조자는 벽면 MCC 판넬 옆에 "
        "서서 지켜보고** 있습니다. 두 사람 사이가 떨어져 있어 둘 다 보입니다.",
        True, "3:2"),
    3: ("주인공이 **손에 든 점검 일지에 무언가를 적으며** 무전기로 통보하는 "
        "모습입니다. 뒤로 냉동기 본체가 보입니다.", False, "3:2"),
    4: ("주인공과 보조자가 냉동기 앞에서 **마주 서서 작업 전 회의**를 하고 "
        "있습니다. 주인공이 손으로 냉동기 쪽을 가리키며 설명합니다.",
        True, "3:2"),
    5: ("주인공이 **배관에 달린 자동밸브의 개폐 표시를 들여다보며** 확인하고 "
        "있습니다. 밸브 위에 네모난 전동 액추에이터가 올라앉아 있고, "
        "옆구리에 열림·닫힘을 가리키는 표시가 있습니다. "
        "밸브와 배관이 화면에서 크게 보입니다.", False, "3:2"),
    6: ("주인공이 **MCC 판넬 앞에 서서 표시등과 전류계를 들여다보며** "
        "확인하고 있습니다. 판넬 문은 닫혀 있고 손은 조작부에 대지 않았습니다.",
        False, "3:2"),
    7: ("주인공이 **냉동기 앞면의 둥근 압력계를 손가락으로 짚으며** 눈금을 "
        "읽고 있습니다. 압력계가 크게 보입니다.", False, "3:2"),
    8: ("주인공이 냉동기에서 **두세 걸음 떨어져 서서 손목시계를 보며 기다리고** "
        "있습니다. 설비에 손을 대지 않고 팔을 내린 자세입니다. "
        "뒤로 고온재생기와 배관이 보입니다.", False, "3:2"),
    9: ("보조자가 **MCC 판넬 앞을 지키고 서서** 다른 사람이 손대지 못하게 "
        "감시하고 있습니다. 판넬에 『작업중』 명판이 걸려 있습니다. "
        "보조자가 화면 앞쪽에 크게 보입니다.", True, "3:2"),
    10: ("주인공이 **닫힌 MCC 판넬 문 앞에서 두 손을 몸 쪽으로 모으고** "
         "들여다보기만 하는 모습입니다. 단자대를 만지지 않습니다.",
         False, "3:2"),
    11: ("주인공이 **고온재생기에서 한 걸음 떨어져 손을 뻗지 않고** 상태를 "
         "살펴보고 있습니다. 보온재로 감싼 부분이 또렷하게 보입니다.",
         False, "3:2"),
    12: ("주인공이 **MCC 판넬 문을 닫고 잠금 손잡이를 돌려** 마무리하고 "
         "있습니다. 바닥은 깨끗하게 정리돼 있습니다.", False, "3:2"),
}, "c02": {
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
         "**천장 가까이 지나가는 배관의 보온재 이음매**를 두 손으로 다루고 "
         "있습니다. 어깨가 사다리와 나란하고 몸이 비틀리지 않았습니다. "
         "보조자가 아래에서 잡아 줍니다. "
         "**배전반이나 계기판을 넣지 마세요** — 실제와 다른 모양이 되기 쉽습니다.",
         True, "3:2"),
    11: ("보조자가 **사다리 아래에서 양손으로 기둥을 잡고 위를 올려다보며** "
         "지켜보고 있습니다. 보조자가 화면 앞쪽에 크게, 사다리 위 주인공은 "
         "뒤쪽에 보입니다.", True, "3:2"),
    12: ("주인공이 **접은 사다리를 벽면 보관 자리에 세워 정리**하고 있습니다. "
         "통로는 비어 있고 바닥이 깨끗합니다. 전신이 보이는 구도.", False, "3:2"),
}}
SCENES = SCENES_ALL["c02"]


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


def task(tid):
    s = io.open(DATA, encoding="utf-8").read()
    m = re.search(r"window\.TASKS = (\{.*\});\s*$", s, re.S)
    return json.loads(m.group(1))[tid]


def 저장(데이터, path, 가로=1600):
    """받은 그림을 가로 1600px JPEG 로 줄여 저장한다."""
    import io as _io
    from PIL import Image
    im = Image.open(_io.BytesIO(데이터)).convert("RGB")
    w, h = im.size
    if w > 가로:
        im = im.resize((가로, round(h * 가로 / w)), Image.LANCZOS)
    im.save(path, "JPEG", quality=86, optimize=True, progressive=True)


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
    ap.add_argument("--saver", default=SAVER)
    ap.add_argument("--mix", action="store_true",
                    help="사람이 크게 나오는 장면만 Pro, 나머지는 싼 모델")
    ap.add_argument("--task", default=TASK, help="작업 id (예: m06)")
    a = ap.parse_args()

    t = task(a.task)
    장면표 = SCENES_ALL.get(a.task) or {}
    설비 = 설비설명.get(a.task, "")
    장갑 = 장갑설명.get(a.task, "회색 작업장갑")
    items = [(it, sec["title"]) for sec in t["guide"] for it in sec["items"]]
    if a.only:
        want = {int(x) for x in a.only.split(",")}
        items = [x for x in items if x[0]["n"] in want]

    프로 = 프로장면.get(a.task, set()) if a.mix else None

    def 고른모델(n):
        """(모델, 장당 비용). --mix 가 아니면 전부 Pro."""
        if 프로 is None:
            return a.model, 190
        return (a.model, 190) if n in 프로 else (a.saver, 48)

    돈 = sum(고른모델(it["n"])[1] for it, _ in items)
    print("작업 : %s (%s)" % (t["name"], a.task))
    if a.mix:
        비싼 = ",".join(str(it["n"]) for it, _ in items if it["n"] in 프로)
        print("모델 : 섞어 쓰기 — Pro %s번 / 나머지 %s" % (비싼, a.saver))
    else:
        print("모델 : %s" % a.model)
    print("만들 사진 : %d장  (약 %d원)" % (len(items), 돈))
    print("저장 : %s" % OUT_DIR)
    if not a.run:
        for it, _ in items:
            어떤, 값 = 고른모델(it["n"])
            print("  %2d. %-18s %-22s %4d원"
                  % (it["n"], it["name"][:18], 어떤, 값))
        print("\n(계획만 봤습니다. 실제로 만들려면 --run)")
        return

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=load_key())
    print()
    됨, 실패 = 0, []
    for it, sec in items:
        n = it["n"]
        장면, two, 비율 = 장면표.get(n, ("", False, "3:2"))
        if not 장면:
            continue
        ref_imgs, got = refs(two)
        인원 = ("## 등장 인원 : **두 사람**. 주인공 1명 + 보조자 1명."
              " 세 번째 사람을 넣지 마세요."
              if two else
              "## 등장 인원 : **한 사람**. 주인공 혼자입니다."
              " 다른 사람을 넣지 마세요.")
        글 = "\n".join([
            STYLE.format(설비=설비, 장갑=장갑),
            인원,
            "",
            "## 이번 사진의 장면",
            장면,
            "",
            "## 이 장면이 가르치려는 것",
            "제목 : %s" % it["name"],
            "\n".join("- " + b for b in it.get("bullets") or []),
        ])
        # 사이트에 올릴 파일은 가볍게. 원본 PNG 는 2.5MB 라 현장에서 안 열린다.
        이름 = os.path.splitext(it["img"] or "%s_g%02d" % (a.task, n))[0] + ".jpg"
        path = os.path.join(OUT_DIR, 이름)
        try:
            쓸모델, _ = 고른모델(n)
            크기 = "2K" if 쓸모델 == a.model else "1K"
            res = client.models.generate_content(
                model=쓸모델, contents=[글] + ref_imgs,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio=비율,
                                                   image_size=크기),
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
            저장(데이터, path)
            print("  %2d. %-18s 완료 %-16s %-22s (참조 %d장)"
                  % (n, it["name"][:18], 이름, 쓸모델, len(ref_imgs)))
            됨 += 1
        except Exception as e:
            실패.append((n, str(e)[:70]))
            print("  %2d. %-20s 실패 %s" % (n, it["name"][:20], str(e)[:50]))

    print("\n만든 것 %d장 / 실패 %d장" % (됨, len(실패)))
    for n, why in 실패:
        print("   %d : %s" % (n, why))


if __name__ == "__main__":
    main()
