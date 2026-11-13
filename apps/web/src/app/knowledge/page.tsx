import type { Metadata } from "next";
import { KnowledgeMap } from "@/components/knowledge/KnowledgeMap";

export const metadata: Metadata = {
  title: "ぴあ友の知識マップ | ぴあとも",
};

/** 知識マップ（/knowledge/）。docs/04 の 6 */
export default function KnowledgePage() {
  return <KnowledgeMap />;
}
