/**
 * Measurement harness: Blade categories page vs React categories page.
 *
 * WHY MEASURE INSTEAD OF LOOK
 * ---------------------------
 * The pharmacy card port was declared "done" twice while it was still wrong —
 * once because `.card-head` collided with another bundle's rule, once because
 * `base.css` line-height 1.65 was inherited. Neither was visible by eye; both
 * were obvious the moment the geometry was printed. Same method here.
 *
 * WHAT IT DOES
 * ------------
 * Renders the REAL Blade markup with the REAL built Blade CSS (from
 * `public/build/manifest.json`, so no stale asset is picked), measures the
 * shell geometry, and prints it. The React side is measured from the running
 * dev server's own DOM in the companion script.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const BACKEND = 'C:/Users/MSI/daway-backend';
const OUT = resolve('tools/__harness-categories.html');

/* --- 1. Resolve the real asset paths from the manifest ------------------
   ⚠️ The manifest's `file` field is RELATIVE TO THE BUILD ROOT (`public/build/`),
   e.g. `assets/tokens-kKaA9aHp.css`. It is NOT a filesystem path and NOT an
   absolute URL. Naively joining it produced `…/daway-backend/build/…`, which
   silently 404s — and a stylesheet that fails to load still renders a page, so
   the measurements come back plausible but meaningless. Resolve it explicitly.
   ------------------------------------------------------------------------ */
const BUILD_ROOT = `${BACKEND}/public`;
const manifest = JSON.parse(readFileSync(`${BACKEND}/public/build/manifest.json`, 'utf8'));
/** Manifest key → absolute filesystem path. */
const assetPath = (key) => `${BUILD_ROOT}/build/${manifest[key].file}`;

const tokens = assetPath('resources/css/tokens.css');
const medicines = assetPath('resources/css/pages/medicines.css');
const categories = assetPath('resources/css/pages/categories.css');
const appCss = assetPath('resources/css/app.css');

console.log('assets in use:');
console.log('  tokens     :', tokens);
console.log('  medicines  :', medicines);
console.log('  categories :', categories);
console.log('  app        :', appCss);

/* Fail LOUDLY if any asset is missing. A silently 404ing stylesheet is the
   single most dangerous failure mode for this harness. */
for (const [label, p] of Object.entries({ tokens, medicines, categories, appCss })) {
  if (!existsSync(p)) {
    console.error(`\n✗ MISSING ASSET (${label}): ${p}\n  The harness would render unstyled and every number below would be a lie.`);
    process.exit(1);
  }
}

/* --- 3. Build the harness -------------------------------------------------
   The markup is transcribed from `categories/index.blade.php` +
   `categories/_row.blade.php` with the Blade directives resolved for two
   realistic rows (one active without review, one active with review) and the
   `needs_review > 0` branch of the stat card.
   -------------------------------------------------------------------------- */
/* `file:///C:/…` — three slashes, forward slashes. A Windows path pasted after
   `file://` loses its drive colon semantics and the load fails silently. */
const fileUrl = (p) => `file:///${p.replace(/\\/g, '/')}`;

const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>harness — categories</title>
<link rel="stylesheet" href="${fileUrl(tokens)}">
<link rel="stylesheet" href="${fileUrl(appCss)}">
<link rel="stylesheet" href="${fileUrl(medicines)}">
<link rel="stylesheet" href="${fileUrl(categories)}">
<style>
  /* Neutralise the pieces that depend on Blade's own JS/nav, so only the
     page shell geometry is being compared. */
  body { margin: 0; }
  .main-content { padding: 28px; width: 1240px; box-sizing: border-box; }
</style>
</head>
<body>
<main class="main-content">
  <div class="animated-page" id="root">
    <div class="top-header-bar">
      <div class="header-title-section">
        <h1>إدارة الأقسام</h1>
        <p>تنظيم كتالوج وزارة الصحة والأدوية المحلية ضمن أقسام واضحة</p>
      </div>
      <div class="header-actions">
        <button type="submit" class="btn-sync-catalog">فلاتر الأعراض</button>
        <button type="submit" class="btn-sync-catalog">مزامنة الكتالوج</button>
        <a href="#" class="btn-add-pharmacy hover-shimmer">إضافة قسم</a>
      </div>
    </div>

    <div class="breadcrumb-trail">
      <a href="#">الرئيسية</a>
      <span>‹</span>
      <span>الأقسام</span>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><span class="stat-title">إجمالي الأقسام</span><span class="stat-value total">42</span></div>
      <div class="stat-card"><span class="stat-title">أقسام مفعّلة</span><span class="stat-value available">39</span></div>
      <div class="stat-card"><span class="stat-title">روابط الأدوية</span><span class="stat-value low">18330</span></div>
      <a href="#" class="stat-card stat-card-link stat-card-danger">
        <span class="stat-title">بانتظار المراجعة</span>
        <span class="stat-value danger">17</span>
      </a>
    </div>

    <div class="filter-card">
      <div class="filter-row">
        <input type="text" value="" placeholder="ابحث بالاسم العربي أو الإنجليزي..." class="filter-input">
      </div>
    </div>

    <div class="main-card">
      <div class="card-top-bar">
        <h3>إدارة الأقسام</h3>
        <span>42</span>
      </div>
      <table class="custom-table">
        <thead>
          <tr>
            <th>القسم</th><th>الحالة</th><th>الترتيب</th><th>عدد الأدوية</th>
            <th>قيد المراجعة</th><th style="text-align:center;">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          <tr id="row-a">
            <td>
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="pill-icon-wrapper icon-cyan">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </div>
                <div>
                  <strong>مسكنات الألم</strong><br>
                  <small style="color:#94a3b8;font-size:11px;">Painkillers • painkillers</small>
                  <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
                    <span style="font-size:10px;background:var(--field-bg,#F1F5F9);color:#64748b;border-radius:6px;padding:2px 6px;">باراسيتامول</span>
                    <span style="font-size:10px;background:var(--field-bg,#F1F5F9);color:#64748b;border-radius:6px;padding:2px 6px;">إيبوبروفين</span>
                  </div>
                </div>
              </div>
            </td>
            <td><button type="submit" class="pill-badge status-badge available" style="border:none;cursor:pointer;font-family:inherit;">● مفعّل</button></td>
            <td>1</td>
            <td><strong style="color:#1C72A6;">1250</strong></td>
            <td><a href="#" class="pill-badge status-badge out" style="text-decoration:none;border:none;cursor:pointer;font-family:inherit;">● 12</a></td>
            <td>
              <div class="action-btn-group">
                <a href="#" class="action-btn" style="color:#1C72A6;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
                <a href="#" class="action-btn edit"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></a>
                <button type="submit" class="action-btn delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
              </div>
            </td>
          </tr>
          <tr id="row-b">
            <td>
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="pill-icon-wrapper icon-cyan">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </div>
                <div>
                  <strong>فيتامينات</strong><br>
                  <small style="color:#94a3b8;font-size:11px;">Vitamins • vitamins</small>
                </div>
              </div>
            </td>
            <td><button type="submit" class="pill-badge status-badge out" style="border:none;cursor:pointer;font-family:inherit;">● معطّل</button></td>
            <td>7</td>
            <td><strong style="color:#1C72A6;">88</strong></td>
            <td><span style="color:#94a3b8;font-size:13px;">—</span></td>
            <td>
              <div class="action-btn-group">
                <a href="#" class="action-btn" style="color:#1C72A6;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></a>
                <a href="#" class="action-btn edit"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></a>
                <button type="submit" class="action-btn delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="pagination-wrapper"></div>
    </div>
  </div>
</main>
</body>
</html>`;

writeFileSync(OUT, html);
console.log('\nharness written:', OUT);
