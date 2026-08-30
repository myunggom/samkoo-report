# -*- coding: utf-8 -*-
"""
적외선 열화상 측정기록표 - 사진 처리 통합 도구 (flir_report_tool.py)

분기 사진 한 번에 처리:
  1단계) 사진 이름 변경 : FLIR0001.jpg... -> 1.jpg ~ 76.jpg (실제/열화상 쌍 순서)
  2단계) 양식에 사진 교체 : .hwpx 양식의 셀 배경 사진을 1~N번 순서대로 교체(내장)

[중요] 2단계는 .hwpx 양식이 필요합니다.
  한글 .hwp 를 프로그램이 자동 변환하면 멈추거나 이미지가 손실되므로,
  사장님이 한글에서 직접 '다른 이름으로 저장 -> 한글 문서(*.hwpx)' 로 만들어 주셔야 합니다.

폴더/파일 규칙 (분기명이 "2026년 2분기" 라면):
  사진 폴더 : ...\\측정기록표\\사진\\2026년 2분기
  양식 파일 : ...\\측정기록표\\[양식]...허브_2026년 2분기.hwpx
  결과 파일 : ...\\측정기록표\\[양식]...허브_2026년 2분기_사진교체.hwpx

사용법:
  python flir_report_tool.py                  # 분기 목록에서 골라 1+2단계 실행
  python flir_report_tool.py "2026년 2분기"    # 분기명 지정
  python flir_report_tool.py "2026년 2분기" --rename-only    # 이름변경만
  python flir_report_tool.py "2026년 2분기" --replace-only   # 사진교체만
  python flir_report_tool.py "2026년 2분기" --yes            # 확인 없이 실행
"""

import os
import re
import sys
import zipfile

# ─── 설정 (여기만 수정) ────────────────────────────────────────────
REPORT_DIR = r"C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\전기\[전기] 적외선 열화상분포 측정기록표"
PHOTO_BASE = os.path.join(REPORT_DIR, "사진")
FORM_PREFIX = "[양식] 적외선 열화상분포 측정기록표_바이오 이노베이션 허브_"
# ───────────────────────────────────────────────────────────────────


# ====================================================================
# 분기 선택
# ====================================================================
def choose_quarter(arg):
    """분기명을 결정. 인자로 받거나, 사진 폴더의 하위 분기 목록에서 고른다."""
    if arg:
        return arg
    if not os.path.isdir(PHOTO_BASE):
        sys.exit(f"오류: 사진 기본 폴더를 찾을 수 없습니다.\n{PHOTO_BASE}")
    quarters = sorted(
        n for n in os.listdir(PHOTO_BASE)
        if os.path.isdir(os.path.join(PHOTO_BASE, n))
    )
    if not quarters:
        sys.exit(f"처리할 분기 폴더가 없습니다.\n{PHOTO_BASE}")
    print("\n어떤 분기를 처리할까요?")
    for i, q in enumerate(quarters, 1):
        print(f"  {i}. {q}")
    sel = input("\n번호를 입력하세요: ").strip()
    if not sel.isdigit() or not (1 <= int(sel) <= len(quarters)):
        sys.exit("올바른 번호가 아닙니다. 취소되었습니다.")
    return quarters[int(sel) - 1]


# ====================================================================
# 1단계 - 사진 이름 변경
#   카메라 패턴: 홀수번호=열화상, 짝수번호=실제사진
#   결과: 실제(1) 열화상(2) 실제(3) 열화상(4) ...
# ====================================================================
def get_flir_files(folder):
    files = []
    for fn in os.listdir(folder):
        m = re.match(r'FLIR(\d+)\.jpg$', fn, re.IGNORECASE)
        if m:
            files.append((int(m.group(1)), fn))
    files.sort(key=lambda x: x[0])
    return files


def build_rename_plan(files):
    plan, errors = [], []
    if len(files) % 2 != 0:
        errors.append(f"파일 개수가 홀수({len(files)}개)입니다. 쌍이 맞지 않습니다.")
    for i in range(0, len(files) - 1, 2):
        num_a, file_a = files[i]
        num_b, file_b = files[i + 1]
        if num_a % 2 != 1:
            errors.append(f"예상 오류: {file_a}은 홀수여야 하는데 짝수입니다.")
        if num_b % 2 != 0:
            errors.append(f"예상 오류: {file_b}은 짝수여야 하는데 홀수입니다.")
        pair = i // 2
        out_real = 2 * pair + 1     # 홀수 = 실제
        out_thermal = 2 * pair + 2  # 짝수 = 열화상
        plan.append((file_a, f"{out_thermal}.jpg", "열화상"))
        plan.append((file_b, f"{out_real}.jpg", "실제"))
    return plan, errors


def rename_photos(photo_folder, ask=True):
    """FLIR 사진 이름 변경. 이미 변경됐으면(또는 FLIR 파일 없으면) 건너뜀."""
    print(f"\n[1단계] 사진 이름 변경  ({photo_folder})")
    files = get_flir_files(photo_folder)
    if not files:
        print("  FLIR 파일이 없습니다 -> 이미 변경됨으로 보고 건너뜁니다.")
        return True

    plan, errors = build_rename_plan(files)
    if errors:
        print("  === 경고 ===")
        for e in errors:
            print("   -", e)
        print("  오류로 중단합니다.")
        return False

    print(f"  발견 {len(files)}개 -> {plan[0][0]} → {plan[0][1]} ... {plan[-1][0]} → {plan[-1][1]}")
    if ask:
        if input("  이름 변경 실행할까요? (yes 입력 시 실행): ").strip().lower() != "yes":
            print("  이름 변경 취소.")
            return False

    # 충돌 방지: 임시 이름 -> 최종 이름 (2단계)
    for original, _, _ in plan:
        os.rename(os.path.join(photo_folder, original),
                  os.path.join(photo_folder, f"__TEMP__{original}"))
    for original, final, _ in plan:
        os.rename(os.path.join(photo_folder, f"__TEMP__{original}"),
                  os.path.join(photo_folder, final))
    print(f"  완료! {len(plan)}개 이름 변경.")
    return True


# ====================================================================
# 2단계 - 양식(.hwpx) 셀 배경 사진 교체
#   읽는 순서(표 순서 -> 왼쪽 col0, 오른쪽 col7)대로 1~N번 사진을 내장
#   외부 링크를 끊고 파일에 내장 -> 자체 완결
# ====================================================================
def _img_borderfills(header_xml):
    """이미지 배경을 가진 borderFill: {id: imageRef}"""
    bf = {}
    for b in re.findall(r'<hh:borderFill\b.*?</hh:borderFill>', header_xml, re.DOTALL):
        idm = re.search(r'id="(\d+)"', b)
        imgm = re.search(r'binaryItemIDRef="([^"]*)"', b)
        if idm and imgm:
            bf[idm.group(1)] = imgm.group(1)
    return bf


def _cell_col(section_xml, pos):
    """borderFillIDRef 위치(pos)의 셀이 몇 번째 열(col)인지.
       - <hp:cellzone ... startColAddr=..> : 태그 자체의 startColAddr (앞쪽)
       - <hp:tc ... borderFillIDRef=..>     : 내용(subList) 뒤의 <hp:cellAddr colAddr=..>"""
    lt = section_xml.rfind('<', 0, pos)
    if section_xml[lt:lt + 13].startswith('<hp:cellzone'):
        mm = re.search(r'startColAddr="(\d+)"', section_xml[lt:pos])
    else:
        mm = re.search(r'<hp:cellAddr colAddr="(\d+)" rowAddr="\d+"', section_xml[pos:])
    return mm.group(1) if mm else '?'


def build_replace_plan(header_xml, section_xml):
    """문서 읽는 순서대로 (사진번호 -> 배경셀) 배정 계획을 만든다.
       반환: (occ_list, conflicts)
         occ: [{'col','bf','img','pos','photo'} ...] (사진번호 순)
         conflicts: 한 image를 두 칸이 공유하는 경우"""
    bf_to_img = _img_borderfills(header_xml)
    img_bf_ids = set(bf_to_img)

    occ = []
    for m in re.finditer(r'borderFillIDRef="(\d+)"', section_xml):
        bid = m.group(1)
        if bid in img_bf_ids:
            occ.append({'col': _cell_col(section_xml, m.start()),
                        'bf': bid, 'img': bf_to_img[bid], 'pos': m.start()})

    n_cells = len(occ)
    plan = []
    for t in range(n_cells // 2):
        pair = sorted(occ[2 * t:2 * t + 2],
                      key=lambda o: int(o['col']) if o['col'].isdigit() else 99)
        for k, o in enumerate(pair):
            o['photo'] = 2 * t + k + 1
            plan.append(o)

    # 한 image를 서로 다른 사진번호의 두 칸이 공유 -> 분리 대상
    img_to_photo, conflicts = {}, []
    for o in plan:
        if o['img'] in img_to_photo and img_to_photo[o['img']] != o['photo']:
            conflicts.append(o)
        else:
            img_to_photo[o['img']] = o['photo']
    return plan, conflicts


def replace_backgrounds(hwpx_src, hwpx_out, photo_folder, ask=True):
    """양식의 셀 배경 사진을 photo_folder의 1.jpg.. 로 교체해 hwpx_out 생성."""
    print(f"\n[2단계] 양식 사진 교체")
    print(f"  양식: {hwpx_src}")

    with zipfile.ZipFile(hwpx_src) as z:
        raw = {n: z.read(n) for n in z.namelist()}

    sec_name = "Contents/section0.xml"
    for need in ("Contents/header.xml", "Contents/content.hpf", sec_name):
        if need not in raw:
            print(f"  오류: 양식에서 {need} 를 찾을 수 없습니다. (제대로 된 .hwpx 인가요?)")
            return False

    hdr = raw["Contents/header.xml"].decode('utf-8')
    hpf = raw["Contents/content.hpf"].decode('utf-8')
    sec = raw[sec_name].decode('utf-8')

    plan, conflicts = build_replace_plan(hdr, sec)
    n_cells = len(plan)
    if n_cells == 0:
        print("  오류: 양식에서 배경 사진 칸을 찾지 못했습니다.")
        return False

    # 사진 파일 존재 확인
    missing = [p for p in range(1, n_cells + 1)
               if not os.path.exists(os.path.join(photo_folder, f"{p}.jpg"))]
    if missing:
        print(f"  오류: 사진 파일 누락 {missing}")
        return False

    print(f"  배경 칸 {n_cells}개 <- 사진 1~{n_cells} 배정")
    if conflicts:
        print(f"  (양식의 중복/누락 {len(conflicts)}건 교정: "
              + ", ".join(f"{o['photo']}번칸" for o in conflicts) + ")")
    if ask:
        if input("  사진 교체 실행할까요? (yes 입력 시 실행): ").strip().lower() != "yes":
            print("  사진 교체 취소.")
            return False

    def photo_bytes(p):
        with open(os.path.join(photo_folder, f"{p}.jpg"), 'rb') as f:
            return f.read()

    new_bin = {}
    extra_bf = []
    next_bf = max(int(x) for x in re.findall(r'<hh:borderFill id="(\d+)"', hdr)) + 1
    conflict_ids = {id(o) for o in conflicts}

    for o in plan:
        if id(o) in conflict_ids:
            # 공유 충돌난 칸: 새 image + 새 borderFill 로 분리
            new_img = f"imageX{o['photo']}"
            new_bf = str(next_bf); next_bf += 1
            new_bin[f"BinData/{new_img}.jpg"] = photo_bytes(o['photo'])
            srcbf = re.search(rf'<hh:borderFill id="{o["bf"]}".*?</hh:borderFill>',
                              hdr, re.DOTALL).group(0)
            nb = srcbf.replace(f'id="{o["bf"]}"', f'id="{new_bf}"', 1)
            nb = re.sub(r'binaryItemIDRef="[^"]*"', f'binaryItemIDRef="{new_img}"', nb)
            extra_bf.append(nb)
            hpf = hpf.replace('</opf:manifest>',
                f'<opf:item id="{new_img}" href="BinData/{new_img}.jpg" '
                f'media-type="image/jpg" isEmbeded="1"/></opf:manifest>')
            o['new_bf'] = new_bf
        else:
            img = o['img']
            new_bin[f"BinData/{img}.jpg"] = photo_bytes(o['photo'])
            hpf = re.sub(
                rf'<opf:item id="{img}" href="[^"]*" media-type="[^"]*" isEmbeded="[01]"/>',
                f'<opf:item id="{img}" href="BinData/{img}.jpg" '
                f'media-type="image/jpg" isEmbeded="1"/>', hpf)

    # section: 분리된 칸의 borderFillIDRef 를 새 id 로 (char 위치 기준, 뒤에서부터)
    repl = [(o['pos'], o['bf'], o['new_bf']) for o in plan if 'new_bf' in o]
    for pos, oldbf, newbf in sorted(repl, key=lambda x: -x[0]):
        seg = sec[pos:pos + 40].replace(
            f'borderFillIDRef="{oldbf}"', f'borderFillIDRef="{newbf}"', 1)
        sec = sec[:pos] + seg + sec[pos + 40:]

    # header: borderFill 추가 + itemCnt 증가
    if extra_bf:
        hdr = hdr.replace('</hh:borderFills>', ''.join(extra_bf) + '</hh:borderFills>')
        m = re.search(r'<hh:borderFills itemCnt="(\d+)"', hdr)
        hdr = hdr.replace(m.group(0),
                          f'<hh:borderFills itemCnt="{int(m.group(1)) + len(extra_bf)}"', 1)

    raw["Contents/header.xml"] = hdr.encode('utf-8')
    raw["Contents/content.hpf"] = hpf.encode('utf-8')
    raw[sec_name] = sec.encode('utf-8')
    raw.update(new_bin)

    try:
        with zipfile.ZipFile(hwpx_out, 'w', zipfile.ZIP_DEFLATED) as zout:
            if 'mimetype' in raw:  # mimetype 은 첫번째·무압축이 안전
                zi = zipfile.ZipInfo('mimetype'); zi.compress_type = zipfile.ZIP_STORED
                zout.writestr(zi, raw.pop('mimetype'))
            for n, d in raw.items():
                zout.writestr(n, d)
    except PermissionError:
        print(f"  오류: 결과 파일에 쓸 수 없습니다 (한글에서 열려 있나요?).\n"
              f"        해당 파일을 닫고 다시 실행해 주세요:\n        {hwpx_out}")
        return False

    print(f"  완료! 사진 {len(new_bin)}장 내장 -> {hwpx_out}")
    return True


# ====================================================================
# 메인
# ====================================================================
def main():
    args = [a for a in sys.argv[1:]]
    flags = {a for a in args if a.startswith("--")}
    quarter_arg = next((a for a in args if not a.startswith("--")), None)
    ask = "--yes" not in flags

    quarter = choose_quarter(quarter_arg)
    photo_folder = os.path.join(PHOTO_BASE, quarter)
    form_src = os.path.join(REPORT_DIR, f"{FORM_PREFIX}{quarter}.hwpx")
    form_out = os.path.join(REPORT_DIR, f"{FORM_PREFIX}{quarter}_사진교체.hwpx")

    print(f"\n===== {quarter} 처리 =====")
    if not os.path.isdir(photo_folder):
        sys.exit(f"오류: 사진 폴더 없음\n{photo_folder}")

    do_rename = "--replace-only" not in flags
    do_replace = "--rename-only" not in flags

    if do_rename:
        if not rename_photos(photo_folder, ask=ask):
            if do_replace:
                print("\n이름 변경에서 멈췄습니다. 사진 교체는 진행하지 않습니다.")
            return

    if do_replace:
        if not os.path.exists(form_src):
            print(f"\n[2단계 안내] 양식 .hwpx 파일이 없습니다:\n  {form_src}")
            print("  한글에서 해당 분기 .hwp 를 열어 '다른 이름으로 저장 -> 한글 문서(*.hwpx)'")
            print("  로 같은 폴더에 저장한 뒤 다시 실행해 주세요.")
            return
        replace_backgrounds(form_src, form_out, photo_folder, ask=ask)
        print(f"\n끝! 결과 파일을 한글로 열어 확인하세요:\n  {form_out}")


if __name__ == "__main__":
    main()
