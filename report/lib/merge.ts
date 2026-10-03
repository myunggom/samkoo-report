// 동시 편집 합치기 — 일지류(업무일지·주간·월간·일일 기록) 공용. I/O 없는 순수 함수.
// 두 사람이 같은 문서를 열어 각자 다른 칸을 고쳐도 둘 다 남도록, 칸 단위 3방향 병합을 한다.
//   base   = 내가 편집을 시작할 때 서버에 있던 문서 (없으면 새 문서의 초안)
//   server = 지금 서버에 있는 문서 (그 사이 다른 사람이 저장했을 수 있음)
//   mine   = 내가 저장하려는 문서
// 내가 바꾼 칸만 내 값으로, 나머지는 서버 값으로. 같은 칸을 둘 다 다르게 바꿨으면 내 값으로 하고 conflicts 에 경로를 남긴다.
// 객체는 키마다, 길이가 같은 배열은 칸마다 내려간다. 길이가 달라진 배열(행 추가·삭제)은 통째로 한 칸.
type Plain = Record<string, unknown>;
const isObj = (v: unknown): v is Plain => typeof v === "object" && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function walk(s: unknown, b: unknown, m: unknown, path: string, conflicts: string[], taken: string[]): unknown {
  if ((isObj(s) || s == null) && (isObj(b) || b == null) && (isObj(m) || m == null) && (isObj(s) || isObj(b) || isObj(m))) {
    const keys = new Set([...Object.keys((s as Plain) ?? {}), ...Object.keys((b as Plain) ?? {}), ...Object.keys((m as Plain) ?? {})]);
    const out: Plain = {};
    for (const k of keys) {
      const v = walk((s as Plain)?.[k], (b as Plain)?.[k], (m as Plain)?.[k], path ? `${path}.${k}` : k, conflicts, taken);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(s) && Array.isArray(b) && Array.isArray(m) && s.length === b.length && b.length === m.length) {
    return m.map((_, i) => walk(s[i], b[i], m[i], `${path}.${i}`, conflicts, taken));
  }
  if (same(m, b)) {
    if (!same(s, b)) taken.push(path); // 남이 고친 칸을 받아 옴
    return s;
  }
  if (!same(s, b) && !same(s, m)) conflicts.push(path); // 둘 다 다르게 바꿈 → 내 값, 알림
  return m;
}

/** updatedAt 은 비교에서 뺀다. server 가 없으면(처음 저장) mine 그대로. */
export function merge3<T extends object>(server: T | undefined, base: T | undefined, mine: T): { value: T; conflicts: string[]; others: number } {
  if (!server) return { value: mine, conflicts: [], others: 0 };
  const conflicts: string[] = [];
  const taken: string[] = [];
  const strip = (x: T | undefined) => (x ? { ...x, updatedAt: undefined } : undefined);
  const value = walk(strip(server), strip(base), strip(mine), "", conflicts, taken) as T;
  return { value, conflicts, others: taken.length };
}
