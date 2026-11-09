# -*- coding: utf-8 -*-
"""
안전 SOP 교육자료 사진을 '누가 만들어도 같게' 만들기 위한 프롬프트를 뽑는다.

왜 만드나
  지금은 작업자마다 시스템 지침을 각자 다시 쓰고, 작업 내용도 PPT 를 보며
  손으로 옮겨 적는다. 그래서 사람 수만큼 결과가 갈린다.
  작업 내용은 이미 data.js 에 다 들어 있으므로, 프롬프트는 쓰는 게 아니라
  뽑으면 된다. 사람은 복사해서 붙여넣기만 한다.

구성
  · 스타일 카드  — 캐릭터 · 복장 · 화풍 · 금지사항 · 출력규격. 여기만 고치면
                   전원에게 동시에 반영된다. 작업자는 손대지 않는다.
  · 장면 설명    — data.js 에서 그 작업 / 그 조치의 실제 문구를 그대로 가져온다.
  · 파일명       — 웹이 그대로 집어가는 이름을 프롬프트에 박아 둔다.

사용법
  python tools/sop_image_prompts.py --sample e01 2      # 견본 1장만 보기
  python tools/sop_image_prompts.py --task e01          # 한 작업 14장
  python tools/sop_image_prompts.py --all               # 전체 (부문별 파일로)
  python tools/sop_image_prompts.py --all --only-small  # 해상도 미달인 것만
"""

import argparse
import io
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
SITE = os.path.join(HOME, "Desktop", "Bio Innovation Hub", "01 Projects",
                    "[안전] 표준운영절차 SOP", "웹 배포", "안전SOP_웹사이트")
OUT = os.path.join(HOME, "Desktop", "Bio Innovation Hub", "01 Projects",
                   "[안전] 표준운영절차 SOP", "사진 생성 프롬프트")
REF = os.path.join(HOME, "Desktop", "Bio Innovation Hub", "01 Projects",
                   "[안전] 표준운영절차 SOP", "4차 수정", "캐릭터 생성용 사진")

# 쓰임새별 비율과 최소 해상도 — 웹 표시폭 × 3배(고해상도 화면) 기준
SPEC = {
    "fig":  ("가로 3:2", 2048, "본문 그림 (각부 명칭 페이지 대표 사진)"),
    "gfig": ("세로 4:3", 1536, "중앙 장비 상세설명도"),
    "g":    ("정사각 1:1", 1024, "조치 사진 (교육자료 12개 항목)"),
}

# 새로 만들 때의 목표 규격은 SPEC, '다시 만들어야 하나' 판단은 이 값으로 한다.
# 웹에서 실제 표시되는 폭 x 3 (고해상도 화면). 이 아래면 눈에 흐리게 보인다.
DISPLAY_MIN = {"fig": 1600, "gfig": 1060, "g": 340}

# 표준인물이 맨 앞 — 이 사진이 인물과 복장의 기준이다.
REF_FILES = ["표준인물.png", "유니폼.png", "안전모.png", "안전화.png",
             "안정장갑.png", "마스크-.png", "Samkoo.png"]
# 작업에 따라 바꿔 쓰는 참조(필요할 때만 첨부) : 가죽장갑.png, 고무장갑.png

STYLE = """## 고정 규칙 — 모든 사진에 똑같이 적용합니다 (고치지 마세요)

**표준 캐릭터 — 첨부 `표준인물.png` 의 그 사람으로 고정합니다**
- 모든 사진의 등장 인물은 **첨부한 `표준인물.png` 와 동일 인물**입니다.
  이 인물을 **'관리자'** 라고 부릅니다.
- 얼굴 · 체형 · 마스크 · 안전모 · 유니폼 · 장갑 · 안전화를 **그 사진 그대로** 씁니다.
  **다른 사람으로 바꾸거나 옷을 다르게 그리지 마세요.**
- 마스크는 **항상 착용**합니다. 얼굴은 가려져도 됩니다 — 이 자료에서 중요한 것은
  얼굴이 아니라 **복장과 보호구가 매번 똑같은 것**입니다.

**표준 장비 세트** — 첨부 사진의 **색상 · 디자인 · 로고 위치 · 소재 느낌**을 그대로 따릅니다

> 첨부한 장비 사진들은 **제품이 어떻게 생겼는지 알려주는 참고용**입니다.
> **그 물건을 화면에 따로 놓지 마세요.** 안전모 · 안전화 · 장갑 · 마스크는
> 반드시 **사람이 착용한 상태로만** 나타납니다. 바닥이나 선반에 놓인
> 신발 · 장갑 · 안전모가 사진에 보이면 안 됩니다.

- 안전모 : 흰색. **앞면에 회사 로고**가 있습니다.
- 유니폼 : **남색** 긴팔 카라티. **가슴 왼쪽에 회사 로고**가 프린팅되어 있습니다.
- 안전화 : 첨부 `안전화.png` 와 같은 제품. **신고 있는 상태로만.**
- 안전장갑 : 첨부 `안정장갑.png`
- 마스크 : 첨부 `마스크-.png`

**회사 로고 — 첨부 `표준인물.png` 에 있는 것을 그대로 옮겨 그리세요**
- 로고는 **녹색 민들레(홀씨) 모양 심볼 + 그 왼쪽에 회색 "Samkoo" 글자**입니다.
- 첨부 `표준인물.png` 의 **안전모 앞면 로고와 가슴 왼쪽 로고를 그대로** 쓰세요.
  모양 · 색 · 크기 · 위치를 바꾸지 마세요.
- **파란색으로 그리지 마세요.** 심볼은 녹색, 글자는 회색입니다.
- 로고를 새로 디자인하거나 다른 글자를 넣지 마세요. 로고 **외의 글자는 금지**입니다.
- 아래 '이 장면'에 적힌 **필수 보호구는 반드시 착용한 상태**로 그립니다.
  (작업에 따라 절연장갑 · 형광조끼 · 무전기 등이 추가됩니다)
- 필수 보호구에 **방진마스크 · 방독마스크처럼 특정 마스크가 지정돼 있으면 그것을** 씁니다.
  지정이 없으면 위 기본 마스크를 씁니다.

**구도 — 이게 가장 중요합니다**
- **작업자가 그 조치를 실제로 하고 있는 순간**을 찍습니다. 설명하거나 가리키는 자세 금지.
- 설비를 **만지는 조치**(점검 · 측정 · 조작 · 교체)이면 **손이 설비에 닿아 있어야** 합니다.
- 설비를 만지지 않는 **준비 동작**(보호구 착용, 통보, 표지 설치, 2인 1조 협의 등)이면
  **설비 앞에 억지로 세우지 마세요.** 그 동작이 실제로 일어나는 자리에서 찍습니다.
  (예: 보호구 착용은 전기실 입구나 작업 준비 공간)
- **사람은 한 명**입니다. 2인 1조 · 감시 · 신호처럼 둘이 필요한 조치일 때만 두 명.
- **설비가 화면의 절반 가까이** 차지해야 합니다. 작업자와 설비가 바짝 붙어 있어야 합니다.
- **가까이서 찍습니다.** 전신이 다 나오는 사진은 안 됩니다. 무릎 위 정도까지,
  설비의 세부(밸브 · 단자 · 나사산 · 표시창)가 보일 만큼 가깝게.
- 작업자는 **카메라를 보지 않고 작업에 집중**합니다. 옆모습이나 비스듬한 각도.
- 카메라 높이는 **그 설비 높이에 맞춥니다.** 낮은 설비면 낮춰서 찍습니다.
- 배경은 **단순한 벽이나 복도**. 현장 전경을 넓게 담지 마세요 — 설비가 작아집니다.

**화풍 — 2020년대 지금 찍은 사진이어야 합니다**
- 실사 사진입니다. 일러스트 · 3D 렌더링 · 만화풍 금지.
- **미러리스 카메라로 오늘 찍은 듯 선명하고 깨끗하게.** 색이 누렇거나 빛바랜 느낌,
  2000년대 교재 사진 같은 분위기는 **절대 금지**입니다.
- 현장과 설비는 **최근에 지어진 깨끗하고 정돈된 상태**로. 녹슬고 낡은 설비 금지.
- 조명은 그 장소의 실내 조명 그대로. 밝고 고르게, 그림자가 짙게 지지 않도록.
- 색은 자연스럽고 선명하게. 채도를 죽이거나 세피아 · 빈티지 보정 금지.
- 설비와 인물 **둘 다 또렷하게**. 설비를 흐리게 날리지 마세요.

**글씨 — 위에 적은 회사 로고 말고는 글자를 한 글자도 넣지 마세요**
- 설명 문구 · 번호 · 화살표 · 워터마크 · 간판 · 상호 · 라벨 **전부 금지**입니다.
- **안전모와 가슴의 회사 로고만 예외**입니다. 그 외에는 한글이든 영어든
  **글자를 그리려 하지 마세요.** 글자는 반드시 깨져서 나옵니다.
- 표지판이나 계기판이 화면에 들어올 수밖에 없으면 **글자 없는 빈 판**으로 두거나,
  읽히지 않게 흐리게 처리하세요.
- 번호는 나중에 웹에서 따로 얹습니다. 사진에 넣지 마세요.
- Samkoo 로고는 **안전모와 가슴에만** 있습니다. 배경 벽이나 간판에 넣지 마세요.

**절대 하지 말 것**
- 보호구 미착용, 안전대 미체결 같은 **잘못된 안전 행동** 묘사 금지
  — 교육자료라 그대로 배웁니다
- 과장된 표정 · 연출된 포즈 · 엄지척 금지
- 손가락 개수 · 공구 형태가 어긋나지 않게 주의

**출력 규격**
- 비율 **%(ratio)s**, 짧은 변 **%(minpx)dpx 이상**
- 배경을 자르지 말고 꽉 채워서 한 장으로
"""

FIRST = """# [0단계] 표준 인물 만들기 — 맨 처음 한 번만 합니다

아래 이미지를 첨부하고 이 글을 그대로 넣어 주세요.

> 첨부 : %s

---

당신은 산업 및 시설 안전교육 전문 시각 자료 제작자입니다.
앞으로 여러 편의 안전 교육 사진을 만들 텐데, 모든 사진에 **같은 인물**이 등장하고
사용자가 제공한 **실제 안전 용품**을 착용해야 합니다.

**표준 장비 세트** — 첨부 사진의 색상 · 디자인 · 로고 위치 · 소재 느낌을 정확히 파악해 주세요.

- 안전모 : 첨부 `안전모.png`. **안전모에 회사 로고(Samkoo)가 보이도록** 해 주세요
  (`안전모.png` 와 `Samkoo.png` 를 합성)
- 유니폼 : 첨부 `유니폼.png` — **남색** 긴팔 카라티입니다.
  (참조 사진은 조명 때문에 회색으로 보이지만 실물은 남색입니다)
  **가슴 왼쪽에 Samkoo 로고**가 프린팅되어 있습니다
- 안전장갑 : 첨부 `안정장갑.png`
- 안전화 : 첨부 `안전화.png`

**표준 캐릭터** — 이 시리즈의 주인공은 **'안전 관리자'**(남성, 30대 중반, 한국인,
신뢰감 있는 인상, 짧고 단정한 머리)이며, 매 사진마다 위 표준 장비 세트를 정확하게
착용하고 등장합니다.

이 인물의 **전신 또는 상반신**이 명확히 보이는 '표준 프로필 이미지'를 먼저 한 장
만들어 주세요. 실사 사진, 글자 · 워터마크 없음, 정사각형 1:1, 1024px 이상.

이 인물을 **"표준 안전 관리자(이하 '관리자')"** 로 지칭하고, 이후 모든 사진에
이 인물을 사용합니다. 나온 사진을 **`표준인물.png`** 로 저장해 두시고,
앞으로 모든 장면에서 같이 첨부해 주세요.
"""


ONESHOT_HEAD = """# [1] 대화 시작 — 이것만 복사해서 넣으세요

ChatGPT · Gemini 어느 쪽이든 그대로 됩니다.

> **Gemini 로 새로 시작하시는 경우** — `02_표준인물_고치기` 는 건너뛰세요.
> 아래 규칙에 유니폼 색과 배경 간판 수정이 이미 들어가 있어서, 처음부터 제대로 나옵니다.

## 1. 먼저 아래 그림 7장을 끌어다 붙이세요

폴더를 주소창에 붙여넣으면 바로 열립니다 :

```
%s
```

첨부할 파일 : %s

## 2. 아래 선 안쪽을 전부 복사해서 붙여넣으세요

---
"""

ONESHOT_BODY = """당신은 산업 및 시설 안전교육 전문 시각 자료 제작자입니다.
지금부터 이 대화에서 안전 교육용 사진을 여러 장 만들 겁니다. 아래 규칙은
**이 대화 내내 모든 사진에 그대로 적용**됩니다. 제가 다시 말하지 않아도 계속 지키세요.

%s

---

여기까지가 규칙입니다. **지금은 사진을 만들지 마세요.**

이어서 제가 "## 이 장면" 설명을 하나씩 드리겠습니다.
그때마다 위 규칙과 첨부한 `표준인물.png` 의 인물을 그대로 유지한 채
**사진을 한 장씩** 만들어 주세요.

설명마다 저장할 파일 이름을 적어 드리니, 그 이름으로 내려받을 수 있게 해 주세요.

준비됐으면 "준비됐습니다" 라고만 답해 주세요.
"""


def oneshot():
    """ChatGPT 대화 하나를 통째로 세팅하는 복붙 블록."""
    style = STYLE.replace("%(ratio)s", "정사각 1:1").replace("%(minpx)dpx", "1024px")
    style = style.split("**출력 규격**")[0].rstrip()
    ref_dir = os.path.join(OUT, "참조 이미지")
    return (ONESHOT_HEAD % (ref_dir, " , ".join(REF_FILES))
            + ONESHOT_BODY % style + "\n---\n")


def load():
    """data.js 를 node 로 읽어 파이썬이 쓸 수 있는 형태로 가져온다."""
    js = ("global.window={};require(%s);"
          "process.stdout.write(JSON.stringify({site:window.SITE,tasks:window.TASKS}))"
          % json.dumps(os.path.join(SITE, "assets", "data.js").replace("\\", "/")))
    raw = subprocess.run(["node", "-e", js], capture_output=True, check=True).stdout
    return json.loads(raw.decode("utf-8"))


def groups_of(site):
    """작업 아이디 → (부문 제목, 묶음 제목)"""
    out = {}
    for g in site.get("groups", []):
        for c in g.get("chapters", []):
            for i in c.get("tasks", []):
                out[i] = (g.get("title", ""), c.get("title", ""))
    return out


def too_small(name, kind):
    """이미 있는 그림이 기준에 못 미치는지."""
    if not name:
        return True
    p = os.path.join(SITE, "assets", "img", name)
    if not os.path.exists(p):
        return True
    try:
        from PIL import Image
        w, h = Image.open(p).size
    except Exception:
        return True
    return max(w, h) < DISPLAY_MIN[kind]


# 우리 건물의 실제 설비가 어떻게 생겼는지 적어 두는 곳.
#
# AI 는 "변압기" 라고만 하면 흔한 유입식(기름탱크 + 방열핀 + 자기부싱)을 그린다.
# 우리 전기실은 몰드형이라 완전히 다르게 생겼다. 이렇게 어긋나는 설비는
# 여기에 생김새를 적어 두면 그 작업의 모든 사진에 자동으로 들어간다.
#
# 쓰는 법 : {"작업아이디 앞부분": "설명"}. "e" 로 적으면 전기부문 전체에 걸린다.
_MOLD_TR = """**이 변압기는 몰드형(건식) 변압기입니다. 유입식으로 그리지 마세요.**
  - 기름 탱크 · 방열핀(라디에이터) · 도자기 부싱이 **없습니다**.
  - 에폭시 수지로 몰딩된 **원통형 코일 3개가 나란히 세로로** 서 있습니다.
  - 코일은 짙은 회갈색이고, 표면에 세로 통풍 홈이 나 있습니다.
  - 위아래를 **회색 철제 프레임**이 잡아 주고, 상부에 구리 단자가 올라와 있습니다.
  - 전체가 **철제 보호 외함(앞면 메시망 또는 판넬)** 안에 들어 있습니다."""

GEAR_NOTES = {
    "e05": _MOLD_TR,   # 변압기 점검
    "e06": _MOLD_TR,   # 변압기 절연저항 측정
    "e07": _MOLD_TR,   # 변압기 TAP 조정
}


def gear_note(tid):
    """작업 아이디에 맞는 설비 설명. 없으면 빈 문자열."""
    for key in sorted(GEAR_NOTES, key=len, reverse=True):
        if tid.startswith(key):
            return GEAR_NOTES[key]
    return ""


def _gear(task):
    """이 작업이 실제로 다루는 설비를 장면에 못 박는다.

    조치 문구만 주면 '어떤 작업에나 통하는' 일반적인 작업 사진이 나온다.
    그 작업의 설비가 프레임에 실제로 보여야 교육자료로 쓸 수 있다."""
    parts = [q.get("name", "") for q in task.get("parts", {}).get("items", [])]
    out = "- 이 작업이 다루는 설비 : **%s** (%s)\n" % (task["name"], task.get("place", ""))
    if parts:
        out += "  주요 부위 — %s\n" % " · ".join(q for q in parts if q)
    out += ("  **그 설비가 사진에 실제로 보여야 합니다.** 아무 작업에나 쓸 수 있는 "
            "일반적인 사진이 아니라, 이 설비를 다루는 사진이어야 합니다.\n")
    note = gear_note(task["id"])
    if note:
        out += "\n" + note + "\n"
    return out


def scene(task, kind, item=None, where=("", ""), compact=False, api=False):
    """프롬프트 한 장. 고정 규칙 + 이 장면 + 파일명."""
    ratio, minpx, what = SPEC[kind]
    ppe = " · ".join(p.get("name", "") for p in task.get("ppe", []))
    head = "## 이 장면\n\n"
    head += "- 작업 : **%s** (%s · 문서번호 %s)\n" % (
        task["name"], where[0] or task.get("sop", ""), task.get("docNo", ""))
    head += "- 장소 : %s\n" % task.get("place", "")
    if ppe:
        head += "- 반드시 착용 : %s\n" % ppe

    if kind == "g":
        head += "- 교육자료 %d번째 조치 : **%s**\n" % (item["n"], item.get("name", ""))
        head += "- 사진으로 보여줄 것 :\n"
        for b in item.get("bullets", []):
            head += "    · %s\n" % b
        if item.get("warn"):
            head += ("- 이 조치를 안 지키면 생기는 사고 : %s\n"
                     "  (분위기로만 담고, 사고 장면이나 글자를 그리지는 마세요)\n"
                     % item["warn"])
        head += _gear(task)
        head += ("\n**관리자가 이 조치를 제대로 지키고 있는 모습**을 찍은 사진입니다. "
                 "위반 장면이 아닙니다.\n"
                 "'관리자 1명이 ○○하는 사진' 처럼 사람이 실제로 그 동작을 하고 있는 "
                 "장면으로 구성해 주세요. 2인 1조 · 감시 · 신호처럼 두 사람이 필요한 "
                 "조치면 두 명을 넣어 주세요.\n")
        fname = item.get("img") or "%s_g%02d.png" % (task["id"], item["n"])
    elif kind == "fig":
        head += "- 이 사진은 **각부 명칭 페이지의 대표 사진**입니다.\n"
        head += "- 아래 1~6번의 장비 또는 내용이 **무조건 전부** 들어가야 합니다. "
        head += "한 장에 최대한 다 넣어 주세요.\n"
        for it in task.get("parts", {}).get("items", []):
            head += "    %d. %s — %s\n" % (it.get("n", 0), it.get("name", ""),
                                           it.get("desc", ""))
        head += ("\n이 사진에는 **사람이 없어야** 합니다. 설비만 담아 주세요.\n"
                 "번호 표시나 화살표도 **넣지 마세요** — 웹에서 따로 얹습니다.\n")
        fname = task.get("parts", {}).get("figure") or "%s_fig.png" % task["id"]
    else:
        head += ("- 이 사진은 **장비 상세설명도**입니다. 설비를 가까이에서 찍어 "
                 "각 부위가 또렷하게 보이게 해 주세요. 인물은 없어도 됩니다.\n")
        head += _gear(task)
        fname = task.get("guideFigure") or "%s_gfig.png" % task["id"]

    fname = os.path.splitext(fname)[0] + ".png"
    body = (STYLE.replace("%(ratio)s", ratio)
                 .replace("%(minpx)dpx", "%dpx" % minpx))
    if api:
        # API 로 보낼 때는 대화가 없으므로 고정 규칙을 매번 같이 보낸다.
        return "%s\n%s\n설명은 붙이지 말고 사진만 주세요." % (body, head)
    if compact:
        # 대화 시작 블록에서 고정 규칙을 이미 걸었으므로 장면만 붙여넣는다.
        # 규칙 40줄을 블록마다 다시 넣으면 복사·붙여넣기가 못 할 짓이 된다.
        return ("%s\n앞서 정한 고정 규칙과 표준 인물을 그대로 유지하고, "
                "위 장면으로 사진 **한 장**을 만들어 주세요.\n"
                "비율 **%s**, 짧은 변 **%dpx 이상**. 설명은 붙이지 말고 사진만 주세요.\n"
                "\n내려받을 파일 이름 : **`%s`**\n" % (head, ratio, minpx, fname))
    return ("### %s  —  %s\n\n> 첨부 :%s\n\n%s\n%s\n"
            "## 저장\n\n- 파일 이름 : **`%s`**\n- 넣을 곳 : `새 사진` 폴더\n"
            % (fname, what, " , ".join(REF_FILES), body, head, fname))


def task_prompts(task, where, only_small=False, compact=False,
                 with_fig=False):
    out = []
    # 본문 그림은 기본적으로 뽑지 않는다.
    # 번호(①~⑥) 좌표가 지금 사진에 묶여 있어서, 사진만 새로 만들면 번호가
    # 엉뚱한 자리에 찍힌다. 다시 만들려면 항목별로 따로 찍어 격자로 합쳐야 한다.
    if with_fig and not (only_small
                         and not too_small(task.get("parts", {}).get("figure"), "fig")):
        out.append(scene(task, "fig", where=where, compact=compact))
    if not (only_small and not too_small(task.get("guideFigure"), "gfig")):
        out.append(scene(task, "gfig", where=where, compact=compact))
    for g in task.get("guide", []):
        for it in g.get("items", []):
            if only_small and not too_small(it.get("img"), "g"):
                continue
            out.append(scene(task, "g", it, where, compact=compact))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", nargs=2, metavar=("작업id", "조치번호"))
    ap.add_argument("--task")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--only-small", action="store_true")
    a = ap.parse_args()

    d = load()
    T, where = d["tasks"], groups_of(d["site"])

    if a.sample:
        tid, n = a.sample[0], int(a.sample[1])
        t = T[tid]
        it = next(i for g in t["guide"] for i in g["items"] if i["n"] == n)
        sys.stdout.write(scene(t, "g", it, where.get(tid, ("", ""))))
        return 0

    if a.task:
        for p in task_prompts(T[a.task], where.get(a.task, ("", "")), a.only_small):
            sys.stdout.write(p + "\n---\n\n")
        return 0

    if a.all:
        # 작업 1건 = 파일 1개 = 대화 1개. 한 파일을 끝내면 그 작업이 끝난다.
        os.makedirs(OUT, exist_ok=True)
        root = os.path.join(OUT, "작업별")
        os.makedirs(root, exist_ok=True)
        ref = os.path.join(OUT, "참조 이미지")
        index, total = [], 0
        for g in d["site"]["groups"]:
            ids = [i for c in g["chapters"] for i in c["tasks"] if i in T]
            if not ids or g["id"] == "ex":
                continue
            sub = os.path.join(root, g["title"].replace(".", "").strip())
            made = []
            for i in ids:
                ps = task_prompts(T[i], where.get(i, ("", "")), a.only_small,
                                  compact=True)
                if not ps:
                    continue
                buf = ["# %s  %s  —  사진 %d장\n" % (i, T[i]["name"], len(ps)),
                       "## 이 파일 하나가 대화 하나입니다",
                       "",
                       "1. 새 대화를 열고 `참조 이미지` 폴더의 그림 **7장을 전부** 첨부하세요.",
                       "   경로 : `%s`" % ref,
                       "2. `01_대화시작_복사.md` 의 선 안쪽을 먼저 붙여넣으세요.",
                       "3. 그 다음 아래 블록을 **하나씩 순서대로** 붙여넣으세요.",
                       "   한 블록 = 사진 한 장입니다. 나온 사진은 블록 끝에 적힌",
                       "   파일 이름으로 `새 사진` 폴더에 저장하세요.",
                       "",
                       "> 이 작업이 끝나면 대화를 닫고 다음 파일로 넘어가세요.",
                       "> 작업을 섞으면 설비가 뒤섞입니다.",
                       ""]
                for k, p in enumerate(ps, 1):
                    buf.append("\n\n## %d / %d 번째 사진\n" % (k, len(ps)))
                    buf.append("---")
                    buf.append(p)
                    buf.append("---")
                os.makedirs(sub, exist_ok=True)
                safe = "".join(c for c in T[i]["name"] if c not in '\\/:*?"<>|')
                fn = "%s_%s.md" % (i, safe.strip())
                io.open(os.path.join(sub, fn), "w", encoding="utf-8")\
                  .write("\n".join(buf))
                made.append((i, T[i]["name"], len(ps)))
                total += len(ps)
            if made:
                index.append((g["title"], made))

        lines = ["# 사진 만들기 — 작업 목록", "",
                 "총 **%d개 작업 / 사진 %d장**." % (sum(len(m) for _t, m in index), total),
                 "", "작업 하나가 파일 하나이고, 대화 하나입니다.",
                 "끝낸 작업은 앞의 `[ ]` 를 `[x]` 로 바꿔 두세요.", ""]
        for title, made in index:
            lines.append("\n## %s  (%d개 작업 / %d장)\n"
                         % (title, len(made), sum(m[2] for m in made)))
            for i, name, n in made:
                lines.append("- [ ] `%s` %s — %d장" % (i, name, n))
        io.open(os.path.join(OUT, "00_작업목록.md"), "w", encoding="utf-8")\
          .write("\n".join(lines) + "\n")

        for title, made in index:
            print("  %-12s 작업 %2d개 / 사진 %3d장"
                  % (title, len(made), sum(m[2] for m in made)))
        print("  합계 사진 %d장  ->  %s" % (total, root))
        return 0

    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
