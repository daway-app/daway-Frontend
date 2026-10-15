/**
 * Theme store — LIGHT ONLY (طلب عبود: الوضع الفاتح هو الافتراضي الوحيد،
 * بلا دارك).
 *
 * تاريخ مختصر: كان التطبيق يتبع Blade (زر تبديل + حفظ `theme` في
 * localStorage + اتباع نظام التشغيل). أُلغي كل ذلك — الدارك مود لم يعد
 * متاحًا من أي مكان في الواجهة.
 *
 * ما تبقى هنا هو الحد الأدنى اللازم للانتقال النظيف:
 *   · `initTheme()` تزيل صنف `.dark-mode` عن <body> و<html> (لو علق من
 *     نسخة قديمة) وتمسح مفتاح `theme` المخزن، فيرجع أي مستخدم قديم
 *     كان على الدارك إلى الفاتح تلقائيًا من أول تحميل.
 *   · تُبث حدث `daway:theme-changed` (بتفصيل `light` دائمًا) لأن مخططات
 *     `Chart.tsx` مشتركة عليه لإعادة رسم الألوان — بلا هذا البث تبقى
 *     المخططات بألوان أول رسم فقط.
 *
 * قواعد `.dark-mode` في ملفات CSS بقيت خامدة (لا تُطبق أبدًا) — إزالتها
 * من عشرات الملفات مخاطرة بلا مقابل، والصنف لا يُضاف من أي مسار الآن.
 */

export type Theme = 'light';

const THEME_KEY = 'theme';

function applyLight(): void {
  document.body.classList.remove('dark-mode');
  document.documentElement.classList.remove('dark-mode');
  try {
    localStorage.removeItem(THEME_KEY);
  } catch {
    /* storage unavailable — nothing stored, nothing to clear */
  }
  window.dispatchEvent(new CustomEvent('daway:theme-changed', { detail: 'light' }));
}

/** Apply the single light theme on boot — called once per shell mount. */
export function initTheme(): Theme {
  applyLight();
  return 'light';
}
