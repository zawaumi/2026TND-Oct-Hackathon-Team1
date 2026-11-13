# 本番公開の手順

画面（Next.js の静的出力）は Firebase Hosting、API（Django）は Cloud Run、DB は Cloud SQL（PostgreSQL 15）に置きます。
Hosting が `/api/**` を Cloud Run へ転送するので、画面と API は同じ場所（`https://tnd2026-oct-hackathon.web.app`）に見えます。CORS の設定は要りません。

```
ブラウザ ── https://tnd2026-oct-hackathon.web.app ──┬─ /api/** → Cloud Run「piatomo-api」(asia-northeast1) → Cloud SQL「piatomo-db」
                                                     └─ それ以外 → apps/web/out/（静的ファイル）
```

- 秘密の値（Django の秘密鍵・DB のパスワード・DeepSeek のキー）は Secret Manager にだけ置きます。リポジトリ・チャット・GitHub には書きません。
- コマンドは Windows の PowerShell 用です。リポジトリの直下（`2026TND-Oct-Hackathon-Team1`）で実行します。
- `gcloud` が「〜を有効にしますか」「リポジトリを作りますか」と聞いてきたら `Y` で進めます。

## 0. 準備

1. **権限**：GCP プロジェクト `tnd2026-oct-hackathon` で、次を操作できること（オーナーか編集者なら足ります）。
   - Cloud Run、Cloud SQL、Secret Manager、Cloud Build、Artifact Registry、サービスアカウント、Firebase Hosting
2. **お支払い**：プロジェクトに請求先アカウントがつながっていること（Firebase は Blaze プラン）。Hosting から Cloud Run への転送と Cloud SQL に必要です。
   - 目安の費用：Cloud SQL の最小構成（db-f1-micro・10GB）が月に千数百円程度。Cloud Run は使った分だけで、ハッカソンの規模ならほぼかかりません。
   - コンソールの「お支払い → 予算とアラート」で、予算のアラート（例：3,000円）を設定しておくと安心です。
3. **道具**（それぞれの公式の手順で入れる）
   - Google Cloud CLI（`gcloud`）
   - Firebase CLI：`npm install -g firebase-tools`
4. **ログインと変数**（PowerShell を開くたびに、この変数の部分は実行し直す）

```powershell
gcloud auth login
firebase login

$PROJECT  = "tnd2026-oct-hackathon"
$REGION   = "asia-northeast1"
$SERVICE  = "piatomo-api"
$INSTANCE = "piatomo-db"
$SA       = "piatomo-api@$PROJECT.iam.gserviceaccount.com"

gcloud config set project $PROJECT
gcloud config set run/region $REGION
```

## 1. 使うサービスを有効にする（初回だけ）

```powershell
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com `
  cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 2. Cloud SQL を作る（初回だけ。10分ほどかかる）

```powershell
gcloud sql instances create $INSTANCE --database-version=POSTGRES_15 --edition=ENTERPRISE `
  --tier=db-f1-micro --region=$REGION --storage-size=10GB
gcloud sql databases create piatomo --instance=$INSTANCE
```

## 3. 秘密の値を Secret Manager に入れる（初回だけ）

値はファイルにもチャットにも残さず、この PowerShell の中だけで作って入れます。

```powershell
# 推測されにくい値を作る
function New-RandomValue([int]$bytes = 48) {
  $buf = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return ([Convert]::ToBase64String($buf) -replace '[+/=]', '')
}
# 末尾に改行を付けずに Secret Manager へ入れる（あれば新しい版を足す）
function Set-Secret([string]$name, [string]$value) {
  $tmp = New-TemporaryFile
  try {
    [IO.File]::WriteAllText($tmp.FullName, $value)
    gcloud secrets describe $name *> $null
    if ($LASTEXITCODE -eq 0) { gcloud secrets versions add $name --data-file=$($tmp.FullName) }
    else { gcloud secrets create $name --replication-policy=automatic --data-file=$($tmp.FullName) }
  } finally { Remove-Item $tmp.FullName -Force }
}

# DB のユーザー
$DBPASS = New-RandomValue 32
gcloud sql users create piatomo --instance=$INSTANCE --password=$DBPASS
Set-Secret "piatomo-db-password" $DBPASS
Remove-Variable DBPASS

# Django の秘密鍵
Set-Secret "piatomo-django-secret" (New-RandomValue 48)

# DeepSeek のキー（中澤さんから個別に受け取ったもの。入力は画面に出ない）
$k = Read-Host "DeepSeek の API キー" -AsSecureString
Set-Secret "piatomo-deepseek-key" ([Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($k)))
Remove-Variable k
```

## 4. API 専用のサービスアカウントを作る（初回だけ）

API には、DB への接続と、3つの秘密の値を読む権限だけを渡します。

```powershell
gcloud iam service-accounts create piatomo-api --display-name "piatomo API"
gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$SA" --role roles/cloudsql.client
foreach ($s in "piatomo-django-secret", "piatomo-db-password", "piatomo-deepseek-key") {
  gcloud secrets add-iam-policy-binding $s --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
}
```

## 5. API を Cloud Run に載せる（コードを変えるたびに）

```powershell
$CONN = gcloud sql instances describe $INSTANCE --format="value(connectionName)"
# 区切りに ; を使う（値の中にカンマがあるため）
$ENVS = "^;^DJANGO_ALLOWED_HOSTS=.run.app,$PROJECT.web.app,$PROJECT.firebaseapp.com" +
        ";DJANGO_CSRF_TRUSTED_ORIGINS=https://$PROJECT.web.app,https://$PROJECT.firebaseapp.com" +
        ";POSTGRES_DB=piatomo;POSTGRES_USER=piatomo;POSTGRES_HOST=/cloudsql/$CONN;POSTGRES_PORT=5432" +
        ";FIREBASE_PROJECT_ID=$PROJECT"
$SECRETS = "DJANGO_SECRET_KEY=piatomo-django-secret:latest,POSTGRES_PASSWORD=piatomo-db-password:latest,DEEPSEEK_API_KEY=piatomo-deepseek-key:latest"

gcloud run deploy $SERVICE --source apps/api --region $REGION --service-account $SA `
  --allow-unauthenticated --add-cloudsql-instances $CONN `
  --min-instances 0 --max-instances 3 --memory 512Mi --timeout 60 `
  --set-env-vars $ENVS --set-secrets $SECRETS
```

- 管理画面（`/admin/`）は、本番では出しません（`*.run.app` の URL から直接見えてしまうため）。どうしても使うときだけ、`$ENVS` に `;DJANGO_ADMIN_ENABLED=true` を足して載せ直し、使い終わったら外して載せ直します。
- `--allow-unauthenticated`：だれでも呼べるようにします。ログインの確認は API 自身が Firebase の ID トークンで行います（`apps/api/accounts/authentication.py`）。
- 最小インスタンスは 0 です（使わないときは費用がかからない代わりに、しばらく使っていないと最初の1回が数秒遅い）。発表の直前に `gcloud run services update $SERVICE --min-instances 1` にし、終わったら 0 に戻すと安心です。

## 6. DB を最新にする（マイグレーション。API を載せるたびに）

API と同じイメージで、マイグレーションだけを実行するジョブを使います。

```powershell
$IMAGE = gcloud run services describe $SERVICE --region $REGION --format="value(spec.template.spec.containers[0].image)"

# 初回：ジョブを作る
gcloud run jobs deploy piatomo-migrate --image $IMAGE --region $REGION --service-account $SA `
  --set-cloudsql-instances $CONN --set-env-vars $ENVS --set-secrets $SECRETS `
  --command python --args "manage.py,migrate,--noinput"

# 2回目からは、イメージを差し替えるだけ
# gcloud run jobs update piatomo-migrate --image $IMAGE --region $REGION

gcloud run jobs execute piatomo-migrate --region $REGION --wait
```

教材データを入れるときも、このジョブの引数を変えて実行します（例：`--args "manage.py,loaddata,<ファイル>"`。コマンドは教材データの入れ方に合わせる）。

```powershell
# gcloud run jobs execute piatomo-migrate --region $REGION --wait --args "manage.py,<コマンド>"
```

## 7. API の確認

```powershell
$URL = gcloud run services describe $SERVICE --region $REGION --format="value(status.url)"
Invoke-RestMethod "$URL/api/v1/health/"          # status=ok なら起動している
```

## 8. 画面を Firebase Hosting に載せる（画面を変えるたびに）

本番の画面は、モックを使わず、同じ場所の `/api/v1/...` を呼びます。

1. `apps/web/.env.local` があり、`NEXT_PUBLIC_API_BASE_URL` か `NEXT_PUBLIC_API_MOCK` が書いてあれば、ビルドの間だけ名前を変えておきます（例：`.env.local.bak`）。
2. ビルドして載せます。

```powershell
cd apps/web
npm ci
npm run build        # 最後に「モックが含まれていない」ことを自動で確かめる（scripts/check-no-mock.mjs）
cd ..\..
firebase deploy --only hosting
```

`firebase.json`（リポジトリの直下）が、`apps/web/out/` の配信と `/api/**` の転送を決めています。API（手順5）を先に載せておかないと、転送先が見つからずに失敗します。

## 9. 通しの確認（発表の流れ）

`https://tnd2026-oct-hackathon.web.app` を開き、次の順に確かめます。

1. Google でログインできる（Firebase の Authentication で Google が有効になっていること）
2. 初回設定（ニックネーム・学年・同意）を終えるとホームに進む
3. 学習内容を選んで授業を始められる（教材データが入っていること）
4. 説明を2〜3回送ると、ぴあ友が質問を返す（本物の DeepSeek）
5. 「授業を終える」で学習レポートが出る（点数・3観点・良かったところ・習得の変化・次の学習の候補）

うまくいかないときは、Cloud Run のログを見ます。

```powershell
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE" --limit 50 --freshness 1h
```

## よくあるつまずき

| 症状 | 原因と対処 |
| --- | --- |
| `run deploy` で `--allow-unauthenticated` が拒否される | 組織のポリシーで公開が禁止されている。プロジェクトの管理者（中澤さん）に相談する |
| `run deploy` のビルドで権限エラー | Cloud Build が使うサービスアカウントに権限がない。エラーに出たロールを管理者に付けてもらう |
| API が 400 Bad Request | 呼ばれたホスト名が `DJANGO_ALLOWED_HOSTS` にない。手順5の `$ENVS` を確認して載せ直す |
| API が起動しない（`must be set`・`Missing PostgreSQL settings`） | 環境変数か秘密の値が足りない。手順3〜5を確認する |
| DB につながらない | `--add-cloudsql-instances` と `POSTGRES_HOST=/cloudsql/<接続名>` が合っているか、サービスアカウントに `cloudsql.client` があるか |
| `firebase deploy` で Cloud Run が見つからない | 手順5の API が、同じプロジェクト・リージョン（asia-northeast1）・名前（piatomo-api）で載っているか |
| 画面が「通信できませんでした」 | ビルドのときに `NEXT_PUBLIC_API_BASE_URL` が入っていた。手順8の1を確認してビルドし直す |
| ログイン後に「初回設定をしてください」で止まる | 初回設定の画面がまだ入っていない |

## ハッカソンのあとに費用を止める

次の操作は**元に戻せません**（DB のデータも消えます）。チームで確認してから実行します。

```powershell
# gcloud sql instances delete $INSTANCE
# gcloud run services delete $SERVICE --region $REGION
# gcloud run jobs delete piatomo-migrate --region $REGION
```
