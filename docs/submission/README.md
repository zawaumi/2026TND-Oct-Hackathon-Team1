# 最終提出の資料（2026-11-14）

ぴあとも（Piatomo）：中学生・高校生が、同年代のAI生徒「ぴあ友」に勉強を教え、教えることで自分の理解を深める学習アプリ。TND 秋のハッカソン2026・チーム1。

## 提出物

| 提出物 | 状態 | 場所・備考 |
|---|---|---|
| リポジトリ | 提出可 | https://github.com/zawaumi/2026TND-Oct-Hackathon-Team1 （`main`：7bda887）。起動の手順は、ルートの [README](../../README.md) |
| 動作 URL | **https://tnd2026-oct-hackathon.web.app** | Google アカウントでログイン。本物の DeepSeek と、サーバーの習得判定で動く（11/13〜14 に本番で通しの確認済み）。配備の手順は [deploy.md](../deploy.md)。ログインなしのデモ版（下記）もある |
| 実装状況と未達の記録 | 提出可 | [status_and_unmet.md](status_and_unmet.md) |
| 発表資料の構成案 | 提出可（スライド本体は、チームの資料を参照） | [slides_outline.md](slides_outline.md) |
| デモの台本・通し練習の手順 | 提出可 | [demo_script.md](demo_script.md) |
| 通し練習の記録 | **空欄（人が実施して記入）** | [rehearsal_log.md](rehearsal_log.md) |
| 画面のスクリーンショット（デモ版） | 提出可 | [screens/](screens/README.md) |
| 試験の記録 | 提出可 | [e2e_acceptance.md](../e2e_acceptance.md)、[a11y_check.md](../a11y_check.md) |
| 仕様書・API 契約 | 提出可 | [docs/](../README.md)、[contracts/openapi.yaml](../../contracts/openapi.yaml) |

## デモ版をローカルで動かす

デモ版は、**モックの API**で動く（実際の AI・習得判定ではない）。`NEXT_PUBLIC_API_BASE_URL` を設定しないと、開発サーバーはモックの API で動く（[apps/web/README.md](../../apps/web/README.md)）。

```sh
cd apps/web
npm ci
npm run dev        # Windows の PowerShell では npm.cmd run dev
```

ブラウザで http://localhost:3000 を開く。再読み込みすると、モックの状態は初期状態に戻る。

本物の API（Django）をつなぐ手順は、ルートの [README](../../README.md)。本物の動きは、動作 URL で試せる。

## 重要な注意

- **デモ版を、本番の AI・判定の実演と言わない。** 画面には、「デモ」の表示が出ない。口頭と、スライドの注記で、必ず伝える。
- 「実装済み」と言ってよいものは、[status_and_unmet.md](status_and_unmet.md) の 1 節で確認する。
