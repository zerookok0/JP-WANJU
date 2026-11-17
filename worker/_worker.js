/**
 * ┌─ worker/_worker.js ────────────────────────────────────────────
 * │ 分流：只处理首页 "/"，其余路径原样交给静态层
 * │ （Cloudflare 会把 /xxx.html 308 成 /xxx，worker 再 fetch 同一路径会死循环）
 * │ 安全页 HTML 直接内嵌在本文件末尾，不依赖任何文件路径
 * │ 判定：爬虫 / 非手机 / 非日语 / 非日本 IP → 安全页（地址栏不变）
 * │ 自检看真页：你的域名/?preview=1　取消：?preview=0
 * └───────────────────────────────────────────────────────────────
 */

const BUILD = "v4";

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

  // ① 爬虫永远只看安全页（预览参数也不行）
  if (RULES.blockAgents.test(ua)) return { show: "safe", reason: "bot" };

  // ② 手动自检
  if (preview) return { show: "page", reason: "preview" };

  // ③ 非手机
  if (RULES.mobileOnly && !isMobile(ua)) return { show: "safe", reason: "not-mobile" };

  // ④ 非日语
  if (!langOk(acceptLanguage)) return { show: "safe", reason: "lang" };

  // ⑤ 非日本 IP
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
<title>RIMO — 遠隔デバイスとマッチングのアプリ</title>
<meta name="description" content="RIMO は、アプリと連動するウェアラブルデバイス、およびパートナーとのマッチング機能を提供するコミュニケーションサービスです。">
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
    <div class="logo"><i></i>RIMO</div>
    <div style="font-size:12px;color:var(--text2)">日本国内向け</div>
  </header>

  <h1>離れていても、<br>気持ちはつながる。</h1>
  <p class="lead">RIMO（リモ）は、アプリと連動するウェアラブルデバイスと、パートナーとのマッチング機能を提供するコミュニケーションサービスです。離れた場所にいる相手と、会話を楽しみながら、ゆっくり距離を縮められます。</p>

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
    <p>本サービスは18歳以上の方を対象としています。<br>© 2026 RIMO. All rights reserved.</p>
  </footer>

</div>
</body>
</html>
`;

export default {
  async fetch(request, env) {
    const assets = env.ASSETS;
    const url = new URL(request.url);

    try {
      // 只接管首页。其它路径（/safe、/privacy.html、图片、js…）一律透传，
      // 避免和 Cloudflare 的 clean-URL 308 规则互相打架。
      if (url.pathname !== "/") return assets.fetch(request);

      const ua = request.headers.get("user-agent") || "";
      const cookie = request.headers.get("cookie") || "";
      const strict = String(env.SAFE_COUNTRY_STRICT ?? "1") !== "0";
      const pv = url.searchParams.get("preview");
      const token = env.PREVIEW_TOKEN || "";
      const isBot = RULES.blockAgents.test(ua);

      // 关闭自检
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

      // 安全页：直接输出内嵌 HTML（不 fetch 任何路径）
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

      // 真页
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
