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

const DATA_DIR = path.join(process.cwd(), ".data");
const PUNG_FILE = path.join(DATA_DIR, "pungsuhae.json");
const MEDIA_FILE = path.join(DATA_DIR, "media.json");
const DAYNOTE_FILE = path.join(DATA_DIR, "daynotes.json");
const GENREPORT_FILE = path.join(DATA_DIR, "genreports.json");
const EVENT_FILE = path.join(DATA_DIR, "events.json");
const ISSUE_FILE = path.join(DATA_DIR, "issues.json");
const WEEKLY_FILE = path.join(DATA_DIR, "weekly.json");
const TASK_FILE = path.join(DATA_DIR, "tasks.json");
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
  // 목록과 읽기 사이에 다른 저장이 그 파일을 정리했으면 404 — 목록부터 다시. 그래도 못 읽으면 빈 값 대신 오류.
  // (빈 값을 돌려주면 다음 저장이 「빈 목록 + 새 항목」으로 덮어써 전부 사라진다 — 2026-10-20 hgp 보고서 유실)
  for (let attempt = 0; ; attempt++) {
    const { blobs } = await list({ prefix });
    if (!blobs.length) return fallback;
    // 파일명에 zero-pad 타임스탬프가 들어있어 사전식 정렬의 마지막이 최신
    blobs.sort((a, b) => b.pathname.localeCompare(a.pathname));
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    if (res.status !== 404 || attempt >= 5) throw new Error(`저장된 자료를 읽지 못했습니다 (${res.status})`);
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }
}
async function writeBlobJson(prefix: string, data: unknown): Promise<void> {
  const { put, list, del } = await import("@vercel/blob");
  const key = `${prefix}${String(Date.now()).padStart(15, "0")}-${randomUUID().slice(0, 8)}.json`;
  await put(key, JSON.stringify(data), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
  });
  // 정리: 내 파일보다 「오래된」 것만, 그중 최근 4개는 남긴다. 나보다 새 파일(거의 동시에 저장한 다른 요청)은 지우지 않는다.
  // 예전엔 내 것 빼고 전부 지워서, 0.7초 간격 저장 두 건이 서로의 파일을 지워 목록이 통째로 비었다 (2026-10-20 hgp 보고서 유실).
  // ponytail: 동시 저장은 여전히 나중 것이 이긴다(먼저 저장한 쪽 수정이 빠질 수 있음) — 전부 사라지지는 않는다. 완전히 막으려면 casUpdate 방식으로.
  try {
    const { blobs } = await list({ prefix });
    const olds = blobs
      .filter((b) => b.pathname < key)
      .sort((a, b) => b.pathname.localeCompare(a.pathname))
      .slice(4)
      .map((b) => b.url);
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

// ── 일일 기록 메모 (날짜별 · 단일 집계 JSON) ───────────────────────
async function allDayNotes(): Promise<DayNote[]> {
  if (USE_BLOB) return readBlobJson<DayNote[]>(DAYNOTE_PREFIX, []);
  return readLocal<DayNote[]>(DAYNOTE_FILE, []);
}
async function putDayNotes(list: DayNote[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(DAYNOTE_PREFIX, list);
  else await writeLocal(DAYNOTE_FILE, list);
}

export async function listDayNotes(): Promise<DayNote[]> {
  const all = await allDayNotes();
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

// 날짜별 메모 upsert (내용이 비면 삭제)
export async function saveDayNote(date: string, note: string): Promise<DayNote | null> {
  const all = await allDayNotes();
  const idx = all.findIndex((d) => d.date === date);
  if (!note.trim()) {
    if (idx >= 0) {
      all.splice(idx, 1);
      await putDayNotes(all);
    }
    return null;
  }
  const entry: DayNote = { date, note, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await putDayNotes(all);
  return entry;
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
