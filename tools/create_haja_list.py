"""
하자리스트 자동화 - Excel Add-in + 양식 파일 생성

생성 파일:
  1. C:\\Users\\user\\Desktop\\punch-macro.xlam
  2. C:\\Users\\user\\Desktop\\[하자리스트] 바이오 이노베이션 허브_양식.xlsx

사용 전 확인:
  Excel > 파일 > 옵션 > 보안 센터 > 보안 센터 설정 > 매크로 설정
  > "VBA 프로젝트 개체 모델에 대한 액세스 신뢰" 체크
"""

import os, sys, traceback, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── 설정 ──────────────────────────────────────────────────────────────────────
ADDIN_PATH    = r"C:\Users\user\Desktop\punch-macro.xlam"
TEMPLATE_PATH      = r"C:\Users\user\Desktop\[하자리스트] 바이오 이노베이션 허브_양식.xlsx"
TEMPLATE_SAVE_PATH = r"C:\Users\user\Desktop\하자리스트_바이오이노베이션허브_양식.xlsx"  # Excel SaveAs는 [] 금지
PROJECT_NAME  = "바이오 이노베이션 허브"

DATA_ROW  = 7       # 데이터 시작 행
LAST_ROW  = 10000   # 수식 적용 최대 행

# 공종: (시트명, 코드, 헤더 RGB)
TRADES = [
    ("전기",     "E", (0x44, 0x72, 0xC4)),
    ("건축",     "A", (0xC0, 0x00, 0x00)),
    ("기계",     "M", (0x70, 0xAD, 0x47)),
    ("소방",     "F", (0xED, 0x7D, 0x31)),
    ("인테리어", "I", (0x70, 0x30, 0xA0)),
]

# 열 정의: (헤더명, 열 너비) — A(1)~P(16)
COLUMNS = [
    ("공종",      4),   # A  1
    ("번호",      5),   # B  2
    ("일자",     11),   # C  3
    ("작성자",    8),   # D  4
    ("소공종",   12),   # E  5
    ("층",        6),   # F  6
    ("발주사",    9),   # G  7
    ("위치",     14),   # H  8
    ("내용",     38),   # I  9
    ("사진",     20),   # J  10
    ("조치사항", 24),   # K  11
    ("조치업체", 14),   # L  12
    ("치유사진", 14),   # M  13
    ("치유일자", 11),   # N  14
    ("확인",      7),   # O  15
    ("비고",     14),   # P  16
]

# ── VBA 모듈 코드 ──────────────────────────────────────────────────────────────
VBA_MODULE = r"""
Option Explicit

Private Const DATA_START   As Long = 7
Private Const COL_TRADE    As Long = 1
Private Const COL_NUM      As Long = 2
Private Const COL_DATE     As Long = 3
Private Const COL_AUTHOR   As Long = 4
Private Const COL_FLOOR    As Long = 6
Private Const COL_LOCATION As Long = 8
Private Const COL_CONTENT  As Long = 9
Private Const COL_PHOTO    As Long = 10

' ComboBox ListIndex(0-4) -> 공종 코드 (한글 Case 문 회피)
Private Function TradeCode(listIdx As Integer) As String
    Select Case listIdx
        Case 0: TradeCode = "E"
        Case 1: TradeCode = "A"
        Case 2: TradeCode = "M"
        Case 3: TradeCode = "F"
        Case 4: TradeCode = "I"
        Case Else: TradeCode = ""
    End Select
End Function

Private Function LastDataRow(ws As Worksheet) As Long
    Dim i As Long
    LastDataRow = DATA_START - 1
    For i = ws.Rows.Count To DATA_START Step -1
        If ws.Cells(i, COL_NUM).Value <> "" Then
            LastDataRow = i
            Exit For
        End If
    Next i
End Function

Private Function MaxNumber(ws As Worksheet) As Long
    Dim i As Long, last As Long, v As Long
    last = LastDataRow(ws)
    MaxNumber = 0
    For i = DATA_START To last
        If IsNumeric(ws.Cells(i, COL_NUM).Value) Then
            v = CLng(ws.Cells(i, COL_NUM).Value)
            If v > MaxNumber Then MaxNumber = v
        End If
    Next i
End Function

Sub InsertPhotoToCell(ws As Worksheet, rowNum As Long, colNum As Long, photoPath As String)
    Dim cell As Range
    Dim pic As Shape
    Dim s As Shape
    Set cell = ws.Cells(rowNum, colNum)
    If cell.RowHeight < 80 Then cell.RowHeight = 80
    For Each s In ws.Shapes
        If s.Type = 13 Then   ' 13 = msoPicture
            If Not Intersect(s.TopLeftCell, cell) Is Nothing Then s.Delete
        End If
    Next s
    On Error GoTo PhotoFail
    Set pic = ws.Shapes.AddPicture( _
        Filename:=photoPath, _
        LinkToFile:=False, _
        SaveWithDocument:=True, _
        Left:=cell.Left + 1, Top:=cell.Top + 1, _
        Width:=cell.Width - 2, Height:=cell.Height - 2)
    pic.LockAspectRatio = False
    Exit Sub
PhotoFail:
    MsgBox "사진 삽입 실패: " & photoPath & vbCrLf & "데이터는 저장되었습니다.", vbExclamation
End Sub

Sub NewDefect()
    Dim targetWb As Workbook
    Set targetWb = ActiveWorkbook

    If InStr(LCase(targetWb.Name), ".xlam") > 0 Or _
       InStr(LCase(targetWb.Name), ".xla") > 0 Then
        MsgBox "Please open the defect list file first.", vbExclamation
        Exit Sub
    End If

    Dim frm As New HajaForm
    frm.Show

    If frm.Tag <> "OK" Then
        Unload frm
        Exit Sub
    End If

    Dim tradeName As String: tradeName = frm.cboTrade.Value
    Dim tradeIdx  As Integer: tradeIdx  = frm.cboTrade.ListIndex
    Dim author    As String: author    = Trim(frm.txtAuthor.Value)
    Dim flr       As String: flr       = Trim(frm.txtFloor.Value)
    Dim loc       As String: loc       = Trim(frm.txtLocation.Value)
    Dim content   As String: content   = Trim(frm.txtContent.Value)
    Dim photoPath As String: photoPath = Trim(frm.txtPhoto.Value)
    Unload frm

    Dim ws As Worksheet
    On Error Resume Next
    Set ws = targetWb.Sheets(tradeName)
    On Error GoTo 0

    If ws Is Nothing Then
        MsgBox "[" & tradeName & "] sheet not found." & vbCrLf & _
               "Make sure the defect list file is open.", vbExclamation
        Exit Sub
    End If

    Dim lastRow As Long: lastRow = LastDataRow(ws)
    Dim nextNum As Long: nextNum = MaxNumber(ws) + 1
    Dim newRow  As Long: newRow  = lastRow + 1

    If lastRow >= DATA_START Then
        ws.Rows(lastRow).Copy
        ws.Rows(newRow).PasteSpecial 8
        Application.CutCopyMode = False
    End If

    ws.Rows(newRow).ClearContents
    ws.Rows(newRow).RowHeight = 45

    ws.Cells(newRow, COL_TRADE).Value       = TradeCode(tradeIdx)
    ws.Cells(newRow, COL_NUM).Value         = nextNum
    ws.Cells(newRow, COL_DATE).Value        = Date
    ws.Cells(newRow, COL_DATE).NumberFormat = "yyyy/mm/dd"

    If author  <> "" Then ws.Cells(newRow, COL_AUTHOR).Value   = author
    If flr     <> "" Then ws.Cells(newRow, COL_FLOOR).Value    = flr
    If loc     <> "" Then ws.Cells(newRow, COL_LOCATION).Value = loc
    If content <> "" Then ws.Cells(newRow, COL_CONTENT).Value  = content

    If photoPath <> "" Then
        If Dir(photoPath) <> "" Then
            Call InsertPhotoToCell(ws, newRow, COL_PHOTO, photoPath)
        End If
    End If

    ' A-P 열 테두리 자동 적용
    With ws.Range(ws.Cells(newRow, 1), ws.Cells(newRow, 16)).Borders
        .LineStyle = 1
        .Weight    = 2
    End With

    ws.Activate
    ws.Cells(newRow, COL_NUM).Select
    Application.Calculate

    MsgBox TradeCode(tradeIdx) & Format(nextNum, "00") & _
           "  (" & tradeName & ")  OK", vbInformation
End Sub
"""

# ── ThisWorkbook 이벤트 (QAT 버튼 + Ctrl+Y) ───────────────────────────────────
VBA_THISWORKBOOK = r"""
Private Sub Workbook_Open()
    Dim qat As CommandBar
    Dim btn As CommandBarButton
    Set qat = Application.CommandBars(37)   ' ID 37 = QAT, 언어 무관
    On Error Resume Next
    qat.FindControl(Tag:="PunchListBtn").Delete
    On Error GoTo 0
    Set btn = qat.Controls.Add(Type:=msoControlButton, Temporary:=True)
    With btn
        .Caption     = "Punch List"
        .TooltipText = "New defect entry  [Ctrl+Y]"
        .OnAction    = "NewDefect"
        .FaceId      = 270
        .Tag         = "PunchListBtn"
    End With
    Application.OnKey "^y", "NewDefect"
End Sub

Private Sub Workbook_BeforeClose(Cancel As Boolean)
    On Error Resume Next
    Application.CommandBars(37).FindControl(Tag:="PunchListBtn").Delete
    Application.OnKey "^y"
End Sub
"""

# ── UserForm 이벤트 코드 ───────────────────────────────────────────────────────
VBA_FORM_CODE = r"""
Option Explicit

Private Sub UserForm_Initialize()
    Me.Caption = "하자 입력"
    Me.Width   = 395
    Me.Height  = 280
    txtAuthor.IMEMode   = 10
    txtFloor.IMEMode    = 10
    txtLocation.IMEMode = 10
    txtContent.IMEMode  = 10
    With cboTrade
        .AddItem "전기"
        .AddItem "건축"
        .AddItem "기계"
        .AddItem "소방"
        .AddItem "인테리어"
        .ListIndex = 0
    End With
End Sub

Private Sub btnBrowse_Click()
    Dim fd As FileDialog
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    fd.Title = "사진 선택"
    fd.Filters.Clear
    fd.Filters.Add "이미지", "*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.tif;*.tiff"
    fd.AllowMultiSelect = False
    If fd.Show = -1 Then
        txtPhoto.Value = fd.SelectedItems(1)
    End If
End Sub

Private Sub btnOK_Click()
    If cboTrade.ListIndex = -1 Then
        MsgBox "공종을 선택하세요.", vbExclamation
        cboTrade.SetFocus: Exit Sub
    End If
    Me.Tag = "OK"
    Me.Hide
End Sub

Private Sub btnCancel_Click()
    Me.Tag = "Cancel"
    Me.Hide
End Sub
"""

# ── 헬퍼 ──────────────────────────────────────────────────────────────────────
def rgb(r, g, b):
    return r | (g << 8) | (b << 16)

def set_border(cell):
    for edge in range(7, 11):   # xlEdgeLeft=7 ~ xlEdgeBottom=10
        cell.Borders(edge).LineStyle = 1
        cell.Borders(edge).Weight = 2

def hdr_cell(cell, text, bg_rgb):
    cell.Value = text
    cell.Interior.Color = bg_rgb
    cell.Font.Color = 0xFFFFFF
    cell.Font.Bold = True
    cell.HorizontalAlignment = -4108   # xlCenter
    cell.VerticalAlignment   = -4108   # xlCenter
    cell.WrapText = True
    set_border(cell)

# ── UserForm 생성 ──────────────────────────────────────────────────────────────
def _ctrl(d, prog_id, name):
    """Controls.Add 후 객체 반환. COM 레이트 바인딩 호환."""
    c = d.Controls.Add(prog_id, name, True)
    return c

def create_userform(wb):
    try:
        frm = wb.VBProject.VBComponents.Add(3)   # vbext_ct_MSForm
        frm.Name = "HajaForm"

        d = frm.Designer
        # 폼 크기 / 제목 — Width/Height 직접 설정이 COM에서 실패할 수 있어 try 처리
        try: d.Caption = "새 하자 항목 입력"
        except Exception: pass
        try: d.Width = 390
        except Exception: pass
        try: d.Height = 310
        except Exception: pass
        try: d.StartUpPosition = 1
        except Exception: pass

        L_LBL, W_LBL = 10,  68
        L_INP, W_INP = 84, 270
        H_LBL,  H_IN = 16,  20

        rows   = [14, 42, 70, 98, 126, 174]
        labels = ["공종:", "작성자:", "층:", "위치:", "내용:", "사진:"]

        # 라벨 — Move(left, top, width, height) 사용
        for i, (txt, top) in enumerate(zip(labels, rows)):
            lbl = _ctrl(d, "Forms.Label.1", f"Lbl{i}")
            lbl.Move(L_LBL, top + 2, W_LBL, H_LBL)
            lbl.Caption   = txt
            lbl.TextAlign = 3   # fmTextAlignRight

        # 공종 드롭다운
        cbo = _ctrl(d, "Forms.ComboBox.1", "cboTrade")
        cbo.Move(L_INP, rows[0], W_INP, H_IN)
        try: cbo.Style = 2
        except Exception: pass

        # 작성자, 층, 위치
        for i, name in enumerate(["txtAuthor", "txtFloor", "txtLocation"], 1):
            tb = _ctrl(d, "Forms.TextBox.1", name)
            tb.Move(L_INP, rows[i], W_INP, H_IN)

        # 내용 (multiline)
        tc = _ctrl(d, "Forms.TextBox.1", "txtContent")
        tc.Move(L_INP, rows[4], W_INP, 38)
        try: tc.MultiLine  = True
        except Exception: pass
        try: tc.WordWrap   = True
        except Exception: pass
        try: tc.ScrollBars = 2
        except Exception: pass

        # 사진 경로 + 찾아보기
        tp = _ctrl(d, "Forms.TextBox.1", "txtPhoto")
        tp.Move(L_INP, rows[5], 196, H_IN)
        try: tp.Enabled = False
        except Exception: pass

        bb = _ctrl(d, "Forms.CommandButton.1", "btnBrowse")
        bb.Caption = "찾아보기..."
        bb.Move(L_INP + 200, rows[5], 70, H_IN)

        # 확인 / 취소
        bOK = _ctrl(d, "Forms.CommandButton.1", "btnOK")
        bOK.Caption = "확인"
        bOK.Move(216, 208, 72, 26)
        try: bOK.Default = True
        except Exception: pass

        bCN = _ctrl(d, "Forms.CommandButton.1", "btnCancel")
        bCN.Caption = "취소"
        bCN.Move(298, 208, 72, 26)
        try: bCN.Cancel = True
        except Exception: pass

        frm.CodeModule.AddFromString(VBA_FORM_CODE)
        return True

    except Exception as e:
        print(f"  !! UserForm error: {e}")
        traceback.print_exc()
        return False

# ── Add-in 생성 ───────────────────────────────────────────────────────────────
def build_addin(xl):
    print("punch-macro.xlam 생성 중...")
    wb = xl.Workbooks.Add()
    while wb.Sheets.Count > 1:
        wb.Sheets(wb.Sheets.Count).Delete()

    # VBA 모듈
    mod = wb.VBProject.VBComponents.Add(1)   # vbext_ct_StdModule
    mod.Name = "M_HajaList"
    mod.CodeModule.AddFromString(VBA_MODULE)
    print("  OK VBA 모듈")

    # UserForm
    ok = create_userform(wb)
    print("  OK UserForm" if ok else "  !! UserForm 실패 (모듈만 저장)")

    # ThisWorkbook 이벤트 (QAT 버튼 + Ctrl+Y)
    # 한국어 Excel에서는 "ThisWorkbook" 이름이 다를 수 있어 Type=100 컴포넌트를 직접 탐색
    sheet_codenames = set()
    for j in range(1, wb.Sheets.Count + 1):
        try: sheet_codenames.add(wb.Sheets(j).CodeName)
        except Exception: pass

    this_wb_comp = None
    for i in range(1, wb.VBProject.VBComponents.Count + 1):
        comp = wb.VBProject.VBComponents.Item(i)
        if comp.Type == 100 and comp.Name not in sheet_codenames:
            this_wb_comp = comp
            break

    if this_wb_comp:
        this_wb_comp.CodeModule.AddFromString(VBA_THISWORKBOOK)
        print("  OK ThisWorkbook (QAT + Ctrl+Y)")
    else:
        print("  !! ThisWorkbook 컴포넌트를 찾지 못했습니다")

    if os.path.exists(ADDIN_PATH):
        try:
            os.remove(ADDIN_PATH)
        except PermissionError:
            raise PermissionError(
                f"파일이 잠겨 있습니다: {ADDIN_PATH}\n"
                "Excel에서 해당 Add-in을 제거하거나 Excel을 완전히 닫은 뒤 다시 실행하세요.\n"
                "제거 방법: 파일 > 옵션 > 추가 기능 > Excel 추가 기능 > 이동 > punch-macro 체크 해제 > 확인"
            )
    wb.SaveAs(ADDIN_PATH, 55)   # 55 = xlOpenXMLAddIn (.xlam)
    wb.Close(False)
    print(f"  저장: {ADDIN_PATH}")

    # Windows 파일 차단 해제 (Mark of the Web 제거)
    try:
        import subprocess
        subprocess.run(
            ["powershell", "-Command", f'Unblock-File -LiteralPath "{ADDIN_PATH}"'],
            capture_output=True, timeout=10
        )
        print("  OK 파일 차단 해제")
    except Exception:
        pass

# ── 공종 시트 생성 ─────────────────────────────────────────────────────────────
def build_trade_sheet(ws, name, code, hdr_rgb):
    xl_rgb = rgb(*hdr_rgb)

    # 열 너비
    for i, (_, w) in enumerate(COLUMNS, 1):
        ws.Columns(i).ColumnWidth = w

    # 행 높이
    ws.Rows(1).RowHeight = 16
    ws.Rows(2).RowHeight = 16
    ws.Rows(3).RowHeight = 6
    ws.Rows(4).RowHeight = 22
    ws.Rows(5).RowHeight = 22
    ws.Rows(6).RowHeight = 38
    ws.Rows(DATA_ROW).RowHeight = 45

    # 통계 (행 1-2)
    for i, h in enumerate(["구분", "발생수", "완료수", "미처리수", "완료율(%)"], 1):
        ws.Cells(1, i).Value = h
        ws.Cells(1, i).Font.Bold = True

    ws.Cells(2, 1).Value = "수량"
    ws.Cells(2, 2).Formula = f"=MAX(B{DATA_ROW}:B{LAST_ROW})"
    ws.Cells(2, 3).Formula = (
        f'=COUNTIF(O{DATA_ROW}:O{LAST_ROW},"O")'
        f'+COUNTIF(O{DATA_ROW}:O{LAST_ROW},"o")'
    )
    ws.Cells(2, 4).Formula = "=B2-C2"
    ws.Cells(2, 5).Formula = "=IF(B2>0,C2/B2,0)"
    ws.Cells(2, 5).NumberFormat = "0.0%"

    # 제목 (행 4)
    ws.Range("A4:P4").Merge()
    c = ws.Cells(4, 1)
    c.Value = f"Punch List ({name})"
    c.Font.Bold = True; c.Font.Size = 12
    c.HorizontalAlignment = -4108

    # 현장명 (행 5)
    ws.Range("A5:P5").Merge()
    c = ws.Cells(5, 1)
    c.Value = PROJECT_NAME
    c.HorizontalAlignment = -4108

    # 컬럼 헤더 (행 6)
    for i, (label, _) in enumerate(COLUMNS, 1):
        hdr_cell(ws.Cells(6, i), label, xl_rgb)

    # 날짜 형식
    ws.Columns(3).NumberFormat  = "yyyy/mm/dd"   # C: 일자
    ws.Columns(14).NumberFormat = "yyyy/mm/dd"   # N: 치유일자

    # 첫 데이터 행 테두리
    for col in range(1, 17):
        set_border(ws.Cells(DATA_ROW, col))

# ── 집계표 시트 생성 ───────────────────────────────────────────────────────────
def build_summary(ws):
    ws.Columns(2).ColumnWidth = 14
    for col in (4, 5, 6):
        ws.Columns(col).ColumnWidth = 11

    ws.Range("B2:H2").Merge()
    c = ws.Cells(2, 2)
    c.Value = "Punch List 집계표"
    c.Font.Bold = True; c.Font.Size = 14
    c.HorizontalAlignment = -4108

    ws.Cells(4, 2).Value = "공  종"; ws.Cells(4, 2).Font.Bold = True
    ws.Cells(4, 4).Value = "발생수"; ws.Cells(4, 4).Font.Bold = True
    ws.Cells(4, 5).Value = "완료수"; ws.Cells(4, 5).Font.Bold = True
    ws.Cells(4, 6).Value = "완료율(%)"; ws.Cells(4, 6).Font.Bold = True

    trade_colors = {n: rgb(*c) for n, _, c in TRADES}

    for i, (name, code, _) in enumerate(TRADES):
        row = 6 + i
        ws.Cells(row, 2).Value = name
        ws.Cells(row, 4).Formula = f"=MAX('{name}'!B{DATA_ROW}:B{LAST_ROW})"
        ws.Cells(row, 5).Formula = (
            f"=COUNTIF('{name}'!O{DATA_ROW}:O{LAST_ROW},\"O\")"
            f"+COUNTIF('{name}'!O{DATA_ROW}:O{LAST_ROW},\"o\")"
        )
        ws.Cells(row, 6).Formula = f"=IF(D{row}>0,E{row}/D{row},0)"
        ws.Cells(row, 6).NumberFormat = "0.0%"

        c = ws.Cells(row, 2)
        c.Interior.Color = trade_colors[name]
        c.Font.Color = 0xFFFFFF; c.Font.Bold = True
        c.HorizontalAlignment = -4108

    # 합계
    tr = 6 + len(TRADES)
    ws.Cells(tr, 2).Value = "[ 합  계 ]"; ws.Cells(tr, 2).Font.Bold = True
    ws.Cells(tr, 4).Formula = f"=SUM(D6:D{tr-1})"
    ws.Cells(tr, 5).Formula = f"=SUM(E6:E{tr-1})"
    ws.Cells(tr, 6).Formula = f"=IF(D{tr}>0,E{tr}/D{tr},0)"
    ws.Cells(tr, 6).NumberFormat = "0.0%"

# ── 양식 파일 생성 ─────────────────────────────────────────────────────────────
def build_template(xl):
    print("[하자리스트] 양식 생성 중...")
    wb = xl.Workbooks.Add()
    while wb.Sheets.Count > 1:
        wb.Sheets(wb.Sheets.Count).Delete()

    # 공종 시트를 먼저 생성 — 집계표 수식이 이 시트들을 참조하므로
    # 시트가 존재한 뒤에 수식을 넣어야 Excel이 내부 참조로 인식함
    wb.Sheets(1).Name = TRADES[0][0]
    build_trade_sheet(wb.Sheets(1), *TRADES[0])
    print(f"  OK {TRADES[0][0]} ({TRADES[0][1]})")

    for name, code, hdr_rgb in TRADES[1:]:
        ws = wb.Sheets.Add(After=wb.Sheets(wb.Sheets.Count))
        ws.Name = name
        build_trade_sheet(ws, name, code, hdr_rgb)
        print(f"  OK {name} ({code})")

    # 집계표는 모든 공종 시트 생성 후 맨 앞에 삽입
    ws_sum = wb.Sheets.Add(Before=wb.Sheets(1))
    ws_sum.Name = "집계표"
    build_summary(ws_sum)
    print("  OK 집계표")

    # Excel SaveAs는 [] 문자를 금지 → 임시 이름으로 저장 후 Python에서 최종 이름으로 변경
    if os.path.exists(TEMPLATE_SAVE_PATH):
        os.remove(TEMPLATE_SAVE_PATH)
    wb.SaveAs(TEMPLATE_SAVE_PATH, 51)   # 51 = xlOpenXMLWorkbook (.xlsx)
    wb.Close(False)

    if os.path.exists(TEMPLATE_PATH):
        os.remove(TEMPLATE_PATH)
    os.rename(TEMPLATE_SAVE_PATH, TEMPLATE_PATH)
    print(f"  저장: {TEMPLATE_PATH}")

# ── 실행 ──────────────────────────────────────────────────────────────────────
def main():
    try:
        import win32com.client as win32
    except ImportError:
        print("오류: pip install pywin32")
        sys.exit(1)

    xl = win32.DispatchEx("Excel.Application")   # 항상 새 인스턴스 생성 (기존 세션 간섭 방지)
    xl.Visible = False
    xl.DisplayAlerts = False

    try:
        build_addin(xl)
        print()
        build_template(xl)
        print()
        print("== 완료 ==")
        print(f"  Add-in : {ADDIN_PATH}")
        print(f"  양식   : {TEMPLATE_PATH}")
        print()
        print("다음 단계:")
        print("  1. Excel 완전 재시작 (이미 열려있으면 닫고 다시 열기)")
        print("  2. 파일 > 옵션 > 추가 기능 > Excel 추가 기능 > 이동")
        print("     > 찾아보기 > punch-macro.xlam 선택 > 확인")
        print("  3. Excel 재시작 시 QAT(빠른 실행 도구 모음)에 'Punch List' 버튼 자동 추가")
        print("  4. Ctrl+Y 로도 바로 실행 가능")
        print()
        print("  * Alt+F8에서 매크로가 안 보이면: '매크로 위치' 드롭다운 → '열려 있는 모든 통합문서' 선택")
    except Exception:
        traceback.print_exc()
    finally:
        try:
            xl.Quit()
        except Exception:
            pass

if __name__ == "__main__":
    main()
