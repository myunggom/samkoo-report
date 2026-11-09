# -*- coding: utf-8 -*-
"""
'## 이 장면' 블록만 모아 부문별 한 파일로 만든다.

고정 규칙은 대화 처음에 한 번만 넣으면 그 대화 내내 유효하다.
그 뒤로는 장면 설명만 하나씩 던지면 되므로, 붙여넣을 것만 추려 놓는다.

쓰는 법
  1. 새 대화 → 참조 이미지 7장 첨부 → `01_대화시작_복사.md` 붙여넣기
  2. 이 파일에서 블록을 하나씩 복사해 붙여넣기
  3. 나온 사진을 블록 끝 파일 이름으로 `새 사진` 폴더에 저장

사용법
  python tools/sop_scene_sheets.py
"""

import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sop_image_prompts as P                                  # noqa: E402


def build():
    d = P.load()
    T, where = d["tasks"], P.groups_of(d["site"])
    root = os.path.join(P.OUT, "장면 모음")
    os.makedirs(root, exist_ok=True)
    made = []

    for g in d["site"]["groups"]:
        if g["id"] == "ex":
            continue
        ids = [i for c in g["chapters"] for i in c["tasks"] if i in T]
        blocks, n_task = [], 0
        for tid in ids:
            # 각 작업의 조치 12개는 전부 사진이 필요하다.
            # 해상도가 멀쩡한 것도 장면·구도가 제각각이라 다시 만든다.
            ps = P.task_prompts(T[tid], where.get(tid, ("", "")),
                                only_small=False, compact=True)
            if not ps:
                continue
            n_task += 1
            blocks.append("\n\n" + "=" * 70)
            blocks.append("# %s  %s  —  %d장" % (tid, T[tid]["name"], len(ps)))
            blocks.append("=" * 70)
            blocks.append("\n> 이 작업은 **대화 하나**에서 끝내세요. "
                          "다음 작업으로 넘어갈 때는 새 대화를 엽니다.")
            for k, p in enumerate(ps, 1):
                blocks.append("\n\n### %s  —  %d / %d\n" % (tid, k, len(ps)))
                blocks.append("```")
                blocks.append(p.rstrip())
                blocks.append("```")
        if not blocks:
            continue

        total = sum(1 for b in blocks if b.startswith("\n\n### "))
        head = [
            "# %s — 붙여넣을 장면 모음" % g["title"],
            "",
            "작업 **%d건 / 사진 %d장**." % (n_task, total),
            "",
            "## 하는 법",
            "",
            "1. 새 대화를 열고 `참조 이미지` 폴더의 그림 **7장을 전부** 첨부합니다.",
            "2. `01_대화시작_복사.md` 의 선 안쪽을 **먼저 한 번** 붙여넣습니다.",
            "   (이걸 넣어야 복장 · 로고 · 구도 규칙이 걸립니다)",
            "3. 아래 블록을 ``` 안쪽만 복사해서 **하나씩 순서대로** 붙여넣습니다.",
            "4. 나온 사진을 블록 끝에 적힌 이름으로 `새 사진` 폴더에 저장합니다.",
            "",
            "> 작업이 바뀌면 **새 대화**를 여세요. 한 대화에 여러 작업을 섞으면",
            "> 앞 작업의 설비가 뒤 사진에 섞여 나옵니다.",
        ]
        fn = "%s.md" % g["title"].replace(".", "").strip()
        io.open(os.path.join(root, fn), "w", encoding="utf-8")\
          .write("\n".join(head + blocks) + "\n")
        made.append((g["title"], n_task, total, fn))
    return root, made


if __name__ == "__main__":
    root, made = build()
    for title, n, total, fn in made:
        print("  %-12s 작업 %2d개 / 사진 %3d장  →  %s" % (title, n, total, fn))
    print("\n저장 : %s" % root)
