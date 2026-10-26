# -*- coding: utf-8 -*-
"""새 사이트(sop-new)의 자료를 만든다.

기존 사이트의 작업 111건을 그대로 가져오되, **사진은 비운다.**
사진은 새 표준인물로 다시 만들 예정이라 옛 사진을 쓰지 않는다.
이미 다시 만든 작업(c02)만 사진을 남긴다.

보호구 그림은 작아서 그대로 가져온다.

쓰는 법
    python sop_new_data_build.py            무엇이 담길지만 보여준다
    python sop_new_data_build.py --run      실제로 만든다
"""
import argparse
import io
import json
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SITE = (r"C:\Users\user\Desktop\Bio Innovation Hub\01 Projects"
        r"\[안전] 표준운영절차 SOP\웹 배포\안전SOP_웹사이트")
SRC = os.path.join(SITE, "assets", "data.js")
SRCIMG = os.path.join(SITE, "assets", "img")
NEW = os.path.join(ROOT, "sop-new", "assets")
OUT = os.path.join(NEW, "data.js")

사진있는작업 = {"c02", "m06"}   # 새 사진을 이미 만든 작업
도면있는작업 = {"c02", "m06"}   # 각부 명칭 도면은 그대로 쓰는 작업

# 각부 명칭 도면 위에 얹을 번호 표식. {작업: {번호: (가로%, 세로%)}}
# 사진에 글자를 박지 않으므로 글자가 깨지지 않고, 목록에 마우스를
# 올리면 그 부위가 밝아진다. 위치는 사진을 보고 정한다.
표식 = {
    "c02": {
        1: (41, 9),       # 상부 힌지 · 각도 잠금장치 — 꼭대기 쇠 경첩
        2: (34, 36),      # 사이드레일 — 왼쪽 알루미늄 기둥
        3: (69, 59),      # 디딤 발판 — 오른쪽 넓은 디딤판
        4: (75, 47),      # 높이조절 잠금핀 — 빨간 스프링 핀
        5: (26, 72),      # 아웃트리거 — 아래 가로로 뻗은 전도방지대
        6: (63, 91),      # 미끄럼 방지 고무발 — 앞쪽 검은 고무발
    },
    "m06": {
        1: (26.5, 9),     # 고온재생기 압력계 — 왼쪽 위 둥근 계기
        2: (43.5, 29),    # 고온재생기 온도계 — 막대형 온도계
        3: (54.5, 51),    # 냉수 · 냉각수 자동 V/V — 파란 액추에이터
        4: (72, 54),      # 현장 MCC 판넬 단자대 — 문 열린 판넬 안쪽
        5: (45, 80),      # 냉수 · 냉각수 압력계 — 아래 둥근 계기 두 개
        6: (12.5, 67),    # 열교환기 · 보온재 — 은색 보온 배관
    },
}


def 읽기():
    js = ("global.window={};require(%s);"
          "process.stdout.write(JSON.stringify({t:window.TASKS,s:window.SITE}))"
          % json.dumps(SRC.replace("\\", "/")))
    d = subprocess.run(["node", "-e", js], capture_output=True, check=True)
    return json.loads(d.stdout.decode("utf-8"))


def 이름맞추기(t, img폴더):
    """자료의 사진 이름을 폴더에 실제로 있는 파일로 맞춘다.

    사진을 다시 만들 때 PNG 를 JPEG 로 줄여 저장하므로 확장자가 바뀐다.
    """
    def 고치기(d, key):
        v = d.get(key)
        if not v or os.path.exists(os.path.join(img폴더, v)):
            return
        밑, _ = os.path.splitext(v)
        for 끝 in (".jpg", ".png", ".jpeg", ".webp"):
            if os.path.exists(os.path.join(img폴더, 밑 + 끝)):
                d[key] = 밑 + 끝
                return

    고치기(t, "guideFigure")
    p = t.get("parts") or {}
    고치기(p, "figure")
    for it in p.get("items") or []:
        고치기(it, "img")
    for sec in t.get("guide") or []:
        for it in sec.get("items") or []:
            고치기(it, "img")


def 표식넣기(t, tid):
    """도면 위 번호 위치를 자료에 넣는다. 정해 둔 작업만."""
    쪽 = 표식.get(tid)
    if not 쪽:
        return
    p = t.get("parts") or {}
    p["marks"] = [{"n": n, "x": x, "y": y}
                  for n, (x, y) in sorted(쪽.items())]


def 비우기(t, 도면남김=False):
    """사진 칸만 비운다. 글과 보호구는 그대로 둔다.

    도면남김=True 면 각부 명칭 도면과 지침 도면은 그대로 둔다.
    도면은 번호를 붙인 그림이라 새로 만들 대상이 아니다.
    """
    p = t.get("parts") or {}
    if not 도면남김:
        p["figure"] = ""
        t["guideFigure"] = ""
    for it in p.get("items") or []:
        it["img"] = ""
    for sec in t.get("guide") or []:
        for it in sec.get("items") or []:
            it["img"] = ""
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    a = ap.parse_args()

    D = 읽기()
    T, S = D["t"], D["s"]

    # 부문 제목 앞의 번호를 뗀다. 순서대로도 아니어서 읽기만 방해한다.
    import re as _re
    for g in S.get("groups") or []:
        g["title"] = _re.sub(r"^\s*\d+\s*[.)]\s*", "", g.get("title", ""))
        for c in g.get("chapters") or []:
            c["title"] = _re.sub(r"^\s*\d+\s*[.)]\s*", "", c.get("title", ""))

    쓸보호구 = set()
    남긴사진 = 0
    for tid, t in T.items():
        if tid not in 사진있는작업:
            비우기(t, tid in 도면있는작업)
        else:
            이름맞추기(t, os.path.join(NEW, "img"))
            표식넣기(t, tid)
            남긴사진 += 1
        for q in (t.get("ppe") or []):
            if q.get("img"):
                쓸보호구.add(os.path.basename(q["img"]))

    print("작업 %d건 / 사진 남긴 작업 %d건 / 보호구 그림 %d장"
          % (len(T), 남긴사진, len(쓸보호구)))
    크기 = sum(os.path.getsize(os.path.join(SRCIMG, n))
              for n in 쓸보호구 if os.path.exists(os.path.join(SRCIMG, n)))
    print("보호구 그림 용량 : %.1f MB" % (크기 / 1048576))
    if not a.run:
        print("\n(보여주기만 했습니다. 만들려면 --run)")
        return

    머리 = ("/* 작업별 안전 표준운영절차 자료.\n"
          "   사진은 새 표준인물로 다시 만들 예정이라 비워 두었습니다.\n"
          "   사진이 들어 있는 작업 : %s */\n"
          % ", ".join(sorted(사진있는작업)))
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(
        머리
        + "window.SITE = " + json.dumps(S, ensure_ascii=False, indent=1) + ";\n\n"
        + "window.TASKS = " + json.dumps(T, ensure_ascii=False, indent=1) + ";\n")
    print("\n자료 저장 : %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))

    img = os.path.join(NEW, "img")
    os.makedirs(img, exist_ok=True)
    옮김 = 0
    for n in sorted(쓸보호구):
        s, d = os.path.join(SRCIMG, n), os.path.join(img, n)
        if os.path.exists(s) and not os.path.exists(d):
            shutil.copy2(s, d)
            옮김 += 1
    print("보호구 그림 %d장 복사 (이미 있던 것 제외)" % 옮김)

    남은 = [n for n in os.listdir(img)
          if n.startswith("c02_") or n.startswith("ppe_")]
    print("사진 폴더 : %d장" % len(os.listdir(img)))


if __name__ == "__main__":
    main()
