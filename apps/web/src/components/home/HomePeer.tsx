import Image from "next/image";
import { PeerAvatar } from "@/components/PeerAvatar";

/**
 * ホームのぴあ友の画像（ADR-038）。チームが生成AIで作ったロボットの静止画。
 * 画像の利用条件の確認（docs/08 の未検証事項）が済むまでは null のままにして、SVGのアバター（idle）で代用する。
 * 確認が済んだら、画像を apps/web/public/ に置き、例えば "/peer-home.png" をここに書く。
 */
export const HOME_PEER_IMAGE: string | null = null;

export function HomePeer() {
  return (
    <div className="flex size-[200px] items-center justify-center rounded-[36px] bg-gradient-to-b from-[#F3F6FE] to-[#DCE6FB] lg:size-[280px] lg:rounded-[48px]">
      {HOME_PEER_IMAGE ? (
        <Image src={HOME_PEER_IMAGE} alt="ぴあ友（ロボットのキャラクター）" width={280} height={280} priority className="size-full object-contain" />
      ) : (
        <PeerAvatar state="idle" size={170} decorative className="size-[170px] lg:size-[240px]" />
      )}
    </div>
  );
}
