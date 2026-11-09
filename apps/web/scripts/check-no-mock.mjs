#!/usr/bin/env node
// 本番成果物（静的出力 out/）にモックが混入していないか検査する。CI の build の後で実行する。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "out";
const MARKERS = ["__PIATOMO_API_MOCK__", "MOCK_NOT_IMPLEMENTED", "piatomo.mock.scenario"];

if (process.env.NEXT_PUBLIC_API_MOCK === "true") {
  console.error("NG: NEXT_PUBLIC_API_MOCK=true のまま本番ビルドしようとしています");
  process.exit(1);
}
const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|json|map|txt)$/.test(name)) {
      const s = readFileSync(p, "utf8");
      for (const m of MARKERS) if (s.includes(m)) hits.push(`${p}: ${m}`);
    }
  }
})(OUT);
if (hits.length) {
  console.error("NG: 本番成果物にモックが含まれています\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`OK: ${OUT}/ にモックは含まれていません`);
