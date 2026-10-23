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

사진있는작업 = {"c02"}          # 새 사진을 이미 만든 작업


def 읽기():
    js = ("global.window={};require(%s);"
          "process.stdout.write(JSON.stringify({t:window.TASKS,s:window.SITE}))"
          % json.dumps(SRC.replace("\\", "/")))
    d = subprocess.run(["node", "-e", js], capture_output=True, check=True)
    return json.loads(d.stdout.decode("utf-8"))


def 비우기(t):
    """사진 칸만 비운다. 글과 보호구는 그대로 둔다."""
    p = t.get("parts") or {}
    p["figure"] = ""
    for it in p.get("items") or []:
        it["img"] = ""
    for sec in t.get("guide") or []:
        for it in sec.get("items") or []:
            it["img"] = ""
    t["guideFigure"] = ""
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    a = ap.parse_args()

    D = 읽기()
    T, S = D["t"], D["s"]

    쓸보호구 = set()
    남긴사진 = 0
    for tid, t in T.items():
        if tid not in 사진있는작업:
            비우기(t)
        else:
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
