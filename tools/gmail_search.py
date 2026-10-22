# -*- coding: utf-8 -*-
"""Gmail 에서 주제별로 메일을 찾아 엑셀로 정리하는 도구.

읽기만 합니다. 보내기·삭제·라벨 변경 권한은 아예 요청하지 않습니다.

준비물
    gmail_oauth.json   구글 클라우드 콘솔에서 받은 'OAuth 클라이언트 ID(데스크톱 앱)' 파일.
                       프로젝트 폴더(이 파일의 부모)에 두세요.
                       credentials.json(서비스 계정)과는 다른 파일입니다.
    gmail_token.json   처음 로그인하면 자동으로 생깁니다. 다음부터는 로그인 안 합니다.

쓰는 법
    python gmail_search.py login
        브라우저가 열립니다. 한 번만 하면 됩니다.

    python gmail_search.py search "조명 하자" "등기구" --out 결과.xlsx
        여러 낱말을 주면 각각 찾아서 하나로 합칩니다(같은 메일은 한 번만).
        기간을 안 주면 메일함 전체를 봅니다.

    python gmail_search.py search "조명" --after 2024/01/01 --before 2025/01/01
    python gmail_search.py search "조명" --raw "from:...@... has:attachment"
        --raw 는 Gmail 검색창에 쓰는 문법을 그대로 넘깁니다.

    python gmail_search.py body <메일ID>
        엑셀에 적힌 ID로 그 메일의 본문 전체를 봅니다.
"""
import argparse
import base64
import io
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# 읽기 전용. 이 범위로는 메일을 보내거나 지울 수 없습니다.
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CLIENT = os.path.join(ROOT, "gmail_oauth.json")
TOKEN = os.path.join(ROOT, "gmail_token.json")

KST = timezone(timedelta(hours=9))


def service():
    """로그인된 Gmail 연결을 돌려준다. 없으면 브라우저를 띄운다."""
    creds = None
    if os.path.exists(TOKEN):
        creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if not creds or not creds.valid:
        refreshed = False
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                refreshed = True
            except Exception as e:
                # 구글이 허락을 거둬들이면(테스트 앱은 7일마다) 다시 로그인한다.
                print("저장된 로그인이 만료됐습니다. 다시 로그인합니다. (%s)" % e)
                creds = None
        if not refreshed:
            if not os.path.exists(CLIENT):
                sys.exit(
                    "gmail_oauth.json 이 없습니다.\n"
                    "구글 클라우드 콘솔에서 'OAuth 클라이언트 ID(데스크톱 앱)'을 만들어\n"
                    f"{CLIENT}\n에 저장한 뒤 다시 실행하세요."
                )
            creds = InstalledAppFlow.from_client_secrets_file(CLIENT, SCOPES) \
                .run_local_server(port=0)
        with io.open(TOKEN, "w", encoding="utf-8") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def call(req, tries=6):
    """구글이 '너무 빠르다'고 막으면 잠깐 쉬었다 다시 부른다.

    분당 호출량 제한에 걸리면 403/429 가 온다. 영구적인 오류가 아니라
    기다리면 풀리므로 1, 2, 4, 8… 초씩 늘려가며 다시 시도한다."""
    from googleapiclient.errors import HttpError
    for n in range(tries):
        try:
            return req.execute()
        except HttpError as e:
            code = getattr(e, "status_code", None) or e.resp.status
            if code not in (403, 429, 500, 503) or n == tries - 1:
                raise
            wait = 2 ** n
            print(f"    (속도 제한 — {wait}초 쉬고 다시 시도)")
            time.sleep(wait)


def _hdr(msg, name):
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def _walk_parts(part, out):
    """본문을 재귀로 긁어모은다. 첨부파일 이름도 같이 모은다."""
    mt = part.get("mimeType", "")
    body = part.get("body", {})
    name = part.get("filename") or ""
    if name:
        out["files"].append(name)
    data = body.get("data")
    if data and mt in ("text/plain", "text/html"):
        txt = base64.urlsafe_b64decode(data).decode("utf-8", "replace")
        if mt == "text/html":
            # 메일 프로그램이 넣은 <style>/<script> 를 먼저 버린다.
            # 남겨두면 본문 대신 CSS 코드가 읽힌다.
            txt = re.sub(r"(?is)<(style|script|head)[^>]*>.*?</\1>", " ", txt)
            txt = re.sub(r"(?is)<!--.*?-->", " ", txt)
            txt = re.sub(r"(?i)</(p|div|tr|li|h[1-6])>", "\n", txt)
            txt = re.sub(r"(?i)<br\s*/?>", "\n", txt)
            txt = re.sub(r"<[^>]+>", " ", txt)
            for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"),
                         ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")]:
                txt = txt.replace(a, b)
        out[mt].append(txt)
    for p in part.get("parts", []) or []:
        _walk_parts(p, out)


def link(mid, who=""):
    """메일 바로가기 주소.

    /u/0/ 는 '브라우저에 첫 번째로 로그인된 계정'이라, 계정을 여러 개
    쓰면 엉뚱한 편지함이 열린다. authuser 로 계정을 못 박는다."""
    base = "https://mail.google.com/mail/u/"
    base += f"?authuser={who}" if who else "0/"
    return f"{base}#all/{mid}"


def whoami(svc):
    return call(svc.users().getProfile(userId="me"))["emailAddress"]


def read_msg(svc, mid, full=False, who=""):
    msg = call(svc.users().messages().get(
        userId="me", id=mid, format="full"))
    out = {"text/plain": [], "text/html": [], "files": []}
    _walk_parts(msg.get("payload", {}), out)
    body = "\n".join(out["text/plain"]) or "\n".join(out["text/html"])
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()

    ts = int(msg.get("internalDate", 0)) / 1000
    when = datetime.fromtimestamp(ts, KST) if ts else None
    return {
        "id": mid,
        "thread": msg.get("threadId", ""),
        "date": when.strftime("%Y-%m-%d %H:%M") if when else "",
        "from": _hdr(msg, "From"),
        "to": _hdr(msg, "To"),
        "subject": _hdr(msg, "Subject"),
        "labels": ",".join(msg.get("labelIds", [])),
        "files": ", ".join(sorted(set(out["files"]))),
        "snippet": msg.get("snippet", ""),
        "body": body if full else body[:4000],
        "link": link(mid, who),
    }



def attachments(svc, mid, outdir):
    """메일 한 통의 첨부파일을 모두 내려받는다. 저장한 경로 목록을 돌려준다."""
    msg = call(svc.users().messages().get(userId="me", id=mid, format="full"))
    saved = []

    def walk(part):
        name = part.get("filename") or ""
        body = part.get("body", {})
        if name and (body.get("attachmentId") or body.get("data")):
            data = body.get("data")
            if not data:
                a = call(svc.users().messages().attachments().get(
                    userId="me", messageId=mid, id=body["attachmentId"]))
                data = a["data"]
            raw = base64.urlsafe_b64decode(data)
            safe = re.sub(r'[\/:*?"<>|]', "_", name)
            path = os.path.join(outdir, f"{mid}_{safe}")
            with open(path, "wb") as f:
                f.write(raw)
            saved.append(path)
        for p in part.get("parts", []) or []:
            walk(p)

    walk(msg.get("payload", {}))
    return saved


def search(svc, query, cap=2000):
    """Gmail 검색. 전체 페이지를 다 넘긴다."""
    ids, page = [], None
    while True:
        r = call(svc.users().messages().list(
            userId="me", q=query, maxResults=500,
            pageToken=page, includeSpamTrash=False))
        ids += [m["id"] for m in r.get("messages", [])]
        page = r.get("nextPageToken")
        if not page or len(ids) >= cap:
            break
    return ids[:cap]


def to_xlsx(rows, path):
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "검색결과"
    cols = [("날짜", 16), ("보낸사람", 30), ("받는사람", 30), ("제목", 55),
            ("첨부파일", 30), ("찾은 낱말", 14), ("내용 미리보기", 70),
            ("메일 ID", 20), ("열기", 10)]
    ws.append([c[0] for c in cols])
    for i, (name, w) in enumerate(cols, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="F2F2F2")
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws.freeze_panes = "A2"

    for r in rows:
        ws.append([r["date"], r["from"], r["to"], r["subject"], r["files"],
                   r.get("hit", ""), r["snippet"], r["id"], "열기"])
        cell = ws.cell(row=ws.max_row, column=9)
        cell.hyperlink = r["link"]
        cell.font = Font(color="0563C1", underline="single")
        ws.cell(row=ws.max_row, column=7).alignment = Alignment(wrap_text=True, vertical="top")
    ws.auto_filter.ref = f"A1:I{ws.max_row}"
    wb.save(path)


def cmd_search(a):
    svc = service()
    me = whoami(svc)
    window = ""
    if a.after:
        window += f" after:{a.after}"
    if a.before:
        window += f" before:{a.before}"

    found, order = {}, []
    for word in a.words:
        q = (a.raw + " " if a.raw else "") + word + window
        ids = search(svc, q)
        print(f"  '{word}' -> {len(ids)}건")
        for mid in ids:
            if mid in found:
                if word not in found[mid]:
                    found[mid].append(word)
            else:
                found[mid] = [word]
                order.append(mid)

    print(f"\n중복 빼고 {len(order)}건. 내용을 읽는 중…")
    rows = []
    for n, mid in enumerate(order, 1):
        r = read_msg(svc, mid, who=me)
        r["hit"] = ", ".join(found[mid])
        rows.append(r)
        if n % 25 == 0:
            print(f"  {n}/{len(order)}")

    rows.sort(key=lambda x: x["date"])
    to_xlsx(rows, a.out)
    print(f"\n{len(rows)}건을 정리했습니다 -> {a.out}")
    if rows:
        print(f"기간: {rows[0]['date']} ~ {rows[-1]['date']}")


def cmd_body(a):
    r = read_msg(service(), a.id, full=True)
    print(f"날짜 : {r['date']}\n보낸사람 : {r['from']}\n받는사람 : {r['to']}")
    print(f"제목 : {r['subject']}\n첨부 : {r['files']}\n{'-'*60}\n{r['body']}")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("login", help="브라우저로 한 번 로그인")

    s = sub.add_parser("search", help="낱말로 찾아 엑셀로 정리")
    s.add_argument("words", nargs="+", help="찾을 낱말들")
    s.add_argument("--after", help="이 날짜 이후 (2024/01/01)")
    s.add_argument("--before", help="이 날짜 이전")
    s.add_argument("--raw", default="", help="Gmail 검색 문법 그대로")
    s.add_argument("--out", default="메일검색결과.xlsx")

    b = sub.add_parser("body", help="메일 한 통의 본문 전체 보기")
    b.add_argument("id")

    a = p.parse_args()
    if a.cmd == "login":
        service()
        print("로그인 완료. gmail_token.json 이 만들어졌습니다.")
    elif a.cmd == "search":
        cmd_search(a)
    else:
        cmd_body(a)


if __name__ == "__main__":
    main()
