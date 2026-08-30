"""
PDF 도구 — 추출 / 병합 / 수정 (페이지 삭제·회전·텍스트·이미지) / 순서변경 / 이미지변환
실행: py -3.12 tools/pdf_tool.py
"""
import os
import io
import json
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image, ImageTk, ImageDraw, ImageFont
import fitz  # PyMuPDF

# ── 한글 폰트 ────────────────────────────────────────────────────────
FONT_NAME = "MalgunGothic"
FONT_PATH = r"C:\Windows\Fonts\malgun.ttf"
STAMP_CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_stamp_config.json")
STAMP_PW, STAMP_PH = 340, 460  # 미리보기 캔버스 크기


def get_font():
    try:
        if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(FONT_NAME, FONT_PATH))
        return FONT_NAME
    except Exception:
        return "Helvetica"


# ── 유틸 ─────────────────────────────────────────────────────────────
def parse_pages(text: str, total: int) -> list:
    """'1,3,5-7' → 0-indexed 페이지 리스트. 'all' 이면 전체."""
    text = text.strip()
    if text.lower() == "all":
        return list(range(total))
    pages = set()
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            pages.update(range(int(a) - 1, int(b)))
        else:
            pages.add(int(part) - 1)
    return sorted(p for p in pages if 0 <= p < total)


def calc_stamp_rect(key, pw, ph, ow, oh, margin=20):
    """위치 키워드 → fitz.Rect — (0,0) 상단 왼쪽 좌표계"""
    positions = {
        "top-left":      (margin, margin),
        "top-center":    ((pw - ow) / 2, margin),
        "top-right":     (pw - ow - margin, margin),
        "center":        ((pw - ow) / 2, (ph - oh) / 2),
        "bottom-left":   (margin, ph - oh - margin),
        "bottom-center": ((pw - ow) / 2, ph - oh - margin),
        "bottom-right":  (pw - ow - margin, ph - oh - margin),
    }
    x, y = positions.get(key, (pw - ow - margin, ph - oh - margin))
    return fitz.Rect(x, y, x + ow, y + oh)


def calc_pos(key, pw, ph, ow, oh, margin=20):
    """위치 키워드 → (x, y) — PDF 좌표계(좌하단 원점)"""
    positions = {
        "top-left":      (margin, ph - oh - margin),
        "top-center":    ((pw - ow) / 2, ph - oh - margin),
        "top-right":     (pw - ow - margin, ph - oh - margin),
        "center":        ((pw - ow) / 2, (ph - oh) / 2),
        "bottom-left":   (margin, margin),
        "bottom-center": ((pw - ow) / 2, margin),
        "bottom-right":  (pw - ow - margin, margin),
    }
    return positions.get(key, (margin, margin))


# ── 메인 앱 ──────────────────────────────────────────────────────────
class PDFTool(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PDF 도구")
        self.geometry("860x640")
        self.resizable(True, True)

        nb = ttk.Notebook(self)
        nb.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.tab_ext = ttk.Frame(nb)
        self.tab_mrg = ttk.Frame(nb)
        self.tab_edt = ttk.Frame(nb)
        self.tab_ord = ttk.Frame(nb)
        self.tab_img_conv = ttk.Frame(nb)
        self.tab_stamp = ttk.Frame(nb)
        self.tab_text_ins = ttk.Frame(nb)

        nb.add(self.tab_ext, text="   추출   ")
        nb.add(self.tab_mrg, text="   병합   ")
        nb.add(self.tab_edt, text="   수정   ")
        nb.add(self.tab_ord, text="   순서변경   ")
        nb.add(self.tab_img_conv, text="   이미지변환   ")
        nb.add(self.tab_stamp, text="   직인   ")
        nb.add(self.tab_text_ins, text="   텍스트   ")

        self._build_extract()
        self._build_merge()
        self._build_edit()
        self._build_reorder()
        self._build_img_convert()
        self._build_stamp()
        self._build_text_ins()

    # ── 추출 ─────────────────────────────────────────────────────────
    def _build_extract(self):
        f = self.tab_ext

        ttk.Label(f, text="PDF 파일").grid(row=0, column=0, sticky="w", padx=12, pady=(18, 6))
        self.ext_path = tk.StringVar()
        ttk.Entry(f, textvariable=self.ext_path, width=52).grid(row=0, column=1, padx=6, pady=(18, 6))
        ttk.Button(f, text="찾아보기", command=self._ext_browse).grid(row=0, column=2, padx=6, pady=(18, 6))

        self.ext_info = ttk.Label(f, text="", foreground="gray")
        self.ext_info.grid(row=1, column=1, sticky="w", padx=6)

        ttk.Label(f, text="추출할 페이지\n예) 1,3,5-7").grid(row=2, column=0, sticky="w", padx=12, pady=10)
        self.ext_pages = tk.StringVar()
        ttk.Entry(f, textvariable=self.ext_pages, width=30).grid(row=2, column=1, sticky="w", padx=6, pady=10)

        ttk.Button(f, text="추출하기", command=self._do_extract).grid(row=3, column=1, sticky="w", padx=6, pady=16)

    def _ext_browse(self):
        p = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if p:
            self.ext_path.set(p)
            self.ext_info.config(text=f"총 {len(PdfReader(p).pages)}페이지")

    def _do_extract(self):
        path = self.ext_path.get()
        if not path or not self.ext_pages.get().strip():
            messagebox.showwarning("입력 필요", "파일과 페이지를 입력하세요.")
            return
        try:
            reader = PdfReader(path)
            pages = parse_pages(self.ext_pages.get(), len(reader.pages))
            if not pages:
                messagebox.showerror("오류", "유효한 페이지가 없어요.")
                return
            out = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
            if not out:
                return
            writer = PdfWriter()
            for p in pages:
                writer.add_page(reader.pages[p])
            with open(out, "wb") as fh:
                writer.write(fh)
            messagebox.showinfo("완료", f"{len(pages)}페이지 추출 완료!\n{out}")
        except Exception as e:
            messagebox.showerror("오류", str(e))

    # ── 병합 ─────────────────────────────────────────────────────────
    def _build_merge(self):
        f = self.tab_mrg

        ttk.Label(f, text="병합할 PDF 목록 (위에서부터 순서대로 합쳐짐)").grid(
            row=0, column=0, columnspan=3, sticky="w", padx=12, pady=(18, 6))

        self.mrg_list = tk.Listbox(f, width=58, height=11)
        self.mrg_list.grid(row=1, column=0, columnspan=2, padx=12, pady=6)

        btn = ttk.Frame(f)
        btn.grid(row=1, column=2, padx=8, sticky="n", pady=6)
        ttk.Button(btn, text="파일 추가", command=self._mrg_add).pack(fill="x", pady=3)
        ttk.Button(btn, text="제거",     command=self._mrg_remove).pack(fill="x", pady=3)
        ttk.Button(btn, text="위로 ↑",  command=lambda: self._mrg_move(-1)).pack(fill="x", pady=3)
        ttk.Button(btn, text="아래로 ↓",command=lambda: self._mrg_move(1)).pack(fill="x", pady=3)

        ttk.Button(f, text="병합하기", command=self._do_merge).grid(row=2, column=0, sticky="w", padx=12, pady=16)

    def _mrg_add(self):
        for p in filedialog.askopenfilenames(filetypes=[("PDF", "*.pdf")]):
            self.mrg_list.insert(tk.END, p)

    def _mrg_remove(self):
        for i in reversed(self.mrg_list.curselection()):
            self.mrg_list.delete(i)

    def _mrg_move(self, d):
        sel = self.mrg_list.curselection()
        if not sel:
            return
        i, j = sel[0], sel[0] + d
        if j < 0 or j >= self.mrg_list.size():
            return
        a, b = self.mrg_list.get(i), self.mrg_list.get(j)
        self.mrg_list.delete(min(i, j), max(i, j))
        if d == -1:
            self.mrg_list.insert(i - 1, a)
            self.mrg_list.insert(i, b)
        else:
            self.mrg_list.insert(i, b)
            self.mrg_list.insert(i + 1, a)
        self.mrg_list.select_set(j)

    def _do_merge(self):
        items = list(self.mrg_list.get(0, tk.END))
        if len(items) < 2:
            messagebox.showwarning("입력 필요", "파일을 2개 이상 추가하세요.")
            return
        out = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
        if not out:
            return
        try:
            writer = PdfWriter()
            for path in items:
                for page in PdfReader(path).pages:
                    writer.add_page(page)
            with open(out, "wb") as fh:
                writer.write(fh)
            messagebox.showinfo("완료", f"{len(items)}개 파일 병합 완료!\n{out}")
        except Exception as e:
            messagebox.showerror("오류", str(e))

    # ── 수정 ─────────────────────────────────────────────────────────
    def _build_edit(self):
        f = self.tab_edt

        # 파일 선택
        ttk.Label(f, text="PDF 파일").grid(row=0, column=0, sticky="w", padx=12, pady=(18, 6))
        self.edt_path = tk.StringVar()
        ttk.Entry(f, textvariable=self.edt_path, width=50).grid(row=0, column=1, padx=6, pady=(18, 6))
        ttk.Button(f, text="찾아보기", command=self._edt_browse).grid(row=0, column=2, padx=6, pady=(18, 6))
        self.edt_info = ttk.Label(f, text="", foreground="gray")
        self.edt_info.grid(row=1, column=1, sticky="w", padx=6)

        # 작업 선택
        ttk.Label(f, text="작업 선택").grid(row=2, column=0, sticky="w", padx=12, pady=(10, 6))
        self.edt_op = tk.StringVar(value="delete")
        op_f = ttk.Frame(f)
        op_f.grid(row=2, column=1, columnspan=2, sticky="w", padx=6)
        for txt, val in [("페이지 삭제", "delete"), ("페이지 회전", "rotate"),
                         ("텍스트/도장 추가", "text"), ("이미지 삽입", "image")]:
            ttk.Radiobutton(op_f, text=txt, variable=self.edt_op, value=val,
                            command=self._refresh_opts).pack(side="left", padx=6)

        # 옵션 영역
        self.opts_frame = ttk.LabelFrame(f, text="옵션")
        self.opts_frame.grid(row=3, column=0, columnspan=3, sticky="ew", padx=12, pady=8)
        self._refresh_opts()

        ttk.Button(f, text="저장하기", command=self._do_edit).grid(row=4, column=1, sticky="w", padx=6, pady=12)

    def _edt_browse(self):
        p = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if p:
            self.edt_path.set(p)
            self.edt_info.config(text=f"총 {len(PdfReader(p).pages)}페이지")

    def _refresh_opts(self):
        for w in self.opts_frame.winfo_children():
            w.destroy()
        op = self.edt_op.get()
        f = self.opts_frame

        if op == "delete":
            ttk.Label(f, text="삭제할 페이지  예) 2,4,6-8").grid(row=0, column=0, sticky="w", padx=12, pady=10)
            self.del_pages = tk.StringVar()
            ttk.Entry(f, textvariable=self.del_pages, width=30).grid(row=0, column=1, padx=6, pady=10)

        elif op == "rotate":
            ttk.Label(f, text="회전할 페이지  예) 1,3  또는  all").grid(row=0, column=0, sticky="w", padx=12, pady=8)
            self.rot_pages = tk.StringVar(value="all")
            ttk.Entry(f, textvariable=self.rot_pages, width=20).grid(row=0, column=1, sticky="w", padx=6, pady=8)

            ttk.Label(f, text="회전 각도").grid(row=1, column=0, sticky="w", padx=12, pady=8)
            self.rot_angle = tk.StringVar(value="90")
            af = ttk.Frame(f)
            af.grid(row=1, column=1, sticky="w", padx=6)
            for txt, val in [("90° 오른쪽", "90"), ("180°", "180"), ("90° 왼쪽", "270")]:
                ttk.Radiobutton(af, text=txt, variable=self.rot_angle, value=val).pack(side="left", padx=6)

        elif op == "text":
            ttk.Label(f, text="페이지  예) 1,3  또는  all").grid(row=0, column=0, sticky="w", padx=12, pady=6)
            self.txt_pages = tk.StringVar(value="all")
            ttk.Entry(f, textvariable=self.txt_pages, width=20).grid(row=0, column=1, sticky="w", padx=6, pady=6)

            ttk.Label(f, text="텍스트 내용").grid(row=1, column=0, sticky="w", padx=12, pady=6)
            self.txt_content = tk.StringVar()
            ttk.Entry(f, textvariable=self.txt_content, width=38).grid(row=1, column=1, columnspan=2, sticky="w", padx=6, pady=6)

            ttk.Label(f, text="위치").grid(row=2, column=0, sticky="w", padx=12, pady=6)
            self.txt_pos = tk.StringVar(value="top-right")
            pf = ttk.Frame(f)
            pf.grid(row=2, column=1, columnspan=2, sticky="w", padx=6)
            for i, (txt, val) in enumerate([
                ("상단 왼쪽", "top-left"), ("상단 중앙", "top-center"), ("상단 오른쪽", "top-right"),
                ("중앙", "center"), ("하단 왼쪽", "bottom-left"), ("하단 중앙", "bottom-center"), ("하단 오른쪽", "bottom-right"),
            ]):
                ttk.Radiobutton(pf, text=txt, variable=self.txt_pos, value=val).grid(
                    row=i // 4, column=i % 4, sticky="w", padx=4, pady=2)

            ttk.Label(f, text="글자 크기").grid(row=3, column=0, sticky="w", padx=12, pady=6)
            self.txt_size = tk.StringVar(value="14")
            ttk.Entry(f, textvariable=self.txt_size, width=8).grid(row=3, column=1, sticky="w", padx=6, pady=6)

            ttk.Label(f, text="색상").grid(row=4, column=0, sticky="w", padx=12, pady=6)
            self.txt_color = tk.StringVar(value="black")
            cf = ttk.Frame(f)
            cf.grid(row=4, column=1, sticky="w", padx=6)
            for txt, val in [("검정", "black"), ("빨강", "red"), ("파랑", "blue"), ("회색", "gray")]:
                ttk.Radiobutton(cf, text=txt, variable=self.txt_color, value=val).pack(side="left", padx=6)

        elif op == "image":
            ttk.Label(f, text="페이지  예) 1,3  또는  all").grid(row=0, column=0, sticky="w", padx=12, pady=6)
            self.img_pages = tk.StringVar(value="all")
            ttk.Entry(f, textvariable=self.img_pages, width=20).grid(row=0, column=1, sticky="w", padx=6, pady=6)

            ttk.Label(f, text="이미지 파일").grid(row=1, column=0, sticky="w", padx=12, pady=6)
            self.img_path = tk.StringVar()
            ttk.Entry(f, textvariable=self.img_path, width=38).grid(row=1, column=1, padx=6, pady=6)
            ttk.Button(f, text="찾아보기", command=self._img_browse).grid(row=1, column=2, padx=6, pady=6)

            ttk.Label(f, text="위치").grid(row=2, column=0, sticky="w", padx=12, pady=6)
            self.img_pos = tk.StringVar(value="top-right")
            pf2 = ttk.Frame(f)
            pf2.grid(row=2, column=1, columnspan=2, sticky="w", padx=6)
            for i, (txt, val) in enumerate([
                ("상단 왼쪽", "top-left"), ("상단 중앙", "top-center"), ("상단 오른쪽", "top-right"),
                ("중앙", "center"), ("하단 왼쪽", "bottom-left"), ("하단 중앙", "bottom-center"), ("하단 오른쪽", "bottom-right"),
            ]):
                ttk.Radiobutton(pf2, text=txt, variable=self.img_pos, value=val).grid(
                    row=i // 4, column=i % 4, sticky="w", padx=4, pady=2)

            ttk.Label(f, text="이미지 크기 (%)").grid(row=3, column=0, sticky="w", padx=12, pady=6)
            self.img_scale = tk.StringVar(value="20")
            ttk.Entry(f, textvariable=self.img_scale, width=8).grid(row=3, column=1, sticky="w", padx=6, pady=6)
            ttk.Label(f, text="← 페이지 너비 대비").grid(row=3, column=2, sticky="w", padx=4)

    def _img_browse(self):
        p = filedialog.askopenfilename(filetypes=[("이미지", "*.png *.jpg *.jpeg *.bmp *.gif")])
        if p:
            self.img_path.set(p)

    # ── 수정 실행 ─────────────────────────────────────────────────────
    def _do_edit(self):
        path = self.edt_path.get()
        if not path:
            messagebox.showwarning("입력 필요", "PDF 파일을 선택하세요.")
            return
        op = self.edt_op.get()
        try:
            reader = PdfReader(path)
            total = len(reader.pages)
            writer = PdfWriter()

            # ── 페이지 삭제
            if op == "delete":
                del_set = set(parse_pages(self.del_pages.get(), total))
                if not del_set:
                    messagebox.showerror("오류", "삭제할 페이지를 입력하세요.")
                    return
                for i, page in enumerate(reader.pages):
                    if i not in del_set:
                        writer.add_page(page)
                if len(writer.pages) == 0:
                    messagebox.showerror("오류", "전체 페이지가 삭제됩니다. 다시 확인하세요.")
                    return

            # ── 페이지 회전
            elif op == "rotate":
                pages_set = set(parse_pages(self.rot_pages.get(), total))
                angle = int(self.rot_angle.get())
                for i, page in enumerate(reader.pages):
                    if i in pages_set:
                        page.rotate(angle)
                    writer.add_page(page)

            # ── 텍스트/도장 추가
            elif op == "text":
                pages_set = set(parse_pages(self.txt_pages.get(), total))
                text = self.txt_content.get()
                if not text:
                    messagebox.showerror("오류", "텍스트를 입력하세요.")
                    return
                font_size = int(self.txt_size.get())
                pos_key = self.txt_pos.get()
                color_map = {"black": (0, 0, 0), "red": (1, 0, 0), "blue": (0, 0, 1), "gray": (0.5, 0.5, 0.5)}
                color = color_map.get(self.txt_color.get(), (0, 0, 0))
                font = get_font()

                for i, page in enumerate(reader.pages):
                    if i in pages_set:
                        pw = float(page.mediabox.width)
                        ph = float(page.mediabox.height)
                        tw = len(text) * font_size * 0.55
                        th = font_size
                        x, y = calc_pos(pos_key, pw, ph, tw, th)

                        packet = io.BytesIO()
                        c = rl_canvas.Canvas(packet, pagesize=(pw, ph))
                        c.setFont(font, font_size)
                        c.setFillColorRGB(*color)
                        c.drawString(x, y, text)
                        c.save()
                        packet.seek(0)
                        overlay = PdfReader(packet)
                        page.merge_page(overlay.pages[0])
                    writer.add_page(page)

            # ── 이미지 삽입
            elif op == "image":
                pages_set = set(parse_pages(self.img_pages.get(), total))
                img_path = self.img_path.get()
                if not img_path or not os.path.exists(img_path):
                    messagebox.showerror("오류", "이미지 파일을 선택하세요.")
                    return
                scale = float(self.img_scale.get()) / 100
                pos_key = self.img_pos.get()

                pil_img = Image.open(img_path).convert("RGBA")

                for i, page in enumerate(reader.pages):
                    if i in pages_set:
                        pw = float(page.mediabox.width)
                        ph = float(page.mediabox.height)
                        iw = pw * scale
                        ih = iw * pil_img.height / pil_img.width
                        x, y = calc_pos(pos_key, pw, ph, iw, ih)

                        tmp = io.BytesIO()
                        pil_img.save(tmp, format="PNG")
                        tmp.seek(0)

                        packet = io.BytesIO()
                        c = rl_canvas.Canvas(packet, pagesize=(pw, ph))
                        c.drawImage(rl_canvas.ImageReader(tmp), x, y, width=iw, height=ih, mask="auto")
                        c.save()
                        packet.seek(0)
                        overlay = PdfReader(packet)
                        page.merge_page(overlay.pages[0])
                    writer.add_page(page)

            # ── 저장
            out = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
            if not out:
                return
            with open(out, "wb") as fh:
                writer.write(fh)
            messagebox.showinfo("완료", f"저장 완료!\n{out}")

        except Exception as e:
            messagebox.showerror("오류", str(e))


    # ── 순서변경 ──────────────────────────────────────────────────────
    def _build_reorder(self):
        f = self.tab_ord

        ttk.Label(f, text="PDF 파일").grid(row=0, column=0, sticky="w", padx=12, pady=(18, 6))
        self.ord_path = tk.StringVar()
        ttk.Entry(f, textvariable=self.ord_path, width=52).grid(row=0, column=1, padx=6, pady=(18, 6))
        ttk.Button(f, text="찾아보기", command=self._ord_browse).grid(row=0, column=2, padx=6, pady=(18, 6))

        self.ord_info = ttk.Label(f, text="", foreground="gray")
        self.ord_info.grid(row=1, column=1, sticky="w", padx=6)

        ttk.Label(f, text="페이지 순서").grid(row=2, column=0, sticky="nw", padx=12, pady=(10, 4))
        ttk.Label(f, text="목록을 클릭 후 ↑↓ 버튼으로 순서를 바꾸세요. 아래 직접입력란에 원하는 순서를 쓸 수도 있어요.",
                  foreground="gray").grid(row=2, column=1, columnspan=2, sticky="w", padx=6, pady=(10, 4))

        list_frame = ttk.Frame(f)
        list_frame.grid(row=3, column=1, padx=6, pady=4, sticky="w")

        self.ord_list = tk.Listbox(list_frame, width=28, height=10, selectmode="single")
        sb = ttk.Scrollbar(list_frame, command=self.ord_list.yview)
        self.ord_list.configure(yscrollcommand=sb.set)
        self.ord_list.pack(side="left")
        sb.pack(side="left", fill="y")

        btn_f = ttk.Frame(f)
        btn_f.grid(row=3, column=2, padx=8, sticky="n", pady=4)
        ttk.Button(btn_f, text="맨 위로",   command=self._ord_top).pack(fill="x", pady=2)
        ttk.Button(btn_f, text="위로 ↑",   command=lambda: self._ord_move(-1)).pack(fill="x", pady=2)
        ttk.Button(btn_f, text="아래로 ↓", command=lambda: self._ord_move(1)).pack(fill="x", pady=2)
        ttk.Button(btn_f, text="맨 아래로", command=self._ord_bottom).pack(fill="x", pady=2)

        # 직접 입력
        row_direct = ttk.Frame(f)
        row_direct.grid(row=4, column=0, columnspan=3, sticky="w", padx=12, pady=(6, 2))
        ttk.Label(row_direct, text="직접 입력  예) 3,1,2,4").pack(side="left")
        self.ord_custom = tk.StringVar()
        ttk.Entry(row_direct, textvariable=self.ord_custom, width=28).pack(side="left", padx=6)
        ttk.Button(row_direct, text="목록에 적용", command=self._ord_apply_custom).pack(side="left")

        ttk.Button(f, text="순서 변경하여 저장", command=self._do_reorder).grid(
            row=5, column=1, sticky="w", padx=6, pady=14)

    def _ord_browse(self):
        p = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if not p:
            return
        self.ord_path.set(p)
        total = len(PdfReader(p).pages)
        self.ord_info.config(text=f"총 {total}페이지")
        self.ord_list.delete(0, tk.END)
        for i in range(1, total + 1):
            self.ord_list.insert(tk.END, f"페이지 {i}")

    def _ord_move(self, d):
        sel = self.ord_list.curselection()
        if not sel:
            return
        i = sel[0]
        j = i + d
        if j < 0 or j >= self.ord_list.size():
            return
        a, b = self.ord_list.get(i), self.ord_list.get(j)
        self.ord_list.delete(min(i, j), max(i, j))
        if d == -1:
            self.ord_list.insert(i - 1, a)
            self.ord_list.insert(i, b)
        else:
            self.ord_list.insert(i, b)
            self.ord_list.insert(i + 1, a)
        self.ord_list.select_set(j)
        self.ord_list.see(j)

    def _ord_top(self):
        sel = self.ord_list.curselection()
        if not sel or sel[0] == 0:
            return
        i = sel[0]
        val = self.ord_list.get(i)
        self.ord_list.delete(i)
        self.ord_list.insert(0, val)
        self.ord_list.select_set(0)
        self.ord_list.see(0)

    def _ord_bottom(self):
        sel = self.ord_list.curselection()
        if not sel:
            return
        i = sel[0]
        last = self.ord_list.size() - 1
        if i == last:
            return
        val = self.ord_list.get(i)
        self.ord_list.delete(i)
        self.ord_list.insert(tk.END, val)
        self.ord_list.select_set(last)
        self.ord_list.see(last)

    def _ord_apply_custom(self):
        path = self.ord_path.get()
        if not path:
            messagebox.showwarning("입력 필요", "먼저 PDF 파일을 선택하세요.")
            return
        total = len(PdfReader(path).pages)
        raw = self.ord_custom.get().strip()
        if not raw:
            return
        try:
            order = [int(x.strip()) for x in raw.split(",")]
        except ValueError:
            messagebox.showerror("오류", "숫자와 쉼표만 입력하세요.  예) 3,1,2,4")
            return
        invalid = [n for n in order if n < 1 or n > total]
        if invalid:
            messagebox.showerror("오류", f"범위를 벗어난 페이지: {invalid}\n(1~{total} 사이로 입력)")
            return
        self.ord_list.delete(0, tk.END)
        for n in order:
            self.ord_list.insert(tk.END, f"페이지 {n}")

    def _do_reorder(self):
        path = self.ord_path.get()
        if not path:
            messagebox.showwarning("입력 필요", "PDF 파일을 선택하세요.")
            return
        if self.ord_list.size() == 0:
            messagebox.showwarning("입력 필요", "페이지 목록이 비어 있어요. 파일을 다시 선택하세요.")
            return
        try:
            reader = PdfReader(path)
            total = len(reader.pages)
            order = []
            for item in self.ord_list.get(0, tk.END):
                n = int(item.replace("페이지 ", "").strip())
                order.append(n - 1)  # 0-indexed

            out = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
            if not out:
                return
            writer = PdfWriter()
            for idx in order:
                writer.add_page(reader.pages[idx])
            with open(out, "wb") as fh:
                writer.write(fh)
            messagebox.showinfo("완료", f"{len(order)}페이지 저장 완료!\n{out}")
        except Exception as e:
            messagebox.showerror("오류", str(e))


    # ── 이미지변환 ────────────────────────────────────────────────────
    def _build_img_convert(self):
        f = self.tab_img_conv

        ttk.Label(f, text="PDF 파일").grid(row=0, column=0, sticky="w", padx=12, pady=(18, 6))
        self.iconv_path = tk.StringVar()
        ttk.Entry(f, textvariable=self.iconv_path, width=52).grid(row=0, column=1, padx=6, pady=(18, 6))
        ttk.Button(f, text="찾아보기", command=self._iconv_browse).grid(row=0, column=2, padx=6, pady=(18, 6))

        self.iconv_info = ttk.Label(f, text="", foreground="gray")
        self.iconv_info.grid(row=1, column=1, sticky="w", padx=6)

        ttk.Label(f, text="변환할 페이지\n예) 1,3,5-7  또는  all").grid(row=2, column=0, sticky="w", padx=12, pady=10)
        self.iconv_pages = tk.StringVar(value="all")
        ttk.Entry(f, textvariable=self.iconv_pages, width=28).grid(row=2, column=1, sticky="w", padx=6, pady=10)

        ttk.Label(f, text="출력 형식").grid(row=3, column=0, sticky="w", padx=12, pady=8)
        self.iconv_fmt = tk.StringVar(value="PNG")
        fmt_f = ttk.Frame(f)
        fmt_f.grid(row=3, column=1, sticky="w", padx=6)
        for txt in ["PNG", "JPG"]:
            ttk.Radiobutton(fmt_f, text=txt, variable=self.iconv_fmt, value=txt).pack(side="left", padx=8)

        ttk.Label(f, text="해상도 (DPI)\n높을수록 고화질").grid(row=4, column=0, sticky="w", padx=12, pady=8)
        self.iconv_dpi = tk.StringVar(value="300")
        dpi_f = ttk.Frame(f)
        dpi_f.grid(row=4, column=1, sticky="w", padx=6)
        for txt, val in [("150 (보통)", "150"), ("300 (고화질)", "300"), ("600 (초고화질)", "600")]:
            ttk.Radiobutton(dpi_f, text=txt, variable=self.iconv_dpi, value=val).pack(side="left", padx=8)

        ttk.Label(f, text="저장 폴더").grid(row=5, column=0, sticky="w", padx=12, pady=8)
        self.iconv_dir = tk.StringVar()
        ttk.Entry(f, textvariable=self.iconv_dir, width=52).grid(row=5, column=1, padx=6, pady=8)
        ttk.Button(f, text="찾아보기", command=self._iconv_dir_browse).grid(row=5, column=2, padx=6, pady=8)

        ttk.Label(f, text="※ 파일명은 자동으로 '원본파일명_001.png' 형태로 저장됩니다.", foreground="gray").grid(
            row=6, column=1, sticky="w", padx=6)

        ttk.Button(f, text="이미지로 변환하기", command=self._do_img_convert).grid(
            row=7, column=1, sticky="w", padx=6, pady=16)

        self.iconv_status = ttk.Label(f, text="", foreground="blue")
        self.iconv_status.grid(row=8, column=1, sticky="w", padx=6)

    def _iconv_browse(self):
        p = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if p:
            self.iconv_path.set(p)
            doc = fitz.open(p)
            self.iconv_info.config(text=f"총 {len(doc)}페이지")
            doc.close()
            # 저장 폴더 기본값: PDF와 같은 폴더
            if not self.iconv_dir.get():
                self.iconv_dir.set(os.path.dirname(p))

    def _iconv_dir_browse(self):
        d = filedialog.askdirectory()
        if d:
            self.iconv_dir.set(d)

    def _do_img_convert(self):
        path = self.iconv_path.get()
        out_dir = self.iconv_dir.get()
        if not path:
            messagebox.showwarning("입력 필요", "PDF 파일을 선택하세요.")
            return
        if not out_dir:
            messagebox.showwarning("입력 필요", "저장 폴더를 선택하세요.")
            return
        try:
            doc = fitz.open(path)
            total = len(doc)
            pages = parse_pages(self.iconv_pages.get(), total)
            if not pages:
                messagebox.showerror("오류", "유효한 페이지가 없어요.")
                doc.close()
                return

            dpi = int(self.iconv_dpi.get())
            fmt = self.iconv_fmt.get()
            ext = fmt.lower()
            zoom = dpi / 72  # PDF 기본 72dpi 기준 배율
            mat = fitz.Matrix(zoom, zoom)

            base_name = os.path.splitext(os.path.basename(path))[0]
            os.makedirs(out_dir, exist_ok=True)

            self.iconv_status.config(text="변환 중...")
            self.update()

            saved = []
            for p in pages:
                page = doc.load_page(p)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                out_file = os.path.join(out_dir, f"{base_name}_{p + 1:03d}.{ext}")
                if fmt == "JPG":
                    pix.save(out_file, output="jpeg")
                else:
                    pix.save(out_file)
                saved.append(out_file)

            doc.close()
            self.iconv_status.config(text=f"완료! {len(saved)}개 파일 저장됨")
            messagebox.showinfo("완료", f"{len(saved)}개 이미지 저장 완료!\n저장 위치: {out_dir}")
        except Exception as e:
            self.iconv_status.config(text="")
            messagebox.showerror("오류", str(e))


    # ── 직인 ──────────────────────────────────────────────────────────
    def _build_stamp(self):
        # 상태 변수
        self._stamp_pdf_doc = None
        self._stamp_preview_idx = 0
        self._stamp_zoom = 1.0
        self._stamp_page_w = 1.0
        self._stamp_page_h = 1.0
        self._stamp_img_w = 1
        self._stamp_img_h = 1
        self._stamp_px = 0.80   # 직인 중심 위치 (페이지 비율 0~1)
        self._stamp_py = 0.85
        self._stamp_offset_x = 0
        self._stamp_offset_y = 0
        self._stamp_preview_photo = None

        f = self.tab_stamp

        # ─ PDF 선택 (상단) ─
        ttk.Label(f, text="PDF 파일").grid(row=0, column=0, sticky="w", padx=12, pady=(14, 5))
        self.stamp_pdf_path = tk.StringVar()
        ttk.Entry(f, textvariable=self.stamp_pdf_path, width=52).grid(row=0, column=1, padx=6, pady=(14, 5))
        ttk.Button(f, text="찾아보기", command=self._stamp_browse_pdf).grid(row=0, column=2, padx=6, pady=(14, 5))
        self.stamp_pdf_info = ttk.Label(f, text="", foreground="gray")
        self.stamp_pdf_info.grid(row=1, column=1, sticky="w", padx=6)

        # ─ 메인 영역 (미리보기 + 설정 나란히) ─
        main = ttk.Frame(f)
        main.grid(row=2, column=0, columnspan=3, padx=12, pady=6, sticky="nsew")

        # 왼쪽: 미리보기
        lf = ttk.LabelFrame(main, text="  미리보기  —  클릭 또는 드래그로 직인 위치 지정  ")
        lf.pack(side="left", padx=(0, 12), fill="y", anchor="n")

        self.stamp_canvas = tk.Canvas(lf, width=STAMP_PW, height=STAMP_PH, bg="#a0a0a0", cursor="crosshair")
        self.stamp_canvas.pack(padx=4, pady=(4, 2))
        self.stamp_canvas.bind("<Button-1>", self._stamp_click)
        self.stamp_canvas.bind("<B1-Motion>", self._stamp_drag)

        nav = ttk.Frame(lf)
        nav.pack(pady=(2, 6))
        ttk.Button(nav, text="◀", width=3, command=self._stamp_prev_page).pack(side="left")
        self._stamp_page_lbl = ttk.Label(nav, text="—", width=12, anchor="center")
        self._stamp_page_lbl.pack(side="left", padx=8)
        ttk.Button(nav, text="▶", width=3, command=self._stamp_next_page).pack(side="left")

        # 오른쪽: 설정
        rf = ttk.Frame(main)
        rf.pack(side="left", fill="y", anchor="n")
        row = 0

        # 직인 이미지
        ttk.Label(rf, text="직인 이미지 (PNG)", font=("", 9, "bold")).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(0, 4))
        row += 1
        self.stamp_img_path = tk.StringVar()
        try:
            with open(STAMP_CONFIG, "r", encoding="utf-8") as fh:
                self.stamp_img_path.set(json.load(fh).get("stamp_path", ""))
        except Exception:
            pass
        ttk.Entry(rf, textvariable=self.stamp_img_path, width=24).grid(row=row, column=0, padx=(0, 4), pady=3)
        ttk.Button(rf, text="찾기", width=5, command=self._stamp_browse_img).grid(row=row, column=1, pady=3)
        row += 1

        # 크기
        ttk.Label(rf, text="크기 (페이지 너비 %)").grid(row=row, column=0, columnspan=2, sticky="w", pady=(10, 2))
        row += 1
        self.stamp_scale = tk.IntVar(value=15)
        tk.Scale(rf, from_=5, to=60, orient="horizontal", variable=self.stamp_scale,
                 length=210, command=lambda _: self._stamp_refresh()).grid(row=row, column=0, columnspan=2, sticky="w")
        row += 1

        # 투명도
        ttk.Label(rf, text="투명도 (100 = 불투명)").grid(row=row, column=0, columnspan=2, sticky="w", pady=(8, 2))
        row += 1
        self.stamp_opacity = tk.IntVar(value=80)
        tk.Scale(rf, from_=10, to=100, orient="horizontal", variable=self.stamp_opacity,
                 length=210, command=lambda _: self._stamp_refresh()).grid(row=row, column=0, columnspan=2, sticky="w")
        row += 1

        # ─ 텍스트 구분선 ─
        ttk.Separator(rf, orient="horizontal").grid(row=row, column=0, columnspan=2, sticky="ew", pady=(14, 6))
        row += 1
        ttk.Label(rf, text="텍스트 (선택사항)", font=("", 9, "bold")).grid(
            row=row, column=0, columnspan=2, sticky="w")
        row += 1

        ttk.Label(rf, text="내용").grid(row=row, column=0, sticky="w", pady=4)
        self.stamp_text = tk.StringVar()
        self.stamp_text.trace_add("write", lambda *_: self._stamp_refresh())
        ttk.Entry(rf, textvariable=self.stamp_text, width=22).grid(row=row, column=1, sticky="w", pady=4)
        row += 1

        ttk.Label(rf, text="글자 크기").grid(row=row, column=0, sticky="w", pady=4)
        self.stamp_text_size = tk.IntVar(value=14)
        tk.Scale(rf, from_=8, to=36, orient="horizontal", variable=self.stamp_text_size,
                 length=140, command=lambda _: self._stamp_refresh()).grid(row=row, column=1, sticky="w")
        row += 1

        ttk.Label(rf, text="색상").grid(row=row, column=0, sticky="w", pady=4)
        self.stamp_text_color = tk.StringVar(value="black")
        cf = ttk.Frame(rf)
        cf.grid(row=row, column=1, sticky="w")
        for txt, val in [("검정", "black"), ("빨강", "red"), ("파랑", "blue")]:
            ttk.Radiobutton(cf, text=txt, variable=self.stamp_text_color, value=val,
                            command=self._stamp_refresh).pack(side="left", padx=2)
        row += 1

        ttk.Label(rf, text="위치").grid(row=row, column=0, sticky="w", pady=4)
        self.stamp_text_pos = tk.StringVar(value="below")
        pf2 = ttk.Frame(rf)
        pf2.grid(row=row, column=1, sticky="w")
        for txt, val in [("위", "above"), ("중앙", "center"), ("아래", "below")]:
            ttk.Radiobutton(pf2, text=txt, variable=self.stamp_text_pos, value=val,
                            command=self._stamp_refresh).pack(side="left", padx=4)
        row += 1

        # ─ 저장 ─
        ttk.Separator(rf, orient="horizontal").grid(row=row, column=0, columnspan=2, sticky="ew", pady=(14, 6))
        row += 1
        ttk.Label(rf, text="적용 페이지").grid(row=row, column=0, sticky="w", pady=4)
        self.stamp_pages = tk.StringVar(value="all")
        ttk.Entry(rf, textvariable=self.stamp_pages, width=16).grid(row=row, column=1, sticky="w", pady=4)
        row += 1
        ttk.Label(rf, text="예) all  또는  1,3,5-7", foreground="gray").grid(
            row=row, column=1, sticky="w")
        row += 1
        ttk.Button(rf, text="직인 삽입하여 저장", command=self._do_stamp).grid(
            row=row, column=0, columnspan=2, pady=(16, 4))

    def _stamp_browse_pdf(self):
        p = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if not p:
            return
        self.stamp_pdf_path.set(p)
        if self._stamp_pdf_doc:
            self._stamp_pdf_doc.close()
        self._stamp_pdf_doc = fitz.open(p)
        total = len(self._stamp_pdf_doc)
        self._stamp_preview_idx = 0
        self.stamp_pdf_info.config(text=f"총 {total}페이지")
        self._stamp_page_lbl.config(text=f"1 / {total}")
        self._stamp_refresh()

    def _stamp_browse_img(self):
        p = filedialog.askopenfilename(filetypes=[("PNG 이미지", "*.png")])
        if not p:
            return
        self.stamp_img_path.set(p)
        try:
            with open(STAMP_CONFIG, "w", encoding="utf-8") as fh:
                json.dump({"stamp_path": p}, fh, ensure_ascii=False)
        except Exception:
            pass
        self._stamp_refresh()

    def _stamp_refresh(self, *_):
        if self._stamp_pdf_doc is None:
            return
        page = self._stamp_pdf_doc[self._stamp_preview_idx]
        pw, ph = page.rect.width, page.rect.height
        zoom = min(STAMP_PW / pw, STAMP_PH / ph) * 0.97
        self._stamp_zoom = zoom
        self._stamp_page_w = pw
        self._stamp_page_h = ph

        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        self._stamp_img_w = pix.width
        self._stamp_img_h = pix.height
        preview = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert("RGBA")

        sx_px = sy_px = sw_px = sh_px = 0
        img_path = self.stamp_img_path.get()
        if img_path and os.path.exists(img_path):
            try:
                stamp = Image.open(img_path).convert("RGBA")
                r, g, b, a = stamp.split()
                a = a.point(lambda x: int(x * self.stamp_opacity.get() / 100))
                stamp.putalpha(a)
                sw_px = max(1, int(pix.width * self.stamp_scale.get() / 100))
                sh_px = max(1, int(sw_px * stamp.height / stamp.width))
                stamp = stamp.resize((sw_px, sh_px), Image.LANCZOS)
                sx_px = int(self._stamp_px * pix.width - sw_px / 2)
                sy_px = int(self._stamp_py * pix.height - sh_px / 2)
                sx_px = max(0, min(sx_px, pix.width - sw_px))
                sy_px = max(0, min(sy_px, pix.height - sh_px))
                preview.paste(stamp, (sx_px, sy_px), stamp)
            except Exception:
                pass

        text = self.stamp_text.get().strip()
        if text and sw_px > 0:
            draw = ImageDraw.Draw(preview)
            fsize = max(8, int(self.stamp_text_size.get() * zoom))
            try:
                font = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", fsize)
            except Exception:
                font = None
            clr_map = {"black": (0, 0, 0, 255), "red": (210, 0, 0, 255), "blue": (0, 0, 200, 255)}
            clr = clr_map.get(self.stamp_text_color.get(), (0, 0, 0, 255))
            if font:
                bb = draw.textbbox((0, 0), text, font=font)
                tw, th = bb[2] - bb[0], bb[3] - bb[1]
            else:
                tw, th = len(text) * fsize * 0.6, fsize
            tx = sx_px + sw_px // 2 - int(tw // 2)
            pos = self.stamp_text_pos.get()
            if pos == "above":
                ty = sy_px - th - 3
            elif pos == "center":
                ty = sy_px + sh_px // 2 - th // 2
            else:
                ty = sy_px + sh_px + 3
            kw = {"font": font} if font else {}
            draw.text((tx, ty), text, fill=clr, **kw)

        self._stamp_offset_x = (STAMP_PW - pix.width) // 2
        self._stamp_offset_y = (STAMP_PH - pix.height) // 2
        self._stamp_preview_photo = ImageTk.PhotoImage(preview.convert("RGB"))
        self.stamp_canvas.delete("all")
        self.stamp_canvas.create_image(
            self._stamp_offset_x, self._stamp_offset_y, anchor="nw", image=self._stamp_preview_photo)

    def _stamp_click(self, event):
        if self._stamp_pdf_doc is None or self._stamp_img_w <= 0:
            return
        px = (event.x - self._stamp_offset_x) / self._stamp_img_w
        py = (event.y - self._stamp_offset_y) / self._stamp_img_h
        self._stamp_px = max(0.01, min(0.99, px))
        self._stamp_py = max(0.01, min(0.99, py))
        self._stamp_refresh()

    def _stamp_drag(self, event):
        self._stamp_click(event)

    def _stamp_prev_page(self):
        if self._stamp_pdf_doc and self._stamp_preview_idx > 0:
            self._stamp_preview_idx -= 1
            total = len(self._stamp_pdf_doc)
            self._stamp_page_lbl.config(text=f"{self._stamp_preview_idx + 1} / {total}")
            self._stamp_refresh()

    def _stamp_next_page(self):
        if self._stamp_pdf_doc:
            total = len(self._stamp_pdf_doc)
            if self._stamp_preview_idx < total - 1:
                self._stamp_preview_idx += 1
                self._stamp_page_lbl.config(text=f"{self._stamp_preview_idx + 1} / {total}")
                self._stamp_refresh()

    def _do_stamp(self):
        pdf_path = self.stamp_pdf_path.get()
        img_path = self.stamp_img_path.get()
        if not pdf_path or not os.path.exists(pdf_path):
            messagebox.showwarning("입력 필요", "PDF 파일을 선택하세요.")
            return
        if not img_path or not os.path.exists(img_path):
            messagebox.showwarning("입력 필요", "직인 이미지 파일을 선택하세요.")
            return
        try:
            pil_img = Image.open(img_path).convert("RGBA")
            pil_w, pil_h = pil_img.size
            r, g, b, a = pil_img.split()
            a = a.point(lambda x: int(x * self.stamp_opacity.get() / 100))
            pil_img.putalpha(a)
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            img_bytes = buf.getvalue()

            doc = fitz.open(pdf_path)
            total = len(doc)
            pages = parse_pages(self.stamp_pages.get(), total)
            if not pages:
                messagebox.showerror("오류", "유효한 페이지가 없어요.")
                doc.close()
                return

            scale = self.stamp_scale.get() / 100
            text = self.stamp_text.get().strip()
            tsize = self.stamp_text_size.get()
            tpos = self.stamp_text_pos.get()
            clr_map = {"black": (0, 0, 0), "red": (0.82, 0, 0), "blue": (0, 0, 0.8)}
            tclr = clr_map.get(self.stamp_text_color.get(), (0, 0, 0))

            for idx in pages:
                page = doc[idx]
                pw, ph = page.rect.width, page.rect.height
                ow = pw * scale
                oh = ow * pil_h / pil_w
                sx = self._stamp_px * pw - ow / 2
                sy = self._stamp_py * ph - oh / 2
                sx = max(0, min(sx, pw - ow))
                sy = max(0, min(sy, ph - oh))
                page.insert_image(fitz.Rect(sx, sy, sx + ow, sy + oh), stream=img_bytes)

                if text:
                    margin = 4
                    if tpos == "above":
                        tr = fitz.Rect(sx, sy - tsize - margin * 2, sx + ow, sy - margin)
                    elif tpos == "center":
                        tr = fitz.Rect(sx, sy + oh / 2 - tsize / 2 - margin,
                                       sx + ow, sy + oh / 2 + tsize / 2 + margin)
                    else:
                        tr = fitz.Rect(sx, sy + oh + margin, sx + ow, sy + oh + tsize + margin * 3)
                    try:
                        page.insert_textbox(tr, text,
                                            fontname="malgun",
                                            fontfile=r"C:\Windows\Fonts\malgun.ttf",
                                            fontsize=tsize, color=tclr, align=1)
                    except Exception:
                        page.insert_textbox(tr, text, fontname="helv",
                                            fontsize=tsize, color=tclr, align=1)

            out = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
            if not out:
                doc.close()
                return
            doc.save(out)
            doc.close()
            messagebox.showinfo("완료", f"직인 삽입 완료!\n{out}")
        except Exception as e:
            messagebox.showerror("오류", str(e))


    # ── 텍스트 삽입 ───────────────────────────────────────────────────
    def _build_text_ins(self):
        self._ti_pdf_doc = None
        self._ti_preview_idx = 0
        self._ti_zoom = 1.0
        self._ti_page_w = 1.0
        self._ti_page_h = 1.0
        self._ti_img_w = 1
        self._ti_img_h = 1
        self._ti_px = 0.1
        self._ti_py = 0.1
        self._ti_offset_x = 0
        self._ti_offset_y = 0
        self._ti_preview_photo = None

        f = self.tab_text_ins

        ttk.Label(f, text="PDF 파일").grid(row=0, column=0, sticky="w", padx=12, pady=(14, 5))
        self.ti_pdf_path = tk.StringVar()
        ttk.Entry(f, textvariable=self.ti_pdf_path, width=52).grid(row=0, column=1, padx=6, pady=(14, 5))
        ttk.Button(f, text="찾아보기", command=self._ti_browse_pdf).grid(row=0, column=2, padx=6, pady=(14, 5))
        self.ti_pdf_info = ttk.Label(f, text="", foreground="gray")
        self.ti_pdf_info.grid(row=1, column=1, sticky="w", padx=6)

        main = ttk.Frame(f)
        main.grid(row=2, column=0, columnspan=3, padx=12, pady=6, sticky="nsew")

        # 왼쪽: 미리보기
        lf = ttk.LabelFrame(main, text="  미리보기  —  클릭으로 텍스트 위치 지정  ")
        lf.pack(side="left", padx=(0, 12), fill="y", anchor="n")

        self.ti_canvas = tk.Canvas(lf, width=STAMP_PW, height=STAMP_PH, bg="#a0a0a0", cursor="crosshair")
        self.ti_canvas.pack(padx=4, pady=(4, 2))
        self.ti_canvas.bind("<Button-1>", self._ti_click)
        self.ti_canvas.bind("<B1-Motion>", self._ti_drag)

        nav = ttk.Frame(lf)
        nav.pack(pady=(2, 6))
        ttk.Button(nav, text="◀", width=3, command=self._ti_prev_page).pack(side="left")
        self._ti_page_lbl = ttk.Label(nav, text="—", width=12, anchor="center")
        self._ti_page_lbl.pack(side="left", padx=8)
        ttk.Button(nav, text="▶", width=3, command=self._ti_next_page).pack(side="left")

        # 오른쪽: 설정
        rf = ttk.Frame(main)
        rf.pack(side="left", fill="y", anchor="n")
        row = 0

        ttk.Label(rf, text="텍스트 내용", font=("", 9, "bold")).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(0, 4))
        row += 1
        self.ti_text = tk.StringVar()
        self.ti_text.trace_add("write", lambda *_: self._ti_refresh())
        ttk.Entry(rf, textvariable=self.ti_text, width=28, font=("맑은 고딕", 11)).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=4, ipady=4)
        row += 1

        ttk.Label(rf, text="글자 크기").grid(row=row, column=0, sticky="w", pady=(12, 2))
        self.ti_size = tk.IntVar(value=16)
        tk.Scale(rf, from_=8, to=72, orient="horizontal", variable=self.ti_size,
                 length=210, command=lambda _: self._ti_refresh()).grid(
            row=row, column=1, sticky="w", pady=(12, 2))
        row += 1

        ttk.Label(rf, text="색상").grid(row=row, column=0, sticky="w", pady=6)
        self.ti_color = tk.StringVar(value="black")
        cf = ttk.Frame(rf)
        cf.grid(row=row, column=1, sticky="w")
        for txt, val in [("검정", "black"), ("빨강", "red"), ("파랑", "blue"), ("회색", "gray")]:
            ttk.Radiobutton(cf, text=txt, variable=self.ti_color, value=val,
                            command=self._ti_refresh).pack(side="left", padx=3)
        row += 1

        ttk.Label(rf, text="굵게").grid(row=row, column=0, sticky="w", pady=6)
        self.ti_bold = tk.BooleanVar(value=False)
        ttk.Checkbutton(rf, variable=self.ti_bold, command=self._ti_refresh).grid(
            row=row, column=1, sticky="w")
        row += 1

        ttk.Separator(rf, orient="horizontal").grid(row=row, column=0, columnspan=2, sticky="ew", pady=(14, 8))
        row += 1

        ttk.Label(rf, text="적용 페이지").grid(row=row, column=0, sticky="w", pady=4)
        self.ti_pages = tk.StringVar(value="all")
        ttk.Entry(rf, textvariable=self.ti_pages, width=16).grid(row=row, column=1, sticky="w", pady=4)
        row += 1
        ttk.Label(rf, text="예) all  또는  1,3,5-7", foreground="gray").grid(
            row=row, column=1, sticky="w")
        row += 1

        ttk.Button(rf, text="텍스트 삽입하여 저장", command=self._do_text_ins).grid(
            row=row, column=0, columnspan=2, pady=(20, 4))

    def _ti_browse_pdf(self):
        p = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if not p:
            return
        self.ti_pdf_path.set(p)
        if self._ti_pdf_doc:
            self._ti_pdf_doc.close()
        self._ti_pdf_doc = fitz.open(p)
        total = len(self._ti_pdf_doc)
        self._ti_preview_idx = 0
        self.ti_pdf_info.config(text=f"총 {total}페이지")
        self._ti_page_lbl.config(text=f"1 / {total}")
        self._ti_refresh()

    def _ti_refresh(self, *_):
        if self._ti_pdf_doc is None:
            return
        page = self._ti_pdf_doc[self._ti_preview_idx]
        pw, ph = page.rect.width, page.rect.height
        zoom = min(STAMP_PW / pw, STAMP_PH / ph) * 0.97
        self._ti_zoom = zoom
        self._ti_page_w = pw
        self._ti_page_h = ph

        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        self._ti_img_w = pix.width
        self._ti_img_h = pix.height
        preview = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert("RGBA")

        text = self.ti_text.get()
        if text:
            draw = ImageDraw.Draw(preview)
            fsize = max(8, int(self.ti_size.get() * zoom))
            font_file = r"C:\Windows\Fonts\malgunbd.ttf" if self.ti_bold.get() else r"C:\Windows\Fonts\malgun.ttf"
            try:
                font = ImageFont.truetype(font_file, fsize)
            except Exception:
                font = None
            clr_map = {"black": (0, 0, 0, 255), "red": (210, 0, 0, 255),
                       "blue": (0, 0, 200, 255), "gray": (100, 100, 100, 255)}
            clr = clr_map.get(self.ti_color.get(), (0, 0, 0, 255))
            tx = int(self._ti_px * pix.width)
            ty = int(self._ti_py * pix.height)
            kw = {"font": font} if font else {}
            draw.text((tx, ty), text, fill=clr, **kw)
            # 위치 표시 십자선
            lc = (255, 80, 80, 180)
            draw.line([(tx - 8, ty), (tx + 8, ty)], fill=lc, width=1)
            draw.line([(tx, ty - 8), (tx, ty + 8)], fill=lc, width=1)

        self._ti_offset_x = (STAMP_PW - pix.width) // 2
        self._ti_offset_y = (STAMP_PH - pix.height) // 2
        self._ti_preview_photo = ImageTk.PhotoImage(preview.convert("RGB"))
        self.ti_canvas.delete("all")
        self.ti_canvas.create_image(
            self._ti_offset_x, self._ti_offset_y, anchor="nw", image=self._ti_preview_photo)

    def _ti_click(self, event):
        if self._ti_pdf_doc is None:
            return
        px = (event.x - self._ti_offset_x) / max(1, self._ti_img_w)
        py = (event.y - self._ti_offset_y) / max(1, self._ti_img_h)
        self._ti_px = max(0.0, min(1.0, px))
        self._ti_py = max(0.0, min(1.0, py))
        self._ti_refresh()

    def _ti_drag(self, event):
        self._ti_click(event)

    def _ti_prev_page(self):
        if self._ti_pdf_doc and self._ti_preview_idx > 0:
            self._ti_preview_idx -= 1
            total = len(self._ti_pdf_doc)
            self._ti_page_lbl.config(text=f"{self._ti_preview_idx + 1} / {total}")
            self._ti_refresh()

    def _ti_next_page(self):
        if self._ti_pdf_doc:
            total = len(self._ti_pdf_doc)
            if self._ti_preview_idx < total - 1:
                self._ti_preview_idx += 1
                self._ti_page_lbl.config(text=f"{self._ti_preview_idx + 1} / {total}")
                self._ti_refresh()

    def _do_text_ins(self):
        pdf_path = self.ti_pdf_path.get()
        text = self.ti_text.get().strip()
        if not pdf_path or not os.path.exists(pdf_path):
            messagebox.showwarning("입력 필요", "PDF 파일을 선택하세요.")
            return
        if not text:
            messagebox.showwarning("입력 필요", "텍스트를 입력하세요.")
            return
        try:
            doc = fitz.open(pdf_path)
            total = len(doc)
            pages = parse_pages(self.ti_pages.get(), total)
            if not pages:
                messagebox.showerror("오류", "유효한 페이지가 없어요.")
                doc.close()
                return

            tsize = self.ti_size.get()
            clr_map = {"black": (0, 0, 0), "red": (0.82, 0, 0),
                       "blue": (0, 0, 0.8), "gray": (0.4, 0.4, 0.4)}
            tclr = clr_map.get(self.ti_color.get(), (0, 0, 0))
            font_file = r"C:\Windows\Fonts\malgunbd.ttf" if self.ti_bold.get() else r"C:\Windows\Fonts\malgun.ttf"

            for idx in pages:
                page = doc[idx]
                pw, ph = page.rect.width, page.rect.height
                tx = self._ti_px * pw
                ty = self._ti_py * ph
                try:
                    page.insert_text(
                        fitz.Point(tx, ty), text,
                        fontname="malgun",
                        fontfile=font_file,
                        fontsize=tsize, color=tclr)
                except Exception:
                    page.insert_text(
                        fitz.Point(tx, ty), text,
                        fontname="helv", fontsize=tsize, color=tclr)

            out = filedialog.asksaveasfilename(defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
            if not out:
                doc.close()
                return
            doc.save(out)
            doc.close()
            messagebox.showinfo("완료", f"텍스트 삽입 완료!\n{out}")
        except Exception as e:
            messagebox.showerror("오류", str(e))


if __name__ == "__main__":
    app = PDFTool()
    app.mainloop()
