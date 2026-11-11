import type { PeerResponse } from "@/lib/api/client";

/**
 * 授業の会話を、このタブのメモリにだけ置く（docs/00 のプライバシー方針）。
 * ページを読み込み直したり、タブを閉じたりすると消える。サーバーにも、ブラウザの保存領域にも書かない。
 * 「この端末に会話を保存する」（設定、初期値オフ）を作るときは、ここに保存の処理を足す。
 */
export type ConversationLine = {
  key: string;
  role: "user" | "peer";
  text: string;
  action?: PeerResponse["action"];
};

const store = new Map<number, ConversationLine[]>();

export function saveConversation(sessionId: number, lines: ConversationLine[]) {
  store.set(sessionId, lines);
}

export function getConversation(sessionId: number): ConversationLine[] | null {
  return store.get(sessionId) ?? null;
}
