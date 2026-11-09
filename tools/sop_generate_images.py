# -*- coding: utf-8 -*-
"""
안전 SOP 교육자료 사진을 Gemini 로 한 번에 만든다.

md 파일을 열어 프롬프트를 하나씩 붙여넣는 일을 없애는 도구다.
프롬프트는 tools/sop_image_prompts.py 가 data.js 에서 뽑고,
여기서는 그것을 그대로 Gemini 에 보내고 받은 그림을 지정된 이름으로 저장한다.

안전장치
  · 이미 만들어진 파일은 건너뛴다 — 중간에 끊겨도 이어서 돌리면 된다
  · 받은 그림의 해상도를 검사해서 기준 미달이면 한 번 더 시도한다
  · 실패한 건 따로 적어 두고 끝까지 돌린다 (한 장 때문에 전체가 멈추지 않는다)
  · --plan 은 돈을 쓰지 않는다. 몇 장을 어디에 만들지만 보여준다

사용법
  python tools/sop_generate_images.py --models            # 키 확인 · 쓸 수 있는 모델
  python tools/sop_generate_images.py --plan              # 계획만 (무료)
  python tools/sop_generate_images.py --plan --only b01   # 한 작업만
  python tools/sop_generate_images.py --run --only b01    # 실제 생성 (유료)
  python tools/sop_generate_images.py --run               # 전부

API 키는 .env 의 GEMINI_API_KEY 에 둔다. 다른 곳에 적지 않는다.
"""

import argparse
import io
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sop_image_prompts as P                              # noqa: E402

OUT_DIR = os.path.join(P.OUT, "새 사진")
REF_DIR = os.path.join(P.OUT, "참조 이미지")
FAIL_LOG = os.path.join(P.OUT, "00_실패목록.txt")

# 2026-10 기준 가성비 모델. --model 또는 .env 의 GEMINI_IMAGE_MODEL 로 바꿀 수 있다.
DEFAULT_MODEL = "gemini-nano-banana-2.1"

# SPEC 의 쓰임새를 Gemini 의 화면비 · 크기 값으로 옮긴다
SHAPE = {
    "fig":  ("3:2", "2K"),
    "gfig": ("3:4", "2K"),
    "g":    ("1:1", "2K"),
}


def load_env():
    """.env 에서 키를 읽는다. 환경변수가 이미 있으면 그걸 쓴다."""
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    env = os.path.join(os.path.dirname(HERE), ".env")
    if os.path.exists(env):
        for line in io.open(env, encoding="utf-8", errors="ignore"):
            k, _, v = line.partition("=")
            if k.strip() == "GEMINI_API_KEY":
                return v.strip().strip('"').strip("'")
    return None


def refs():
    """참조 이미지. 표준인물이 있으면 맨 앞에 둔다."""
    from PIL import Image
    out = []
    if not os.path.isdir(REF_DIR):
        return out
    names = [n for n in os.listdir(REF_DIR) if n.lower().endswith((".png", ".jpg"))]
    names.sort(key=lambda n: (0 if "표준인물" in n else 1, n))
    for n in names:
        try:
            out.append(Image.open(os.path.join(REF_DIR, n)).convert("RGB"))
        except Exception:
            pass
    return out


def jobs(only=None):
    """만들 사진 목록. (파일명, 쓰임새, 프롬프트)"""
    d = P.load()
    T, where = d["tasks"], P.groups_of(d["site"])
    out = []
    for g in d["site"]["groups"]:
        if g["id"] == "ex":
            continue
        for tid in [i for c in g["chapters"] for i in c["tasks"] if i in T]:
            if only and not tid.startswith(only):
                continue
            t, w = T[tid], where.get(tid, ("", ""))
            if not P.too_small(t.get("guideFigure"), "gfig"):
                pass
            else:
                out.append((_png(t.get("guideFigure") or "%s_gfig" % tid), "gfig",
                            P.scene(t, "gfig", where=w, api=True)))
            for sec in t.get("guide", []):
                for it in sec.get("items", []):
                    if not P.too_small(it.get("img"), "g"):
                        continue
                    out.append((_png(it.get("img") or "%s_g%02d" % (tid, it["n"])),
                                "g", P.scene(t, "g", it, w, api=True)))
    return out


def _png(name):
    return os.path.splitext(name)[0] + ".png"


def generate(client, model, prompt, kind, ref_imgs):
    from google.genai import types
    ratio, size = SHAPE[kind]
    res = client.models.generate_content(
        model=model,
        contents=[prompt] + ref_imgs,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=ratio, image_size=size),
        ),
    )
    for cand in res.candidates or []:
        for part in (cand.content.parts or []):
            blob = getattr(part, "inline_data", None)
            if blob and blob.data:
                return blob.data
    return None


def ok_size(path, kind):
    from PIL import Image
    try:
        w, h = Image.open(path).size
    except Exception:
        return False
    return max(w, h) >= P.DISPLAY_MIN[kind]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", action="store_true", help="키 확인 · 모델 목록")
    ap.add_argument("--plan", action="store_true", help="계획만 (무료)")
    ap.add_argument("--run", action="store_true", help="실제 생성 (유료)")
    ap.add_argument("--only", help="작업 아이디 앞부분 (예: b01, b)")
    ap.add_argument("--limit", type=int, help="앞에서 N장만")
    ap.add_argument("--model",
                default=os.environ.get("GEMINI_IMAGE_MODEL", DEFAULT_MODEL))
    a = ap.parse_args()

    todo = jobs(a.only)
    done = [j for j in todo if os.path.exists(os.path.join(OUT_DIR, j[0]))]
    todo = [j for j in todo if not os.path.exists(os.path.join(OUT_DIR, j[0]))]
    if a.limit:
        todo = todo[:a.limit]

    if a.plan or not (a.models or a.run):
        print("만들 곳 : %s" % OUT_DIR)
        print("이미 있는 것 %d장은 건너뜁니다." % len(done))
        print("만들 사진 %d장" % len(todo))
        by = {}
        for name, kind, _p in todo:
            by.setdefault(name.split("_")[0][:1], []).append(name)
        for k in sorted(by):
            print("   %s… %d장" % (k, len(by[k])))
        if todo:
            print("\n예시 : %s (%s)" % (todo[0][0], SHAPE[todo[0][1]][0]))
        print("\n실제로 만들려면 --run  (유료입니다)")
        return 0

    key = load_env()
    if not key:
        print("GEMINI_API_KEY 가 없습니다.")
        print("  1) https://aistudio.google.com/apikey 에서 키를 받으세요")
        print("  2) 이 프로젝트의 .env 파일에 아래 한 줄을 추가하세요")
        print("     GEMINI_API_KEY=받은키")
        return 1

    from google import genai
    client = genai.Client(api_key=key)

    if a.models:
        print("쓸 수 있는 모델 중 이미지 생성이 가능한 것 :")
        for m in client.models.list():
            acts = getattr(m, "supported_actions", None) or []
            if "generateContent" in acts and "image" in (m.name or "").lower():
                print("   %-45s %s" % (m.name, (m.display_name or "")))
        return 0

    model = a.model
    if not model:
        cand = [m.name for m in client.models.list()
                if "image" in (m.name or "").lower()
                and "generateContent" in (getattr(m, "supported_actions", None) or [])]
        if not cand:
            print("이미지 생성 모델을 찾지 못했습니다. --models 로 확인한 뒤"
                  " --model 로 지정해 주세요.")
            return 1
        model = sorted(cand)[-1]
    print("모델 : %s" % model)

    os.makedirs(OUT_DIR, exist_ok=True)
    ref_imgs = refs()
    print("참조 이미지 %d장 / 만들 사진 %d장\n" % (len(ref_imgs), len(todo)))

    fails = []
    for i, (name, kind, prompt) in enumerate(todo, 1):
        path = os.path.join(OUT_DIR, name)
        got = None
        for attempt in (1, 2):
            try:
                got = generate(client, model, prompt, kind, ref_imgs)
            except Exception as e:
                print("  [%d/%d] %-18s 오류 : %s" % (i, len(todo), name, str(e)[:70]))
                time.sleep(3)
                continue
            if not got:
                continue
            with open(path, "wb") as f:
                f.write(got)
            if ok_size(path, kind):
                break
            print("  [%d/%d] %-18s 해상도 미달 — 다시 시도" % (i, len(todo), name))
            os.remove(path)
            got = None
        if got:
            print("  [%d/%d] %-18s 완료" % (i, len(todo), name))
        else:
            fails.append(name)
            print("  [%d/%d] %-18s 실패" % (i, len(todo), name))

    print("\n성공 %d장 / 실패 %d장" % (len(todo) - len(fails), len(fails)))
    if fails:
        io.open(FAIL_LOG, "w", encoding="utf-8").write("\n".join(fails) + "\n")
        print("실패 목록 : %s" % FAIL_LOG)
        print("다시 돌리면 실패한 것만 재시도합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
