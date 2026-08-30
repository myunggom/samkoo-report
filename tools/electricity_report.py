import os
import logging
from datetime import datetime
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

logger = logging.getLogger(__name__)

EXCEL_PATH = r"C:\Users\user\Desktop\Bio Innovation Hub\02 Areas\관리\[관리] 일일업무일지\전기 에너지 사용량.xlsx"
CAPTURE_RANGE = "A1:G5"
TEMPLATE_SHEET = "템플릿"


def get_current_sheet_name(dt: datetime = None) -> str:
    if dt is None:
        dt = datetime.now()
    return dt.strftime("%Y.%m")


def update_electricity(ch4: float, ch5: float, ch6: float, solar_mwh: float) -> str:
    """
    엑셀에 오늘 전기 에너지 검침값을 입력하고 A1:G20 캡처 이미지 경로를 반환.
    ch4, ch5, ch6: 채널별 검침값
    solar_mwh: 태양광 발전량 (MWh) → 내부에서 kWh로 변환
    """
    import xlwings as xw
    from PIL import ImageGrab

    today = datetime.now()
    sheet_name = get_current_sheet_name(today)
    day = today.day
    log_row = 10 + day  # 행 11 = 1일, 행 12 = 2일, ...
    solar_kwh = round(solar_mwh * 1000, 2)

    app = xw.App(visible=True, add_book=False)
    try:
        wb = app.books.open(EXCEL_PATH)
        sheet_names = [s.name for s in wb.sheets]

        # 이번 달 시트 없으면 새로 생성 (월 전환)
        if sheet_name not in sheet_names:
            _create_new_month_sheet(wb, sheet_name, today)

        sheet = wb.sheets[sheet_name]

        # 당일 재실행 여부 확인 (오늘 행에 이미 값이 있으면 수정 모드)
        is_update = sheet.range(f'I{log_row}').value is not None

        if not is_update:
            # 첫 입력: B12:D12 → B11:D11, F5 → E11 (전일값 이동)
            sheet.range('B11').value = sheet.range('B12').value
            sheet.range('C11').value = sheet.range('C12').value
            sheet.range('D11').value = sheet.range('D12').value
            sheet.range('E11').value = sheet.range('F5').value
        # 당일 수정이면 B11:D11, E11은 그대로 유지

        # 오늘 검침값 입력
        sheet.range('B12').value = ch4
        sheet.range('C12').value = ch5
        sheet.range('D12').value = ch6

        # 태양광 kWh 입력
        sheet.range('F19').value = solar_kwh

        # 수식 재계산 후 F20 → E13 (태양광 일일 차이)
        wb.app.calculate()
        sheet.range('E13').value = sheet.range('F20').value

        # 월간 일별 기록 테이블 기입 (당일 재실행 시 덮어쓰기)
        sheet.range(f'I{log_row}').value = ch4
        sheet.range(f'J{log_row}').value = ch5
        sheet.range(f'K{log_row}').value = ch6
        sheet.range(f'L{log_row}').value = sheet.range('E13').value  # E13값 저장

        wb.app.calculate()
        sheet.range(f'M{log_row}').value = sheet.range('E3').value

        # 저장
        wb.save()

        # A1:G20 캡처
        tmp_dir = os.path.join(BASE_DIR, '.tmp')
        os.makedirs(tmp_dir, exist_ok=True)
        img_path = os.path.join(tmp_dir, 'electricity_capture.png')

        sheet.range(CAPTURE_RANGE).api.CopyPicture(Format=2)
        img = ImageGrab.grabclipboard()
        if img is None:
            raise RuntimeError("클립보드에서 이미지를 가져오지 못했어요. 잠시 후 다시 시도해주세요.")
        img.save(img_path)

        wb.close()
        logger.info(f"전기 에너지 업데이트 완료: {today.strftime('%Y.%m.%d')}")
        return img_path

    except Exception as e:
        logger.error(f"전기 에너지 업데이트 실패: {e}")
        try:
            wb.close()
        except Exception:
            pass
        raise
    finally:
        app.quit()


def _create_new_month_sheet(wb, new_sheet_name: str, today: datetime):
    """
    템플릿 시트를 복사해 새 달 시트를 생성하고,
    전월 마지막 검침값을 이어받아 초기값을 설정.
    """
    sheet_names = [s.name for s in wb.sheets]

    if TEMPLATE_SHEET not in sheet_names:
        raise RuntimeError(
            f"엑셀에 '{TEMPLATE_SHEET}' 시트가 없어요. "
            "템플릿 시트를 만들어두세요."
        )

    # 전월 시트 이름 계산
    if today.month == 1:
        prev_dt = datetime(today.year - 1, 12, 1)
    else:
        prev_dt = datetime(today.year, today.month - 1, 1)
    prev_sheet_name = prev_dt.strftime("%Y.%m")

    # 전월 마지막 검침값 가져오기
    prev_b12 = prev_c12 = prev_d12 = None
    if prev_sheet_name in sheet_names:
        prev_sheet = wb.sheets[prev_sheet_name]
        prev_b12 = prev_sheet.range('B12').value
        prev_c12 = prev_sheet.range('C12').value
        prev_d12 = prev_sheet.range('D12').value

    # 템플릿 복사 → 새 시트 생성
    template = wb.sheets[TEMPLATE_SHEET]
    template.api.Copy(After=wb.sheets[-1].api)
    new_sheet = wb.sheets[-1]
    new_sheet.name = new_sheet_name

    # 전월값 초기 세팅
    if prev_b12 is not None:
        new_sheet.range('I10').value = prev_b12
        new_sheet.range('J10').value = prev_c12
        new_sheet.range('K10').value = prev_d12
        new_sheet.range('B11').value = prev_b12
        new_sheet.range('C11').value = prev_c12
        new_sheet.range('D11').value = prev_d12

    # 태양광 전일값 = 0
    new_sheet.range('E11').value = 0

    logger.info(f"새 시트 생성: {new_sheet_name} (전월: {prev_sheet_name})")
