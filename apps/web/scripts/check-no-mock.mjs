#!/usr/bin/env node
// 本番の成果物（静的出力 out/）にモックが混ざっていないか確かめる。
// npm run build のあとに自動で動く（package.json の postbuild）。
// もとは Shiori さんの #82（scripts/check-no-mock.mjs）。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out";
const MARKERS = ["__PIATOMO_API_MOCK__"];

// 公開先を分けたステージングなど、モック入りで本番モードのビルドがどうしても要るときだけ
// NEXT_PUBLIC_MOCK_BUILD_ACK=staging-only を付ける。本番のホスティングには置かない。
if (process.env.NEXT_PUBLIC_MOCK_BUILD_ACK === "staging-only") {
  console.log("SKIP: NEXT_PUBLIC_MOCK_BUILD_ACK=staging-only のため、モックの検査を省きました（本番に配備しないこと）");
  process.exit(0);
}
if (process.env.NEXT_PUBLIC_API_MOCK === "true") {
  console.error("NG: NEXT_PUBLIC_API_MOCK=true のまま本番ビルドしています（apps/web/README.md の「APIとモック」）");
  process.exit(1);
}
if (!existsSync(OUT)) {
  console.error(`NG: ${OUT}/ がありません。先に next build を実行してください`);
  process.exit(1);
}

const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|json|map|txt)$/.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const m of MARKERS) if (text.includes(m)) hits.push(`${p}: ${m}`);
    }
  }
})(OUT);

if (hits.length) {
  console.error("NG: 本番の成果物にモックが含まれています\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`OK: ${OUT}/ にモックは含まれていません`);
