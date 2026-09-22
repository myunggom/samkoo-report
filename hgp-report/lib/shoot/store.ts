// 저장소 계층 — 클라우드(Vercel Blob)와 로컬 파일을 자동 전환.
//
//  · 클라우드: Vercel에 Blob 저장소를 연결하면 BLOB_READ_WRITE_TOKEN 환경변수가
//    주입되어 이 경로를 사용합니다. 일정/보고서(JSON)와 사진을 모두 Blob에 저장.
//  · 로컬: 토큰이 없으면 .data 폴더에 저장하여
//    별도 설정 없이 바로 테스트할 수 있습니다.
//
//  ※ Blob 주의: 같은 경로를 덮어쓰면 CDN 캐시로 옛 내용이 반환됩니다. 그래서
//    JSON 데이터는 "매 저장마다 새 파일(타임스탬프 파일명)"로 쓰고, 읽을 때는
//    list()로 가장 최신 파일을 골라 읽습니다. 새 파일 URL은 불변이라 항상 최신.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Report, Schedule } from "./types";
import { emptyReport } from "./types";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const USE_BLOB = !!BLOB_TOKEN;

const SCHEDULES_PREFIX = "db/shoot/schedules/";
const reportPrefix = (id: string) => `db/shoot/reports/${id}/`;

// ── 로컬 파일 경로 ────────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), ".data");
const SCHEDULES_FILE = path.join(DATA_DIR, "shoot-schedules.json");
const REPORTS_FILE = path.join(DATA_DIR, "shoot-reports.json");
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
  // 파일명에 zero-pad 타임스탬프가 들어있어 사전식 정렬의 마지막이 최신
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
  // 이전 버전 파일 정리(최신 1개만 유지) — 실패해도 무시
  try {
    const { blobs } = await list({ prefix });
    const olds = blobs.filter((b) => b.pathname !== key).map((b) => b.url);
    if (olds.length) await del(olds);
  } catch {
    /* 정리 실패는 치명적이지 않음 */
  }
}
async function delBlobPrefix(prefix: string): Promise<void> {
  const { list, del } = await import("@vercel/blob");
  try {
    const { blobs } = await list({ prefix });
    if (blobs.length) await del(blobs.map((b) => b.url));
  } catch {
    /* 없으면 무시 */
  }
}

// ── Schedules (단일 집계 JSON) ────────────────────────────────────
async function allSchedules(): Promise<Schedule[]> {
  if (USE_BLOB) return readBlobJson<Schedule[]>(SCHEDULES_PREFIX, []);
  return readLocal<Schedule[]>(SCHEDULES_FILE, []);
}
async function putSchedules(list: Schedule[]): Promise<void> {
  if (USE_BLOB) await writeBlobJson(SCHEDULES_PREFIX, list);
  else await writeLocal(SCHEDULES_FILE, list);
}

export async function listSchedules(): Promise<Schedule[]> {
  const all = await allSchedules();
  return all.sort((a, b) => a.start.localeCompare(b.start));
}

export async function getSchedule(id: string): Promise<Schedule | null> {
  const all = await allSchedules();
  return all.find((s) => s.id === id) ?? null;
}

export async function saveSchedule(
  input: Omit<Schedule, "id" | "createdAt"> & { id?: string }
): Promise<Schedule> {
  const all = await allSchedules();
  const existing = input.id ? all.find((s) => s.id === input.id) : undefined;
  const schedule: Schedule = {
    ...input,
    id: input.id ?? randomUUID(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const idx = all.findIndex((s) => s.id === schedule.id);
  if (idx >= 0) all[idx] = schedule;
  else all.push(schedule);
  await putSchedules(all);
  return schedule;
}

export async function deleteSchedule(id: string): Promise<void> {
  const all = await allSchedules();
  await putSchedules(all.filter((s) => s.id !== id));
  if (USE_BLOB) {
    await delBlobPrefix(reportPrefix(id));
  } else {
    const reports = await readLocal<Record<string, Report>>(REPORTS_FILE, {});
    delete reports[id];
    await writeLocal(REPORTS_FILE, reports);
  }
}

// ── Reports ───────────────────────────────────────────────────────
export async function getReport(scheduleId: string): Promise<Report> {
  if (USE_BLOB) return readBlobJson<Report>(reportPrefix(scheduleId), emptyReport(scheduleId));
  const reports = await readLocal<Record<string, Report>>(REPORTS_FILE, {});
  return reports[scheduleId] ?? emptyReport(scheduleId);
}

export async function saveReport(report: Report): Promise<Report> {
  const next: Report = { ...report, updatedAt: new Date().toISOString() };
  if (USE_BLOB) {
    await writeBlobJson(reportPrefix(next.scheduleId), next);
  } else {
    const reports = await readLocal<Record<string, Report>>(REPORTS_FILE, {});
    reports[next.scheduleId] = next;
    await writeLocal(REPORTS_FILE, reports);
  }
  return next;
}

