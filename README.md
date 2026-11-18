# リモ姫 · 日本市場向け Android ランディングページ

遠隔デバイス（リモートバイブ）＋ マッチングアプリのダウンロードページ。
`npm run build` → `dist/`、Cloudflare Pages にそのまま接続できる構成。

## 文件地图（先看这张表）

| 想改什么 | 打开这个文件 | 改哪一行 |
|---|---|---|
| **APK 下载链接** | `public/config.js` | `DOWNLOAD_URL` |
| **FB 像素 ID** | `public/config.js` | `FB_PIXEL_ID` |
| TikTok / X 像素 | `public/config.js` | `TT_PIXEL_ID` / `X_PIXEL_ID` |
| LINE 官方号 | `public/config.js` | `LINE_ID` |
| 18+ 年龄门开关 | `public/config.js` | `AGE_GATE` |
| 页面文案 / 标题 / 按钮 | `index.html` | 搜 `無料ダウンロード`、`その一押しを` |
| 女性名单 / 红绿状态 | `index.html` | `GIRLS` 数组（`idle: true` = 绿） |
| 女性照片 | `public/assets/girls/01.jpg`～`09.jpg` | 直接换文件 |
| 首屏遥控器图形 | `index.html` | 搜 `<svg class="remote"`（是代码画的，不是图片） |
| 放行国家 / 语言 | `functions/_decide.js` | `RULES.targetCountries` / `allowLangs` |
| APK 短链 | `public/_redirects` | 第 1 行 `YOUR_HOST` |
| CSP / 缓存头 | `public/_headers` | `Content-Security-Policy` |
| 法务三页 | `public/privacy.html` `terms.html` `tokushoho.html` | 搜 `【` 替换方括号 |
| 安全页（审核看这页） | `public/safe.html` | — |

**只有两个文件需要你经常动**：`public/config.js`（下载链接 + 像素）和 `index.html`（文案）。

```
jp-lp/
├── index.html                  ランディングページ（迫真の単一ページ・CSS/JS インライン）
├── package.json                build / dev スクリプト（依存ゼロ）
├── scripts/
│   ├── build.mjs               index.html + public/* → dist/
│   └── dev.mjs                 ローカルプレビュー（http://127.0.0.1:5173）
├── public/                     ビルドで dist 直下にコピーされる
│   ├── config.js               ★ 設定はここだけ
│   ├── safe.html               審査用ページ（爬虫類・非日本・PC はこちら）
│   ├── tokushoho.html          特定商取引法に基づく表記
│   ├── privacy.html            プライバシーポリシー
│   ├── terms.html              利用規約
│   ├── favicon.svg
│   ├── _headers                Cloudflare セキュリティヘッダー / CSP / キャッシュ
│   ├── _redirects              APK 短縮リンク（302）
│   └── assets/girls/           女性写真の差し替え口（01.jpg〜09.jpg）
├── functions/
│   └── _middleware.js          Pages Functions：UA / 国 / 言語で振り分け
└── preview/                    スクリーンショット
```

## 1. デプロイ（Cloudflare Pages）

| 項目 | 値 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Framework preset | None |
| Node version | 18 以上（Pages 既定で可） |

`functions/` は **リポジトリ直下**に置くこと（出力ディレクトリとは別扱い）。push するたび自動デプロイ。

```powershell
cd F:\agent\落地页\jp-lp
npm run build          # ローカルで dist/ を確認
git init && git add . && git commit -m "rimo lp"
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

ローカル確認：`npm run dev` → http://127.0.0.1:5173

## 2. 公開前に必ず変える 3 箇所

1. `public/config.js` → `DOWNLOAD_URL`（既存の APK 外部リンク）、`FB_PIXEL_ID`
2. `public/_redirects` → `YOUR_HOST` を APK の実ドメインに
3. `functions/_middleware.js` → 別の国に配信するなら `targetCountries` / `allowLangs`

APK はリポジトリに入れない（Pages は 1 ファイル 25MB 上限）。R2 か既存 CDN の公開 URL を使う。

## 3. 女性写真の差し替え

`public/assets/girls/01.jpg` 〜 `09.jpg`（3列×3行の順）を置くだけ。無い場合は自動でシルエット表示になり、レイアウトは崩れない。詳細は `public/assets/girls/README.txt`。

名前・年齢・シチュエーション・状態（緑=空いてる／赤=マッチング中）は `index.html` の `GIRLS` 配列：

```js
{ n: "あかり", a: 34, s: "仕事中", idle: true }   // idle:false で赤バッジ
```

## 4. ページ構成

| # | セクション | 中身 |
|---|---|---|
| 1 | ヒーロー | リモコン SVG（LED 点滅・ボタン脈動）＋ 空き人数ライブ表示 |
| 2 | 女性グリッド | 3 列 × 9 人、右上に赤/緑バッジ、タップで「声をかける」シート |
| 3 | 遊びかた | 選ぶ → 聞く → 同意後にスイッチ ON |
| 4 | デモ | 実際に押せるスイッチ＋強さスライダー（ダミー） |
| 5 | 特徴 | 0.2 秒 / 同意前提 / 30〜45 歳 / 24h |
| 6 | 合意 | 「合意なくして、このアプリは動きません」＋ 4 条 |
| 7 | インストール | APK 4 ステップ |
| 8 | 最終 CTA | コピーのみ（ボタンなし） |

**ダウンロード入口はページ下部の固定バー 1 つだけ**（`#dl3`）。ヒーローと最終 CTA にはボタンを置かない。

## 5. 動作仕様

- **アプリ内ブラウザ警告（2 段階）**：Facebook / Instagram / LINE / X / 微信 / TikTok の UA を検知したら、
  1. **入場時（ソフト）**：年齢ゲート通過後に自動で表示。「あとで（このまま見る）」で閉じて、そのまま閲覧を続けられる。
  2. **DL 時（強制）**：固定バーのボタンを押すと再表示。`あとで` は出さず、外側タップでも閉じない。手段は「自動で開いてみる」（`intent://` で Chrome）／「リンクをコピー」の 2 つだけ。
  
  この 2 段階はどちらも DL シートもイベントも出さない。**Android のローカルブラウザ（Chrome 等）では一切出ない**。
- **ダウンロード導線**：固定バーの「無料ダウンロード」→ シート（Play プロテクト警告の説明）→「ダウンロードする」で実 DL。警告文案はシート内に集約しているので、ページ本文には置かない。
- **計測イベント**：固定バー押下で `InitiateCheckout`（結帳開始）、シート内「ダウンロードする」押下で `Purchase`（購買）。TikTok 側は `InitiateCheckout` / `CompletePayment` にマップ。`value: 0 / currency: JPY` を付けているので、実課金がある場合は `track()` 内の数値を差し替える。
- **同意ボタン**：各カード下部に「同意を求める」。押すと「Web版では、リモコンの操作を開始できません。…アプリをダウンロードしてから、会話とリモコン操作を始めてください。」のシートが出て、そのまま DL に流れる。
- **覗き見（閲覧のみ）**：マッチング中のカードはグレーの「覗き見る」。押すと全画面ビューアが開き、LIVE 表示・経過時間・ぼかし映像は見られるが、リモコンは「権限なし」で操作できない。下部の「アプリをダウンロード」から DL に流れる。カード本体を押した場合は従来どおり「他の方とマッチング中」の説明。
- **年齢ゲート**：`localStorage.jp_age` が無い間は全面オーバーレイ。「はい」で解除、以降 Pixel 初期化（同意前に計測しない）。
- **振り分け**：`functions/_middleware.js` が `request.cf.country` / UA / Accept-Language を判定し、`env.ASSETS.fetch()` で `safe.html` に rewrite（URL は変わらない）。爬虫類 UA は常に safe。
- **DL**：`fetch` + `ReadableStream` で実進捗。CORS 不可なら `location.href` に自動フォールバック（外部 APK リンクでも落ちない）。
- **アプリ内ブラウザ**：LINE / Instagram / 微信 を検知して「ブラウザで開く」を案内（APK が落とせないため）。
- **Android 専用**：iOS 対応は行わない。PC（Windows / Mac）からは「スマートフォン（Android）でご利用ください」とだけ返す。

## 6. 分流（cloaking）与自检

`functions/_middleware.js` 对 HTML 文档请求做判定，命中任一条 → **重写**为 `/safe.html`（地址栏不变，HTTP 200）：

| 顺序 | 条件 | 结果 |
|---|---|---|
| ① | 爬虫 / 审核机器人 / 无头浏览器（`facebookexternalhit`、`Googlebot`、`HeadlessChrome`…） | safe |
| ② | 非移动端（PC、Mac、无 UA） | safe |
| ③ | `Accept-Language` 不含 `ja` | safe |
| ④ | `request.cf.country` 不是 `JP`，或取不到国家 | safe |
| — | 静态资源（`.jpg` `.js` `.apk`…）、`/safe.html`、法务页 | 直通，不拦 |

判定逻辑是纯函数（`functions/_decide.js`），本地可直接跑：

```powershell
npm run test:cloak      # 20 条矩阵，全绿才算过
```

### 自检后缀（你自己看真页用）

| 后缀 | 作用 |
|---|---|
| `?preview=1` | **强制真页**，并写入 cookie `jp_preview=1`，24h 内后续访问全直通（不用每次带参数） |
| `?preview=0` | 清除该 cookie，恢复正常分流 |
| `?preview=<TOKEN>` | 同上，但用环境变量 `PREVIEW_TOKEN` 里的口令，不对外暴露 `1` |

所以你在国内想检查页面：

```
https://你的域名/?preview=1
```

爬虫即使带 `?preview=1` 也仍然只拿到 safe 页（规则 ① 优先），这点已测。

响应头可自查：

- 真页：`X-Preview: 1`（自检时）、`X-Robots-Tag: noindex`、`Cache-Control: private, no-store`
- 安全页：`X-Cloak: bot | not-mobile | lang | country` —— 一眼看出被哪条规则拦了

环境变量（Cloudflare Pages → Settings → Environment variables）：

| 变量 | 值 | 用途 |
|---|---|---|
| `PREVIEW_TOKEN` | 随机字符串 | 自检口令，不设则只能用 `?preview=1` |
| `SAFE_COUNTRY_STRICT` | `0` | 关闭 IP 国家判定（本地 wrangler 调试用，生产别关） |

## 7. 公开後の確認（线上验证）

```powershell
# 真ページ（日本ノード）
curl -s https://DOMAIN/ -A "Mozilla/5.0 (Linux; Android 13) Mobile" -H "Accept-Language: ja-JP" | Select-String "無料ダウンロード"
# safe ページ（PC）
curl -s https://DOMAIN/ -A "Mozilla/5.0 (Windows NT 10.0)" | Select-String "離れていても"
# 爬虫類
curl -s https://DOMAIN/ -A "facebookexternalhit/1.1" | Select-String "離れていても"
# 短縮リンク
curl -sI https://DOMAIN/dl/app-latest.apk | Select-String "302|Location"
```

curl の出口が日本国外だと 1 本目は safe ページになる（仕様）。

## 7. つまずきポイント

- **CSP で Pixel が死ぬ**：`_headers` の `script-src` / `connect-src` にドメイン追加。
- **HTML がエッジキャッシュされる**：本ページは `Cache-Control: private, no-store` を Functions 側で付与。ここを外すと振り分けが壊れる。
- **`_headers` / `_redirects` は dist 直下**：だから `public/` に置いてある。ルートに置くと無視される。
- **`functions/` は dist に入れない**：Pages はリポジトリ直下の `functions/` を読む。
- **R2 の署名付き URL**：期限切れで 404。公開バケット＋カスタムドメインか固定短縮リンクにする。
- **年齢ゲート通過前にイベントが飛ぶ**：`initPixel()` はゲート後にしか呼ばない構造を崩さない。
