import os
import logging
from datetime import datetime, timedelta, time as dtime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    CommandHandler,
    MessageHandler,
    ConversationHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

logger = logging.getLogger(__name__)

SHEET_TAB = "업무목록"
HEADERS = ["ID", "제목", "마감일", "우선순위", "메모", "상태", "등록일", "처리일"]

RECORD_TAB = "완료업무기록"
RECORD_HEADERS = ["번호", "업무내용", "우선순위", "마감일", "처리일자", "기타사항"]

# 기존 봇 상태값(0~9)과 충돌 방지
TASK_TITLE, TASK_DEADLINE, TASK_PRIORITY, TASK_MEMO, DONE_MEMO = range(10, 15)
EDIT_FIELD, EDIT_VALUE = range(15, 17)

PRIORITY_EMOJI = {"높음": "🔴", "보통": "🟡", "낮음": "🟢"}


# ── 구글 시트 연동 ──────────────────────────────────────────────────────────────

def get_sheet():
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    creds_path = os.path.join(BASE_DIR, "credentials.json")
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(sheet_id)

    sheet_names = [s.title for s in spreadsheet.worksheets()]
    if SHEET_TAB not in sheet_names:
        ws = spreadsheet.add_worksheet(title=SHEET_TAB, rows=1000, cols=10)
        ws.append_row(HEADERS)
    else:
        ws = spreadsheet.worksheet(SHEET_TAB)
    return ws


def get_record_sheet():
    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    creds_path = os.path.join(BASE_DIR, "credentials.json")
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(sheet_id)

    sheet_names = [s.title for s in spreadsheet.worksheets()]
    if RECORD_TAB not in sheet_names:
        ws = spreadsheet.add_worksheet(title=RECORD_TAB, rows=1000, cols=8)
        ws.append_row(RECORD_HEADERS)
    else:
        ws = spreadsheet.worksheet(RECORD_TAB)
    return ws


def write_completion_record(task: dict, memo: str, processed_date: str):
    ws = get_record_sheet()
    records = ws.get_all_records()
    next_num = len(records) + 1
    ws.append_row([
        next_num,
        task["제목"],
        task["우선순위"],
        task["마감일"] if task["마감일"] else "없음",
        processed_date,
        memo if memo else "없음",
    ])


def _cell(row: int, col: int) -> str:
    """행/열 번호를 A1 표기법으로 변환 (A~Z 범위)."""
    return f"{chr(64 + col)}{row}"


def batch_complete_tasks(task_ids: list) -> list:
    """여러 태스크를 한 번의 API 호출 묶음으로 완료 처리."""
    ws = get_sheet()
    records = ws.get_all_records()
    status_col = HEADERS.index("상태") + 1
    date_col = HEADERS.index("처리일") + 1
    processed_date = datetime.now().strftime("%Y.%m.%d")

    id_set = set(task_ids)
    updates = []
    completed = []

    for i, r in enumerate(records, start=2):
        if int(r["ID"]) in id_set:
            updates.append({"range": _cell(i, status_col), "values": [["완료"]]})
            updates.append({"range": _cell(i, date_col), "values": [[processed_date]]})
            completed.append(r)

    if updates:
        ws.batch_update(updates)

    if completed:
        rec_ws = get_record_sheet()
        existing = rec_ws.get_all_records()
        next_num = len(existing) + 1
        rows = [
            [next_num + i, t["제목"], t["우선순위"],
             t["마감일"] if t["마감일"] else "없음", processed_date, "없음"]
            for i, t in enumerate(completed)
        ]
        rec_ws.append_rows(rows)

    return completed


def _next_id(ws) -> int:
    records = ws.get_all_records()
    if not records:
        return 1
    return max(int(r["ID"]) for r in records) + 1


def add_task(title: str, deadline: str, priority: str, memo: str) -> dict:
    ws = get_sheet()
    task_id = _next_id(ws)
    now = datetime.now().strftime("%Y.%m.%d")
    ws.append_row([task_id, title, deadline, priority, memo, "진행중", now, ""])
    return {"id": task_id, "title": title, "deadline": deadline, "priority": priority}


def get_active_tasks() -> list:
    ws = get_sheet()
    records = ws.get_all_records()
    active = [r for r in records if r["상태"] in ("진행중", "지연")]
    # 정렬: 지연 먼저, 그 다음 우선순위 순
    priority_order = {"높음": 0, "보통": 1, "낮음": 2}
    status_order = {"지연": 0, "진행중": 1}
    active.sort(key=lambda x: (
        status_order.get(x["상태"], 9),
        priority_order.get(x["우선순위"], 9),
    ))
    return active


def update_task_field(task_id: int, field: str, value: str) -> bool:
    ws = get_sheet()
    records = ws.get_all_records()
    col = HEADERS.index(field) + 1
    for i, r in enumerate(records, start=2):
        if int(r["ID"]) == task_id:
            ws.update_cell(i, col, value)
            return True
    return False


def update_task_status(task_id: int, status: str) -> bool:
    ws = get_sheet()
    records = ws.get_all_records()
    status_col = HEADERS.index("상태") + 1
    date_col = HEADERS.index("처리일") + 1
    for i, r in enumerate(records, start=2):  # 헤더가 1행이므로 데이터는 2행부터
        if int(r["ID"]) == task_id:
            ws.update_cell(i, status_col, status)
            if status in ("완료", "지연"):
                ws.update_cell(i, date_col, datetime.now().strftime("%Y.%m.%d"))
            return True
    return False


def build_weekly_report() -> str:
    ws = get_sheet()
    records = ws.get_all_records()
    today = datetime.now()

    this_monday = today - timedelta(days=today.weekday())
    last_monday = this_monday - timedelta(days=7)
    last_sunday = this_monday - timedelta(days=1)

    # 지난주에 완료/지연 처리된 태스크
    last_week = []
    for r in records:
        if r["처리일"] and r["상태"] in ("완료", "지연"):
            try:
                processed = datetime.strptime(r["처리일"], "%Y.%m.%d")
                if last_monday.date() <= processed.date() <= last_sunday.date():
                    last_week.append(r)
            except ValueError:
                pass

    # 현재 진행중인 태스크 (이번주 계획)
    this_week = [r for r in records if r["상태"] == "진행중"]
    this_week.sort(key=lambda x: x["마감일"] or "9999")

    lines = [f"📋 주간업무 보고 {today.strftime('%Y.%m.%d')}", ""]
    lines.append("✅ 지난주 업무 이행 내역")
    if last_week:
        for r in last_week:
            mark = "완료 ✓" if r["상태"] == "완료" else "지연 ⚠"
            lines.append(f"• {r['제목']} → {mark}")
    else:
        lines.append("• 처리된 업무 없음")

    lines.append("")
    lines.append("📌 이번주 업무 이행 계획")
    if this_week:
        for r in this_week:
            emoji = PRIORITY_EMOJI.get(r["우선순위"], "")
            deadline = r["마감일"] if r["마감일"] else "없음"
            lines.append(f"• {r['제목']} ({emoji} {r['우선순위']}, 마감: {deadline})")
    else:
        lines.append("• 진행중인 업무 없음")

    return "\n".join(lines)


# ── 텔레그램 핸들러 ─────────────────────────────────────────────────────────────

async def cmd_task(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text("📝 새 업무 등록\n\n업무 제목을 입력하세요.")
    return TASK_TITLE


async def get_task_title(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["title"] = update.message.text.strip()
    await update.message.reply_text(
        "📅 마감일을 입력하세요.\n예: 04/18\n없으면 '없음' 입력"
    )
    return TASK_DEADLINE


async def get_task_deadline(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "없음":
        context.user_data["deadline"] = ""
    else:
        try:
            year = datetime.now().year
            dt = datetime.strptime(f"{year}/{text}", "%Y/%m/%d")
            context.user_data["deadline"] = dt.strftime("%Y.%m.%d")
        except ValueError:
            await update.message.reply_text(
                "날짜 형식이 맞지 않아요. 다시 입력해주세요.\n예: 04/18"
            )
            return TASK_DEADLINE

    keyboard = [[
        InlineKeyboardButton("🔴 높음", callback_data="pri_높음"),
        InlineKeyboardButton("🟡 보통", callback_data="pri_보통"),
        InlineKeyboardButton("🟢 낮음", callback_data="pri_낮음"),
    ]]
    await update.message.reply_text(
        "⚡ 우선순위를 선택하세요.",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return TASK_PRIORITY


async def get_task_priority(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    priority = query.data.replace("pri_", "")
    context.user_data["priority"] = priority
    await query.edit_message_text(f"우선순위: {PRIORITY_EMOJI[priority]} {priority}")
    await query.message.reply_text("📝 메모를 입력하세요.\n없으면 '없음' 입력")
    return TASK_MEMO


async def get_task_memo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    memo = update.message.text.strip()
    if memo == "없음":
        memo = ""

    d = context.user_data
    try:
        import asyncio
        task = await asyncio.to_thread(add_task, d["title"], d["deadline"], d["priority"], memo)
        deadline_str = task["deadline"] if task["deadline"] else "없음"
        await update.message.reply_text(
            f"✅ 등록 완료!\n\n"
            f"제목: {task['title']}\n"
            f"마감: {deadline_str}\n"
            f"우선순위: {PRIORITY_EMOJI[task['priority']]} {task['priority']}"
        )
    except Exception as e:
        logger.error(f"태스크 등록 실패: {e}")
        await update.message.reply_text(f"❌ 저장 중 오류가 발생했어요:\n{e}")
    return ConversationHandler.END


async def cmd_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ 목록 불러오는 중...")
    try:
        import asyncio
        tasks = await asyncio.to_thread(get_active_tasks)
    except Exception as e:
        await update.message.reply_text(f"❌ 목록 불러오기 실패:\n{e}")
        return

    if not tasks:
        await update.message.reply_text("현재 진행중인 업무가 없습니다.")
        return

    context.user_data["task_list"] = tasks

    lines = ["📋 현재 업무 목록\n"]
    for i, t in enumerate(tasks, 1):
        status_emoji = "⏰" if t["상태"] == "지연" else "🔵"
        emoji = PRIORITY_EMOJI.get(t["우선순위"], "")
        deadline = t["마감일"] if t["마감일"] else "없음"
        lines.append(f"{i}. {status_emoji} {t['제목']}")
        lines.append(f"   {emoji} {t['우선순위']} | 마감: {deadline}")
        if t["메모"]:
            lines.append(f"   📝 {t['메모']}")
        lines.append("")

    lines.append("완료 처리: /done 1  또는  /done 1 2 3 (여러 개)")
    lines.append("지연 처리: /delay [번호]")
    lines.append("내용 수정: /edit [번호]")
    await update.message.reply_text("\n".join(lines))


async def cmd_done(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """완료 처리 — 단일(/done 1): 메모 입력 후 저장, 복수(/done 1 2 3): 즉시 일괄 처리."""
    args = context.args
    if not args or not all(a.isdigit() for a in args):
        await update.message.reply_text("번호를 입력해주세요.\n예: /done 1\n여러 개: /done 1 2 3")
        return ConversationHandler.END

    import asyncio
    try:
        tasks = await asyncio.to_thread(get_active_tasks)
    except Exception as e:
        await update.message.reply_text(f"❌ 목록 조회 실패:\n{e}")
        return ConversationHandler.END

    # 번호 유효성 검사 (중복 제거)
    seen = set()
    indices = []
    invalid = []
    for a in args:
        idx = int(a) - 1
        if 0 <= idx < len(tasks) and idx not in seen:
            indices.append(idx)
            seen.add(idx)
        elif idx not in seen:
            invalid.append(a)
            seen.add(idx)

    if invalid:
        await update.message.reply_text(
            f"없는 번호: {', '.join(invalid)}\n1~{len(tasks)} 사이 번호를 입력해주세요."
        )
        return ConversationHandler.END

    # 단일 태스크 → 기존 흐름 (메모 입력)
    if len(indices) == 1:
        task = tasks[indices[0]]
        context.user_data["done_task"] = task
        await update.message.reply_text(
            f"✅ '{task['제목']}' 완료 처리\n\n"
            f"기타사항을 입력하세요.\n"
            f"(처리 내용, 메모 등 — 없으면 '없음' 입력)"
        )
        return DONE_MEMO

    # 복수 태스크 → 즉시 일괄 처리
    selected_ids = [tasks[i]["ID"] for i in indices]
    await update.message.reply_text(f"⏳ {len(indices)}개 업무 완료 처리 중...")
    try:
        completed = await asyncio.to_thread(batch_complete_tasks, selected_ids)
        lines = [f"✅ 완료 처리 ({len(completed)}건):"]
        for t in completed:
            lines.append(f"  • {t['제목']}")
        await update.message.reply_text("\n".join(lines))
    except Exception as e:
        logger.error(f"일괄 완료 처리 실패: {e}")
        await update.message.reply_text(f"❌ 오류가 발생했어요:\n{e}")

    return ConversationHandler.END


async def get_done_memo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    memo = update.message.text.strip()
    if memo == "없음":
        memo = ""

    task = context.user_data.get("done_task")
    if not task:
        await update.message.reply_text("오류: 태스크 정보가 없어요. 다시 시도해주세요.")
        return ConversationHandler.END

    processed_date = datetime.now().strftime("%Y.%m.%d")
    try:
        import asyncio
        await asyncio.to_thread(update_task_status, int(task["ID"]), "완료")
        await asyncio.to_thread(write_completion_record, task, memo, processed_date)
        await update.message.reply_text(
            f"✅ '{task['제목']}' 완료 처리됐습니다.\n"
            f"완료업무기록 시트에 저장됐어요."
        )
    except Exception as e:
        logger.error(f"완료 처리 실패: {e}")
        await update.message.reply_text(f"❌ 오류가 발생했어요:\n{e}")

    context.user_data.pop("done_task", None)
    return ConversationHandler.END


async def cmd_delay(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if not args or not args[0].isdigit():
        await update.message.reply_text("번호를 입력해주세요.\n예: /delay 1")
        return

    tasks = context.user_data.get("task_list")
    if not tasks:
        # task_list 없으면 직접 조회
        try:
            tasks = get_active_tasks()
        except Exception as e:
            await update.message.reply_text(f"❌ 목록 조회 실패:\n{e}")
            return

    idx = int(args[0]) - 1
    if idx < 0 or idx >= len(tasks):
        await update.message.reply_text(f"1~{len(tasks)} 사이 번호를 입력해주세요.")
        return

    task = tasks[idx]
    try:
        import asyncio
        await asyncio.to_thread(update_task_status, int(task["ID"]), "지연")
        await update.message.reply_text(f"⏰ '{task['제목']}' → 지연 처리됐습니다.")
        context.user_data.pop("task_list", None)
    except Exception as e:
        logger.error(f"상태 변경 실패: {e}")
        await update.message.reply_text(f"❌ 오류가 발생했어요:\n{e}")


async def cmd_weekly(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ 주간보고 생성 중...")
    try:
        import asyncio
        report = await asyncio.to_thread(build_weekly_report)
        await update.message.reply_text("아래 텍스트를 카카오톡에 붙여넣기 하세요.\n\n─────────────────")
        await update.message.reply_text(report)
    except Exception as e:
        logger.error(f"주간보고 오류: {e}")
        await update.message.reply_text(f"❌ 오류가 발생했어요:\n{e}")


async def cmd_edit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    args = context.args
    if not args or not args[0].isdigit():
        await update.message.reply_text("번호를 입력해주세요.\n예: /edit 1")
        return ConversationHandler.END

    await update.message.reply_text("⏳ 불러오는 중...")
    try:
        import asyncio
        tasks = await asyncio.to_thread(get_active_tasks)
    except Exception as e:
        await update.message.reply_text(f"❌ 목록 조회 실패:\n{e}")
        return ConversationHandler.END

    idx = int(args[0]) - 1
    if idx < 0 or idx >= len(tasks):
        await update.message.reply_text(f"1~{len(tasks)} 사이 번호를 입력해주세요.")
        return ConversationHandler.END

    task = tasks[idx]
    context.user_data["edit_task"] = task

    deadline = task["마감일"] if task["마감일"] else "없음"
    memo = task["메모"] if task["메모"] else "없음"

    keyboard = [
        [InlineKeyboardButton("📝 제목", callback_data="edit_제목"),
         InlineKeyboardButton("📅 마감일", callback_data="edit_마감일")],
        [InlineKeyboardButton("⚡ 우선순위", callback_data="edit_우선순위"),
         InlineKeyboardButton("📋 메모", callback_data="edit_메모")],
    ]
    await update.message.reply_text(
        f"✏️ 수정할 업무\n\n"
        f"제목: {task['제목']}\n"
        f"마감: {deadline}\n"
        f"우선순위: {PRIORITY_EMOJI.get(task['우선순위'],'')} {task['우선순위']}\n"
        f"메모: {memo}\n\n"
        f"수정할 항목을 선택하세요.",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return EDIT_FIELD


async def get_edit_field(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    field = query.data.replace("edit_", "")
    context.user_data["edit_field"] = field

    if field == "우선순위":
        keyboard = [[
            InlineKeyboardButton("🔴 높음", callback_data="epri_높음"),
            InlineKeyboardButton("🟡 보통", callback_data="epri_보통"),
            InlineKeyboardButton("🟢 낮음", callback_data="epri_낮음"),
        ]]
        await query.edit_message_text(
            "⚡ 새 우선순위를 선택하세요.",
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        return EDIT_VALUE

    hints = {
        "제목": "새 제목을 입력하세요.",
        "마감일": "새 마감일을 입력하세요.\n예: 04/30\n없으면 '없음' 입력",
        "메모": "새 메모를 입력하세요.\n없으면 '없음' 입력",
    }
    await query.edit_message_text(hints.get(field, f"{field}을 입력하세요."))
    return EDIT_VALUE


async def get_edit_value(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    # 우선순위는 콜백, 나머지는 텍스트
    if update.callback_query:
        query = update.callback_query
        await query.answer()
        value = query.data.replace("epri_", "")
        reply = query.edit_message_text
        async def reply_text(text): await query.edit_message_text(text)
        async def send_result(text): await query.message.reply_text(text)
    else:
        value = update.message.text.strip()
        async def reply_text(text): pass
        async def send_result(text): await update.message.reply_text(text)

    field = context.user_data.get("edit_field")
    task = context.user_data.get("edit_task")

    if field == "마감일":
        if value == "없음":
            value = ""
        else:
            try:
                year = datetime.now().year
                dt = datetime.strptime(f"{year}/{value}", "%Y/%m/%d")
                value = dt.strftime("%Y.%m.%d")
            except ValueError:
                await send_result("날짜 형식이 맞지 않아요.\n예: 04/30")
                return EDIT_VALUE
    elif field == "메모" and value == "없음":
        value = ""

    field_map = {"제목": "제목", "마감일": "마감일", "우선순위": "우선순위", "메모": "메모"}
    try:
        import asyncio
        await asyncio.to_thread(update_task_field, int(task["ID"]), field_map[field], value)
        display = value if value else "없음"
        if field == "우선순위":
            display = f"{PRIORITY_EMOJI.get(value,'')} {value}"
        await send_result(f"✅ '{task['제목']}'\n{field} → {display} 로 수정됐습니다.")
    except Exception as e:
        logger.error(f"업무 수정 실패: {e}")
        await send_result(f"❌ 수정 중 오류가 발생했어요:\n{e}")

    return ConversationHandler.END


async def cmd_task_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("취소했습니다.")
    return ConversationHandler.END


async def cmd_myid(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        f"내 Chat ID: {chat_id}\n\n"
        f".env 파일에 아래 줄을 추가하세요:\n"
        f"TELEGRAM_CHAT_ID={chat_id}"
    )


# ── 일일 알림 ────────────────────────────────────────────────────────────────────

KST = ZoneInfo("Asia/Seoul")


def build_daily_digest() -> str | None:
    """오늘 마감 업무와 기한 초과 업무를 정리해서 반환. 없으면 None."""
    ws = get_sheet()
    records = ws.get_all_records()
    today = datetime.now(KST).date()

    overdue = []
    due_today = []

    for r in records:
        if r["상태"] != "진행중" or not r["마감일"]:
            continue
        try:
            deadline = datetime.strptime(r["마감일"], "%Y.%m.%d").date()
        except ValueError:
            continue
        if deadline < today:
            overdue.append(r)
        elif deadline == today:
            due_today.append(r)

    if not overdue and not due_today:
        return None

    lines = [f"📋 업무 알림 {today.strftime('%Y.%m.%d')}\n"]

    if overdue:
        lines.append("⚠️ 기한 초과 업무")
        for r in sorted(overdue, key=lambda x: x["마감일"]):
            emoji = PRIORITY_EMOJI.get(r["우선순위"], "")
            lines.append(f"• {r['제목']} (마감: {r['마감일']}, {emoji} {r['우선순위']})")
        lines.append("")

    if due_today:
        lines.append("📌 오늘 마감 업무")
        for r in due_today:
            emoji = PRIORITY_EMOJI.get(r["우선순위"], "")
            lines.append(f"• {r['제목']} ({emoji} {r['우선순위']})")

    lines.append("")
    lines.append("/list 로 전체 목록을 확인하세요.")
    return "\n".join(lines)


async def daily_digest_job(context: ContextTypes.DEFAULT_TYPE):
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not chat_id:
        logger.warning("TELEGRAM_CHAT_ID 미설정 — 알림 건너뜀. /myid 로 확인 후 .env에 추가하세요.")
        return
    try:
        import asyncio
        message = await asyncio.to_thread(build_daily_digest)
        if message:
            await context.bot.send_message(chat_id=chat_id, text=message)
        else:
            logger.info("오늘 알릴 업무 없음 — 알림 건너뜀.")
    except Exception as e:
        logger.error(f"일일 알림 발송 실패: {e}")


async def cmd_digest(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """지금 즉시 일일 알림 메시지를 테스트 발송."""
    try:
        import asyncio
        message = await asyncio.to_thread(build_daily_digest)
        if message:
            await update.message.reply_text(message)
        else:
            await update.message.reply_text("📭 오늘 마감이거나 기한이 지난 업무가 없어요.")
    except Exception as e:
        logger.error(f"/digest 오류: {e}")
        await update.message.reply_text(f"❌ 오류가 발생했어요:\n{e}")


def register_jobs(app):
    """봇 앱에 일일 알림 스케줄을 등록한다."""
    alarm_hour = int(os.getenv("DAILY_ALARM_HOUR", "9"))
    alarm_time = dtime(hour=alarm_hour, minute=0, tzinfo=KST)
    app.job_queue.run_daily(daily_digest_job, time=alarm_time, name="daily_digest")
    logger.info(f"일일 알림 등록 완료 — 매일 {alarm_hour:02d}:00 KST")


def get_task_handlers():
    """daily_log_bot.py에서 가져다 쓸 핸들러 목록을 반환한다."""
    task_conv = ConversationHandler(
        entry_points=[CommandHandler("task", cmd_task)],
        states={
            TASK_TITLE:    [MessageHandler(filters.TEXT & ~filters.COMMAND, get_task_title)],
            TASK_DEADLINE: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_task_deadline)],
            TASK_PRIORITY: [CallbackQueryHandler(get_task_priority, pattern="^pri_")],
            TASK_MEMO:     [MessageHandler(filters.TEXT & ~filters.COMMAND, get_task_memo)],
        },
        fallbacks=[CommandHandler("cancel", cmd_task_cancel)],
    )
    done_conv = ConversationHandler(
        entry_points=[CommandHandler("done", cmd_done)],
        states={
            DONE_MEMO: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_done_memo)],
        },
        fallbacks=[CommandHandler("cancel", cmd_task_cancel)],
    )
    edit_conv = ConversationHandler(
        entry_points=[CommandHandler("edit", cmd_edit)],
        states={
            EDIT_FIELD: [CallbackQueryHandler(get_edit_field, pattern="^edit_")],
            EDIT_VALUE: [
                CallbackQueryHandler(get_edit_value, pattern="^epri_"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, get_edit_value),
            ],
        },
        fallbacks=[CommandHandler("cancel", cmd_task_cancel)],
    )
    return [
        task_conv,
        done_conv,
        edit_conv,
        CommandHandler("list", cmd_list),
        CommandHandler("delay", cmd_delay),
        CommandHandler("weekly", cmd_weekly),
        CommandHandler("digest", cmd_digest),
        CommandHandler("myid", cmd_myid),
    ]
