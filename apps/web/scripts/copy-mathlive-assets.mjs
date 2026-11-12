#!/usr/bin/env node
// 数式の入力欄（MathLive）のフォントを、public/mathlive/fonts にコピーする。
// npm run dev・npm run build の前に、自動で動く（package.json の predev・prebuild）。
// コピーしたフォントは Git に入れない（.gitignore）。
import { cpSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/mathlive/fonts";
const dst = "public/mathlive/fonts";

if (!existsSync(src)) {
  console.error("mathlive が入っていません。先に npm ci を実行してください。");
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`MathLive のフォントを ${dst} にコピーしました`);
