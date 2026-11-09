# -*- coding: utf-8 -*-
"""
사람들에게 나눠 줄 '사진 작업 배포' 폴더를 만든다.

왜 txt 인가
  받는 사람이 메모장으로 열어 바로 복사할 수 있어야 한다.
  md 는 별 표시(**)와 우물 정(##)이 그대로 보여서 뭘 복사할지 헷갈린다.
  한글이 깨지지 않도록 BOM 을 붙여 저장한다 (utf-8-sig).

폴더 구조
  사진 작업 배포/
      00_먼저 읽으세요.txt
      01_대화 시작할 때 붙여넣기.txt
      참조 이미지/            ← 7장. 매 대화에 전부 첨부
      1 공통부문/             ← 담당자 한 명이 맡는 단위
          00_이 부문 안내.txt
          c01 이동식작업대(BT 비계) 작업.txt   ← 작업 1건 = 파일 1개 = 대화 1개
          ...

사용법
  python tools/sop_make_handout.py
"""

import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sop_image_prompts as P                                  # noqa: E402

OUT = os.path.join(os.path.dirname(P.OUT), "사진 작업 배포")
BAR = "=" * 68
DASH = "-" * 68


def plain(md):
    """마크다운 기호를 걷어내고 메모장에서 읽기 좋은 글로 바꾼다."""
    t = md
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.M)      # ## 제목
    t = t.replace("**", "")                            # 굵게
    t = re.sub(r"^>\s?", "  ", t, flags=re.M)          # 인용
    t = t.replace("`", "")                             # 코드 표시
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.rstrip()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # BOM 을 붙여야 윈도우 메모장에서 한글이 깨지지 않는다
    io.open(path, "w", encoding="utf-8-sig", newline="\r\n").write(text)


from sop_handout_text import GUIDE, SECTION_GUIDE   # noqa: E402


def task_text(tid, name, prompts):
    out = [BAR, " %s  %s" % (tid, name), " 사진 %d장" % len(prompts), BAR, ""]
    out.append(" 시작하기 전에 :")
    out.append("   1) Gemini 새 대화를 엽니다")
    out.append("   2) '참조 이미지' 폴더의 사진 7장을 전부 첨부합니다")
    out.append("   3) '01_대화 시작할 때 붙여넣기.txt' 내용을 먼저 넣습니다")
    out.append("")
    out.append(" 그 다음 아래 1번부터 순서대로 하시면 됩니다.")
    out.append("")
    for k, p in enumerate(prompts, 1):
        m = re.search(r"내려받을 파일 이름 : \*\*`([^`]+)`\*\*", p)
        fname = m.group(1) if m else "?"
        body = re.sub(r"\n*내려받을 파일 이름 : .*$", "", p.rstrip(), flags=re.S)
        out.append("")
        out.append(BAR)
        out.append(" [ %d / %d ]   저장할 파일 이름 :  %s" % (k, len(prompts), fname))
        out.append(BAR)
        out.append("")
        out.append("[여기부터 복사]")
        out.append(DASH)
        out.append(plain(body))
        out.append(DASH)
        out.append("[여기까지 복사]")
        out.append("")
        out.append("  -> 나온 사진을 '%s' 이름으로 저장하세요." % fname)
        out.append("")
    return "\n".join(out)


def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    # 참조 이미지
    src_ref = os.path.join(P.OUT, "참조 이미지")
    dst_ref = os.path.join(OUT, "참조 이미지")
    os.makedirs(dst_ref)
    for n in P.REF_FILES:
        s = os.path.join(src_ref, n)
        if os.path.exists(s):
            shutil.copyfile(s, os.path.join(dst_ref, n))

    write(os.path.join(OUT, "00_먼저 읽으세요.txt"),
          GUIDE.format(bar=BAR, dash=DASH))

    # 대화 시작 블록
    one = P.oneshot()
    body = one.split("---\n", 1)[1].rstrip().rstrip("-").rstrip()
    start = [BAR, " 대화를 시작할 때 한 번만 붙여넣는 글", BAR, "",
             " 먼저 '참조 이미지' 폴더의 사진 7장을 전부 첨부하세요.", "",
             "[여기부터 복사]", DASH, plain(body), DASH, "[여기까지 복사]", "",
             " -> Gemini 가 '준비됐습니다' 라고 답하면 다음 단계로 갑니다.", ""]
    write(os.path.join(OUT, "01_대화 시작할 때 붙여넣기.txt"), "\n".join(start))

    d = P.load()
    T, where = d["tasks"], P.groups_of(d["site"])
    made = []
    for g in d["site"]["groups"]:
        if g["id"] == "ex":
            continue
        folder = os.path.join(OUT, g["title"].replace(".", "").strip())
        rows, n_task, total = [], 0, 0
        for tid in [i for c in g["chapters"] for i in c["tasks"] if i in T]:
            ps = P.task_prompts(T[tid], where.get(tid, ("", "")),
                                only_small=False, compact=True)
            if not ps:
                continue
            n_task += 1
            total += len(ps)
            safe = "".join(c for c in T[tid]["name"] if c not in '\\/:*?"<>|')
            fn = "%s %s.txt" % (tid, safe.strip())
            write(os.path.join(folder, fn), task_text(tid, T[tid]["name"], ps))
            rows.append("   [ ] %-5s %-30s %2d장" % (tid, T[tid]["name"][:30], len(ps)))
        if not rows:
            continue
        write(os.path.join(folder, "00_이 부문 안내.txt"),
              SECTION_GUIDE.format(bar=BAR, dash=DASH, title=g["title"],
                                   n=n_task, total=total, list="\n".join(rows)))
        made.append((g["title"], n_task, total))
    return made


if __name__ == "__main__":
    made = build()
    print("저장 : %s\n" % OUT)
    for title, n, total in made:
        print("  %-12s 작업 %2d건 / 사진 %3d장" % (title, n, total))
    print("\n  합계 작업 %d건 / 사진 %d장"
          % (sum(m[1] for m in made), sum(m[2] for m in made)))
