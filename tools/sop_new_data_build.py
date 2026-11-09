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
import sys
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

def 사진이미만든작업():
    """새 사진이 이미 있는 작업을 **폴더를 보고** 찾는다.

    예전에는 {"c02","m06"} 처럼 손으로 적어 두었다. 작업을 하나 끝낼 때마다
    여기를 고쳐야 했고, 잊으면 다시 만들 때 애써 만든 사진이 자료에서
    지워졌다. 폴더에 파일이 있으면 만든 것이다.
    """
    폴더 = os.path.join(ROOT, "sop-new", "assets", "img")
    if not os.path.isdir(폴더):
        return set()
    있음 = set()
    for f in os.listdir(폴더):
        밑, 끝 = os.path.splitext(f)
        if "_g" in 밑 and 끝.lower() in (".jpg", ".png", ".jpeg", ".webp"):
            있음.add(밑.split("_g")[0])
    return 있음 - {"ppe"}


사진있는작업 = 사진이미만든작업()   # 새 사진을 이미 만든 작업
도면있는작업 = {"c02", "m06"}       # 각부 명칭 도면은 그대로 쓰는 작업

# 각부 명칭 도면 위에 얹을 번호 표식. {작업: {번호: (가로%, 세로%)}}
# 사진에 글자를 박지 않으므로 글자가 깨지지 않고, 목록에 마우스를
# 올리면 그 부위가 밝아진다. 위치는 사진을 보고 정한다.
표식 = {
    "c02": {
        1: (41, 7),       # 상부 힌지 · 각도 잠금장치 — 꼭대기 쇠 경첩
        2: (37, 25),      # 사이드레일 — 라벨이 붙은 왼쪽 기둥
        3: (61, 45),      # 디딤 발판 — 가운데 넓은 디딤판
        4: (50, 61),      # 높이조절 잠금핀 — 검은 플라스틱 잠금 고리
        5: (27, 62),      # 아웃트리거 — 왼쪽 노란 브래킷
        6: (50, 89),      # 미끄럼 방지 고무발 — 앞 기둥 끝 검은 고무
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


def 이름채우기(t, tid, img폴더):
    """사진 칸이 비어 있거나 아예 없는 자리를, 폴더에 실제로 있는 파일로 채운다.

    s08 · s09 · s10 은 조치에 img 칸이 아예 없고, 26건은 figure 칸이 비어
    있다. 사진을 만들어도 사이트가 읽을 칸이 없으면 화면에 나오지 않는다.
    **폴더에 파일이 있을 때만** 채우므로 없는 그림을 가리킬 일이 없다.
    """
    def 찾기(밑):
        for 끝 in (".jpg", ".png", ".jpeg", ".webp"):
            if os.path.exists(os.path.join(img폴더, 밑 + 끝)):
                return 밑 + 끝
        return ""

    def 쓸만한가(이름, 밑):
        """적혀 있는 이름이 폴더에 진짜 있는가. 없으면 바른 이름을 찾아 준다.

        옛 사이트에서 물려받은 이름(e01_fig.png)이 그대로 남아 **깨진
        그림**으로 뜬 적이 있다. 적혀 있다고 믿지 않고 늘 확인한다.
        """
        if 이름 and os.path.exists(os.path.join(img폴더, 이름)):
            return 이름
        return 찾기(밑)

    채움, 치움 = 0, 0
    for sec in t.get("guide") or []:
        for it in sec.get("items") or []:
            옛 = it.get("img") or ""
            새 = 쓸만한가(옛, "%s_g%02d" % (tid, it.get("n") or 0))
            if 새 != 옛:
                it["img"] = 새
                채움 += bool(새)
                치움 += bool(옛) and not 새
    p = t.get("parts") or {}
    옛 = p.get("figure") or ""
    새 = 쓸만한가(옛, "%s_fig" % tid)
    if 새 != 옛:
        p["figure"] = 새
        채움 += bool(새)
        치움 += bool(옛) and not 새
    옛 = t.get("guideFigure") or ""
    새 = 쓸만한가(옛, "%s_gfig" % tid)
    if 새 != 옛:
        t["guideFigure"] = 새
        채움 += bool(새)
        치움 += bool(옛) and not 새
    return 채움, 치움


def 가리키는그림(t):
    """이 작업이 **화면에 띄우는 그림 전부**를 (무엇, 파일이름) 으로 준다.

    점검망과 복사가 서로 다른 목록을 보고 있으면, 한쪽만 고치고 끝난다.
    실제로 그래서 예시 사진 16장이 배포 뒤에 X 표로 떴다. 칸이 늘면
    **여기 한 줄만** 늘린다.
    """
    p = t.get("parts") or {}
    r = t.get("report") or {}
    out = [("각부 명칭 도면", p.get("figure")),
           ("지침 대표 사진", t.get("guideFigure"))]
    out += [("각부 도면 %d" % (i + 1), v)
            for i, v in enumerate(p.get("figures") or [])]
    out += [("각부 항목", it.get("img")) for it in (p.get("items") or [])]
    out += [("작업 사례 %d" % (i + 1), v)
            for i, v in enumerate(r.get("examples") or [])]
    out += [("보호구", q.get("img")) for q in (t.get("ppe") or [])]
    for sec in t.get("guide") or []:
        for it in sec.get("items") or []:
            out.append(("조치 %s" % it.get("n"), it.get("img")))
    return [(무엇, 이름) for 무엇, 이름 in out if 이름]


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
    남긴사진, 채운칸, 치운칸 = 0, 0, 0
    for tid, t in T.items():
        if tid not in 사진있는작업:
            비우기(t, tid in 도면있는작업)
        else:
            이름맞추기(t, os.path.join(NEW, "img"))
            더, 뺀 = 이름채우기(t, tid, os.path.join(NEW, "img"))
            채운칸 += 더
            치운칸 += 뺀                  # 없는 그림을 가리키던 칸
            표식넣기(t, tid)
            남긴사진 += 1
        for 무엇, 이름 in 가리키는그림(t):
            # 우리가 새로 만든 사진은 이미 폴더에 있다. 그 밖의 것(보호구
            # 그림 · 예시 사진 · 도구 도면)은 옛 사이트에서 가져와야 한다.
            쓸보호구.add(os.path.basename(이름))

    # 자료가 가리키는 그림이 **폴더에 다 있는지** 마지막으로 센다.
    # e01 의 도면이 없는 파일을 가리켜 배포 뒤에야 깨진 그림으로 드러났다.
    # 만들기 전에 여기서 잡는다.
    폴더 = os.path.join(NEW, "img")
    os.makedirs(폴더, exist_ok=True)
    # 점검하기 **전에** 옛 사이트 그림을 먼저 옮겨 둔다. 순서가 반대면
    # 아직 안 옮긴 그림을 보고 "깨졌다" 며 멈춰 버린다.
    옮길것 = [n for n in sorted(쓸보호구)
            if not os.path.exists(os.path.join(폴더, n))
            and os.path.exists(os.path.join(SRCIMG, n))]
    if a.run:
        for n in 옮길것:
            shutil.copy2(os.path.join(SRCIMG, n), os.path.join(폴더, n))
        if 옮길것:
            print("옛 사이트에서 그림 %d장을 옮겼습니다." % len(옮길것))
    elif 옮길것:
        print("옛 사이트에서 그림 %d장을 옮길 예정입니다." % len(옮길것))
    # 보여주기일 때는 아직 안 옮겼으므로, 옮길 것도 '있는 것' 으로 친다.
    있는것 = set(os.listdir(폴더)) if os.path.isdir(폴더) else set()
    있는것 |= set(옮길것)
    깨짐 = []
    for tid, t in T.items():
        for 무엇, 이름 in 가리키는그림(t):
            if os.path.basename(이름) not in 있는것:
                깨짐.append("%s %s = %s" % (tid, 무엇, 이름))
    if 깨짐:
        print()
        for x in 깨짐[:20]:
            print("※ 없는 그림을 가리킵니다 : " + x)
        sys.exit(chr(10) + "깨진 그림 %d개. 배포하면 사이트에 X 표가 뜹니다. "
                 "만들지 않았습니다." % len(깨짐))

    print("작업 %d건 / 사진 남긴 작업 %d건 / 가리키는 그림 %d장"
          % (len(T), 남긴사진, len(쓸보호구)))
    print("가리키는 그림 전부 폴더에 있습니다 (깨진 링크 0개).")
    if 채운칸:
        print("비어 있던 사진 칸 %d개를 폴더에 있는 파일로 채웠습니다." % 채운칸)
    if 치운칸:
        print("없는 그림을 가리키던 칸 %d개를 비웠습니다 (깨진 그림 방지)."
              % 치운칸)
    크기 = sum(os.path.getsize(os.path.join(SRCIMG, n))
              for n in 쓸보호구 if os.path.exists(os.path.join(SRCIMG, n)))
    print("옛 사이트에서 가져오는 그림 용량 : %.1f MB" % (크기 / 1048576))
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

    img = 폴더                      # 복사는 점검 앞에서 이미 끝냈다

    남은 = [n for n in os.listdir(img)
          if n.startswith("c02_") or n.startswith("ppe_")]
    print("사진 폴더 : %d장" % len(os.listdir(img)))


if __name__ == "__main__":
    main()
