import type { ApiClient, SessionSummary } from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";

/** ホームの吹き出しに出す、前回の授業の状態（docs/04 の 3.1） */
export type RecentState =
  | { kind: "loading" }
  /** 授業がまだない */
  | { kind: "none" }
  /** 前回の最後の小単元の名前 */
  | { kind: "last"; title: string }
  /** 授業はあるが、小単元の名前が取れなかった（非公開になったなど） */
  | { kind: "unknown" }
  /** 通信などに失敗した */
  | { kind: "error" };

/**
 * いちばん新しい授業の、最後の小単元の id。複数選んだ授業では最後のもの（docs/04 の 3.1）。
 * sessions は新しい順（GET /sessions/ の並び）。授業がなければ null。
 */
export function lastLessonId(sessions: SessionSummary[]): number | null {
  const ids = sessions[0]?.lesson_ids ?? [];
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

/**
 * 前回の授業を取りに行く。GET /sessions/?limit=1 → 最後の小単元 GET /lessons/{id}/。
 * 401（ログインが切れた）は client.ts が受け止めてログイン画面へ戻すので、ここでは投げ直す。
 * 小単元が見つからない（404）ときだけ unknown にし、そのほかの失敗は投げる。
 */
export async function loadRecent(client: Pick<ApiClient, "listSessions" | "getLesson">): Promise<RecentState> {
  const sessions = await client.listSessions(1);
  const id = lastLessonId(sessions);
  if (id === null) return { kind: "none" };
  try {
    const lesson = await client.getLesson(id);
    return lesson.title ? { kind: "last", title: lesson.title } : { kind: "unknown" };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "unknown" };
    throw e;
  }
}
