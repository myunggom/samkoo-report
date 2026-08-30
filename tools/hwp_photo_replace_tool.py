"""
HWP 사진 교체 도구 (hwp_photo_replace_tool.py)
- HWP 또는 HWPX 파일의 기존 사진을 폴더 사진으로 순서대로 1:1 교체
- 폴더 사진: 숫자 이름 정렬 (1.jpg, 2.jpg, 3.jpg ...)
- 출력: HWPX 형식
"""
import zipfile, os, re, io
from PIL import Image
import win32com.client

# ─── 설정 (여기만 수정) ───────────────────────────────────────────
HWP_PATH     = r'여기에_원본_HWP_파일_경로.hwp'
PHOTO_FOLDER = r'여기에_새_사진_폴더_경로'
OUTPUT_PATH  = r'여기에_결과_파일_경로.hwpx'
HWPX_TEMP    = r'C:\Users\user\Desktop\_hwp_replace_temp.hwpx'
# ──────────────────────────────────────────────────────────────────


def load_photos(folder):
    ext_ok = {'.jpg', '.jpeg', '.png'}
    files = [f for f in os.listdir(folder)
             if os.path.splitext(f)[1].lower() in ext_ok]
    return sorted(files,
                  key=lambda x: int(re.sub(r'\D', '', x.rsplit('.', 1)[0]) or '0'))


def to_jpeg_bytes(path):
    with Image.open(path) as img:
        buf = io.BytesIO()
        img.convert('RGB').save(buf, 'JPEG', quality=95)
        return buf.getvalue()


def img_wh(path):
    with Image.open(path) as img:
        return img.size  # (width, height)


def update_pic_block(block, new_ref, org_w, org_h, dim_w, dim_h):
    cx, cy = org_w // 2, org_h // 2

    block = re.sub(r'binaryItemIDRef="[^"]*"',
                   f'binaryItemIDRef="{new_ref}"', block)
    block = re.sub(r'<hp:orgSz width="[^"]*" height="[^"]*"/>',
                   f'<hp:orgSz width="{org_w}" height="{org_h}"/>', block)
    block = re.sub(r'<hp:imgRect>.*?</hp:imgRect>',
                   f'<hp:imgRect>'
                   f'<hc:pt0 x="0" y="0"/><hc:pt1 x="{org_w}" y="0"/>'
                   f'<hc:pt2 x="{org_w}" y="{org_h}"/><hc:pt3 x="0" y="{org_h}"/>'
                   f'</hp:imgRect>',
                   block, flags=re.DOTALL)
    block = re.sub(r'<hp:imgClip [^/]*/>',
                   f'<hp:imgClip left="0" right="{dim_w}" top="0" bottom="{dim_h}"/>',
                   block)
    block = re.sub(r'<hp:imgDim [^/]*/>',
                   f'<hp:imgDim dimwidth="{dim_w}" dimheight="{dim_h}"/>',
                   block)
    block = re.sub(r'centerX="[^"]*" centerY="[^"]*"',
                   f'centerX="{cx}" centerY="{cy}"', block)
    return block


def hwp_to_hwpx(hwp_path, hwpx_path):
    hwp = win32com.client.Dispatch('HWPFrame.HwpObject')
    hwp.RegisterModule('FilePathCheckDLL', 'SecurityModule')
    hwp.Open(hwp_path, 'HWP', 'forceopen:true')
    hwp.SaveAs(hwpx_path, 'HWPX', '')
    hwp.Quit()


def main():
    photos = load_photos(PHOTO_FOLDER)
    if not photos:
        print('오류: 사진 폴더에 jpg/png 파일이 없습니다.')
        return
    print(f'교체 사진: {len(photos)}장  ({photos[0]} ~ {photos[-1]})')

    # HWPX 준비
    ext = os.path.splitext(HWP_PATH)[1].lower()
    if ext == '.hwp':
        print('HWPX 변환 중...')
        hwp_to_hwpx(HWP_PATH, HWPX_TEMP)
        src_hwpx = HWPX_TEMP
    elif ext in ('.hwpx', '.zip'):
        src_hwpx = HWP_PATH
    else:
        print(f'오류: 지원하지 않는 파일 형식 ({ext})')
        return

    with zipfile.ZipFile(src_hwpx) as z:
        all_files = {name: z.read(name) for name in z.namelist()}

    # 섹션 XML 목록 (section0.xml, section1.xml ...)
    section_names = sorted(
        n for n in all_files if re.match(r'Contents/section\d+\.xml', n)
    )
    print(f'섹션 수: {len(section_names)}개')

    # 문서 내 전체 사진 수 먼저 파악
    total_pics = 0
    for sec_name in section_names:
        xml = all_files[sec_name].decode('utf-8')
        total_pics += len(re.findall(r'<hp:pic\b', xml))
    print(f'문서 내 사진: {total_pics}개')

    if total_pics == 0:
        print('오류: 문서에 사진이 없습니다.')
        return

    replace_count = min(total_pics, len(photos))
    print(f'교체 예정: {replace_count}장'
          + (f'  (폴더 사진 {len(photos) - replace_count}장은 슬롯 부족으로 미사용)'
             if len(photos) > total_pics else '')
          + (f'  (문서 사진 {total_pics - len(photos)}개는 교체 대상 없음 — 원본 유지)'
             if total_pics > len(photos) else ''))

    # 교체 처리
    photo_idx = [0]
    new_bindata = {}
    new_xmls = {}
    old_bindata_keys = {k for k in all_files if k.startswith('BinData/')}
    pic_re = re.compile(r'<hp:pic\b.*?</hp:pic>', re.DOTALL)

    for sec_name in section_names:
        xml = all_files[sec_name].decode('utf-8')

        def replace_pic(m, _photos=photos, _folder=PHOTO_FOLDER,
                        _idx=photo_idx, _bindata=new_bindata):
            i = _idx[0]
            if i >= len(_photos):
                return m.group(0)
            _idx[0] += 1

            photo_path = os.path.join(_folder, _photos[i])
            img_w, img_h = img_wh(photo_path)
            org_w, org_h = img_w * 7747, img_h * 7747
            dim_w, dim_h = img_w * 75,   img_h * 75
            new_ref  = f'RPL{_idx[0]:04d}'
            bin_path = f'BinData/{new_ref}.jpg'
            _bindata[bin_path] = to_jpeg_bytes(photo_path)
            print(f'  [{_idx[0]:3d}] {_photos[i]} → {new_ref}.jpg  ({img_w}×{img_h})')
            return update_pic_block(m.group(0), new_ref, org_w, org_h, dim_w, dim_h)

        new_xmls[sec_name] = pic_re.sub(replace_pic, xml)

    print(f'\n교체 완료: {photo_idx[0]}장')

    # HWPX 저장 (기존 BinData 제거 후 새 것 추가)
    print(f'저장 중: {OUTPUT_PATH}')
    with zipfile.ZipFile(OUTPUT_PATH, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name, data in all_files.items():
            if name in new_xmls:
                zout.writestr(name, new_xmls[name].encode('utf-8'))
            elif name in old_bindata_keys:
                pass  # 기존 이미지 파일 제거
            else:
                zout.writestr(name, data)
        for bp, bd in new_bindata.items():
            zout.writestr(bp, bd)

    if ext == '.hwp' and os.path.exists(HWPX_TEMP):
        os.remove(HWPX_TEMP)

    print(f'\n완료! 저장 위치: {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
