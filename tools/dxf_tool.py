"""
DXF 도구
- 탭 1: DWG → DXF 변환 (ODA File Converter 활용)
- 탭 2: DXF 레이어 추출 → PNG / SVG 이미지
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
import sys
import subprocess
import tempfile
import shutil
import glob

def _ensure(package, import_name=None):
    import importlib
    name = import_name or package
    try:
        importlib.import_module(name)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])

_ensure("matplotlib")
_ensure("ezdxf")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend


# ODA File Converter 기본 설치 경로 후보
ODA_CANDIDATES = [
    r"C:\Program Files\ODA\ODAFileConverter\ODAFileConverter.exe",
    r"C:\Program Files (x86)\ODA\ODAFileConverter\ODAFileConverter.exe",
    r"C:\Program Files\ODA File Converter\ODAFileConverter.exe",
    r"C:\Program Files (x86)\ODA File Converter\ODAFileConverter.exe",
]

DXF_VERSIONS = ["ACAD2018", "ACAD2013", "ACAD2010", "ACAD2007", "ACAD2004"]


def find_oda():
    for p in ODA_CANDIDATES:
        if os.path.exists(p):
            return p
    return ""


# ══════════════════════════════════════════════════════════════════
#  메인 윈도우
# ══════════════════════════════════════════════════════════════════

class DXFTool(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("DXF 도구")
        self.geometry("700x640")
        self.resizable(True, True)

        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=8)

        tab1 = ConvertTab(nb)
        tab2 = ExtractTab(nb)

        nb.add(tab1, text="  DWG → DXF 변환  ")
        nb.add(tab2, text="  DXF 레이어 추출  ")


# ══════════════════════════════════════════════════════════════════
#  탭 1 — DWG → DXF 변환
# ══════════════════════════════════════════════════════════════════

class ConvertTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)

        self.oda_path = tk.StringVar(value=find_oda())
        self.input_path = tk.StringVar()
        self.output_path = tk.StringVar()
        self.version = tk.StringVar(value="ACAD2018")
        self.mode = tk.StringVar(value="file")   # file | folder

        self._build_ui()

    def _build_ui(self):
        # ── ODA 경로 ────────────────────────────────────────────
        frm_oda = ttk.LabelFrame(self, text="ODA File Converter 위치")
        frm_oda.pack(fill="x", padx=10, pady=(10, 4))

        ttk.Entry(frm_oda, textvariable=self.oda_path, width=52).pack(
            side="left", padx=6, pady=6
        )
        ttk.Button(frm_oda, text="찾기", command=self._pick_oda).pack(side="left")

        # ── 변환 대상 ────────────────────────────────────────────
        frm_mode = ttk.LabelFrame(self, text="변환 대상")
        frm_mode.pack(fill="x", padx=10, pady=4)

        ttk.Radiobutton(
            frm_mode, text="파일 하나", variable=self.mode,
            value="file", command=self._toggle_mode
        ).pack(side="left", padx=8, pady=6)
        ttk.Radiobutton(
            frm_mode, text="폴더 전체 (DWG 전부 변환)", variable=self.mode,
            value="folder", command=self._toggle_mode
        ).pack(side="left", padx=4)

        # ── 입력 ────────────────────────────────────────────────
        frm_in = ttk.LabelFrame(self, text="입력")
        frm_in.pack(fill="x", padx=10, pady=4)

        ttk.Entry(frm_in, textvariable=self.input_path, width=52).pack(
            side="left", padx=6, pady=6
        )
        self.btn_pick_in = ttk.Button(
            frm_in, text="파일 선택", command=self._pick_input
        )
        self.btn_pick_in.pack(side="left")

        # ── 출력 ────────────────────────────────────────────────
        frm_out = ttk.LabelFrame(self, text="출력 폴더")
        frm_out.pack(fill="x", padx=10, pady=4)

        ttk.Entry(frm_out, textvariable=self.output_path, width=52).pack(
            side="left", padx=6, pady=6
        )
        ttk.Button(frm_out, text="폴더 선택", command=self._pick_output).pack(
            side="left"
        )

        # ── 옵션 ────────────────────────────────────────────────
        frm_opt = ttk.LabelFrame(self, text="DXF 버전")
        frm_opt.pack(fill="x", padx=10, pady=4)

        ttk.Combobox(
            frm_opt, textvariable=self.version,
            values=DXF_VERSIONS, state="readonly", width=12
        ).pack(side="left", padx=8, pady=6)
        ttk.Label(frm_opt, text="(보통 ACAD2018로 충분해요)", foreground="gray").pack(
            side="left"
        )

        # ── 변환 버튼 ────────────────────────────────────────────
        ttk.Button(self, text="변환하기", command=self._convert).pack(
            pady=8
        )

        # ── 로그 ────────────────────────────────────────────────
        frm_log = ttk.LabelFrame(self, text="결과")
        frm_log.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.log = tk.Text(frm_log, height=8, state="disabled", wrap="word",
                           font=("맑은 고딕", 9))
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
            self.btn_pick_in.configure(text="파일 선택")
        else:
            self.btn_pick_in.configure(text="폴더 선택")
        self.input_path.set("")

    def _pick_oda(self):
        p = filedialog.askopenfilename(
            filetypes=[("ODAFileConverter.exe", "*.exe"), ("All files", "*.*")]
        )
        if p:
            self.oda_path.set(p)

    def _pick_input(self):
        if self.mode.get() == "file":
            p = filedialog.askopenfilename(
                filetypes=[("DWG files", "*.dwg"), ("All files", "*.*")]
            )
        else:
            p = filedialog.askdirectory()
        if p:
            self.input_path.set(p)

    def _pick_output(self):
        p = filedialog.askdirectory()
        if p:
            self.output_path.set(p)

    def _convert(self):
        oda = self.oda_path.get().strip()
        inp = self.input_path.get().strip()
        out = self.output_path.get().strip()

        if not oda or not os.path.exists(oda):
            messagebox.showerror("오류", "ODA File Converter 경로를 확인해주세요.")
            return
        if not inp or not os.path.exists(inp):
            messagebox.showerror("오류", "입력 파일/폴더를 선택해주세요.")
            return
        if not out:
            messagebox.showerror("오류", "출력 폴더를 선택해주세요.")
            return

        os.makedirs(out, exist_ok=True)
        ver = self.version.get()

        # 파일 1개 모드 → 임시 폴더에 복사 후 변환
        if self.mode.get() == "file":
            tmp_dir = tempfile.mkdtemp()
            try:
                fname = os.path.basename(inp)
                shutil.copy2(inp, os.path.join(tmp_dir, fname))
                self._run_oda(oda, tmp_dir, out, ver)
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)
        else:
            self._run_oda(oda, inp, out, ver)

    def _run_oda(self, oda, in_dir, out_dir, ver):
        # ODAFileConverter <입력폴더> <출력폴더> <버전> DXF <재귀:0> <감사:1>
        cmd = [oda, in_dir, out_dir, ver, "DXF", "0", "1"]
        self._log(f"실행: {' '.join(cmd)}")

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120
            )
            if result.stdout:
                self._log(result.stdout.strip())
            if result.stderr:
                self._log(result.stderr.strip())

            # 결과 파일 확인
            dxf_files = glob.glob(os.path.join(out_dir, "*.dxf"))
            if dxf_files:
                self._log(f"\n✅ 완료! DXF 파일 {len(dxf_files)}개 생성됨")
                for f in dxf_files:
                    self._log(f"  → {f}")
                messagebox.showinfo(
                    "완료",
                    f"변환 완료!\n\nDXF 파일 {len(dxf_files)}개 저장됨\n{out_dir}"
                )
            else:
                self._log("⚠️  출력 폴더에 DXF 파일이 없어요. 변환에 실패했을 수 있어요.")

        except subprocess.TimeoutExpired:
            self._log("❌ 시간 초과 (2분). 파일이 너무 크거나 오류가 발생했어요.")
        except Exception as e:
            self._log(f"❌ 오류: {e}")
            messagebox.showerror("오류", str(e))


# ══════════════════════════════════════════════════════════════════
#  탭 2 — DXF 레이어 추출
# ══════════════════════════════════════════════════════════════════

class ExtractTab(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)

        self.dxf_path = tk.StringVar()
        self.doc = None
        self.layer_vars = {}

        self._build_ui()

    def _build_ui(self):
        # ── 파일 선택 ──────────────────────────────────────────────
        frm_file = ttk.LabelFrame(self, text="DXF 파일")
        frm_file.pack(fill="x", padx=10, pady=(10, 4))

        ttk.Entry(frm_file, textvariable=self.dxf_path, width=52).pack(
            side="left", padx=6, pady=6
        )
        ttk.Button(frm_file, text="파일 선택", command=self._select_file).pack(
            side="left", padx=2
        )
        ttk.Button(frm_file, text="레이어 불러오기", command=self._load_layers).pack(
            side="left", padx=6
        )

        # ── 레이어 목록 ────────────────────────────────────────────
        frm_layers = ttk.LabelFrame(self, text="레이어 선택 (체크된 레이어만 추출됩니다)")
        frm_layers.pack(fill="both", expand=True, padx=10, pady=4)

        frm_top = ttk.Frame(frm_layers)
        frm_top.pack(fill="x", padx=6, pady=(4, 0))
        ttk.Button(frm_top, text="전체 선택", command=self._select_all).pack(
            side="left", padx=2
        )
        ttk.Button(frm_top, text="전체 해제", command=self._deselect_all).pack(
            side="left", padx=2
        )
        self.lbl_count = ttk.Label(frm_top, text="", foreground="gray")
        self.lbl_count.pack(side="right", padx=6)

        container = ttk.Frame(frm_layers)
        container.pack(fill="both", expand=True, padx=6, pady=4)

        self.cv = tk.Canvas(container, borderwidth=0, highlightthickness=0)
        sb = ttk.Scrollbar(container, orient="vertical", command=self.cv.yview)
        self.frm_check = ttk.Frame(self.cv)

        self.frm_check.bind(
            "<Configure>",
            lambda e: self.cv.configure(scrollregion=self.cv.bbox("all")),
        )
        self.cv.create_window((0, 0), window=self.frm_check, anchor="nw")
        self.cv.configure(yscrollcommand=sb.set)

        sb.pack(side="right", fill="y")
        self.cv.pack(side="left", fill="both", expand=True)

        self.cv.bind("<Enter>", lambda e: self.cv.bind_all("<MouseWheel>", self._on_scroll))
        self.cv.bind("<Leave>", lambda e: self.cv.unbind_all("<MouseWheel>"))

        # ── 내보내기 옵션 ──────────────────────────────────────────
        frm_export = ttk.LabelFrame(self, text="내보내기 옵션")
        frm_export.pack(fill="x", padx=10, pady=4)

        ttk.Label(frm_export, text="형식:").pack(side="left", padx=(8, 2), pady=6)
        self.fmt = tk.StringVar(value="PNG")
        ttk.Radiobutton(frm_export, text="PNG", variable=self.fmt, value="PNG").pack(side="left")
        ttk.Radiobutton(frm_export, text="SVG", variable=self.fmt, value="SVG").pack(
            side="left", padx=(0, 12)
        )

        ttk.Label(frm_export, text="배경:").pack(side="left", padx=(8, 2))
        self.bg = tk.StringVar(value="white")
        ttk.Radiobutton(frm_export, text="흰색", variable=self.bg, value="white").pack(side="left")
        ttk.Radiobutton(frm_export, text="검정", variable=self.bg, value="black").pack(
            side="left", padx=(0, 12)
        )

        ttk.Label(frm_export, text="해상도(PNG):").pack(side="left", padx=(8, 2))
        self.dpi = tk.StringVar(value="300")
        ttk.Combobox(
            frm_export, textvariable=self.dpi,
            values=["150", "300", "600"], width=5
        ).pack(side="left")
        ttk.Label(frm_export, text="dpi").pack(side="left", padx=(2, 12))

        self.force_black = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            frm_export, text="선 색상 강제 검정", variable=self.force_black
        ).pack(side="left", padx=(8, 4))

        ttk.Button(frm_export, text="추출하기", command=self._export).pack(
            side="right", padx=10, pady=6
        )

        # ── 상태 표시줄 ────────────────────────────────────────────
        self.status = tk.StringVar(value="DXF 파일을 선택하고 레이어를 불러오세요.")
        ttk.Label(self, textvariable=self.status, foreground="gray", anchor="w").pack(
            fill="x", padx=12, pady=(2, 8)
        )

    def _on_scroll(self, event):
        self.cv.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _select_file(self):
        path = filedialog.askopenfilename(
            filetypes=[("DXF files", "*.dxf"), ("All files", "*.*")]
        )
        if path:
            self.dxf_path.set(path)

    def _load_layers(self):
        path = self.dxf_path.get().strip()
        if not path or not os.path.exists(path):
            messagebox.showerror("오류", "파일을 먼저 선택해주세요.")
            return

        self.status.set("파일 읽는 중...")
        self.update()

        try:
            self.doc = ezdxf.readfile(path)
        except Exception as e:
            messagebox.showerror("오류", f"파일을 읽을 수 없어요:\n{e}")
            self.status.set("파일 읽기 실패.")
            return

        for widget in self.frm_check.winfo_children():
            widget.destroy()
        self.layer_vars.clear()

        layers = sorted([layer.dxf.name for layer in self.doc.layers])
        for name in layers:
            var = tk.BooleanVar(value=True)
            self.layer_vars[name] = var
            ttk.Checkbutton(self.frm_check, text=name, variable=var).pack(
                anchor="w", padx=8
            )

        count = len(layers)
        self.lbl_count.config(text=f"총 {count}개 레이어")
        self.status.set(f"레이어 {count}개 불러왔어요. 추출할 레이어를 선택하세요.")

    def _select_all(self):
        for var in self.layer_vars.values():
            var.set(True)

    def _deselect_all(self):
        for var in self.layer_vars.values():
            var.set(False)

    def _export(self):
        if not self.doc:
            messagebox.showerror("오류", "먼저 DXF 파일을 불러오세요.")
            return

        selected = [name for name, var in self.layer_vars.items() if var.get()]
        if not selected:
            messagebox.showerror("오류", "레이어를 최소 하나 이상 선택해주세요.")
            return

        fmt = self.fmt.get().lower()
        out_path = filedialog.asksaveasfilename(
            defaultextension=f".{fmt}",
            filetypes=[(f"{fmt.upper()} 파일", f"*.{fmt}"), ("모든 파일", "*.*")],
            initialfile=os.path.splitext(os.path.basename(self.dxf_path.get()))[0],
        )
        if not out_path:
            return

        self.status.set("추출 중... 잠시 기다려주세요.")
        self.update()

        try:
            for layer in self.doc.layers:
                name = layer.dxf.name
                if name in selected:
                    layer.on()
                    layer.unlock()
                else:
                    layer.off()

            msp = self.doc.modelspace()
            fig = plt.figure(figsize=(24, 24))
            ax = fig.add_axes([0, 0, 1, 1])

            bg_color = self.bg.get()

            ctx = RenderContext(self.doc)
            out_backend = MatplotlibBackend(ax)

            # ezdxf 설정: 흰 배경 정책 적용 (버전에 따라 지원 여부 다름)
            try:
                from ezdxf.addons.drawing.config import Configuration, BackgroundPolicy
                policy = (BackgroundPolicy.WHITE if bg_color == "white"
                          else BackgroundPolicy.BLACK)
                cfg = Configuration(background_policy=policy)
                Frontend(ctx, out_backend, config=cfg).draw_layout(msp, finalize=True)
            except Exception:
                Frontend(ctx, out_backend).draw_layout(msp, finalize=True)

            # 선 색상 강제 검정
            if self.force_black.get():
                import matplotlib.collections as mc
                for col in ax.collections:
                    try:
                        col.set_color("black")
                    except Exception:
                        pass
                    try:
                        col.set_edgecolor("black")
                    except Exception:
                        pass
                for line in ax.lines:
                    try:
                        line.set_color("black")
                    except Exception:
                        pass
                for patch in ax.patches:
                    try:
                        patch.set_edgecolor("black")
                    except Exception:
                        pass

            # ezdxf가 배경색을 덮어쓸 수 있으므로 렌더링 후 강제 적용
            fig.patch.set_facecolor(bg_color)
            ax.set_facecolor(bg_color)

            if fmt == "png":
                try:
                    dpi_val = int(self.dpi.get())
                except ValueError:
                    dpi_val = 300
                fig.savefig(
                    out_path, dpi=dpi_val, bbox_inches="tight",
                    facecolor=bg_color, edgecolor="none",
                )
            else:
                fig.savefig(
                    out_path, format="svg", bbox_inches="tight",
                    facecolor=bg_color,
                )

            plt.close(fig)

            for layer in self.doc.layers:
                layer.on()

            self.status.set(f"완료! → {out_path}")
            messagebox.showinfo("완료", f"추출이 완료됐어요!\n\n저장 위치:\n{out_path}")

        except Exception as e:
            plt.close("all")
            self.status.set(f"오류: {e}")
            messagebox.showerror("오류", f"추출 중 오류가 발생했어요:\n{e}")


if __name__ == "__main__":
    app = DXFTool()
    app.mainloop()
