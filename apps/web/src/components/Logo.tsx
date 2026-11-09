import Image from "next/image";

/**
 * アプリのロゴ「Piatomo」（docs/04 の 1.3、ADR-039）。
 * 画像（public/logo.svg）をそのまま使い、文字や書体で組み直さない。
 * 高さは className で決める（例：h-[26px]）。幅は縦横比に合わせて決まる。
 */
export function Logo({ className = "h-7" }: { className?: string }) {
  return <Image src="/logo.svg" alt="Piatomo" width={612} height={109} priority className={`w-auto ${className}`} />;
}
