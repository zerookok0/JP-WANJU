/**
 * ┌─ scripts/test-cloak.mjs ─────────────────────────────────────────────────────
 * │ 分流矩阵测试：node scripts/test-cloak.mjs（20 条，必须全绿）
 * │ 改了 _decide.js 之后一定要跑一遍
 * │ 输出 OK/FAIL + 拦截原因，方便定位规则顺序问题
 * └───────────────────────────────────────────────────────────────
 */
import { decide } from "../worker/_worker.js";

const A = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FBC = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const GB = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const cases = [
  ["Android + ja + JP",              { ua: A, acceptLanguage: "ja-JP,ja;q=0.9", country: "JP", pathname: "/", accept: "text/html" }, "page"],
  ["Android + ja + US",              { ua: A, acceptLanguage: "ja-JP", country: "US", pathname: "/", accept: "text/html" }, "safe"],
  ["Android + en + JP",              { ua: A, acceptLanguage: "en-US,en;q=0.9", country: "JP", pathname: "/", accept: "text/html" }, "safe"],
  ["Android + 无语言头 + JP",         { ua: A, acceptLanguage: "", country: "JP", pathname: "/", accept: "text/html" }, "safe"],
  ["PC + ja + JP",                   { ua: PC, acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html" }, "safe"],
  ["FB 爬虫",                        { ua: FBC, acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html" }, "safe"],
  ["Googlebot",                      { ua: GB, acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html" }, "safe"],
  ["Headless Chrome + JP",           { ua: A.replace("Chrome/120", "HeadlessChrome/120"), acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html" }, "safe"],
  ["法务页 非日本",                   { ua: PC, acceptLanguage: "en", country: "US", pathname: "/privacy.html", accept: "text/html" }, "page"],
  ["safe.html 直达",                 { ua: PC, acceptLanguage: "en", country: "US", pathname: "/safe.html", accept: "text/html" }, "page"],
  ["图片资源",                       { ua: PC, acceptLanguage: "en", country: "US", pathname: "/assets/girls/01.jpg", accept: "image/*" }, "page"],
  ["config.js",                      { ua: PC, acceptLanguage: "en", country: "US", pathname: "/config.js", accept: "*/*" }, "page"],
  ["Android + ja + 国家未知",         { ua: A, acceptLanguage: "ja-JP", country: "", pathname: "/", accept: "text/html" }, "safe"],
  ["国家未知 + strict=false",         { ua: A, acceptLanguage: "ja-JP", country: "", pathname: "/", accept: "text/html", strict: false }, "page"],
  ["POST 请求",                      { ua: A, acceptLanguage: "ja-JP", country: "JP", pathname: "/", method: "POST", accept: "text/html" }, "page"],
  ["iPad (平板) + ja + JP",          { ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Mobile/15E148", acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html" }, "page"],
  ["LINE 内置 + ja + JP",            { ua: A + " Line/13.5.0", acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html" }, "page"],
  ["PC + ?preview=1（自检）",         { ua: PC, acceptLanguage: "en", country: "CN", pathname: "/", accept: "text/html", preview: true }, "page"],
  ["FB 爬虫 + ?preview=1",            { ua: FBC, acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html", preview: true }, "safe"],
  ["Googlebot + ?preview=1",          { ua: GB, acceptLanguage: "ja-JP", country: "JP", pathname: "/", accept: "text/html", preview: true }, "safe"]
];

let pass = 0, fail = 0;
for (const [name, ctx, expect] of cases) {
  const v = decide(ctx);
  const ok = v.show === expect;
  ok ? pass++ : fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(24)} expect=${expect.padEnd(4)} actual=${v.show.padEnd(4)} (${v.reason})`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
