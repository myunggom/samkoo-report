# -*- coding: utf-8 -*-
"""설비 참조 사진 묶음을 만든다.

왜 필요한가
    사진을 만들 때 설비를 **글로만** 설명하면 모델이 흔한 설비를 그린다.
    흡수식 냉동기를 터보 냉동기로 그린 것이 그 때문이다.
    우리 건물에서 찍은 실물 사진을 참조로 넣으면 그대로 옮긴다.

하는 일
    1. 아래 '묶음' 에 적힌 실물 사진을 7차 작업 폴더에 모은다 (원본 그대로)
    2. 사이트에서 볼 수 있게 가로 1200px JPEG 로 줄여 sop-new/assets/ref/ 에 넣는다
    3. sop-new/assets/refs.js 를 만든다 (사장 확인용 화면이 읽는다)

쓰는 법
    python sop_ref_photos.py            무엇이 담길지만 보여준다
    python sop_ref_photos.py --run      실제로 만든다
"""
import argparse
import io
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

B = "C:/Users/user/Desktop/Bio Innovation Hub"
보관 = (B + "/01 Projects/[안전] 표준운영절차 SOP/7차 작업/06 설비 참조")
WEB = os.path.join(ROOT, "sop-new", "assets", "ref")
OUT = os.path.join(ROOT, "sop-new", "assets", "refs.js")

냉동 = B + "/01 Projects/[지원금] 냉난방 설치 지원금/냉동기 사진/"
하절 = B + "/02 Areas/안전/[안전] 하절기 안전대책/사진/"
장비 = (B + "/01 Projects/[안전] 표준운영절차 SOP/2차 수정/사진/")
열화 = (B + "/02 Areas/전기/[전기] 적외선 열화상분포 측정기록표/사진"
            "/2026년 3분기/")

# 장소 → 그 장소 작업에 쓸 실물 참조 사진.
# '설명' 은 사장이 화면에서 보고 맞는지 판단하는 글이다.
묶음 = [
    {
        # 예시 'ladder' 는 c02 와 글이 똑같은 보기 자료다. 같은 사다리를
        # 참조로 붙여야 두 곳의 사진이 어긋나지 않는다. 2026-11-04 에 넣었다.
        "장소": "사다리 — 우리가 쓰는 것",
        "작업": ["c02", "ladder"],
        "사진": [
            (장비 + "1. 사다리.png",
             "다목적 알루미늄 사다리 (노란 힌지 · 노란 전도방지대 · 검은 고무발)"),
        ],
    },
    {
        "장소": "휴대용 연삭기(그라인더)",
        "작업": ["c12"],
        "사진": [(장비 + "2. 글라인더.png", "우리가 쓰는 휴대용 연삭기")],
    },
    {
        "장소": "테이블 리프트",
        "작업": ["c07"],
        "사진": [(장비 + "3. 테이블리프트.png", "우리가 쓰는 테이블 리프트")],
    },
    {
        # h05 는 계단 신주솔(손솔) 광택 작업이다. 바닥 광택기를 쓰지 않는데
        # 광택기 사진을 붙여 두어 계단에 광택기가 그려질 판이었다.
        # 2026-11-04 에 뺐다.
        "장소": "바닥 광택기",
        "작업": ["c17", "h08", "h09"],
        "사진": [(장비 + "5. 왁스 작업 - 광택기.png", "우리가 쓰는 바닥 광택기")],
    },
    {
        "장소": "계단 청소 도구",
        "작업": ["c22", "h02"],
        "사진": [
            (장비 + "6. 계단 청소 - 대걸레.png", "대걸레"),
            (장비 + "6. 계단 청소 - 짤순이.png", "짤순이(탈수기)"),
            (장비 + "6. 계단 청소 - 작업표시판.png", "작업표시판"),
        ],
    },
    {
        "장소": "냉동기실",
        "작업": ["m04", "m05", "m06"],
        "사진": [
            (냉동 + "1. AC-1 사진_01.jpg", "흡수식 냉동기 — 비스듬히 본 전경"),
            (냉동 + "1. AC-1 사진_02.jpg", "흡수식 냉동기 — 옆면 전체"),
        ],
    },
    {
        "장소": "발전기실",
        "작업": ["e08", "e09", "c23"],
        "사진": [
            (하절 + "0807 점검사진/7.jpg",
             "비상발전기와 제어반(No.1 FEEDER PANEL · D/G CONTROL PANEL)"),
            (하절 + "0710 점검사진/7.jpg", "발전기 제어반 계기판"),
        ],
    },
    {
        "장소": "기계실 — MCC 판넬",
        "작업": ["c26", "f02", "m01", "m02", "m13", "m14", "m15", "e10"],
        "사진": [
            (하절 + "0807 점검사진/11.jpg", "MCC 판넬 열 — 조작부와 명판"),
            (하절 + "0710 점검사진/11.jpg", "MCC 판넬 열 — 다른 각도"),
            (하절 + "6-19_점검사진/11.JPG", "MCC 판넬 열 — 통로 쪽에서"),
        ],
    },
    {
        "장소": "기계실 — 배관 · 밸브 · 여과기",
        "작업": ["m03", "m05", "m09", "f02"],
        "사진": [
            (하절 + "0710 점검사진/10.jpg", "여과기와 파란 밸브"),
            (하절 + "0710 점검사진/12.jpg", "밸브 · 스트레이너 청소"),
            (하절 + "6-19_점검사진/10.JPG", "배관 · 밸브 · 압력계"),
        ],
    },
    {
        "장소": "전기실 — 고압반 · 변압기",
        "작업": ["electric", "c21", "e01", "e02", "e03", "e04",
               "e05", "e06", "e07"],
        "사진": [
            (열화 + "1.jpg", "고압반 내부 — VCB(진공차단기)"),
            (열화 + "21.jpg", "건식 변압기 — 몰드 코일"),
            (하절 + "0703 점검사진/11.jpg", "전기실 판넬 조작"),
        ],
    },
    {
        # c25 는 승강기(E/L · E/S) 점검이다. 저수조 사진을 붙여 두었더니
        # 엘리베이터 작업에 물탱크가 그려질 판이었다. 2026-11-04 에 뺐다.
        "장소": "물탱크실 · 저수조",
        "작업": ["m09"],
        "사진": [
            (하절 + "0807 점검사진/12.jpg", "저수조 스트레이너 청소"),
        ],
    },
]


def 보관이름(번, i, 원본):
    """원본 보관용 파일 이름.

    그냥 파일 이름만 쓰면 안 된다. 점검일이 다른 '7.jpg' · '11.jpg' 가
    여러 폴더에 있어서 서로 덮어써 버린다(실제로 21장 중 4장이 사라졌다).
    그래서 **번호와 원본이 있던 폴더 이름을 앞에 붙여** 반드시 다르게 만든다.
    """
    밑 = os.path.basename(원본)
    폴더 = os.path.basename(os.path.dirname(원본))
    이름, 확장 = os.path.splitext(밑)
    return "%02d-%02d_%s_%s%s" % (번, i, 폴더, 이름, 확장.lower())


def 줄여쓰기(원본, 길, 가로=1200):
    from PIL import Image
    im = Image.open(원본).convert("RGB")
    if im.width > 가로:
        im = im.resize((가로, round(im.height * 가로 / im.width)),
                       Image.LANCZOS)
    im.save(길, "JPEG", quality=84, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true")
    a = ap.parse_args()

    자료, 없음, 전체 = [], [], 0
    for 번, 칸 in enumerate(묶음, 1):
        줄 = {"place": 칸["장소"], "tasks": 칸["작업"], "photos": []}
        for i, (원본, 설명) in enumerate(칸["사진"], 1):
            전체 += 1
            if not os.path.exists(원본):
                없음.append(원본)
                continue
            밑 = "ref%02d_%02d.jpg" % (번, i)   # 장소마다 번호가 달라야 안 겹친다
            # 원본 경로를 함께 들고 다닌다. 나중에 다시 걸러 맞추면 어긋난다.
            줄["photos"].append({"file": 밑, "note": 설명,
                                 "src": os.path.basename(원본),
                                 "_원본": 원본, "_보관이름": 보관이름(번, i, 원본)})
        자료.append(줄)

    print("장소 %d곳 / 참조 사진 %d장" % (len(묶음), 전체))
    for 칸, 줄 in zip(묶음, 자료):
        print("  %-28s %d장  (작업 %d건)"
              % (칸["장소"], len(줄["photos"]), len(칸["작업"])))
    if 없음:
        print("\n찾지 못한 파일 %d개 :" % len(없음))
        for p in 없음:
            print("   " + p)
    if not a.run:
        print("\n(보여주기만 했습니다. 만들려면 --run)")
        return

    os.makedirs(WEB, exist_ok=True)
    복사 = 0
    for 칸, 줄 in zip(묶음, 자료):
        폴더 = os.path.join(보관, 칸["장소"].replace("·", "").strip())
        os.makedirs(폴더, exist_ok=True)
        for 사진 in 줄["photos"]:
            shutil.copy2(사진["_원본"], os.path.join(폴더, 사진["_보관이름"]))
            줄여쓰기(사진["_원본"], os.path.join(WEB, 사진["file"]))
            복사 += 1

    # 한 장도 잃지 않았는지 센다. 예전에 이름이 겹쳐 조용히 사라진 적이 있다.
    보관장수 = sum(len(os.listdir(os.path.join(보관, d)))
                for d in os.listdir(보관)
                if os.path.isdir(os.path.join(보관, d)))
    if 보관장수 < 복사:
        print("주의 : 보관 폴더에 %d장만 있습니다 (복사한 것은 %d장). "
              "이름이 겹쳤는지 확인하세요." % (보관장수, 복사))

    # 밑줄로 시작하는 칸은 우리끼리 쓰는 것이라 사이트 자료에는 넣지 않는다.
    깨끗 = [dict(줄, photos=[{k: v for k, v in p.items()
                            if not k.startswith("_")} for p in 줄["photos"]])
           for 줄 in 자료]
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(
        "/* 설비 참조 사진. tools/sop_ref_photos.py 가 만든다.\n"
        "   사진을 만들 때 이 사진들을 참조로 넣어 설비 모양을 맞춘다. */\n"
        "window.REFS = "
        + json.dumps(깨끗, ensure_ascii=False, indent=1) + ";\n")
    크기 = sum(os.path.getsize(os.path.join(WEB, f))
              for f in os.listdir(WEB) if f.endswith(".jpg"))
    print("\n원본 보관 : %s" % 보관)
    print("사이트용 : %s (%.1f MB)" % (WEB, 크기 / 1048576))
    print("자료 : %s" % OUT)


if __name__ == "__main__":
    main()
