"""
HWP 열화상 측정기록표 사진 삽입 도구 (HWPX XML 직접 조작 방식)
- 실화상 셀: 홀수 번호 사진 (1, 3, 5...)
- 열화상 셀: 짝수 번호 사진 (2, 4, 6...)
"""
import zipfile, os, re
from PIL import Image
import win32com.client

HWP_PATH    = r'C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\전기\[전기] 적외선 열화상분포 측정기록표\[양식] 적외선 열화상분포 측정기록표_바이오 이노베이션 허브_최종양식.hwp'
PHOTO_FOLDER = r'C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\전기\[전기] 적외선 열화상분포 측정기록표\사진\2026년 1분기'
OUTPUT_PATH  = r'C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\전기\[전기] 적외선 열화상분포 측정기록표\[결과] 열화상측정기록표_사진삽입완료.hwpx'
HWPX_TEMP   = r'C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\전기\[전기] 적외선 열화상분포 측정기록표\_work_temp.hwpx'

# 셀 크기 상수 (1/100mm 단위)
CELL_W      = 23303
CELL_H      = 13401
CELL_MARGIN = 141
AVAIL_W     = CELL_W - CELL_MARGIN * 2   # 23021
AVAIL_H     = CELL_H - CELL_MARGIN * 2   # 13119

def clean_jpeg(photo_path):
    """FLIR 전용 메타데이터를 제거한 표준 JPEG로 재인코딩"""
    import io
    with Image.open(photo_path) as img:
        buf = io.BytesIO()
        img.convert('RGB').save(buf, 'JPEG', quality=95)
        return buf.getvalue()


def calc_display_size(img_w, img_h):
    if AVAIL_W * img_h <= AVAIL_H * img_w:
        disp_w = AVAIL_W
        disp_h = int(AVAIL_W * img_h / img_w)
    else:
        disp_h = AVAIL_H
        disp_w = int(AVAIL_H * img_w / img_h)
    return disp_w, disp_h


def make_pic_xml(bin_name, ph_w, ph_h, disp_w, disp_h, inst_id, char_pr):
    # _ref_patched.hwpx 검증 완료 구조
    org_w = ph_w * 7747   # EMU 기반 원본 크기 (72dpi FLIR)
    org_h = ph_h * 7747
    dim_w = ph_w * 75     # imgDim/imgClip 단위 (픽셀×75)
    dim_h = ph_h * 75
    cx = org_w // 2
    cy = org_h // 2
    instid = inst_id + 10000000  # id와 instid를 다르게 설정 (ref_patched 방식)
    return (
        f'<hp:run charPrIDRef="{char_pr}">'
        f'<hp:pic id="{inst_id}" zOrder="0" numberingType="PICTURE" '
        f'textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" '
        f'dropcapstyle="None" href="" groupLevel="0" instid="{instid}" reverse="0">'
        f'<hp:offset x="0" y="0"/>'
        f'<hp:orgSz width="{org_w}" height="{org_h}"/>'
        f'<hp:curSz width="{disp_w}" height="{disp_h}"/>'
        f'<hp:flip horizontal="0" vertical="0"/>'
        f'<hp:rotationInfo angle="0" centerX="{cx}" centerY="{cy}" rotateimage="1"/>'
        f'<hp:renderingInfo>'
        f'<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
        f'<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
        f'<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
        f'</hp:renderingInfo>'
        f'<hc:img binaryItemIDRef="{bin_name}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>'
        f'<hp:imgRect>'
        f'<hc:pt0 x="0" y="0"/><hc:pt1 x="{org_w}" y="0"/>'
        f'<hc:pt2 x="{org_w}" y="{org_h}"/><hc:pt3 x="0" y="{org_h}"/>'
        f'</hp:imgRect>'
        f'<hp:imgClip left="0" right="{dim_w}" top="0" bottom="{dim_h}"/>'
        f'<hp:inMargin left="0" right="0" top="0" bottom="0"/>'
        f'<hp:imgDim dimwidth="{dim_w}" dimheight="{dim_h}"/>'
        f'<hp:effects/>'
        f'<hp:sz width="{disp_w}" widthRelTo="ABSOLUTE" height="{disp_h}" heightRelTo="ABSOLUTE" protect="0"/>'
        f'<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
        f'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" '
        f'horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
        f'<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
        f'</hp:pic><hp:t/>'   # ref_patched 구조: pic 뒤에 빈 텍스트 앵커 필요
        f'</hp:run>'
    )


def make_lineseg_xml(org_h, cell_w):
    """이미지가 들어간 줄의 linesegarray — vertsize를 orgSz height(EMU)로 설정"""
    baseline = int(org_h * 0.85)
    return (
        f'<hp:linesegarray>'
        f'<hp:lineseg textpos="0" vertpos="0" vertsize="{org_h}" textheight="{org_h}" '
        f'baseline="{baseline}" spacing="600" horzpos="0" horzsize="{cell_w}" flags="393216"/>'
        f'</hp:linesegarray>'
    )


def main():
    # 사진 목록
    photos = sorted(
        [f for f in os.listdir(PHOTO_FOLDER) if f.lower().endswith('.jpg')],
        key=lambda x: int(x.rsplit('.', 1)[0])
    )
    print(f'사진 {len(photos)}장 발견 ({photos[0]} ~ {photos[-1]})')

    # 1. HWP -> HWPX
    print('HWPX 변환 중...')
    hwp = win32com.client.Dispatch('HWPFrame.HwpObject')
    hwp.RegisterModule('FilePathCheckDLL', 'SecurityModule')
    hwp.Open(HWP_PATH, 'HWP', 'forceopen:true')
    hwp.SaveAs(HWPX_TEMP, 'HWPX', '')
    hwp.Quit()

    # 2. XML 읽기
    with zipfile.ZipFile(HWPX_TEMP) as z:
        xml       = z.read('Contents/section0.xml').decode('utf-8')
        header    = z.read('Contents/header.xml').decode('utf-8')
        all_files = {name: z.read(name) for name in z.namelist()}

    # 3. 실화상 / 열화상 패턴 (뒤따르는 linesegarray도 함께 캡처)
    _ls = r'(?:<hp:linesegarray><hp:lineseg [^/]*/></hp:linesegarray>)?'
    real_pat  = re.compile(r'<hp:run charPrIDRef="([^"]*)"><hp:t>실화상</hp:t></hp:run>' + _ls)
    therm_pat = re.compile(r'<hp:run charPrIDRef="([^"]*)"><hp:t>열화상</hp:t></hp:run>' + _ls)

    real_count  = len(real_pat.findall(xml))
    therm_count = len(therm_pat.findall(xml))
    print(f'실화상 셀: {real_count}개  열화상 셀: {therm_count}개')

    max_pairs = min(real_count, therm_count, len(photos) // 2)
    print(f'삽입 가능 쌍: {max_pairs}개 (사진 {max_pairs*2}장)')
    if len(photos) // 2 > max_pairs:
        remaining = len(photos) // 2 - max_pairs
        print(f'주의: {remaining}쌍({remaining*2}장)은 슬롯 부족으로 미삽입')

    # 4. 이미지 데이터 수집 & XML 치환
    # binaryItemIDRef: 파일명 기반 문자열 (binDataList 불필요 — HWP 네이티브 방식)
    new_bindata = {}   # bin_path -> raw bytes
    inst_counter = [2000000]

    real_idx  = [0]
    therm_idx = [0]

    def replace_real(m):
        i = real_idx[0]
        real_idx[0] += 1
        if i >= max_pairs:
            return m.group(0)
        photo_num  = 2 * i + 1
        photo_path = os.path.join(PHOTO_FOLDER, f'{photo_num}.jpg')
        bin_name   = f'rp{photo_num}'
        bin_path   = f'BinData/{bin_name}.jpg'
        inst_id    = inst_counter[0]
        inst_counter[0] += 1
        with Image.open(photo_path) as img:
            ph_w, ph_h = img.size
        disp_w, disp_h = calc_display_size(ph_w, ph_h)
        with open(photo_path, 'rb') as f:
            new_bindata[bin_path] = f.read()
        pic = make_pic_xml(bin_name, ph_w, ph_h, disp_w, disp_h, inst_id, m.group(1))
        ls  = make_lineseg_xml(ph_h * 7747, AVAIL_W)
        return pic + ls

    def replace_therm(m):
        i = therm_idx[0]
        therm_idx[0] += 1
        if i >= max_pairs:
            return m.group(0)
        photo_num  = 2 * (i + 1)
        photo_path = os.path.join(PHOTO_FOLDER, f'{photo_num}.jpg')
        bin_name   = f'tp{photo_num}'
        bin_path   = f'BinData/{bin_name}.jpg'
        inst_id    = inst_counter[0]
        inst_counter[0] += 1
        with Image.open(photo_path) as img:
            ph_w, ph_h = img.size
        disp_w, disp_h = calc_display_size(ph_w, ph_h)
        with open(photo_path, 'rb') as f:
            new_bindata[bin_path] = f.read()
        pic = make_pic_xml(bin_name, ph_w, ph_h, disp_w, disp_h, inst_id, m.group(1))
        ls  = make_lineseg_xml(ph_h * 7747, AVAIL_W)
        return pic + ls

    new_xml = real_pat.sub(replace_real, xml)
    new_xml = therm_pat.sub(replace_therm, new_xml)
    print(f'실화상 교체: {real_idx[0]}개  열화상 교체: {therm_idx[0]}개')

    # 5. header.xml 수정 없음 (파일명 기반 참조는 binDataList 불필요)
    new_header = header

    # 6. HWPX 저장
    print(f'저장 중: {OUTPUT_PATH}')
    with zipfile.ZipFile(OUTPUT_PATH, 'w', zipfile.ZIP_DEFLATED) as zout:
        for name, data in all_files.items():
            if name == 'Contents/section0.xml':
                zout.writestr(name, new_xml.encode('utf-8'))
            elif name == 'Contents/header.xml':
                zout.writestr(name, new_header.encode('utf-8'))
            else:
                zout.writestr(name, data)
        for bin_path, bin_data in new_bindata.items():
            zout.writestr(bin_path, bin_data)

    os.remove(HWPX_TEMP)
    print(f'완료! 파일: {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
