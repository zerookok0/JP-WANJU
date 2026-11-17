/**
 * ┌─ worker/_worker.js ────────────────────────────────────────────
 * │ 分流逻辑全部在这一个文件里（构建时复制成 dist/_worker.js）
 * │ Cloudflare Pages 会自动把它当 Worker 跑，Dashboard 拖拽上传也生效
 * │ 判定：爬虫 / 非手机 / 非日语 / 非日本 IP → 返回 safe.html（地址栏不变）
 * │ 自检看真页：你的域名/?preview=1　取消：?preview=0
 * │ 要改放行国家 / 语言 → 下面的 RULES
 * └───────────────────────────────────────────────────────────────
 */

const BUILD = "v3";

const RULES = {
  targetCountries: ["JP"],
  allowLangs: ["ja"],
  mobileOnly: true,
  // 爬虫 / 审核机器人 / 无头浏览器
  blockAgents:
    /facebookexternalhit|Facebot|meta-externalagent|Googlebot|Google-InspectionTool|bingbot|Baiduspider|YandexBot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Pinterest|vkShare|W3C_Validator|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|lighthouse|HeadlessChrome|PhantomJS|python-requests|curl\/|wget\//i,
  // Pages 会把 /xxx.html 308 到 /xxx，所以内部取用不带扩展名的路径，避免死循环
  openPaths: /^\/(safe|privacy|terms|tokushoho)(\.html)?$/,
  assetExt: /\.(png|jpe?g|webp|avif|svg|ico|css|js|json|txt|xml|woff2?|ttf|apk|zip|map)$/i,
  safePath: "/safe"
};

function isMobile(ua) {
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua);
}

function langOk(header) {
  if (!header) return false;
  const v = String(header).toLowerCase();
  return RULES.allowLangs.some((l) => v.includes(l));
}

function decide({ ua = "", acceptLanguage = "", country = "", pathname = "/",
                  method = "GET", accept = "", strict, preview } = {}) {
  // strict 默认开启（只有显式传 false 才关闭国家判定）
  const countryStrict = strict !== false;

  if (method !== "GET" && method !== "HEAD") return { show: "page", reason: "method" };
  if (RULES.assetExt.test(pathname)) return { show: "page", reason: "asset" };
  if (RULES.openPaths.test(pathname)) return { show: "page", reason: "open-path" };
  if (accept && !accept.includes("text/html")) return { show: "page", reason: "non-html" };

  // ① 爬虫永远只看安全页（预览参数也不例外）
  if (RULES.blockAgents.test(ua)) return { show: "safe", reason: "bot" };

  // ② 手动自检
  if (preview) return { show: "page", reason: "preview" };

  // ③ 非手机
  if (RULES.mobileOnly && !isMobile(ua)) return { show: "safe", reason: "not-mobile" };

  // ④ 非日语
  if (!langOk(acceptLanguage)) return { show: "safe", reason: "lang" };

  // ⑤ 非日本 IP
  if (countryStrict) {
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

export default {
  async fetch(request, env) {
    const assets = env.ASSETS;

    try {
      const url = new URL(request.url);
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
        pathname: url.pathname,
        method: request.method,
        strict,
        preview
      });

      // 安全页（rewrite，地址栏不变）
      if (verdict.show === "safe") {
        const safeUrl = new URL(RULES.safePath, url.origin);
        const res = await assets.fetch(new Request(safeUrl.toString(), request));
        const out = new Response(res.body, res);
        out.headers.set("Cache-Control", "public, max-age=300");
        out.headers.set("X-Robots-Tag", "index, follow");
        out.headers.set("X-Cloak", verdict.reason);
        out.headers.set("X-Build", BUILD);
        return out;
      }

      // 真页
      const res = await assets.fetch(request);
      const openPath = RULES.openPaths.test(url.pathname) || RULES.assetExt.test(url.pathname);
      const out = new Response(res.body, res);
      out.headers.set("X-Build", BUILD);
      if (!openPath) {
        out.headers.set("Cache-Control", "private, no-store, max-age=0");
        out.headers.set("Vary", "User-Agent, Accept-Language");
        out.headers.set("X-Robots-Tag", "noindex, nofollow");
      }
      if (verdict.reason === "preview") {
        out.headers.set("X-Preview", "1");
        if (pv === "1" || (token && pv === token)) {
          out.headers.append("Set-Cookie", "jp_preview=1; Path=/; Max-Age=86400; SameSite=Lax");
        }
      }
      return out;
    } catch (e) {
      // 出任何问题都别让站挂掉
      return assets.fetch(request);
    }
  }
};

// 供 scripts/test-cloak.mjs 复用（Cloudflare 只认 default export，不影响运行）
export { decide, RULES, isMobile, langOk };
