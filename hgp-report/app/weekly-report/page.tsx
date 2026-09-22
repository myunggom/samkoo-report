import WeeklyEditor from "@/components/WeeklyEditor";
import { getWeeklyDraft } from "@/lib/store";
import { emptyDraft } from "@/lib/weekly";

// 이 페이지는 proxy.ts에서 비밀번호 쿠키로 보호됨 (미인증 시 /weekly-report/login 으로 이동)
export const dynamic = "force-dynamic";

export default async function WeeklyReportPage() {
  const draft = (await getWeeklyDraft()) ?? emptyDraft();
  return <WeeklyEditor initial={draft} />;
}
