/**
 * ┌─ worker/_worker.js ────────────────────────────────────────────
 * │ 分流：只处理根路径 "/"，其它路径原样交给静态层
 * │ 安全页 HTML 内嵌在本文件，不依赖任何文件路径
 * │
 * │ 后台在线统计（只有你自己能看）：
 * │   /admin/live?token=你的口令      实时面板
 * │   /api/ping                      页面调用，记录在线
 * │   /api/stats?token=              面板拉数据
 * │ 数据存 Cloudflare D1（免费 10 万写/天），90 秒无心跳即离线
 * └───────────────────────────────────────────────────────────────
 */

const BUILD = "v7";
const DEFAULT_ADMIN_TOKEN = "rimo-live-2026";
const ONLINE_TTL_MS = 90 * 1000;

const RULES = {
  targetCountries: ["JP"],
  allowLangs: ["ja"],
  mobileOnly: true,
  blockAgents:
    /facebookexternalhit|Facebot|meta-externalagent|Googlebot|Google-InspectionTool|bingbot|Baiduspider|YandexBot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Pinterest|vkShare|W3C_Validator|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|lighthouse|HeadlessChrome|PhantomJS|python-requests|curl\/|wget\//i
};

function isMobile(ua) {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua);
}

function langOk(header) {
  if (!header) return false;
  const v = String(header).toLowerCase();
  return RULES.allowLangs.some((l) => v.includes(l));
}

function decide({ ua = "", acceptLanguage = "", country = "", method = "GET",
                  accept = "", strict = true, preview = false } = {}) {
  if (method !== "GET" && method !== "HEAD") return { show: "page", reason: "method" };
  if (accept && !accept.includes("text/html")) return { show: "page", reason: "non-html" };
  if (RULES.blockAgents.test(ua)) return { show: "safe", reason: "bot" };
  if (preview) return { show: "page", reason: "preview" };
  if (RULES.mobileOnly && !isMobile(ua)) return { show: "safe", reason: "not-mobile" };
  if (!langOk(acceptLanguage)) return { show: "safe", reason: "lang" };
  if (strict) {
    if (!country) return { show: "safe", reason: "country-unknown" };
    if (!RULES.targetCountries.includes(country.toUpperCase())) return { show: "safe", reason: "country" };
  }
  return { show: "page", reason: "pass" };
}

function readCookie(header, name) {
  if (!header) return "";
  const m = header.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

/* ── D1：建表（首次自动） ── */
let tableReady = false;
async function ensureTable(DB) {
  if (tableReady) return;
  await DB.prepare(
    `CREATE TABLE IF NOT EXISTS live (
       sid TEXT, ts INTEGER, inapp INTEGER, country TEXT, region TEXT, event TEXT, ua TEXT
     )`
  ).run();
  await DB.prepare(`CREATE INDEX IF NOT EXISTS idx_live_ts ON live (ts)`).run();
  tableReady = true;
}

/* ── /api/ping ── */
async function handlePing(request, env, url) {
  const DB = env.DB;
  const cf = request.cf || {};
  const p = url.searchParams;
  const sid = (p.get("sid") || "").slice(0, 40);
  if (!sid) return json({ ok: false, error: "no sid" }, 400);

  const ua = request.headers.get("user-agent") || "";
  if (RULES.blockAgents.test(ua)) return json({ ok: true, skipped: "bot" });

  if (!DB) return json({ ok: false, error: "D1 (DB) 未绑定" }, 200);
  await ensureTable(DB);

  const now = Date.now();
  const row = {
    sid,
    ts: now,
    inapp: p.get("inapp") === "1" ? 1 : 0,
    country: (cf.country || "").slice(0, 4),
    region: (cf.region || "").slice(0, 40),
    event: (p.get("e") || "heartbeat").slice(0, 20),
    ua: ua.slice(0, 160)
  };

  try {
    await DB.prepare(
      `INSERT INTO live (sid, ts, inapp, country, region, event, ua) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.sid, row.ts, row.inapp, row.country, row.region, row.event, row.ua).run();

    // 顺手清理 2 小时前的记录，别让表无限涨
    await DB.prepare(`DELETE FROM live WHERE ts < ?`).bind(now - 2 * 3600 * 1000).run();
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 120) }, 200);
  }
  return json({ ok: true });
}

/* ── /api/stats ── */
async function handleStats(env, url) {
  const DB = env.DB;
  const token = url.searchParams.get("token") || "";
  const admin = env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN;
  if (token !== admin) return json({ ok: false, error: "forbidden" }, 403);
  if (!DB) return json({ ok: false, error: "D1 (DB) 未绑定" }, 200);
  await ensureTable(DB);

  const now = Date.now();
  const since = now - ONLINE_TTL_MS;
  const todayStart = Date.now() - (Date.now() % 86400000);

  try {
    const online = await DB.prepare(
      `SELECT COUNT(DISTINCT sid) AS c FROM live WHERE ts > ?`
    ).bind(since).first();

    const split = await DB.prepare(
      `SELECT inapp, COUNT(DISTINCT sid) AS c FROM live WHERE ts > ? GROUP BY inapp`
    ).bind(since).all();

    const events = await DB.prepare(
      `SELECT event, COUNT(*) AS c FROM live WHERE ts > ? GROUP BY event`
    ).bind(todayStart).all();

    const visits = await DB.prepare(
      `SELECT COUNT(DISTINCT sid) AS c FROM live WHERE ts > ? AND event = 'open'`
    ).bind(todayStart).first();

    const recent = await DB.prepare(
      `SELECT sid, MAX(ts) AS ts, inapp, country, region, ua FROM live
       WHERE ts > ? GROUP BY sid ORDER BY ts DESC LIMIT 25`
    ).bind(todayStart).all();

    const byRegion = await DB.prepare(
      `SELECT region, COUNT(DISTINCT sid) AS c FROM live WHERE ts > ? GROUP BY region ORDER BY c DESC LIMIT 8`
    ).bind(todayStart).all();

    const ev = {};
    (events.results || []).forEach((r) => { ev[r.event] = r.c; });

    let emb = 0, local = 0;
    (split.results || []).forEach((r) => { r.inapp ? (emb = r.c) : (local = r.c); });

    return json({
      ok: true,
      online: online ? online.c : 0,
      embedded: emb,
      local: local,
      visits: visits ? visits.c : 0,
      events: ev,
      regions: byRegion.results || [],
      recent: recent.results || [],
      now
    });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 160) }, 200);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

/* ── 面板 ── */
function panelHtml(token) {
  return `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>リモ姫 管理</title>
<style>
:root{--bg:#0B0D12;--card:#15171E;--line:rgba(255,255,255,.08);--text:#EDEFF4;--dim:#8A8F9C;--pink:#FF3F6E;--green:#2BE39A}
*{box-sizing:border-box}body{margin:0 auto;max-width:560px;background:var(--bg);color:var(--text);font-family:-apple-system,"Noto Sans JP",sans-serif;font-size:14px;line-height:1.7;padding:18px}
h1{font-size:15px;letter-spacing:.08em;color:var(--dim);font-weight:600;margin:0 0 14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
.big{font-size:44px;font-weight:800;letter-spacing:-.02em;line-height:1.1;color:var(--pink);font-variant-numeric:tabular-nums}
.big small{font-size:14px;color:var(--dim);font-weight:500;margin-left:6px}
.row{display:flex;gap:10px;margin-top:10px}
.kpi{flex:1;background:rgba(255,255,255,.03);border-radius:10px;padding:10px}
.kpi b{display:block;font-size:19px;font-variant-numeric:tabular-nums}
.kpi span{font-size:10.5px;color:var(--dim);letter-spacing:.04em}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:11px}
table{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}
td,th{padding:6px 3px;border-bottom:1px solid var(--line);text-align:left;overflow:hidden;text-overflow:ellipsis}td:last-child{text-align:right;width:92px}
th{color:var(--dim);font-weight:500;font-size:10.5px}
.tag{font-size:9.5px;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.06);color:var(--dim)}
.tag.e{background:rgba(255,63,110,.16);color:var(--pink)}
.live{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--green)}
.live i{width:6px;height:6px;border-radius:50%;background:var(--green);animation:bl 1.6s infinite}
@keyframes bl{0%,100%{opacity:.3}50%{opacity:1}}
.err{color:#FFB4C4;font-size:12px}
h2{font-size:12px;color:var(--dim);letter-spacing:.06em;margin:0 0 8px;font-weight:600}
</style></head><body>
<h1>リモ姫 ／ LIVE</h1>

<div class="card">
  <div class="big"><span id="online">-</span><small>人が見ています</small></div>
  <div class="live"><i></i><span id="upd">接続中…</span></div>
  <div class="row">
    <div class="kpi"><b id="emb">-</b><span>FB内蔵</span></div>
    <div class="kpi"><b id="loc">-</b><span>ローカル</span></div>
    <div class="kpi"><b id="vis">-</b><span>今日の着地</span></div>
  </div>
</div>

<div class="card">
  <h2>今日のファネル</h2>
  <table id="funnel"><tbody><tr><td colspan="2">読み込み中…</td></tr></tbody></table>
</div>

<div class="card">
  <h2>地域（今日）</h2>
  <table id="regions"><tbody><tr><td>—</td></tr></tbody></table>
</div>

<div class="card">
  <h2>最近の訪問</h2>
  <table id="recent"><tbody><tr><td>—</td></tr></tbody></table>
</div>

<p class="err" id="err"></p>

<script>
var TOKEN = ${JSON.stringify(token)};
function $(id){return document.getElementById(id);}
function fmt(n){return (n===undefined||n===null)?"-":String(n);}
function ago(ts){
  var s = Math.max(0, Math.round((Date.now()-ts)/1000));
  if (s < 60) return s+"秒前";
  if (s < 3600) return Math.round(s/60)+"分前";
  return Math.round(s/3600)+"時間前";
}
function dev(ua){
  if(!ua) return "-";
  var v = (ua.match(/Android[\\s\\/]([\\d.]+)/)||[])[1];
  return v ? "Android "+v : (ua.indexOf("iPhone")>-1?"iPhone":"その他");
}
function load(){
  fetch("/api/stats?token="+encodeURIComponent(TOKEN),{cache:"no-store"})
  .then(function(r){return r.json();})
  .then(function(d){
    if(!d.ok){ $("err").textContent = d.error || "エラー"; return; }
    $("err").textContent = "";
    $("online").textContent = fmt(d.online);
    $("emb").textContent = fmt(d.embedded);
    $("loc").textContent = fmt(d.local);
    $("vis").textContent = fmt(d.visits);

    var e = d.events || {};
    var order = [["open","着地"],["ask","同意ボタン"],["sheet","DLシート"],["dl","ダウンロード実行"],["heartbeat","心拍"]];
    var html = "";
    order.forEach(function(p){
      if(e[p[0]]!==undefined && p[0]!=="heartbeat") html += "<tr><td>"+p[1]+"</td><td class='mono'>"+e[p[0]]+"</td></tr>";
    });
    $("funnel").querySelector("tbody").innerHTML = html || "<tr><td>まだデータなし</td></tr>";

    var rg = (d.regions||[]).map(function(r){
      return "<tr><td>"+(r.region||"不明")+"</td><td class='mono'>"+r.c+"</td></tr>";
    }).join("");
    $("regions").querySelector("tbody").innerHTML = rg || "<tr><td>—</td></tr>";

    var rd = (d.recent||[]).map(function(r){
      return "<tr><td class='mono'>"+ago(r.ts)+"</td><td>"+(r.region||"-")+"</td><td><span class='tag"+(r.inapp?" e":"")+"'>"+(r.inapp?"FB内蔵":"LOCAL")+"</span></td></tr>";
    }).join("");
    $("recent").querySelector("tbody").innerHTML = rd || "<tr><td>—</td></tr>";

    $("upd").textContent = "更新 " + new Date(d.now).toLocaleTimeString("ja-JP");
  })
  .catch(function(){ $("err").textContent = "接続エラー"; });
}
load(); setInterval(load, 5000);
</script>
</body></html>`;
}

/* ── 主入口 ── */
export default {
  async fetch(request, env) {
    const assets = env.ASSETS;
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      /* 后台 */
      if (path === "/api/ping") return await handlePing(request, env, url);
      if (path === "/api/stats") return await handleStats(env, url);
      if (path === "/admin/live") {
        const token = url.searchParams.get("token") || "";
        const admin = env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN;
        if (token !== admin) return new Response("Not Found", { status: 404 });
        return new Response(panelHtml(token), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
        });
      }

      /* 只接管根路径 */
      if (path !== "/") return assets.fetch(request);

      const ua = request.headers.get("user-agent") || "";
      const cookie = request.headers.get("cookie") || "";
      const strict = String(env.SAFE_COUNTRY_STRICT ?? "1") !== "0";
      const pv = url.searchParams.get("preview");
      const token = env.PREVIEW_TOKEN || "";
      const isBot = RULES.blockAgents.test(ua);

      if (pv === "0") {
        const res = await assets.fetch(request);
        const out = new Response(res.body, res);
        out.headers.append("Set-Cookie", "jp_preview=; Path=/; Max-Age=0; SameSite=Lax");
        out.headers.set("X-Build", BUILD);
        return out;
      }

      const preview =
        !isBot &&
        (pv === "1" || (token && pv === token) || readCookie(cookie, "jp_preview") === "1");

      const verdict = decide({
        ua,
        acceptLanguage: request.headers.get("accept-language") || "",
        accept: request.headers.get("accept") || "",
        country: (request.cf && request.cf.country) || "",
        method: request.method,
        strict,
        preview
      });

      /* 安全页：直接输出内嵌 HTML */
      if (verdict.show === "safe") {
        return new Response(SAFE_HTML, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
            "x-robots-tag": "index, follow",
            "x-cloak": verdict.reason,
            "x-build": BUILD
          }
        });
      }

      const res = await assets.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set("Cache-Control", "private, no-store, max-age=0");
      out.headers.set("Vary", "User-Agent, Accept-Language");
      out.headers.set("X-Robots-Tag", "noindex, nofollow");
      out.headers.set("X-Build", BUILD);
      if (verdict.reason === "preview") {
        out.headers.set("X-Preview", "1");
        if (pv === "1" || (token && pv === token)) {
          out.headers.append("Set-Cookie", "jp_preview=1; Path=/; Max-Age=86400; SameSite=Lax");
        }
      }
      return out;
    } catch (e) {
      return assets.fetch(request);
    }
  }
};

export { decide, RULES, isMobile, langOk };

const SAFE_HTML = `<!DOCTYPE html>
<!--
  ┌─ public/safe.html ─────────────────────────────────────────────────────
  │ 安全页 / 审核页：非日本 IP、PC、非日语、爬虫看到的都是这一页
  │ 要求干净：无 18+ 表述、无下载按钮、不要回链 index.html
  │ 允许被搜索引擎索引（真页是 noindex）
  └───────────────────────────────────────────────────────────────
-->
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>リモ姫 — 遠隔デバイスとマッチングのアプリ</title>
<meta name="description" content="リモ姫 は、アプリと連動するウェアラブルデバイス、およびパートナーとのマッチング機能を提供するコミュニケーションサービスです。">
<style>
:root{--bg:#F6F8FB;--surface:#fff;--text:#0F1B2D;--text2:#5A6B85;--line:rgba(20,40,80,.1);--accent:#1F6FEB}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;font-size:15px;line-height:1.8}
.wrap{max-width:640px;margin:0 auto;padding:40px 20px 64px}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:36px}
.logo{font-weight:700;letter-spacing:.12em}
.logo i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:6px;vertical-align:1px}
h1{font-size:25px;line-height:1.5;margin:0 0 12px}
.lead{color:var(--text2);margin:0 0 28px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:14px}
.card h2{font-size:16px;margin:0 0 8px}
.card p{margin:0;color:var(--text2);font-size:14px}
.links{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0}
.links a{flex:1;min-width:170px;text-align:center;padding:14px;border-radius:12px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:14px}
footer{border-top:1px solid var(--line);margin-top:40px;padding-top:20px;color:var(--text2);font-size:12px;line-height:2}
footer a{color:var(--text2);margin-right:14px}
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="logo"><i></i>リモ姫</div>
    <div style="font-size:12px;color:var(--text2)">日本国内向け</div>
  </header>

  <h1>離れていても、<br>気持ちはつながる。</h1>
  <p class="lead">リモ姫（リモひめ）は、アプリと連動するウェアラブルデバイスと、パートナーとのマッチング機能を提供するコミュニケーションサービスです。離れた場所にいる相手と、会話を楽しみながら、ゆっくり距離を縮められます。</p>

  <div class="card">
    <h2>アプリとデバイスが連動</h2>
    <p>スマートフォンのアプリから、ペアリングしたデバイスの動作を調整できます。設定はかんたん、専用の知識は必要ありません。</p>
  </div>
  <div class="card">
    <h2>相手の同意が前提</h2>
    <p>デバイスの操作は、ペアリングした相手が承諾した場合にのみ有効になります。相手はいつでも停止できます。</p>
  </div>
  <div class="card">
    <h2>会話も、いっしょに</h2>
    <p>アプリ内のチャットで、その日の出来事や気分を共有できます。急かさない、落ち着いたやり取りを大切にしています。</p>
  </div>

  <div class="links">
    <a href="privacy.html">プライバシーポリシー</a>
    <a href="terms.html">利用規約</a>
  </div>

  <footer>
    <a href="tokushoho.html">特定商取引法に基づく表記</a>
    <a href="privacy.html">プライバシーポリシー</a>
    <a href="terms.html">利用規約</a>
    <p>本サービスは18歳以上の方を対象としています。<br>© 2026 リモ姫. All rights reserved.</p>
  </footer>

</div>
</body>
</html>
`;
