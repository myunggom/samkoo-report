import os
import sys
import logging
import asyncio
import platform
from datetime import datetime

# Windows에서 asyncio SSL 연결 문제 해결
if platform.system() == "Windows":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# httpcore의 anyio 백엔드 connect_tcp를 직접 패치하여 hosts 파일 우회
# (httpx/anyio는 socket.getaddrinfo를 거치지 않으므로 더 깊은 레벨에서 패치)
TELEGRAM_IP = "149.154.166.110"

def _patch_httpcore():
    import httpcore._backends.anyio as _anyio_be
    _orig_connect = _anyio_be.AnyIOBackend.connect_tcp

    async def _connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        if host == "api.telegram.org":
            host = TELEGRAM_IP
        return await _orig_connect(self, host, port, timeout, local_address, socket_options)

    _anyio_be.AnyIOBackend.connect_tcp = _connect_tcp

_patch_httpcore()
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ConversationHandler,
    filters,
    ContextTypes,
)
from telegram.request import HTTPXRequest

# tools/ 폴더를 import 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# .env 파일 로드 (봇 파일 기준 상위 폴더에서 찾음)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

logging.basicConfig(
    format="%(asctime)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# 대화 단계 — 일일업무일지
(
    MINWON,
    TODAY_WORK, TOMORROW_WORK,
    ARCH_TODAY, ARCH_TOMORROW,
    SEC_TODAY, SEC_TOMORROW,
    CLEAN_TODAY, CLEAN_TOMORROW,
) = range(9)

# 대화 단계 — 전기 에너지 사용량
ELEC_CH4 = 9  # 4개 값을 한 번에 입력받는 단일 단계

# 대화 단계 — 사고보고서
(
    ACC_DATETIME, ACC_LOCATION, ACC_FINDER,
    ACC_CAUSE, ACC_ACTION, ACC_RESOLVE_DATE, ACC_DONE,
) = range(10, 17)


def format_log(data: dict) -> str:
    date        = data.get("date", datetime.now().strftime("%Y.%m.%d"))
    minwon      = data.get("minwon", "없음")
    today_work  = data.get("today_work", "")
    tmrw_work   = data.get("tomorrow_work", "")
    arch_today  = data.get("arch_today", "")
    arch_tmrw   = data.get("arch_tomorrow", "")
    sec_today   = data.get("sec_today", "")
    sec_tmrw    = data.get("sec_tomorrow", "")
    clean_today = data.get("clean_today", "")
    clean_tmrw  = data.get("clean_tomorrow", "")

    return (
        f"일일업무일지 {date}\n"
        f"\n"
        f"☆민원사항\n{minwon}\n"
        f"\n"
        f"★금일업무\n{today_work}\n"
        f"\n"
        f"☆ 명일업무\n{tmrw_work}\n"
        f"\n"
        f"-----------------------------\n"
        f"◇건축 금일업무\n{arch_today}\n"
        f"\n"
        f"◆건축 명일업무\n{arch_tmrw}\n"
        f"\n"
        f"---------------------------------\n"
        f"○보안 금일업무\n{sec_today}\n"
        f"\n"
        f"●보안 명일업무\n{sec_tmrw}\n"
        f"\n"
        f"------------------------------\n"
        f"□미화 금일업무\n{clean_today}\n"
        f"\n"
        f"■미화 명일업무\n{clean_tmrw}"
    )


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    context.user_data["date"] = datetime.now().strftime("%Y.%m.%d")
    await update.message.reply_text(
        f"📋 일일업무일지 작성 시작\n"
        f"날짜: {context.user_data['date']}\n\n"
        "☆ 민원사항을 입력하세요.\n"
        "없으면 '없음' 입력"
    )
    return MINWON


async def get_minwon(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["minwon"] = update.message.text
    await update.message.reply_text(
        "★ 금일업무를 입력하세요.\n\n"
        "번호 매겨서 그대로 입력하면 돼요.\n"
        "예:\n1. OO 작업 완료\n - 세부내용"
    )
    return TODAY_WORK


async def get_today_work(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["today_work"] = update.message.text
    await update.message.reply_text("☆ 명일업무를 입력하세요.")
    return TOMORROW_WORK


async def get_tomorrow_work(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["tomorrow_work"] = update.message.text
    await update.message.reply_text("◇ 건축 금일업무를 입력하세요.")
    return ARCH_TODAY


async def get_arch_today(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["arch_today"] = update.message.text
    await update.message.reply_text("◆ 건축 명일업무를 입력하세요.")
    return ARCH_TOMORROW


async def get_arch_tomorrow(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["arch_tomorrow"] = update.message.text
    await update.message.reply_text("○ 보안 금일업무를 입력하세요.")
    return SEC_TODAY


async def get_sec_today(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["sec_today"] = update.message.text
    await update.message.reply_text("● 보안 명일업무를 입력하세요.")
    return SEC_TOMORROW


async def get_sec_tomorrow(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["sec_tomorrow"] = update.message.text
    await update.message.reply_text("□ 미화 금일업무를 입력하세요.")
    return CLEAN_TODAY


async def get_clean_today(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["clean_today"] = update.message.text
    await update.message.reply_text("■ 미화 명일업무를 입력하세요.")
    return CLEAN_TOMORROW


async def get_clean_tomorrow(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["clean_tomorrow"] = update.message.text
    log_text = format_log(context.user_data)

    await update.message.reply_text("✅ 완료! 아래 텍스트를 카카오톡에 붙여넣기 하세요.\n\n─────────────────")
    await update.message.reply_text(log_text)
    await asyncio.to_thread(save_log, context.user_data["date"], log_text)
    return ConversationHandler.END


def save_log(date: str, log_text: str):
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    creds_path = os.path.join(BASE_DIR, "credentials.json")

    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
        client = gspread.authorize(creds)
        sheet = client.open_by_key(sheet_id).sheet1
        sheet.append_row([date, log_text])
        logger.info(f"구글 시트 저장 완료: {date}")
    except Exception as e:
        logger.error(f"구글 시트 저장 실패: {e}")


async def cmd_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("작성을 취소했습니다. 다시 시작하려면 /log")
    return ConversationHandler.END


# ── 사고보고서 ────────────────────────────────────────────────────────

async def cmd_acc(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "🚨 사고보고서 작성\n\n"
        "사고일시를 입력하세요.\n"
        "예) 2026.04.22 14:30\n\n"
        "취소하려면 /cancel"
    )
    return ACC_DATETIME


async def acc_get_datetime(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_datetime"] = update.message.text.strip()
    await update.message.reply_text("📍 사고 위치를 입력하세요.\n예) B동 3층 복도")
    return ACC_LOCATION


async def acc_get_location(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_location"] = update.message.text.strip()
    await update.message.reply_text("👤 발견자를 입력하세요.\n예) 홍길동 (보안팀)")
    return ACC_FINDER


async def acc_get_finder(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_finder"] = update.message.text.strip()
    await update.message.reply_text("🔍 사고 원인을 입력하세요.")
    return ACC_CAUSE


async def acc_get_cause(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_cause"] = update.message.text.strip()
    await update.message.reply_text("🔧 처리내역을 입력하세요.")
    return ACC_ACTION


async def acc_get_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_action"] = update.message.text.strip()
    await update.message.reply_text(
        "📅 처리일자를 입력하세요.\n예) 2026.04.22\n\n"
        "아직 미처리면 '미정' 입력"
    )
    return ACC_RESOLVE_DATE


async def acc_get_resolve_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_resolve_date"] = update.message.text.strip()
    await update.message.reply_text(
        "✅ 완료여부를 선택하세요.\n\n"
        "완료 / 진행중 / 미처리"
    )
    return ACC_DONE


async def acc_get_done(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["acc_done"] = update.message.text.strip()
    d = context.user_data
    received_at = datetime.now().strftime("%Y.%m.%d %H:%M")

    summary = (
        f"📋 사고보고서 확인\n"
        f"─────────────────\n"
        f"접수일시: {received_at}\n"
        f"사고일시: {d['acc_datetime']}\n"
        f"위    치: {d['acc_location']}\n"
        f"발 견 자: {d['acc_finder']}\n"
        f"원    인: {d['acc_cause']}\n"
        f"처리내역: {d['acc_action']}\n"
        f"처리일자: {d['acc_resolve_date']}\n"
        f"완료여부: {d['acc_done']}\n"
        f"─────────────────"
    )
    await update.message.reply_text(summary)

    try:
        save_accident(
            received_at=received_at,
            acc_datetime=d["acc_datetime"],
            location=d["acc_location"],
            finder=d["acc_finder"],
            cause=d["acc_cause"],
            action=d["acc_action"],
            resolve_date=d["acc_resolve_date"],
            done=d["acc_done"],
        )
        await update.message.reply_text("✅ 구글 시트 '사고보고서' 탭에 저장 완료!")
    except Exception as e:
        logger.error(f"사고보고서 저장 실패: {e}")
        await update.message.reply_text(f"⚠️ 구글 시트 저장 실패:\n{e}")

    return ConversationHandler.END


def save_accident(received_at, acc_datetime, location, finder, cause, action, resolve_date, done):
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    creds_path = os.path.join(BASE_DIR, "credentials.json")

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(sheet_id)

    # 사고보고서 탭 없으면 자동 생성
    try:
        sheet = spreadsheet.worksheet("사고보고서")
    except gspread.exceptions.WorksheetNotFound:
        sheet = spreadsheet.add_worksheet(title="사고보고서", rows=1000, cols=9)
        sheet.append_row(["접수일시", "사고일시", "위치", "발견자", "원인", "처리내역", "처리일자", "완료여부"])
        logger.info("사고보고서 시트 신규 생성")

    sheet.append_row([received_at, acc_datetime, location, finder, cause, action, resolve_date, done])
    logger.info(f"사고보고서 저장 완료: {acc_datetime} / {location}")


# ── 전기 에너지 사용량 ────────────────────────────────────────────

async def cmd_elec(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "⚡ 전기 에너지 사용량 입력\n\n"
        "채널4 채널5 채널6 태양광(MWh) 순서로\n"
        "스페이스로 구분해서 한 줄로 입력하세요.\n\n"
        "예: 57.25 33.50 98.39 7.16"
    )
    return ELEC_CH4


async def get_elec_values(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    parts = update.message.text.split()
    if len(parts) != 4:
        await update.message.reply_text(
            "값이 4개여야 해요. 스페이스로 구분해서 다시 입력해주세요.\n"
            "예: 57.25 33.50 98.39 7.16"
        )
        return ELEC_CH4
    try:
        ch4, ch5, ch6, solar = [float(p) for p in parts]
    except ValueError:
        await update.message.reply_text(
            "숫자를 인식하지 못했어요. 다시 입력해주세요.\n"
            "예: 57.25 33.50 98.39 7.16"
        )
        return ELEC_CH4

    await update.message.reply_text("⏳ 엑셀 업데이트 중... 잠깐만요.")

    try:
        from electricity_report import update_electricity
        loop = asyncio.get_event_loop()
        img_path = await loop.run_in_executor(
            None,
            lambda: update_electricity(ch4, ch5, ch6, solar)
        )
        with open(img_path, 'rb') as f:
            await update.message.reply_photo(f, caption="✅ 전기 에너지 사용량 업데이트 완료!")
    except Exception as e:
        logger.error(f"전기 에너지 오류: {e}")
        await update.message.reply_text(f"❌ 오류가 발생했어요:\n{e}")

    return ConversationHandler.END


_lock_socket = None

def _acquire_lock() -> bool:
    """같은 포트에 두 번 bind할 수 없는 원리로 중복 실행을 차단."""
    global _lock_socket
    import socket as _s
    _lock_socket = _s.socket(_s.AF_INET, _s.SOCK_STREAM)
    try:
        _lock_socket.bind(('127.0.0.1', 47891))
        _lock_socket.listen(1)
        return True
    except OSError:
        logger.error("봇이 이미 실행 중입니다. 중복 실행을 차단합니다.")
        return False


def main():
    if not _acquire_lock():
        sys.exit(1)

    if not TOKEN:
        raise ValueError(".env 파일에 TELEGRAM_BOT_TOKEN이 없습니다.")

    bot_req = HTTPXRequest(
        connection_pool_size=8,
        read_timeout=30,
        write_timeout=30,
        connect_timeout=30,
        http_version="1.1",
    )
    poll_req = HTTPXRequest(
        connection_pool_size=1,
        read_timeout=30,
        write_timeout=30,
        connect_timeout=30,
        http_version="1.1",
    )
    app = Application.builder().token(TOKEN).request(bot_req).get_updates_request(poll_req).build()

    conv = ConversationHandler(
        entry_points=[
            CommandHandler("log", cmd_start),
        ],
        states={
            MINWON:          [MessageHandler(filters.TEXT & ~filters.COMMAND, get_minwon)],
            TODAY_WORK:      [MessageHandler(filters.TEXT & ~filters.COMMAND, get_today_work)],
            TOMORROW_WORK:   [MessageHandler(filters.TEXT & ~filters.COMMAND, get_tomorrow_work)],
            ARCH_TODAY:      [MessageHandler(filters.TEXT & ~filters.COMMAND, get_arch_today)],
            ARCH_TOMORROW:   [MessageHandler(filters.TEXT & ~filters.COMMAND, get_arch_tomorrow)],
            SEC_TODAY:       [MessageHandler(filters.TEXT & ~filters.COMMAND, get_sec_today)],
            SEC_TOMORROW:    [MessageHandler(filters.TEXT & ~filters.COMMAND, get_sec_tomorrow)],
            CLEAN_TODAY:     [MessageHandler(filters.TEXT & ~filters.COMMAND, get_clean_today)],
            CLEAN_TOMORROW:  [MessageHandler(filters.TEXT & ~filters.COMMAND, get_clean_tomorrow)],
        },
        fallbacks=[CommandHandler("cancel", cmd_cancel)],
    )

    app.add_handler(conv)

    elec_conv = ConversationHandler(
        entry_points=[CommandHandler("elec", cmd_elec)],
        states={
            ELEC_CH4: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_elec_values)],
        },
        fallbacks=[CommandHandler("cancel", cmd_cancel)],
    )
    app.add_handler(elec_conv)

    acc_conv = ConversationHandler(
        entry_points=[CommandHandler("acc", cmd_acc)],
        states={
            ACC_DATETIME:    [MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_datetime)],
            ACC_LOCATION:    [MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_location)],
            ACC_FINDER:      [MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_finder)],
            ACC_CAUSE:       [MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_cause)],
            ACC_ACTION:      [MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_action)],
            ACC_RESOLVE_DATE:[MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_resolve_date)],
            ACC_DONE:        [MessageHandler(filters.TEXT & ~filters.COMMAND, acc_get_done)],
        },
        fallbacks=[CommandHandler("cancel", cmd_cancel)],
    )
    app.add_handler(acc_conv)

    from task_manager import get_task_handlers, register_jobs
    for handler in get_task_handlers():
        app.add_handler(handler)
    register_jobs(app)

    from quiz_engine import get_quiz_handlers
    for handler in get_quiz_handlers():
        app.add_handler(handler)

    logger.info("봇 시작됨 — 대기중...")
    app.run_polling(drop_pending_updates=True, timeout=5)


if __name__ == "__main__":
    main()
