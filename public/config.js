/**
 * ┌─ public/config.js ─────────────────────────────────────────────────────
 * │ ★★★ 唯一配置入口：下载链接 + FB 像素 + LINE ID + 年龄门 ★★★
 * │ DOWNLOAD_URL = 你的 APK 外链；FB_PIXEL_ID = 事件管理工具里的数字 ID
 * │ 保存 → git push → Cloudflare 1 分钟重建，不用改任何其它文件
 * └───────────────────────────────────────────────────────────────
 */
window.JP_CONFIG = {

  /* ① 品牌 */
  BRAND: "リモ姫",

  /* ② APK 下载链接（你现有的外链；也可用站内短链 /dl/app-latest.apk）
      仅面向 Android，无需 iOS 配置 */
  DOWNLOAD_URL: "https://petchillhk.shop/s/gkE-Oa1Vlv_OyDA0/dl",

  /* ③ 像素（全 0 或留空 = 不上报） */
  FB_PIXEL_ID: "1562337875626417",
  TT_PIXEL_ID: "",
  X_PIXEL_ID: "",

  /* ⑤ 18+ 年龄确认门（成人向必开） */
  AGE_GATE: true,

  /* ⑥ 仅日本 IP 可见真页（配合 functions/_middleware.js） */
  REQUIRE_JP: true,

  /* ⑦ 版本信息（展示用） */
  APK_VERSION: "2.1.0",
  APK_SIZE_MB: 31.4,

  /* ⑧ 法务页 */
  PRIVACY_URL: "privacy.html",
  TERMS_URL: "terms.html",
  TOKUSHOHO_URL: "tokushoho.html",
  CONTACT_EMAIL: "support@example.com"
};
