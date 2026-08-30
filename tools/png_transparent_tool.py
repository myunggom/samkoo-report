"""
PNG 배경 투명 변환 도구
- 지정한 색상(기본: 흰색)을 투명으로 변환
- 허용 범위(tolerance) 조절 가능
- 단일 파일 / 폴더 일괄 처리 지원
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, colorchooser
import os
from PIL import Image
import numpy as np


class PNGTransparentTool(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PNG 배경 투명 변환")
        self.geometry("560x480")
        self.resizable(False, False)

        self.mode = tk.StringVar(value="file")
        self.input_path = tk.StringVar()
        self.output_path = tk.StringVar()
        self.tolerance = tk.IntVar(value=30)
        self.bg_color = (255, 255, 255)  # 기본: 흰색
        self.bg_hex = tk.StringVar(value="#ffffff")

        self._build_ui()

    def _build_ui(self):
        # ── 처리 대상 ────────────────────────────────────────────
        frm_mode = ttk.LabelFrame(self, text="처리 대상")
        frm_mode.pack(fill="x", padx=12, pady=(12, 4))

        ttk.Radiobutton(
            frm_mode, text="파일 하나", variable=self.mode,
            value="file", command=self._toggle_mode
        ).pack(side="left", padx=10, pady=6)
        ttk.Radiobutton(
            frm_mode, text="폴더 전체 (PNG 전부 변환)",
            variable=self.mode, value="folder", command=self._toggle_mode
        ).pack(side="left")

        # ── 입력 ────────────────────────────────────────────────
        frm_in = ttk.LabelFrame(self, text="입력")
        frm_in.pack(fill="x", padx=12, pady=4)

        ttk.Entry(frm_in, textvariable=self.input_path, width=50).pack(
            side="left", padx=6, pady=6
        )
        self.btn_in = ttk.Button(frm_in, text="파일 선택", command=self._pick_input)
        self.btn_in.pack(side="left")

        # ── 출력 ────────────────────────────────────────────────
        frm_out = ttk.LabelFrame(self, text="출력 폴더 (비워두면 원본 위치에 저장)")
        frm_out.pack(fill="x", padx=12, pady=4)

        ttk.Entry(frm_out, textvariable=self.output_path, width=50).pack(
            side="left", padx=6, pady=6
        )
        ttk.Button(frm_out, text="폴더 선택", command=self._pick_output).pack(
            side="left"
        )

        # ── 옵션 ────────────────────────────────────────────────
        frm_opt = ttk.LabelFrame(self, text="옵션")
        frm_opt.pack(fill="x", padx=12, pady=4)

        # 배경색 선택
        row1 = ttk.Frame(frm_opt)
        row1.pack(fill="x", padx=8, pady=(8, 4))

        ttk.Label(row1, text="제거할 배경색:").pack(side="left")

        self.color_preview = tk.Label(
            row1, bg="#ffffff", width=4, relief="solid", borderwidth=1
        )
        self.color_preview.pack(side="left", padx=6)

        ttk.Label(row1, textvariable=self.bg_hex, foreground="gray").pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(row1, text="색상 선택", command=self._pick_color).pack(
            side="left", padx=4
        )
        ttk.Button(row1, text="흰색으로 초기화", command=self._reset_white).pack(
            side="left", padx=4
        )

        # 허용 범위 슬라이더
        row2 = ttk.Frame(frm_opt)
        row2.pack(fill="x", padx=8, pady=(4, 10))

        ttk.Label(row2, text="허용 범위:").pack(side="left")
        ttk.Scale(
            row2, from_=0, to=100, orient="horizontal",
            variable=self.tolerance, length=280
        ).pack(side="left", padx=6)
        ttk.Label(row2, textvariable=self.tolerance, width=3).pack(side="left")
        ttk.Label(row2, text="  (낮을수록 정밀, 높을수록 넓게 제거)", foreground="gray").pack(
            side="left"
        )

        # ── 변환 버튼 ────────────────────────────────────────────
        ttk.Button(self, text="투명 변환하기", command=self._convert).pack(pady=10)

        # ── 상태 ────────────────────────────────────────────────
        self.status = tk.StringVar(value="파일을 선택하고 변환하기를 눌러주세요.")
        ttk.Label(self, textvariable=self.status, foreground="gray", anchor="w").pack(
            fill="x", padx=14, pady=(0, 6)
        )

        # ── 로그 ────────────────────────────────────────────────
        frm_log = ttk.LabelFrame(self, text="결과")
        frm_log.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        self.log = tk.Text(
            frm_log, height=6, state="disabled", wrap="word",
            font=("맑은 고딕", 9)
        )
        sb = ttk.Scrollbar(frm_log, command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.log.pack(fill="both", expand=True, padx=4, pady=4)

    # ── 헬퍼 ──────────────────────────────────────────────────────

    def _log(self, msg):
        self.log.configure(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")
        self.update()

    def _toggle_mode(self):
        if self.mode.get() == "file":
            self.btn_in.configure(text="파일 선택")
        else:
            self.btn_in.configure(text="폴더 선택")
        self.input_path.set("")

    def _pick_input(self):
        if self.mode.get() == "file":
            p = filedialog.askopenfilename(
                filetypes=[("PNG files", "*.png"), ("All files", "*.*")]
            )
        else:
            p = filedialog.askdirectory()
        if p:
            self.input_path.set(p)

    def _pick_output(self):
        p = filedialog.askdirectory()
        if p:
            self.output_path.set(p)

    def _pick_color(self):
        init = self.bg_hex.get()
        result = colorchooser.askcolor(color=init, title="제거할 배경색 선택")
        if result and result[0]:
            r, g, b = [int(x) for x in result[0]]
            self.bg_color = (r, g, b)
            hex_val = f"#{r:02x}{g:02x}{b:02x}"
            self.bg_hex.set(hex_val)
            self.color_preview.configure(bg=hex_val)

    def _reset_white(self):
        self.bg_color = (255, 255, 255)
        self.bg_hex.set("#ffffff")
        self.color_preview.configure(bg="#ffffff")

    # ── 변환 ──────────────────────────────────────────────────────

    def _convert(self):
        inp = self.input_path.get().strip()
        if not inp or not os.path.exists(inp):
            messagebox.showerror("오류", "입력 파일 또는 폴더를 선택해주세요.")
            return

        out_dir = self.output_path.get().strip()
        tol = self.tolerance.get()

        if self.mode.get() == "file":
            files = [inp]
            base_dir = os.path.dirname(inp)
        else:
            files = [
                os.path.join(inp, f)
                for f in os.listdir(inp)
                if f.lower().endswith(".png")
            ]
            base_dir = inp
            if not files:
                messagebox.showwarning("알림", "폴더에 PNG 파일이 없어요.")
                return

        ok, fail = 0, 0
        for fpath in files:
            try:
                save_dir = out_dir if out_dir else os.path.dirname(fpath)
                os.makedirs(save_dir, exist_ok=True)

                fname = os.path.splitext(os.path.basename(fpath))[0]
                save_path = os.path.join(save_dir, fname + "_transparent.png")

                result_img = self._remove_bg(fpath, self.bg_color, tol)
                result_img.save(save_path, "PNG")

                self._log(f"완료: {save_path}")
                ok += 1
            except Exception as e:
                self._log(f"실패: {os.path.basename(fpath)} — {e}")
                fail += 1

        summary = f"총 {ok + fail}개 처리 — 성공 {ok}개"
        if fail:
            summary += f", 실패 {fail}개"
        self.status.set(summary)
        messagebox.showinfo("완료", summary)

    def _remove_bg(self, path: str, target: tuple, tolerance: int) -> Image.Image:
        img = Image.open(path).convert("RGBA")
        data = np.array(img, dtype=np.int32)

        tr, tg, tb = target
        r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]

        mask = (
            (np.abs(r - tr) <= tolerance) &
            (np.abs(g - tg) <= tolerance) &
            (np.abs(b - tb) <= tolerance)
        )
        data[mask, 3] = 0  # 알파값 0 = 투명

        return Image.fromarray(data.astype(np.uint8), "RGBA")


if __name__ == "__main__":
    app = PNGTransparentTool()
    app.mainloop()
