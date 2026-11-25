// 공조기 스케줄 저장 — 판 하나를 파일 하나로, 쌓기만 하고 지우지 않는다.
//
// 다른 자료(store.ts)는 「목록 전체를 새 파일로 쓰고 옛 파일 정리」 방식인데, 이것은 기록이
// 목적이라 옛 판을 지우면 안 된다. 그래서 db/hvac/v/<시각>-<난수>.json 으로 판마다 따로 둔다.
// 같은 이름을 덮어쓰지 않으므로 Blob 캐시로 옛 내용이 섞일 일도 없다.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { HvacVersion } from "./hvac";

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = "db/hvac/v/";
const LOCAL = path.join(process.cwd(), ".data", "hvac.json");

export async function listHvacVersions(): Promise<HvacVersion[]> {
  if (!USE_BLOB) {
    try {
      return JSON.parse(await fs.readFile(LOCAL, "utf8")) as HvacVersion[];
    } catch {
      return [];
    }
  }
  const { list } = await import("@vercel/blob");
  const blobs: { url: string; pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  const out = await Promise.all(
    blobs.map(async (b) => {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(b.url, { cache: "no-store" });
        if (res.ok) return (await res.json()) as HvacVersion;
        await new Promise((r) => setTimeout(r, 200 * (i + 1)));
      }
      // 한 판이라도 못 읽으면 빈 기록을 보여 주지 말고 오류로 알린다
      throw new Error("스케줄 기록을 읽지 못했습니다. 잠시 뒤 다시 열어 주세요.");
    }),
  );
  return out.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export async function addHvacVersion(v: Omit<HvacVersion, "id" | "savedAt">): Promise<HvacVersion> {
  const savedAt = new Date().toISOString();
  const full: HvacVersion = { ...v, id: randomUUID(), savedAt };
  if (!USE_BLOB) {
    const all = await listHvacVersions();
    all.push(full);
    await fs.mkdir(path.dirname(LOCAL), { recursive: true });
    await fs.writeFile(LOCAL, JSON.stringify(all, null, 2), "utf8");
    return full;
  }
  const { put } = await import("@vercel/blob");
  const key = `${PREFIX}${String(Date.now()).padStart(15, "0")}-${full.id.slice(0, 8)}.json`;
  await put(key, JSON.stringify(full), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
  });
  return full;
}
