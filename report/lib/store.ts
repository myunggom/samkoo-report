// 저장소 계층 — 클라우드(Vercel Blob)와 로컬 파일을 자동 전환.
//
//  · 클라우드: BLOB_READ_WRITE_TOKEN 환경변수가 있으면 Blob에 저장.
//    (Samkoo-Shoot와 같은 Blob 저장소를 공유하되 폴더 prefix "db/pungsuhae/"로 분리)
//  · 로컬: 토큰이 없으면 report/.data 폴더와 public/uploads 폴더에 저장.
//
//  ※ Blob 주의: 같은 경로를 덮어쓰면 CDN 캐시로 옛 내용이 반환됩니다. 그래서
//    JSON은 "매 저장마다 새 파일(타임스탬프 파일명)"로 쓰고, 읽을 때 list()로 최신본을 읽습니다.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { PungReport } from "./pungsuhae";
import type { MediaItem, DayNote } from "./archive";
import type { GenReport } from "./reports";
import type { CalEvent } from "./events";
import type { Issue } from "./issues";
import type { WeeklyDraft } from "./weekly";
import type { Task } from "./tasks";
import type { DailyLog } from "./dailyLog";
import type { WeeklyLog } from "./weeklyLog";
import type { MonthlyReport } from "./monthlyReport";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const USE_BLOB = !!BLOB_TOKEN;

const PUNG_PREFIX = "db/pungsuhae/";
const MEDIA_PREFIX = "db/media/";
const DAYNOTE_PREFIX = "db/daynotes/";
const GENREPORT_PREFIX = "db/genreports/";
const EVENT_PREFIX = "db/events/";
const ISSUE_PREFIX = "db/issues/";
const WEEKLY_PREFIX = "db/weekly/";
const TASK_PREFIX = "db/tasks/";
const DAILYLOG_PREFIX = "db/dailylog/";
const WEEKLYLOG_PREFIX = "db/weeklylog/";
const MONTHLY_PREFIX = "db/monthlyreport/";

const DATA_DIR = path.join(process.cwd(), ".data");
const PUNG_FILE = path.join(DATA_DIR, "pungsuhae.json");
const MEDIA_FILE = path.join(DATA_DIR, "media.json");
const DAYNOTE_FILE = path.join(DATA_DIR, "daynotes.json");
const GENREPORT_FILE = path.join(DATA_DIR, "genreports.json");
const EVENT_FILE = path.join(DATA_DIR, "events.json");
const ISSUE_FILE = path.join(DATA_DIR, "issues.json");
const WEEKLY_FILE = path.join(DATA_DIR, "weekly.json");
const TASK_FILE = path.join(DATA_DIR, "tasks.json");
const DAILYLOG_FILE = path.join(DATA_DIR, "dailylog.json");
const WEEKLYLOG_FILE = path.join(DATA_DIR, "weeklylog.json");
const MONTHLY_FILE = path.join(DATA_DIR, "monthlyreport.json");
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

async function readLocal<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeLocal(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ── Blob JSON 헬퍼 (버전 파일 방식) ───────────────────────────────
async function readBlobJson<T>(prefix: string, fallback: T): Promise<T> {
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix });
  if (!blobs.length) return fallback;
  blobs.sort((a, b) => b.pathname.localeCompare(a.pathname));
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return fallback;
  return (await res.json()) as T;
}
async function writeBlobJson(prefix: string, data: unknown): Promise<void> {
  const { put, list, del } = await import("@vercel/blob");
  const key = `${prefix}${String(Date.now()).padStart(15, "0")}-${randomUUID().slice(0, 8)}.json`;
  await put(key, JSON.stringify(data), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
  });
  try {
    const { blobs } = await list({ prefix });
    const olds = blobs.filter((b) => b.pathname !== key).map((b) => b.url);
    if (olds.length) await del(olds);
  } catch {
    /* 정리 실패는 치명적이지 않음 */
  }
}

// ── 풍수해 예방 점검 보고서 (일별 · 단일 집계 JSON) ────────────────
async function allPungReports(): Promise<PungReport[]> {
  if (USE_BLOB) return readBlobJson<PungReport[]>(PUNG_PREFIX, []);
  return readLocal<PungReport[]>(PUNG_FILE, []);
}
async function putPungReports(list: PungReport[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(PUNG_PREFIX, list);
  else await writeLocal(PUNG_FILE, list);
}

export async function listPungReports(): Promise<PungReport[]> {
  const all = await allPungReports();
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function getPungReport(id: string): Promise<PungReport | null> {
  const all = await allPungReports();
  return all.find((r) => r.id === id) ?? null;
}

export async function savePungReport(report: PungReport): Promise<PungReport> {
  const all = await allPungReports();
  const next: PungReport = { ...report, updatedAt: new Date().toISOString() };
  const idx = all.findIndex((r) => r.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await putPungReports(all);
  return next;
}

export async function deletePungReport(id: string): Promise<void> {
  const all = await allPungReports();
  await putPungReports(all.filter((r) => r.id !== id));
}

// ── 아카이브 미디어 (사진·동영상 · 단일 집계 JSON) ────────────────
async function allMedia(): Promise<MediaItem[]> {
  if (USE_BLOB) return readBlobJson<MediaItem[]>(MEDIA_PREFIX, []);
  return readLocal<MediaItem[]>(MEDIA_FILE, []);
}
async function putMedia(list: MediaItem[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(MEDIA_PREFIX, list);
  else await writeLocal(MEDIA_FILE, list);
}

export async function listMedia(): Promise<MediaItem[]> {
  const all = await allMedia();
  // 최신 촬영일이 위로 (같은 날은 생성 역순)
  return all.sort((a, b) => b.takenAt.localeCompare(a.takenAt) || b.createdAt.localeCompare(a.createdAt));
}

export async function addMedia(item: MediaItem): Promise<MediaItem> {
  const all = await allMedia();
  all.push(item);
  await putMedia(all);
  return item;
}

export async function updateMedia(id: string, patch: Partial<MediaItem>): Promise<MediaItem | null> {
  const all = await allMedia();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id };
  await putMedia(all);
  return all[idx];
}

export async function deleteMedia(id: string): Promise<void> {
  const all = await allMedia();
  const target = all.find((m) => m.id === id);
  await putMedia(all.filter((m) => m.id !== id));
  // Blob 원본 파일도 삭제 (실패해도 무시)
  if (USE_BLOB && target?.url?.startsWith("http")) {
    try {
      const { del } = await import("@vercel/blob");
      await del(target.url);
    } catch {
      /* 파일 정리 실패는 치명적이지 않음 */
    }
  }
}

// ── 일일 기록 메모 (날짜별 · 업무일지와 같은 버전 저장, 아래 dayNoteStore) ──
export async function listDayNotes(): Promise<DayNote[]> {
  return (await dayNoteStore.list()).sort((a, b) => b.date.localeCompare(a.date));
}

// 날짜별 메모 저장 (내용이 비면 삭제). base 는 편집을 시작할 때의 메모 — 주면 동시 편집을 확인한다.
// 그 사이 다른 사람이 같은 날 메모를 고쳤으면 어느 쪽도 버리지 않고 「서버 내용 + 내 내용」으로 이어 붙인다.
export async function saveDayNote(date: string, note: string, base?: string): Promise<{ entry: DayNote | null; joined: boolean }> {
  return dayNoteStore.update<{ entry: DayNote | null; joined: boolean }>((all) => {
    const cur = all.find((d) => d.date === date)?.note ?? "";
    let text = note;
    let joined = false;
    if (base !== undefined && note === base) text = cur; // 나는 안 고침 → 서버 그대로
    else if (base !== undefined && cur !== base && cur !== note) {
      // 둘 다 고침: 한쪽이 지웠으면 남은 쪽을, 둘 다 썼으면 이어 붙인다
      if (!note.trim()) text = cur;
      else if (cur.trim()) { text = `${cur.trimEnd()}\n\n${note}`; joined = true; }
    }
    const rest = all.filter((d) => d.date !== date);
    if (!text.trim()) return { all: rest, result: { entry: null, joined } };
    const entry: DayNote = { date, note: text, updatedAt: new Date().toISOString() };
    return { all: [...rest, entry], result: { entry, joined } };
  });
}

// ── 일반 보고서(사고·완료·점검·보수요청 · 단일 집계 JSON) ─────────
async function allGenReports(): Promise<GenReport[]> {
  if (USE_BLOB) return readBlobJson<GenReport[]>(GENREPORT_PREFIX, []);
  return readLocal<GenReport[]>(GENREPORT_FILE, []);
}
async function putGenReports(list: GenReport[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(GENREPORT_PREFIX, list);
  else await writeLocal(GENREPORT_FILE, list);
}

export async function listGenReports(): Promise<GenReport[]> {
  const all = await allGenReports();
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function getGenReport(id: string): Promise<GenReport | null> {
  const all = await allGenReports();
  return all.find((r) => r.id === id) ?? null;
}

export async function saveGenReport(report: GenReport): Promise<GenReport> {
  const all = await allGenReports();
  const next: GenReport = { ...report, updatedAt: new Date().toISOString() };
  const idx = all.findIndex((r) => r.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await putGenReports(all);
  return next;
}

export async function deleteGenReport(id: string): Promise<void> {
  const all = await allGenReports();
  await putGenReports(all.filter((r) => r.id !== id));
}

// ── 일정(캘린더 이벤트 · 단일 집계 JSON) ──────────────────────────
async function allEvents(): Promise<CalEvent[]> {
  if (USE_BLOB) return readBlobJson<CalEvent[]>(EVENT_PREFIX, []);
  return readLocal<CalEvent[]>(EVENT_FILE, []);
}
async function putEvents(list: CalEvent[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(EVENT_PREFIX, list);
  else await writeLocal(EVENT_FILE, list);
}
export async function listEvents(): Promise<CalEvent[]> {
  const all = await allEvents();
  return all.sort((a, b) => a.date.localeCompare(b.date));
}
export async function addEvent(e: CalEvent): Promise<CalEvent> {
  const all = await allEvents();
  all.push(e);
  await putEvents(all);
  return e;
}
export async function updateEvent(id: string, patch: Partial<CalEvent>): Promise<CalEvent | null> {
  const all = await allEvents();
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id };
  await putEvents(all);
  return all[idx];
}
export async function deleteEvent(id: string): Promise<void> {
  const all = await allEvents();
  await putEvents(all.filter((x) => x.id !== id));
}
// 특정 날짜(회차) 완료 토글
export async function toggleEventDone(id: string, date: string, done?: boolean): Promise<CalEvent | null> {
  const all = await allEvents();
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const cur = new Set(all[idx].doneDates || []);
  const target = done === undefined ? !cur.has(date) : done;
  if (target) cur.add(date);
  else cur.delete(date);
  all[idx] = { ...all[idx], doneDates: Array.from(cur).sort() };
  await putEvents(all);
  return all[idx];
}

// ── 문제(이슈 · 단일 집계 JSON) ───────────────────────────────────
async function allIssues(): Promise<Issue[]> {
  if (USE_BLOB) return readBlobJson<Issue[]>(ISSUE_PREFIX, []);
  return readLocal<Issue[]>(ISSUE_FILE, []);
}
async function putIssues(list: Issue[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(ISSUE_PREFIX, list);
  else await writeLocal(ISSUE_FILE, list);
}
export async function listIssues(): Promise<Issue[]> {
  const all = await allIssues();
  // 최근 갱신순
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function addIssue(i: Issue): Promise<Issue> {
  const all = await allIssues();
  all.push(i);
  await putIssues(all);
  return i;
}
export async function updateIssue(id: string, patch: Partial<Issue>): Promise<Issue | null> {
  const all = await allIssues();
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id, updatedAt: new Date().toISOString() };
  await putIssues(all);
  return all[idx];
}
export async function deleteIssue(id: string): Promise<void> {
  const all = await allIssues();
  await putIssues(all.filter((x) => x.id !== id));
}

// ── 주간 업무보고 초안 (사장 전용 · 단일 문서) ────────────────────
export async function getWeeklyDraft(): Promise<WeeklyDraft | null> {
  if (USE_BLOB) return readBlobJson<WeeklyDraft | null>(WEEKLY_PREFIX, null);
  return readLocal<WeeklyDraft | null>(WEEKLY_FILE, null);
}
export async function saveWeeklyDraft(draft: WeeklyDraft): Promise<WeeklyDraft> {
  const next: WeeklyDraft = { ...draft, updatedAt: new Date().toISOString() };
  if (USE_BLOB) await writeBlobJson(WEEKLY_PREFIX, next);
  else await writeLocal(WEEKLY_FILE, next);
  return next;
}

// ── 개인 할 일 (운영자 전용 · 단일 집계 JSON) ─────────────────────
async function allTasks(): Promise<Task[]> {
  if (USE_BLOB) return readBlobJson<Task[]>(TASK_PREFIX, []);
  return readLocal<Task[]>(TASK_FILE, []);
}
async function putTasks(list: Task[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(TASK_PREFIX, list);
  else await writeLocal(TASK_FILE, list);
}

// 마감일 이른 순. 마감일 없는 항목은 맨 뒤로 보낸다.
export async function listTasks(): Promise<Task[]> {
  const all = await allTasks();
  return all.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function addTasks(items: Task[]): Promise<Task[]> {
  const all = await allTasks();
  all.push(...items);
  await putTasks(all);
  return items;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task | null> {
  const all = await allTasks();
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id: all[idx].id, updatedAt: new Date().toISOString() };
  await putTasks(all);
  return all[idx];
}

export async function deleteTask(id: string): Promise<void> {
  const all = await allTasks();
  await putTasks(all.filter((x) => x.id !== id));
}

// ── 고객사 일일 업무일지 (날짜별 · 단일 집계 JSON, 버전 번호로 동시 저장 보호) ──
// 여러 사람이 동시에 저장해도 하나가 사라지지 않게 「읽기→고치기→쓰기」를 비교-교환으로 한다.
//   db/dailylog-v/000000007.json 처럼 버전 번호를 파일 이름으로 쓰고, 다음 번호 파일을 「덮어쓰기 금지」로 만든다.
//   다른 사람이 그 번호를 먼저 만들었으면 실패하므로, 최신본을 다시 읽어 합친 뒤 다음 번호로 재시도한다.
//   파일 내용은 한 번 쓰면 바뀌지 않으므로 CDN 캐시 때문에 옛 내용을 읽는 일도 없다.
//   (단, 지운 파일 이름을 다시 쓰면 CDN 에 남은 옛 응답을 받는다 — 번호는 늘기만 하고 최근 5개는 늘 남겨 둔다.)
// 예전 방식(db/dailylog/<시각>-<uuid>.json)은 새 버전이 처음 생길 때까지 읽기용으로만 쓴다.
// 2026-10-03 프리뷰에서 10명 동시 저장 3회 — 매번 10건 모두 남음.
const DAILYLOG_V_PREFIX = "db/dailylog-v/";

async function readVersioned<T>(prefix: string, legacy: () => Promise<T>): Promise<{ data: T; ver: number; olds: string[] }> {
  const { list } = await import("@vercel/blob");
  // 목록을 받은 사이 다른 저장이 이어져 그 파일이 정리(삭제)됐으면 404 — 목록부터 다시 읽는다
  for (let attempt = 0; ; attempt++) {
    const { blobs } = await list({ prefix });
    blobs.sort((a, b) => b.pathname.localeCompare(a.pathname));
    if (!blobs.length) return { data: await legacy(), ver: 0, olds: [] };
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (res.status === 404 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
      continue;
    }
    if (!res.ok) throw new Error(`저장된 자료를 읽지 못했습니다 (${res.status})`);
    return {
      data: (await res.json()) as T,
      ver: Number(blobs[0].pathname.slice(prefix.length, prefix.length + 9)),
      olds: blobs.slice(4).map((b) => b.url), // 최근 5개만 남긴다
    };
  }
}

// 최신본을 받아 고친 값을 돌려주는 fn 으로 저장. 다른 사람이 먼저 저장했으면 최신본으로 fn 을 다시 부른다.
export async function casUpdate<T, R>(prefix: string, legacy: () => Promise<T>, fn: (cur: T) => { data: T; result: R }): Promise<R> {
  const { put, head, del } = await import("@vercel/blob");
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await readVersioned(prefix, legacy);
    const { data, result } = fn(cur.data);
    const key = `${prefix}${String(cur.ver + 1).padStart(9, "0")}.json`;
    try {
      await put(key, JSON.stringify(data), { access: "public", contentType: "application/json; charset=utf-8", addRandomSuffix: false });
    } catch (e) {
      // 그 번호가 이미 있으면 = 다른 사람이 먼저 저장함 → 잠깐 쉬고 최신본으로 다시
      const taken = await head(key).then(() => true, () => false);
      if (!taken) throw e;
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 300 * (attempt + 1)));
      continue;
    }
    if (cur.olds.length) await del(cur.olds).catch(() => {});
    return result;
  }
  throw new Error("동시에 저장하는 사람이 많아 저장하지 못했습니다. 잠시 후 다시 저장해 주세요.");
}

// 버전 번호 저장소 하나 — 목록 읽기와 「최신본 → 고친 목록」 저장. 로컬(.data)은 파일 하나에 그대로.
function versionedStore<T>(vPrefix: string, legacyPrefix: string, file: string) {
  const legacy = () => readBlobJson<T[]>(legacyPrefix, []);
  return {
    async list(): Promise<T[]> {
      return USE_BLOB ? (await readVersioned(vPrefix, legacy)).data : readLocal<T[]>(file, []);
    },
    async update<R>(fn: (all: T[]) => { all: T[]; result: R }): Promise<R> {
      if (!USE_BLOB) {
        const { all, result } = fn(await readLocal<T[]>(file, []));
        await writeLocal(file, all);
        return result;
      }
      return casUpdate(vPrefix, legacy, (cur: T[]) => {
        const { all, result } = fn(cur);
        return { data: all, result };
      });
    },
  };
}

const dailyStore = versionedStore<DailyLog>(DAILYLOG_V_PREFIX, DAILYLOG_PREFIX, DAILYLOG_FILE);
const weeklyStore = versionedStore<WeeklyLog>("db/weeklylog-v/", WEEKLYLOG_PREFIX, WEEKLYLOG_FILE);
const monthlyStore = versionedStore<MonthlyReport>("db/monthlyreport-v/", MONTHLY_PREFIX, MONTHLY_FILE);
const dayNoteStore = versionedStore<DayNote>("db/daynotes-v/", DAYNOTE_PREFIX, DAYNOTE_FILE);

export async function listDailyLogs(): Promise<DailyLog[]> {
  return (await dailyStore.list()).sort((a, b) => a.date.localeCompare(b.date));
}
export const updateDailyLogs = <R>(fn: (all: DailyLog[]) => { all: DailyLog[]; result: R }) => dailyStore.update(fn);

// ── 고객사 주간 업무 보고 (보고일별 · 위와 같은 버전 저장) ─────────
export async function listWeeklyLogs(): Promise<WeeklyLog[]> {
  return (await weeklyStore.list()).sort((a, b) => a.date.localeCompare(b.date));
}
export const updateWeeklyLogs = <R>(fn: (all: WeeklyLog[]) => { all: WeeklyLog[]; result: R }) => weeklyStore.update(fn);

// ── 고객사 월간 보고서 (보고월별 · 위와 같은 버전 저장) ───────────
export async function listMonthlyReports(): Promise<MonthlyReport[]> {
  return (await monthlyStore.list()).sort((a, b) => a.month.localeCompare(b.month));
}
export const updateMonthlyReports = <R>(fn: (all: MonthlyReport[]) => { all: MonthlyReport[]; result: R }) => monthlyStore.update(fn);

// ── 사진 업로드 (고유 파일명 — 불변이라 덮어쓰기 문제 없음) ────────
export async function savePhoto(buffer: Buffer, ext: string): Promise<string> {
  const safeExt = (ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const name = `${randomUUID()}.${safeExt}`;
  if (USE_BLOB) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`photos/${name}`, buffer, {
      access: "public",
      contentType: `image/${safeExt === "jpg" ? "jpeg" : safeExt}`,
    });
    return blob.url;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/${name}`;
}

export const storageMode = {
  data: USE_BLOB ? "cloud" : "local",
  photos: USE_BLOB ? "cloud" : "local",
};
