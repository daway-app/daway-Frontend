# Daway — Pharmacy Web

لوحة الصيدلي (SPA) لمنصة **دواي** — واجهة الويب اللي بيدير منها الصيدلي مخزونه واستفسارات
المرضى ومحاسبته. تستهلك **Daway API** (مستودع `daway-backend`) ولا تتصل بقاعدة البيانات
مباشرة أبدًا.

- **Stack:** React 19 · TypeScript · Vite · React Router · TanStack Query · CSS خام (بلا Tailwind)
- **اللغة:** عربي أولًا، RTL كامل، خط Tajawal محلي (بلا CDN)

---

## البيئات — ⚠️ اقرأ هذا أولًا

| البيئة | `VITE_API_BASE_URL` |
|---|---|
| محلي | `http://127.0.0.1:8000` |
| **إنتاج** | **`https://daway-backend-zlh2.onrender.com`** |

### 🔴 تحذير: الرابط فيه لاحقة `-zlh2`

```
✅ https://daway-backend-zlh2.onrender.com      ← الصحيح
❌ https://daway-backend.onrender.com            ← يرجّع 404 دائمًا
```

الرابط **بلا اللاحقة** بيرجّع `404` من حافة Render نفسها، **مش من Laravel** — فبيضلّلك
تفكّر إن الخدمة واقعة أو إن المسار غلط، وإنت بتضرب دومين غلط. علامة التمييز:

```
x-render-routing: no-server     ← "ما في سيرفر" (دومين غلط)
x-powered-by: PHP/8.4.26        ← Laravel حقيقي ✓
```

---

## تشغيل محلي

```bash
npm install
cp .env.example .env.local     # اضبط VITE_API_BASE_URL
npm run dev                    # http://127.0.0.1:5173
```

**يحتاج الباك إند شغّال:** `php artisan serve` في مستودع `daway-backend` على المنفذ `8000`.
> ملاحظة: السيرفر المحلي **بيموت بين الجلسات** — لو شفت «تعذّر الاتصال بالخادم»، شغّله من جديد.

---

## الإبقاء على الباك إند صاحي (Render free)

خدمة Render المجانية **بتنام بعد 15 دقيقة خمول**، والـcold start بياخد **~56 ثانية**.
فنضرب نقطة فحص كل 10 دقايق:

```
GET https://daway-backend-zlh2.onrender.com/healthz
```

| الإعداد | القيمة |
|---|---|
| المجدول | cron-job.org |
| التعبير | `*/10 0-2,5-23 * * *` |
| المنطقة | `Asia/Hebron` (نفس توقيت غزة — متطابق طول السنة) |

التعبير بيسكّت الساعتين **3 و 4** عن قصد ⇒ السيرفر بينام من ~03:05 لـ05:00.
**التحقق:** «التنفيذات القادمة» لازم تبيّن قفزة من `02:50` مباشرة لـ`05:00`.

⚠️ **نبضة الـ05:00 رح تسجّل timeout** — لأن الإقلاع 56 ثانية وسقف المهلة 30 ثانية.
الطلب **وصل** وبدأ الإقلاع، فالنبضة نجحت فعليًا. لا تعتمد عليها كمراقبة توفّر.

⚠️ **حد Render:** 750 ساعة/شهر. خدمة واحدة always-on = 730–744 ساعة ⇒ تكفي بالكاد.
**خدمتان always-on تتجاوز الحد وتُوقَفان.**

---

## الأوامر

```bash
npm run dev        # سيرفر التطوير
npm run build      # بناء الإنتاج
npm run test       # vitest
npm run lint       # eslint
npm run typecheck  # tsc
npm run check:css  # حارس الـdead-CSS (ratchet)
```

`check:css` بيفشل لو زاد عدد كلاسات CSS الميتة عن `tools/dead-css-budget.json`.
**الحد ينزل بس — لا يزيد** إلا بتبرير صريح بالكوميت.

> ⚠️ **`tsc -b` بيعطي أخطاء قديمة من الكاش** — ساعات بيشتكي من أسماء معرَّفة فعلًا قبلها
> بسطرين. لو شكّيت بنتيجة، شغّل `npx tsc -b --noEmit --force` قبل ما تصدّقها.
> (`npm run build` بيستعمل `tsc -b` العادي، فممكن يفشل بسبب الكاش مش بسبب كودك.)

---

## قواعد ثابتة

- **الوضع الفاتح لا يُغيَّر بلا سبب** — القيم من `src/styles/tokens.css` (نسخة مرآة من الـBlade).
- **الـBlade هو مرجع التصميم** — أي انحراف عنه يُوثَّق.
- **لا تغيير على عقد الـAPI** (`availability` / `inquiry` / `notifications`) بلا سبب.
- **`ui-system.css` طبقة polish مش نظام تصميم ثانٍ** — `tokens.css` وكلاسات `.ph-*` هي المرجع.

---

## هيكل سريع

```
src/
  api/          ← عميل الـAPI والأنواع (لا منطق أعمال)
  components/   ← ui/ (primitives) · layout/ (Sidebar · Topbar)
  features/     ← شاشة لكل مجلد (pharmacy/*)
  lib/          ← i18n · format · errors
  styles/       ← tokens · base · layout · pages · ui-system
tools/          ← أدوات الفحص البصري وحارس الـCSS
outputs/        ← تقارير المراحل
```
