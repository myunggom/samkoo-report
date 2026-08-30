"""
보디빌딩 구술시험 퀴즈 엔진 - 텔레그램 봇 핸들러
OCR 추출 480개 문제를 별점 순서대로 텔레그램으로 전송
"""
import re
import os
import random as _random
from telegram import Update
from telegram.ext import CommandHandler, ContextTypes

_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OCR_FILE = os.path.join(_BASE, '.tmp', 'ocr_full.txt')

# ── OCR 오타 수정 ─────────────────────────────────────────────────────────────
_FIXES = [
    ('트레이닐', '트레이닝'), ('트레이님', '트레이닝'),
    ('트레이낭', '트레이닝'), ('트레이넣', '트레이닝'),
    ('트레이블', '트레이닝'), ('트레이딩', '트레이닝'),
    ('심패소생', '심폐소생'), ('심페소생', '심폐소생'),
    ('심패기능', '심폐기능'), ('심페기능', '심폐기능'),
    ('드레성', '드레싱'), ('진피증', '진피층'),
    ('지렇이', '지혈이'), ('지렇올', '지혈을'),
    ('출헬시', '출혈시'), ('출헬', '출혈'),
    ('골b ', '골든 '), ('응급처지', '응급처치'),
    ('과잠바', '과부하'), ('수추과', '수축과'),
]

def _clean(text: str) -> str:
    for old, new in _FIXES:
        text = text.replace(old, new)
    return text

# ── 별점 파싱 ─────────────────────────────────────────────────────────────────
def _stars(text: str) -> int:
    if re.search(r'10회\s*이상', text):
        return 6
    m = re.search(r'★+', text)
    if m:
        return len(m.group())
    m = re.search(r'\(\s*([\*\s]+)\s*(?:,\s*10회)?\s*\)', text)
    if m:
        return min(len(m.group(1).replace(' ', '')), 5)
    return 0

def _star_label(n: int) -> str:
    if n >= 6:
        return '⭐⭐⭐⭐⭐ (10회+최빈출)'
    return '⭐' * n if n > 0 else '기출없음'

_NOISE = re.compile(
    r'본 자료는 저작권|시험문제 정보공유|보디빌딩 (배드|밴드|카페):|https?[:/]|'
    r'저작권법 법률|\d+ / 94|본\s+자료[틀를]|제 16933|제 17588|'
    r'금지I니다|금지됩니다|금지돌니다'
)
_Q_PAT = re.compile(r'^(\d+-\d+)\.\s*(.+)', re.MULTILINE)

# ── 파싱 ─────────────────────────────────────────────────────────────────────
def _parse(text: str) -> list[dict]:
    lines = text.split('\n')
    questions, cur = [], None
    for raw in lines:
        line = raw.strip()
        if not line or _NOISE.search(line):
            continue
        m = _Q_PAT.match(line)
        if m:
            if cur:
                questions.append(cur)
            cur = {
                'num': m.group(1),
                'q': _clean(line),
                'answer': '',
                'stars': _stars(line),
            }
        elif cur:
            if line.startswith('암기:') or line.startswith('암기 :'):
                cur['answer'] = _clean(line)
            elif cur['stars'] == 0 and re.search(r'\d{4}\(', line):
                cur['stars'] = _stars(line)
    if cur:
        questions.append(cur)
    return questions

def _dedup(qs: list[dict]) -> list[dict]:
    seen = {}
    for q in qs:
        k = q['num']
        if k not in seen or q['stars'] > seen[k]['stars']:
            seen[k] = q
    return list(seen.values())

# ── 질문 목록 로드 (최초 1회) ─────────────────────────────────────────────────
_QUESTIONS: list[dict] | None = None

def get_questions() -> list[dict]:
    global _QUESTIONS
    if _QUESTIONS is None:
        try:
            with open(OCR_FILE, encoding='utf-8') as f:
                text = f.read()
            qs = _dedup(_parse(text))
            _QUESTIONS = sorted(qs, key=lambda x: -x['stars'])
        except FileNotFoundError:
            _QUESTIONS = []
    return _QUESTIONS

# ── 필터 적용 ─────────────────────────────────────────────────────────────────
def _get_filtered(user_data: dict) -> list[dict]:
    star_min = user_data.get('star_min', 0)
    qs = get_questions()
    if star_min > 0:
        qs = [q for q in qs if q['stars'] >= star_min]
    return qs

def _question_text(q: dict) -> str:
    text = q['q']
    text = re.sub(r'^\d+-\d+\.\s*', '', text).strip()
    text = re.sub(r'\s*[-–]\s*\d{2,4}.*$', '', text).strip()
    return text

# ── 명령어 핸들러 ─────────────────────────────────────────────────────────────
async def cmd_study(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    qs = get_questions()
    from collections import Counter
    cnt = Counter(q['stars'] for q in qs)
    lines = [
        '📚 보디빌딩 구술 퀴즈 봇',
        f'총 {len(qs)}개 문제 (별점 순)',
        '',
        '📊 별점 분포:',
    ]
    for s in [6, 5, 4, 3, 2, 1, 0]:
        if cnt.get(s, 0):
            lines.append(f'  {_star_label(s)}: {cnt[s]}문제')
    lines += [
        '',
        '📖 명령어:',
        '/q — 다음 문제',
        '/ans — 현재 문제 답 보기',
        '/random — 랜덤/순서 모드 전환',
        '/star 5 — 별5개 이상만 보기',
        '/star 4 — 별4개 이상만 보기',
        '/star 0 — 전체 보기',
        '/reset — 처음부터 다시',
        '',
        '💡 /q 로 시작하세요!',
    ]
    await update.message.reply_text('\n'.join(lines))


async def cmd_q(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    qs = _get_filtered(ctx.user_data)
    if not qs:
        await update.message.reply_text('해당 별점 문제가 없어요.\n/star 0 으로 전체 보기')
        return

    random_mode = ctx.user_data.get('random_mode', False)

    if random_mode:
        seen = ctx.user_data.setdefault('seen_nums', set())
        remaining = [q for q in qs if q['num'] not in seen]
        if not remaining:
            seen.clear()
            remaining = qs
        q = _random.choice(remaining)
        seen.add(q['num'])
        progress = f'{len(qs) - len(remaining) + 1}/{len(qs)}번째 (랜덤)'
    else:
        idx = ctx.user_data.get('quiz_idx', 0) % len(qs)
        q = qs[idx]
        ctx.user_data['quiz_idx'] = idx + 1
        progress = f'{idx + 1}/{len(qs)}번째'

    ctx.user_data['current_q'] = q

    star_min = ctx.user_data.get('star_min', 0)
    filter_txt = f' (별{star_min}+)' if star_min > 0 else ''

    msg = (
        f'{_star_label(q["stars"])}\n'
        f'━━━━━━━━━━━━━━━━━━━━\n'
        f'📌 {q["num"]}번\n\n'
        f'{_question_text(q)}\n\n'
        f'━━━━━━━━━━━━━━━━━━━━\n'
        f'{progress}{filter_txt}\n'
        f'/ans 답 보기   /q 다음'
    )
    await update.message.reply_text(msg)


async def cmd_random(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    current = ctx.user_data.get('random_mode', False)
    ctx.user_data['random_mode'] = not current
    ctx.user_data.pop('seen_nums', None)
    ctx.user_data.pop('current_q', None)
    if not current:
        await update.message.reply_text('🔀 랜덤 모드 ON\n중복 없이 전체 문제를 랜덤 순서로 출제해요.\n\n/q 로 시작하세요')
    else:
        await update.message.reply_text('📋 순서 모드 ON (별점 높은 순)\n\n/q 로 시작하세요')


async def cmd_ans(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    q = ctx.user_data.get('current_q')
    if not q:
        await update.message.reply_text('/q 로 먼저 문제를 받으세요.')
        return

    ans = q.get('answer', '').strip()
    if not ans:
        ans = '(이 문제는 별도 암기 답변이 없어요.)'

    msg = (
        f'✅ 답변\n'
        f'━━━━━━━━━━━━━━━━━━━━\n'
        f'{ans}\n\n'
        f'━━━━━━━━━━━━━━━━━━━━\n'
        f'/q 다음 문제'
    )
    await update.message.reply_text(msg)


async def cmd_star(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    args = ctx.args
    if not args or not args[0].isdigit():
        await update.message.reply_text(
            '사용법:\n/star 5 → 별5개 이상만\n/star 4 → 별4개 이상만\n/star 0 → 전체'
        )
        return
    n = int(args[0])
    ctx.user_data['star_min'] = n
    ctx.user_data['quiz_idx'] = 0
    ctx.user_data.pop('current_q', None)
    qs = _get_filtered(ctx.user_data)
    label = f'별{n}개 이상' if n > 0 else '전체'
    await update.message.reply_text(
        f'✅ {label} 필터 적용 완료\n문제 수: {len(qs)}개\n\n/q 로 시작하세요'
    )


async def cmd_reset(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data['quiz_idx'] = 0
    ctx.user_data.pop('current_q', None)
    qs = _get_filtered(ctx.user_data)
    star_min = ctx.user_data.get('star_min', 0)
    filter_txt = f' (별{star_min}+ 필터)' if star_min > 0 else ' (전체)'
    await update.message.reply_text(
        f'🔄 처음부터 다시 시작합니다\n총 {len(qs)}개 문제{filter_txt}\n\n/q 로 시작하세요'
    )


def get_quiz_handlers():
    return [
        CommandHandler('study', cmd_study),
        CommandHandler('q', cmd_q),
        CommandHandler('ans', cmd_ans),
        CommandHandler('random', cmd_random),
        CommandHandler('star', cmd_star),
        CommandHandler('reset', cmd_reset),
    ]
