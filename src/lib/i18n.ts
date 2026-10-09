/**
 * UI strings — extracted VERBATIM from the Laravel language files.
 *
 * Sources:
 *   daway-backend/resources/lang/ar/layout.php
 *   daway-backend/resources/lang/ar/pharmacy.php
 *   daway-backend/resources/lang/ar/topbar.php
 *   daway-backend/resources/lang/ar/users.php
 *   daway-backend/resources/lang/ar/accounting.php
 *
 * Only Arabic is carried here for now (the Blade app defaults to `ar`).
 * The backend remains the source of truth — do not reword any string.
 */

export const AR = {
  layout: {
    app_title: 'دواك',
    app_subtitle: 'الصحة، في مكان واحد',
    main_section: 'الرئيسية',
    dashboard: 'لوحة التحكم',
    management_section: 'الإدارة',
    settings_section: 'الإعدادات',
    system_settings: 'إعدادات النظام',
    my_profile: 'الملف الشخصي',
    edit_profile_modal_title: 'تعديل الملف الشخصي',
    profile_saved: 'تم حفظ التغييرات بنجاح',
    profile_save_error: 'تعذر حفظ التغييرات، حاول مرة أخرى',
    switch_language_tooltip: 'تبديل اللغة',
    dark_mode_tooltip: 'تبديل الوضع الداكن',
    notifications_tooltip: 'الإشعارات',
    logout_tooltip: 'تسجيل الخروج',
    change_picture_button: 'تغيير الصورة',
    full_name_label: 'الاسم الكامل',
    job_title_label: 'المسمى الوظيفي',
    cancel_button: 'إلغاء',
    confirm_picture_button: 'استخدام هذه الصورة',
    picture_preview_title: 'معاينة الصورة',
    crop_hint: 'اسحب الصورة لتحديد مكان الوجه، واستخدم عجلة الفأرة أو الأزرار للتكبير',
    save_changes_button: 'حفظ التغييرات',
    logging_out_message: 'جاري تسجيل الخروج...',
    logout_confirm_title: 'تسجيل الخروج',
    logout_confirm_message: 'هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟',
    logout_confirm_yes: 'تسجيل الخروج',
    notifications_title: 'التنبيهات',
    mark_all_as_read: 'تحديد الكل كمقروء',
    view_all_notifications: 'عرض كل التنبيهات',
    loading_notifications: 'جاري تحميل التنبيهات...',
    error_loading_notifications: 'لا يوجد لديك إشعارات جديدة.',
    no_new_notifications: 'لا توجد إشعارات جديدة',
  },

  topbar: {
    dashboard_title: 'لوحة الإحصائيات',
    dashboard_subtitle: 'نظرة عامة على أداء المنصة',
  },

  /**
   * Command palette (Ctrl+K) — ADDED (not in the Laravel lang files): the Blade
   * app has no command palette, so these strings have no backend counterpart.
   * Kept in the same nesting style as the rest of this object.
   */
  commandPalette: {
    /** Accessible name of the dialog. */
    title: 'لوحة الأوامر',
    /** Tooltip/label for the quiet Topbar trigger. */
    open_tooltip: 'فتح لوحة الأوامر',
    placeholder: 'ابحث عن صفحة أو إجراء…',
    /** Grouping labels shown as secondary text on each option. */
    group_destinations: 'الانتقال',
    group_accounting: 'المحاسبة',
    group_actions: 'إجراءات',
    /** The one action that ships here — a real toggle, no new behaviour. */
    action_toggle_theme: 'تبديل الوضع الداكن',
    search_label: 'بحث في الأوامر',
    empty_title: 'لا توجد نتائج مطابقة',
    empty_hint: 'جرّب كلمة أخرى أو ابحث باسم الصفحة.',
    hint_navigate: 'تنقّل',
    hint_select: 'فتح',
    hint_close: 'إغلاق',
    hint_theme: 'تبديل الوضع',
    results_count: ':count نتيجة',
  },

  pharmacy: {
    sidebar: {
      section_title: 'لوحة تحكم الصيدلية',
      dashboard: 'لوحة التحكم',
      manage_medicines: 'إدارة الأدوية',
      add_medicine: 'إضافة دواء',
      manage_alternatives: 'إدارة البدائل',
      pharmacy_profile: 'ملف الصيدلية',
      ratings: 'التقييمات',
      inventory: 'إدارة المخزون',
      bulk_import: 'استيراد المخزون بالجملة',
      inquiries: 'استفسارات التوفر',
    },
    status: {
      all: 'الكل',
      available: 'متوفر',
      low: 'منخفض',
      low_stock: 'مخزون منخفض',
      out: 'نافد',
      out_unavailable: 'منتهي الصلاحية / غير متوفر',
      unclassified: 'غير مصنف',
    },
    /** `pharmacy.dashboard.*` — dashboard/index.blade.php */
    dashboard: {
      title: 'لوحة تحكم الصيدلية',
      heading: 'لوحة الصيدلية',
      subtitle: 'نظرة عامة على أداء صيدلية :pharmacy',
      /**
       * ADDED (Phase 2): first-run checklist. Only shown to a pharmacy that has
       * not finished setting up, and only while it has unfinished steps — it
       * disappears on its own, and can be dismissed permanently.
       */
      setup: {
        title: 'إعداد الصيدلية',
        account: 'إنشاء الحساب',
        profile: 'إكمال بيانات الصيدلية',
        profile_hint: 'الاسم والهاتف والموقع — ما يراه المريض عند البحث',
        medicine: 'إضافة أول دواء',
        medicine_hint: 'ابدأ بالخطوة التي تجعل صيدليتك تظهر في نتائج البحث',
        invoice: 'إنشاء أول فاتورة',
        invoice_hint: 'سجّل أول عملية بيع من شاشة نقطة البيع',
      },
      update_inventory: 'تحديث المخزون',
      stat_out: 'نافد',
      stat_low: 'مخزون منخفض',
      stat_available: 'متوفر',
      stat_total: 'إجمالي الأدوية',
      chart_inventory_status: 'حالة المخزون',
      chart_inventory_desc: 'عدد الأدوية حسب حالة المخزون',
      chart_availability: 'نسبة التوفر',
      low_stock_title: 'تنبيهات المخزون المنخفض',
      low_stock_desc: 'الأدوية التي وصلت إلى حد المخزون المنخفض',
      no_alerts: 'لا توجد تنبيهات',
      no_alerts_desc: 'جميع الأدوية بكميات آمنة',
      badge_low: 'منخفض',
      col_medicine: 'اسم الدواء',
      col_quantity_left: 'الكمية المتبقية',
      col_status: 'الحالة',
      latest_inquiries: 'آخر استفسارات المرضى',
      latest_inquiries_desc: 'أحدث الاستفسارات الواردة',
      patient_fallback: 'مريض',
      inquiry_q: 'هل يتوفر دواء :medicine؟',
      no_inquiries_yet: 'لا توجد استفسارات بعد',
    },
    /** `pharmacy.inventory.*` — inventory/index.blade.php */
    inventory: {
      heading: 'إدارة المخزون',
      subtitle: 'تحديث كميات الأدوية وحالة التوفر',
      stat_out: 'منتهي الصلاحية / غير متوفر',
      stat_low: 'مخزون منخفض',
      stat_available: 'متوفر',
      chart_status_title: 'حالة المخزون',
      chart_status_desc: 'نسبة الأصناف حسب حالة التوفر',
      center_total: 'إجمالي الأصناف',
      legend_available: 'متوفر',
      legend_low: 'منخفض المخزون',
      legend_out: 'منتهي الصلاحية / غير متوفر',
      trend_title: 'اتجاه المخزون',
      trend_desc: 'إجمالي عدد الأصناف المتوفرة',
      update_title: 'تحديث الكميات',
      col_medicine: 'الدواء',
      col_status: 'الحالة',
      col_current: 'الكمية الحالية',
      col_edit: 'تعديل الكمية',
      status_available: 'متوفر',
      status_low: 'منخفض',
      status_out: 'نافد',
      status_all: 'الكل',
      empty: 'لا توجد أدوية في المخزون',
      no_results: 'لا توجد نتائج تطابق البحث والفلتر.',
      search_placeholder: 'ابحث بالاسم أو المادة الفعالة...',
      clear_filters: 'مسح',
      save_button: 'حفظ التحديثات',
      /**
       * Toast copy for the bulk-save outcome. The success line carries the same
       * `:count` the old inline message rendered (`save_button — updated_count`)
       * — this is the SAME information, moved from an inline span into the
       * transient stack, not new copy.
       */
      toast_saved: 'تم حفظ التحديثات — :count',
      toast_error: 'تعذّر حفظ كميات المخزون',
    },
    /**
     * `pharmacy.toast.*` — shared, action-outcome toast copy.
     *
     * WHY THESE EXIST
     * ---------------
     * A toast announces the RESULT of an action ("saved", "could not save"),
     * which is a different thing from the per-screen labels above it. Kept in
     * one place so two screens reporting the same outcome say the same words,
     * and so a failure can never be silently blank (the invisible-error bug the
     * `Notice` component was created to fix).
     */
    toast: {
      saved: 'تم الحفظ بنجاح',
      save_failed: 'تعذّر الحفظ',
      deleted: 'تم الحذف بنجاح',
      delete_failed: 'تعذّر الحذف',
      /** Prefix used when the server supplied its own localised error message. */
      error_prefix: 'تعذّر إتمام العملية',
    },
    /** `pharmacy.medicines.index.*` — medicines/index.blade.php */
    medicines: {
      index: {
        title: 'إدارة أدوية الصيدلية',
        heading: 'إدارة أدوية صيدلية :pharmacy',
        heading_page: 'إدارة الأدوية',
        subtitle: 'ابحث في كتالوج وزارة الصحة وأضف دواءً لصيدليتك مع تحديد السعر والمخزون.',
        subtitle_page: 'إضافة وتعديل أدوية صيدليتك',
        add_medicine: 'إضافة دواء جديد',
        breadcrumb_dashboard: 'لوحة تحكم الصيدلية',
        breadcrumb_current: 'إدارة الأدوية',
        total_medicines: 'أدوية الصيدلية',
        available_count: 'متوفرة حالياً',
        out_of_stock: 'نفدت من المخزون',
        table_heading: 'قائمة الأدوية',
        total_badge: 'إجمالي :count دواء',
        col_medicine: 'اسم الدواء',
        col_ingredient: 'المادة الفعالة',
        col_price: 'السعر',
        col_quantity: 'الكمية',
        col_status: 'الحالة',
        col_actions: 'الإجراء',
        currency: '₪',
        search_placeholder: 'ابحث باسم الدواء أو المادة الفعالة...',
        empty: 'لا توجد أدوية في صيدليتك حالياً. اضغط "إضافة دواء جديد" للبدء.',
        empty_title: 'لا توجد أدوية',
        empty_desc: 'ابدأ بإضافة دواء جديد',
        delete_confirm: 'هل أنت متأكد من حذف هذا الدواء؟',
        edit_tooltip: 'تعديل',
        delete_tooltip: 'حذف',
        /**
         * ADDED. The delete button called `window.confirm()` and then did
         * nothing — there is no delete endpoint. This replaces a fake
         * confirmation with the truth, and the button is disabled.
         */
        delete_unavailable: 'حذف الدواء غير متاح بعد',
      },
      request: {
        title: 'طلب دواء جديد',
        heading: 'طلب دواء جديد لصيدلية :pharmacy',
        subtitle:
          'إن لم تجد الدواء في الكتالوج، أرسل طلبا لإدارة الموقع لتضافه واعتماده. سيُضاف لمخزونك فور موافقة الإدارة.',
        trade_name: 'اسم الدواء التجاري (بالإنجليزية)',
        trade_name_ar: 'الاسم العربي (اختياري)',
        generic_name: 'الاسم العلمي (اختياري)',
        manufacturer: 'الشركة المصنعة (اختياري)',
        active_ingredient: 'المادة الفعالة (اختياري)',
        dosage_form: 'الشكل الدوائي (اختياري)',
        barcode: 'الباركود (اختياري)',
        barcode_filled: 'أُدخل الباركود من المسح — راجعه قبل الإرسال.',
        official_price: 'السعر الرسمي (اختياري)',
        category: 'القسم',
        subcategory: 'القسم الفرعي',
        submit: 'إرسال الطلب للمراجعة',
        cancel: 'إلغاء',
      },
    },

    /** `pharmacy.inquiries.*` — resources/lang/ar/pharmacy.php */
    inquiries: {
      title: 'استفسارات التوفر',
      heading: 'استفسارات المرضى',
      subtitle: 'متابعة استفسارات توفر الأدوية',
      stat_closed: 'مغلقة',
      stat_answered: 'تم الرد',
      stat_new: 'جديدة',
      filter_all: 'الكل',
      filter_closed: 'مغلقة',
      filter_answered: 'تم الرد',
      filter_new: 'جديدة',
      search_placeholder: 'ابحث باسم المريض أو الدواء أو نص الاستفسار...',
      col_patient: 'المريض',
      col_medicine: 'الدواء',
      col_inquiry: 'الاستفسار',
      col_date: 'التاريخ',
      col_status: 'الحالة',
      col_action: 'الإجراء',
      status_new: 'جديدة',
      status_answered: 'تم الرد',
      status_closed: 'مغلقة',
      patient_fallback: 'مريض',
      medicine_fallback: 'دواء غير محدد',
      message_fallback: 'هل يتوفر هذا الدواء؟',
      answer_button: 'تم الرد',
      close_button: 'إغلاق',
      empty: 'لا توجد استفسارات',
      /**
       * ADDED: this screen changed an inquiry's status with no confirmation at
       * all. `:status` is filled with the label the user just picked.
       */
      status_saved: 'تم تحديث حالة الاستفسار إلى «:status»',
      /** Shown when the optimistic update is reverted, so the revert is explained. */
      status_failed: 'تعذّر تحديث الحالة — أُعيدت القيمة السابقة.',
      open_chat: 'المحادثة',
      chat_title: 'المحادثة',
      chat_subtitle: 'عرض الرسائل والرد على المريض',
      back_to_inquiries: 'العودة إلى الاستفسارات',
      chat_no_messages: 'لا توجد رسائل بعد',
      chat_send_placeholder: 'اكتب ردّك هنا...',
      /**
       * ADDED (not in the Laravel lang files): the Blade chat auto-polls every
       * 4s, so it never needed a refresh control. The SPA does not poll (the
       * backend's ~4s TTFB would make a 4s poll self-saturating), so it exposes
       * a manual refresh instead.
       */
      refresh: 'تحديث',
      msg_read: 'تمت القراءة',
      attach_photo: 'إرفاق صورة',
      media_required: 'يجب إرسال رسالة نصية أو صورة واحدة على الأقل.',
      patient_phone: 'هاتف المريض',
    },

    /** `pharmacy.alternatives.*` — resources/lang/ar/pharmacy.php */
    alternatives: {
      index: {
        title: 'إدارة بدائل الأدوية',
        heading: 'إدارة بدائل الأدوية لصيدلية :pharmacy',
        heading_page: 'إدارة البدائل',
        subtitle: 'ربط الأدوية ببدائل لها نفس المادة الفعالة',
        add_button: 'إضافة بديل جديد',
        card_title: 'قائمة الأدوية وبدائلها',
        stat_defined: 'بدائل محددة',
        stat_need: 'أدوية تحتاج بديلاً',
        search_placeholder: 'ابحث عن دواء أو مادة فعالة...',
        badge_unavailable: 'دواء غير متوفر حالياً',
        badge_in_stock: 'متوفر في المخزون',
        badge_not_in_stock: 'غير متوفر في المخزون',
        detail_ingredient: 'المادة الفعالة',
        detail_quantity: 'الكمية المتوفرة',
        detail_updated: 'آخر تحديث',
        no_alternative_notice:
          'لم يتم تحديد بديل لهذا الدواء بعد. اختر بديلاً من القائمة المجاورة.',
        col_medicine: 'اسم الدواء',
        col_ingredient: 'المادة الفعالة',
        col_quantity: 'الكمية المتوفرة',
        col_actions: 'الإجراء',
        available: 'متوفر',
        no_alternatives: 'لا توجد بدائل',
        selected: 'تم اختياره',
        choose_alternative: 'اختيار البديل',
        no_candidates: 'لا توجد بدائل بنفس المادة الفعالة',
        footer_note: 'جميع البدائل المعروضة تتشارك نفس المادة الفعالة.',
        empty: 'لا توجد أدوية في صيدليتك لإدارة بدائلها.',
        /**
         * ADDED: linking and unlinking an alternative were both completely
         * silent — the row appeared or vanished with no confirmation.
         */
        linked_ok: 'تم ربط الدواء البديل بنجاح',
        unlinked_ok: 'تم فك ربط الدواء البديل',
        empty_medicines: 'لا توجد أدوية',
        no_access: 'ليس لديك صلاحية الوصول لهذه الصفحة.',
        confirm_delete: 'هل تريد حذف البديل؟',
        confirm_delete_title: 'تأكيد حذف البديل',
        cancel_button: 'إلغاء',
        delete_button: 'حذف',
        delete_tooltip: 'حذف البديل',
      },
      create: {
        title: 'إضافة بديل لدواء',
        heading: 'إضافة بديل لدواء في صيدلية :pharmacy',
        card_title: 'ربط دواء ببديل',
        base_label: 'اختر الدواء الأساسي:',
        base_placeholder: '-- اختر دواء من مخزون صيدليتك --',
        alternative_label: 'اختر الدواء البديل:',
        alternative_placeholder: '-- اختر دواء بديلاً من القائمة العامة --',
        add_button: 'إضافة البديل',
        cancel_button: 'إلغاء',
      },
    },

    /** `pharmacy.ratings.*` — resources/lang/ar/pharmacy.php */
    ratings: {
      title: 'تقييمات وملاحظات الصيدلية',
      heading: 'تقييمات وملاحظات صيدلية :pharmacy',
      heading_page: 'التقييمات والملاحظات',
      subtitle: 'آراء المرضى حول صيدلية :pharmacy',
      avg_label: 'متوسط التقييم: :avg / 5',
      out_of: 'من 5',
      ratings_count: ':count تقييماً',
      distribution_title: 'توزيع التقييمات',
      star: 'نجمة',
      stars: 'نجوم',
      trend_title: 'متوسط التقييم خلال آخر 6 أشهر',
      latest_title: 'آخر التقييمات',
      anonymous_user: 'مستخدم مجهول',
      patient_fallback: 'مريض',
      empty: 'لا توجد تقييمات لهذه الصيدلية حالياً.',
      empty_comments: 'لا توجد تعليقات بعد',
    },

    /** `pharmacy.profile.*` — resources/lang/ar/pharmacy.php */
    profile: {
      title: 'تعديل ملف الصيدلية',
      heading: 'تعديل ملف صيدلية :pharmacy',
      heading_page: 'الملف الشخصي',
      subtitle: 'إدارة بيانات صيدلية :pharmacy',
      card_title: 'بيانات الصيدلية',
      location_title: 'موقع الصيدلية',
      latitude_label: 'خط العرض',
      longitude_label: 'خط الطول',
      map_hint: 'انقر على الخريطة أو حرّك الدبوس لتحديد الموقع',
      map_display_hint: 'الموقع الحالي للصيدلية على الخريطة',
      hours_title: 'ساعات العمل',
      closed: 'مغلق',
      edit_hours: 'تعديل ساعات العمل',
      from: 'من',
      to: 'إلى',
      tagline: 'تعتني بصحتك لحياة أفضل',
      name_label: 'اسم الصيدلية',
      email_label: 'البريد الإلكتروني',
      phone_label: 'رقم الهاتف',
      address_label: 'العنوان',
      logo_label: 'شعار الصيدلية',
      logo_change: 'تغيير الشعار',
      choose_image: 'اختيار صورة',
      location_change: 'تعديل الموقع',
      hours_change: 'تعديل الساعات',
      save_button: 'حفظ التغييرات',
      cancel_button: 'إلغاء',
      update_button: 'تحديث الملف الشخصي',
      success: 'تم تحديث بيانات الصيدلية بنجاح.',
      done: 'تم',
      password_change: {
        title: 'تغيير كلمة المرور',
        hint: 'اختياري — املأ الحقول فقط إذا أردت تغيير كلمة المرور.',
        current_password: 'كلمة المرور الحالية',
        new_password: 'كلمة المرور الجديدة',
        confirm_password: 'تأكيد كلمة المرور الجديدة',
        password_hint: '8 أحرف على الأقل',
        wrong_current: 'كلمة المرور الحالية غير صحيحة.',
        /**
         * ADDED: the success path used `window.alert` + an immediate redirect,
         * so the user could never read the message. It is a blocking modal now.
         */
        changed_title: 'تم تغيير كلمة المرور',
        changed_body: 'لأسباب أمنية أُنهيت جميع الجلسات. يرجى تسجيل الدخول من جديد.',
        relogin: 'تسجيل الدخول مرة أخرى',
      },
      hours_quick: {
        unified: 'دوام موحد 9-5',
        uniform: 'دوام موحد',
        h24: '24 ساعة',
        friday_off: 'إجازة الجمعة',
        clear: 'مسح الكل',
        copy: 'نسخ',
        copy_title: 'نسخ هذا اليوم لكل الأيام',
        closed: 'مغلق',
        closed_title: 'إغلاق هذا اليوم',
        apply_all: 'تطبيق على كل الأيام',
        open_24: 'مفتوح 24 ساعة',
        exception: 'استثناء',
        no_exception: 'لا يوجد',
      },
      complete: {
        title: 'إكمال بيانات الصيدلية',
        heading: 'أكمل بيانات صيدليتك',
        subtitle: 'أهلاً :pharmacy، يجب إكمال هذه البيانات قبل البدء.',
        region_label: 'المنطقة / الحي',
        location_default_hint: 'انقر على الخريطة أو اسحب الدبوس لتحديد موقع صيدليتك بالضبط.',
        logo_label: 'شعار الصيدلية',
        logo_hint:
          'اختياري — صورة مربعة (JPG/PNG/WebP حتى 2MB). تظهر في نتائج البحث وبروفايل الصيدلية.',
        email_hint: 'اختياري — يُستخدم لتنبيهات النظام فقط.',
        password_section: 'تغيير كلمة المرور',
        new_password: 'كلمة المرور الجديدة',
        password_hint: '8 أحرف على الأقل',
        password_optional_hint:
          'اختياري — اتركها فارغة إذا أردت الإبقاء على كلمة مرورك الحالية.',
        password_optional_placeholder: 'اتركها فارغة للإبقاء على الحالية',
        confirm_password: 'تأكيد كلمة المرور الجديدة',
        save_button: 'حفظ والبدء',
        required_message: 'يجب إكمال بيانات الصيدلية قبل المتابعة.',
        hours_required: 'يجب تحديد مواعيد عمل يوم واحد على الأقل.',
        success: 'تم إكمال بيانات الصيدلية بنجاح.',
      },
      /** Blade `$daysOfWeek` — keys match the backend's English day keys. */
      days: {
        Sunday: 'الأحد',
        Monday: 'الاثنين',
        Tuesday: 'الثلاثاء',
        Wednesday: 'الأربعاء',
        Thursday: 'الخميس',
        Friday: 'الجمعة',
        Saturday: 'السبت',
      },
    },

    /** `pharmacy.password.*` — resources/lang/ar/pharmacy.php */
    password: {
      change: {
        title: 'تغيير كلمة المرور',
        heading: 'عيّن كلمة مرور جديدة',
        subtitle:
          'كلمة المرور الحالية مؤقتة سلّمها لك مدير النظام. لأمان حسابك، يجب تغييرها قبل المتابعة.',
        required_message: 'يجب تغيير كلمة المرور المؤقتة قبل استخدام اللوحة.',
        current_label: 'كلمة المرور الحالية (المؤقتة)',
        new_label: 'كلمة المرور الجديدة',
        confirm_label: 'تأكيد كلمة المرور الجديدة',
        rules: '8 أحرف على الأقل، وتشمل حروفاً وأرقاماً.',
        show: 'إظهار',
        hide: 'إخفاء',
        show_password: 'إظهار كلمة المرور',
        submit: 'حفظ كلمة المرور والمتابعة',
        logout_instead: 'تسجيل الخروج بدلاً من ذلك',
        hero_tag: 'حماية الحساب',
        hero_title: 'خطوة أمان واحدة',
        hero_desc:
          'كلمة مرور قوية تحمي مخزون صيدليتك وبياناتك. أنشئها الآن وستُستخدم عند كل دخول.',
        success: 'تم تغيير كلمة المرور بنجاح.',
        current_required: 'أدخل كلمة المرور الحالية.',
        current_wrong: 'كلمة المرور الحالية غير صحيحة.',
        new_required: 'أدخل كلمة المرور الجديدة.',
        mismatch: 'كلمتا المرور غير متطابقتين.',
        too_short: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.',
        same_as_current: 'كلمة المرور الجديدة يجب أن تختلف عن المؤقتة الحالية.',
      },
    },

    currency: '₪',
  },

  /**
   * `accounting.*` — resources/lang/ar/accounting.php, ported verbatim.
   *
   * Ported in full (not just the barcode/scanner subset) because the nine
   * accounting screens are now implemented; every key below is consumed by a
   * real page, so partial porting would only re-introduce raw key leakage.
   */
  accounting: {
    sidebar: {
      section_title: 'المحاسبة',
      overview: 'نظرة عامة',
      sales: 'المبيعات',
      purchases: 'المشتريات',
      expenses: 'المصروفات',
      suppliers: 'الموردون',
      customers: 'العملاء',
      cash_register: 'الصندوق',
      refunds: 'الإرجاعات',
      payments: 'المدفوعات',
      profit_loss: 'الأرباح والخسائر',
      daily_closing: 'الإغلاق اليومي',
      reports: 'التقارير',
      settings: 'الإعدادات',
      soon: 'قريبًا',
    },

    common: {
      currency: '₪',
      search: 'بحث',
      clear_filters: 'مسح الفلاتر',
      all: 'الكل',
      date: 'التاريخ',
      type: 'النوع',
      reference: 'المرجع',
      description: 'الوصف',
      amount: 'المبلغ',
      payment_method: 'طريقة الدفع',
      status: 'الحالة',
      actions: 'الإجراءات',
      view: 'عرض',
      print: 'طباعة',
      export: 'تصدير',
      refund: 'إرجاع',
      record_payment: 'تسجيل دفعة',
      save: 'حفظ',
      cancel: 'إلغاء',
      close: 'إغلاق',
      apply: 'تطبيق',
      from: 'من',
      to: 'إلى',
      total: 'الإجمالي',
      subtotal: 'المجموع الفرعي',
      discount: 'الخصم',
      paid: 'المدفوع',
      remaining: 'المتبقي',
      quantity: 'الكمية',
      qty: 'الكمية',
      price: 'السعر',
      unit_price: 'سعر الوحدة',
      medicine: 'الدواء',
      barcode: 'الباركود',
      remove: 'إزالة',
      today: 'اليوم',
      last_7_days: 'آخر 7 أيام',
      last_30_days: 'آخر 30 يومًا',
      this_month: 'هذا الشهر',
      results_count: ':count نتيجة',
      /**
       * From `resources/lang/ar/pagination.php`, used by
       * `partials/pagination.blade.php` (the Blade sales page's paginator).
       */
      previous: 'السابق',
      next: 'التالي',
      mock_notice: 'بيانات تجريبية — الواجهة جاهزة للربط بالـAPI',
      /**
       * ADDED (not in the Laravel lang files): the Blade POS redirects to the
       * sales list after saving, so it never showed an in-page confirmation. The
       * SPA keeps the till on screen and needs one.
       */
      saved: 'تم حفظ الفاتورة',
      back: 'رجوع',
      summary: 'الملخّص',
      direction: 'الاتجاه',
      user: 'المستخدم',
      refunded: 'المُرجَع',
      refundable: 'القابل للإرجاع',
      select_items: 'اختر الأصناف',
      processing: 'جارٍ المعالجة…',
      confirm_refund: 'تأكيد الإرجاع',
      refund_forbidden: 'لا يمكن إرجاع فاتورة ملغاة أو مُرجَعة بالكامل',
    },

    payment_methods: {
      cash: 'نقدًا',
      bank_transfer: 'حوالة بنكية',
      card: 'بطاقة',
      credit: 'آجل',
      other: 'أخرى',
    },

    payment_types: {
      sale: 'مبيعات',
      purchase: 'مشتريات',
      expense: 'مصروفات',
      deposit: 'إيداع',
      withdrawal: 'سحب',
      customer_payment: 'دفعة عميل',
      supplier_payment: 'دفعة مورد',
      adjustment: 'تسوية',
      refund: 'إرجاع',
      type: 'النوع',
    },

    statuses: {
      paid: 'مدفوع',
      partially_paid: 'مدفوع جزئيًا',
      unpaid: 'غير مدفوع',
      refunded: 'مُرجَع',
      cancelled: 'ملغى',
      open: 'مفتوح',
      closed: 'مغلق',
      overdue: 'متأخر',
    },

    refunds: {
      title: 'الإرجاعات',
      subtitle: 'سجل مرتجعات البيع لهذه الصيدلية',
      reason: 'سبب الإرجاع',
      reason_placeholder: 'اذكر سبب الإرجاع (اختياري)',
      confirm: 'هل أنت متأكد من تنفيذ الإرجاع؟ لا يمكن التراجع عنه.',
      /**
       * ADDED (not in the Laravel lang files): the Blade page always posted and
       * redirected, so it had no in-page success message. The SPA keeps the user
       * on the page, so it needs one.
       */
      created_success: 'تم تنفيذ الإرجاع بنجاح',
      not_found: 'الإرجاع غير موجود',
      empty: 'لا توجد إرجاعات',
      empty_desc: 'ستظهر هنا كل عمليات الإرجاع التي تُنفَّذ على فواتير البيع.',
      col_refund_id: 'رقم الإرجاع',
      col_sale: 'الفاتورة',
      col_date: 'التاريخ',
      col_amount: 'المبلغ',
      col_status: 'الحالة',
      col_reason: 'السبب',
      col_created_by: 'أنشأه',
      status: {
        pending: 'قيد الانتظار',
        completed: 'مكتمل',
        cancelled: 'ملغى',
      },
      show: {
        title: 'تفاصيل الإرجاع',
        refund_number: 'إرجاع :number',
        sale_info: 'بيانات الفاتورة',
        items: 'الأصناف المُرجَعة',
        reason: 'السبب',
        sale_summary: 'ملخّص الفاتورة بعد الإرجاع',
      },
    },

    cash_registers: {
      title: 'الصندوق',
      subtitle: 'كل حركة نقدية داخل الصيدلية — الرصيد مجموعها لا رقم مكتوب يدويًا',
      balance_now: 'الرصيد الحالي',
      incoming: 'وارد',
      outgoing: 'صادر',
      empty: 'لا توجد حركات صندوق',
      empty_desc: 'ستظهر هنا كل الحركات النقدية: مبيعات، مصروفات، دفعات، وتسويات.',
      direction: {
        in: 'وارد',
        out: 'صادر',
      },
      types: {
        sale: 'مبيعات',
        purchase: 'مشتريات',
        expense: 'مصروفات',
        customer_payment: 'دفعة عميل',
        supplier_payment: 'دفعة مورد',
        withdrawal: 'سحب',
        deposit: 'إيداع',
        adjustment: 'تسوية',
        refund: 'إرجاع',
      },
    },

    overview: {
      title: 'نظرة عامة على المحاسبة',
      heading: 'المحاسبة',
      subtitle: 'ملخص مالي لصيدلية :pharmacy',
      kpi_today_sales: 'مبيعات اليوم',
      kpi_today_purchases: 'مشتريات اليوم',
      kpi_today_expenses: 'مصروفات اليوم',
      kpi_today_profit: 'أرباح اليوم',
      kpi_cash_balance: 'رصيد الصندوق',
      kpi_outstanding_debts: 'ديون مستحقة',
      chart_sales_title: 'حركة المبيعات',
      chart_sales_desc: 'إجمالي المبيعات خلال الفترة المختارة',
      chart_expenses_title: 'توزيع المصروفات',
      chart_expenses_desc: 'المصروفات حسب الفئة خلال الشهر الحالي',
      /**
       * ADDED (not in the Laravel lang files): the Blade page renders an empty
       * donut chart when `$expenseBreakdown` is empty, with no message. An
       * explicit empty state is clearer than a blank chart, so this string
       * exists only here. The backend remains the source of truth for every
       * string that DOES exist there.
       */
      no_expenses: 'لا توجد مصروفات مسجّلة',
      recent_transactions: 'آخر الحركات',
      recent_transactions_desc: 'أحدث العمليات المالية المسجّلة',
      alerts_title: 'تنبيهات',
      alerts_desc: 'أمور تحتاج انتباهك',
      alert_supplier_due: 'دفعة مورد مستحقة',
      alert_supplier_due_desc: 'مستحق لـ:supplier بمبلغ :amount',
      alert_customer_overdue: 'دين عميل متأخر',
      alert_customer_overdue_desc: ':customer — متأخر منذ :days يومًا',
      alert_low_cash: 'رصيد الصندوق منخفض',
      alert_low_cash_desc: 'الرصيد الحالي :amount — أقل من الحد الآمن',
      alert_register_unclosed: 'صندوق غير مُغلق',
      alert_register_unclosed_desc: 'الصندوق رقم :register مفتوح منذ :time',
      alert_low_stock: 'مخزون منخفض',
      alert_out_of_stock: 'نفد من المخزون',
      alert_stock_remaining: 'بقي :count وحدة',
      live_refresh_failed: 'تعذّر تحديث الأرقام — المعروض من آخر تحميل للصفحة',
      no_alerts: 'لا توجد تنبيهات',
      no_alerts_desc: 'كل شيء تحت السيطرة',
      no_transactions: 'لا توجد حركات بعد',
      no_transactions_desc: 'ستظهر هنا أول عملية مالية تسجّلها',
      quick_actions: 'إجراءات سريعة',
      new_sale: 'فاتورة بيع جديدة',
      add_expense: 'إضافة مصروف',
      view_reports: 'عرض التقارير',
    },

    sales: {
      title: 'المبيعات',
      heading: 'المبيعات',
      subtitle: 'كل فواتير البيع وقيم التحصيل',
      new_sale: 'فاتورة جديدة',
      search_placeholder: 'ابحث برقم الفاتورة أو اسم العميل...',
      date_range: 'الفترة',
      filter_payment: 'طريقة الدفع',
      filter_status: 'الحالة',
      col_invoice: 'رقم الفاتورة',
      col_date: 'التاريخ',
      col_customer: 'العميل',
      col_items: 'الأصناف',
      col_subtotal: 'المجموع الفرعي',
      col_discount: 'الخصم',
      col_total: 'الإجمالي',
      col_paid: 'المدفوع',
      col_remaining: 'المتبقي',
      col_payment: 'الدفع',
      col_status: 'الحالة',
      col_actions: 'الإجراءات',
      empty: 'لا توجد مبيعات بعد',
      empty_desc: 'ابدأ بأول فاتورة بيع من زر «فاتورة جديدة»',
      no_results: 'لا نتائج مطابقة',
      no_results_desc: 'جرّب تغيير الفلاتر أو كلمة البحث',
      walk_in: 'زائر نقدي',
      items_count: ':count صنف',
    },

    pos: {
      title: 'فاتورة بيع جديدة',
      heading: 'فاتورة بيع جديدة',
      subtitle: 'امسح الباركود أو ابحث عن الدواء ثم أضفه للسلة',
      entry_title: 'شاشة البيع',
      entry_subtitle: 'ابدأ بمسح الباركود أو البحث بالاسم',
      or: 'أو',
      search_by_name: 'ابحث بالاسم',
      barcode_label: 'مسح الباركود',
      barcode_placeholder: 'امسح الباركود هنا أو الصقه ثم Enter...',
      barcode_hint: 'يدعم EAN-13 · EAN-8 · UPC-A · GTIN-14',
      barcode_ready: 'حقل الباركود جاهز للماسح',
      barcode_looking: 'جارٍ البحث عن الدواء...',
      barcode_found: 'تمت إضافة :name',
      barcode_not_found: 'لا يوجد دواء بهذا الباركود',
      barcode_invalid: 'تنسيق باركود غير معروف',
      barcode_not_in_stock: 'الدواء موجود لكن غير مُسجّل في مخزونك',
      barcode_out_of_stock: ':name نافد من المخزون',
      search_label: 'البحث عن دواء',
      search_placeholder: 'اكتب اسم الدواء أو المادة الفعّالة...',
      search_hint: 'اكتب حرفين على الأقل للبحث',
      search_no_results: 'لا يوجد دواء مطابق',
      search_error: 'تعذّر البحث — حاول مرة أخرى',
      search_results: 'نتائج البحث',
      cart_title: 'السلة',
      cart_empty: 'السلة فارغة',
      cart_empty_desc: 'امسح باركود أو ابحث عن دواء لإضافته',
      cart_items: 'أصناف السلة',
      clear_cart: 'إفراغ السلة',
      clear_cart_confirm: 'هل أنت متأكد من إفراغ السلة؟',
      customer_label: 'العميل',
      customer_walk_in: 'زائر نقدي',
      customer_search_placeholder: 'ابحث عن عميل أو اكتب اسمًا...',
      invoice_title: 'الفاتورة',
      invoice_number: 'رقم الفاتورة',
      invoice_number_pending: 'يُولَّد عند الحفظ',
      subtotal: 'المجموع الفرعي',
      discount: 'الخصم',
      tax: 'الضريبة',
      tax_not_supported: 'غير مدعومة في النظام الحالي',
      total: 'الإجمالي',
      paid: 'المدفوع',
      remaining: 'المتبقي',
      payment_method: 'طريقة الدفع',
      complete_sale: 'إتمام البيع',
      processing: 'جارٍ الحفظ...',
      sale_saved: 'تم تسجيل الفاتورة بنجاح',
      sale_no_backend: 'لم تُحفظ الفاتورة: نظام المحاسبة الخلفي غير موجود بعد. الواجهة فقط.',
      sale_failed: 'تعذّر إتمام الفاتورة',
      stock_available: 'متوفر: :qty',
      stock_none: 'غير متوفر',
      not_in_inventory: 'غير مُسجّل بمخزونك',
      out_of_stock_warn: 'الكمية المطلوبة تتجاوز المتوفر (:qty)',
      invalid_qty: 'أدخل كمية صحيحة أكبر من صفر',
      invalid_amount: 'أدخل مبلغًا صحيحًا',
      paid_exceeds_total: 'المدفوع أكبر من الإجمالي',
      lines_required: 'أضف صنفًا واحدًا على الأقل قبل إتمام البيع',
    },

    expenses: {
      title: 'المصروفات',
      heading: 'المصروفات',
      category: {
        salaries: 'رواتب',
        rent: 'إيجار',
        electricity: 'كهرباء',
        water: 'ماء',
        internet: 'إنترنت',
        transport: 'مواصلات',
        maintenance: 'صيانة',
        taxes: 'ضرائب',
        other: 'أخرى',
      },
    },

    invoice: {
      title: 'تفاصيل الفاتورة',
      heading: 'فاتورة :number',
      pharmacy: 'الصيدلية',
      customer: 'العميل',
      item: 'الصنف',
      items: 'الأصناف',
      number: 'رقم الفاتورة',
      payment_history: 'سجل الدفعات',
      created_by: 'أنشأها',
      created_at: 'تاريخ الإنشاء',
      print_ready: 'جاهزة للطباعة',
      download_soon: 'تنزيل PDF غير مدعوم في النظام الحالي',
      not_found: 'الفاتورة غير موجودة',
      no_payments: 'لا توجد دفعات مسجّلة على هذه الفاتورة',
      refunded_status: 'هذه الفاتورة مُرجَعة بالكامل — لا يمكن إرجاعها مرة أخرى',
      items_pending: 'لا توجد بنود مسجّلة لهذه الفاتورة',
      items_pending_desc:
        'عدد الأصناف المسجّل :count — لم تُحفظ بنودها. راجع الفاتورة قبل الاعتماد عليها.',
    },

    barcode: {
      field_label: 'الباركود',
      field_placeholder: 'امسح الباركود أو اكتبه…',
      scan_button: 'مسح الباركود',
      scan_button_lg: 'امسح الباركود',
      manual_button: 'إدخال يدوي',
      scanned_code: 'الباركود الممسوح',
      clear: 'تفريغ',
      search_another: 'ابحث عن دواء آخر',
      not_every_medicine_hint:
        'لا تملك كل الأدوية باركودًا مسجّلًا بعد. لو لم يظهر شيء، اربطه بدواء موجود.',
      codes_count: 'باركود',
      status: {
        unknown: 'غير مرتبط بعد',
        pending: 'بانتظار التوثيق',
        verified: 'موثَّق',
        conflict: 'مرتبط بدواء آخر',
      },
      status_hint: {
        unknown: 'لم يُسجَّل هذا الباركود في القاعدة بعد — يمكنك ربطه بدواء موجود.',
        pending: 'الباركود مسجَّل لكنه لم يُوثَّق. يمكنك البيع به مباشرة.',
        verified: 'الباركود مسجَّل وموثَّق.',
        conflict: 'هذا الباركود مسجَّل لدواء آخر ويحتاج مراجعة قبل الاستخدام.',
      },
      found_title: 'تم التعرّف على الدواء',
      found_add: 'أضف إلى الفاتورة',
      found_added: 'أُضيف إلى الفاتورة',
      looking: 'جارٍ البحث عن الباركود…',
      lookup_failed: 'تعذّر البحث عن الباركود. تحقّق من الاتصال ثم أعد المحاولة.',
      empty_code: 'امسح باركود أو اكتبه أولًا.',
      no_stock_warning: 'هذا الدواء غير متوفّر في مخزونك حاليًا.',
      link_modal_title: 'ربط الباركود بدواء',
      link_modal_sub: 'اختر الدواء الذي ينتمي إليه هذا الباركود.',
      link_note_title: 'هذا الباركود غير مسجَّل بعد',
      link_note_body: 'القاعدة تُبنى تدريجيًا. اربط الباركود بدواء موجود ليُعرَف من المرة القادمة.',
      link_search_label: 'ابحث عن الدواء',
      link_search_placeholder: 'الاسم التجاري عربي أو إنجليزي…',
      link_search_help: 'الاسم العلمي أو التجاري — النتائج من قاعدة الأدوية الحالية.',
      link_search_empty: 'اكتب حرفين على الأقل للبحث.',
      link_no_results: 'لا توجد نتائج مطابقة.',
      link_chosen: 'الدواء المختار:',
      link_change: 'تغيير',
      link_save: 'حفظ الربط',
      link_saved: 'تم حفظ ربط الباركود.',
      link_saved_hint: 'سيُعرَف هذا الباركود في عمليات المسح القادمة.',
      link_need_choice: 'اختر دواءً أولًا.',
      link_unavailable_title: 'الربط غير متاح حاليًا',
      link_unavailable_body:
        'حفظ الروابط يحتاج نقطة خدمة غير مضافة بعد. لا تُسجَّل أي بيانات الآن.',
      conflict_title: 'الباركود مرتبط بدواء آخر',
      conflict_desc: 'هذا الرقم مسجَّل مسبقًا لدواء مختلف. لا يمكن ربط الرقم الواحد بدواءين.',
      conflict_linked_to: 'مسجَّل حاليًا لـ',
      conflict_you_tried: 'تحاول ربطه بـ',
      conflict_note_title: 'ما الذي يحدث الآن؟',
      conflict_note_body:
        'لن نغيّر الربط تلقائيًا. راجع الحالة أولًا — إما أن الباركود خاطئ، أو أن الدواء مكرّر.',
      conflict_review: 'مراجعة',
      coverage_title: 'تغطية الباركود',
      coverage_subtitle: 'كم صنفًا في مخزونك مرتبط بباركود مسجَّل',
      coverage_linked: 'مرتبط بباركود',
      coverage_unlinked: 'بلا باركود',
      coverage_percent: 'نسبة التغطية',
      coverage_mock_notice: 'أرقام توضيحية — تُحسب من مخزونك عند تفعيل نقطة الخدمة.',
      coverage_of: 'من :total صنفًا',
      coverage_all_done: 'كل أصنافك مرتبطة بباركود.',
      activity_title: 'آخر نشاط الباركود',
      activity_subtitle: 'عمليات المسح والربط في هذه الجلسة',
      activity_empty_title: 'لا نشاط بعد',
      activity_empty_desc: 'عمليات المسح والربط التي تجريها ستظهر هنا.',
      inventory_column: 'الباركود',
      inventory_link_action: 'ربط',
      inventory_linked_action: 'إدارة',
      inventory_filter_all: 'الكل',
      inventory_filter_linked: 'مرتبط',
      inventory_filter_unlinked: 'بلا باركود',
      inventory_no_barcode: 'بلا باركود',
      inventory_multiple: ':count باركودات',
      inventory_add_fields: 'بيانات الباركود',
    },

    scanner: {
      button: 'المسح بالهاتف',
      modal_title: 'وصّل هاتفك',
      modal_sub: 'استخدم كاميرا الهاتف لمسح الباركود، وتصل النتيجة هنا مباشرة.',
      step_1: 'افتح تطبيق Daway على هاتفك.',
      step_2: 'امسح رمز الـQR أو أدخل رمز الاقتران.',
      step_3: 'اترك هذه النافذة مفتوحة أثناء المسح.',
      state_idle: 'لا جلسة مسح بعد',
      state_waiting: 'بانتظار الهاتف…',
      state_connecting: 'جارٍ الاتصال…',
      state_connected: 'الهاتف متصل — جاهز للمسح',
      state_scanning: 'وصل باركود، جارٍ البحث…',
      state_received: 'تم استلام الباركود',
      state_disconnected: 'انقطع الاتصال بالهاتف',
      state_expired: 'انتهت صلاحية الجلسة',
      state_error: 'خطأ في الاتصال',
      pairing_code: 'رمز الاقتران',
      pairing_code_hint: 'أدخله في تطبيق الهاتف إن تعذّر مسح الـQR.',
      qr_alt: 'رمز اقتران جلسة المسح',
      qr_caption: 'امسحه بكاميرا الهاتف للاقتران',
      qr_pending: 'سيظهر رمز الـQR عند تفعيل نقطة الاقتران.',
      qr_pending_alt: 'رمز الـQR غير متاح بعد',
      received_label: 'تم استلام الباركود',
      queue_label: 'طابور المسح',
      devices_title: 'أجهزة المسح',
      devices_empty: 'لا جهاز مرتبط بعد.',
      device_active: 'الجهاز النشط',
      disconnect: 'فصل',
      device_request_title: 'جهاز آخر يريد الاتصال',
      device_allow: 'سماح',
      device_reject: 'رفض',
      reconnect: 'إعادة الاتصال',
      new_session: 'جلسة جديدة',
      close_scanner: 'إغلاق الماسح',
      simulate: 'محاكاة مسح',
      no_camera_note:
        'الكاميرا تعمل على الهاتف فقط. هذه النافذة تستقبل رقم الباركود ولا تفتح كاميرا.',
      session_expired_note: 'الـQR القديم لم يعد صالحًا. أنشئ جلسة جديدة للاستمرار.',
      disconnected_note: 'سلتك محفوظة كما هي.',
      mock_title: 'وضع تجريبي',
      mock_body:
        'نقاط خدمة جلسة المسح غير مضافة بعد. ما تراه هنا للعرض فقط ولا يُسجَّل في النظام.',
    },

    nav: {
      breadcrumb_dashboard: 'لوحة الصيدلية',
      breadcrumb_accounting: 'المحاسبة',
    },
  },

  /** `pharmacy_import.*` — resources/lang/ar/pharmacy_import.php */
  pharmacyImport: {
    title: 'استيراد المخزون بالجملة',
    subtitle: 'حدّث مخزون صيدليتك كاملاً من ملف Excel أو CSV واحد، مع مراجعة كل سطر قبل الحفظ.',
    back_to_inventory: 'رجوع إلى المخزون',
    step_download: 'نزّل القالب',
    step_upload: 'ارفع الملف',
    step_review: 'راجع النتائج',
    step_confirm: 'أكّد الاستيراد',
    template_title: 'قالب الملف',
    template_hint: 'استخدم القالب الفارغ للبدء من الصفر، أو نزّل مخزونك الحالي وعدّل عليه.',
    download_empty_template: 'تحميل قالب فارغ',
    download_current_inventory: 'تحميل المخزون الحالي',
    column_guide_title: 'الأعمدة',
    column_guide_hint: 'الأعمدة المعلَّمة بـ (*) إلزامية. أي عمود آخر يُهمل مع تنبيه.',
    col_trade_name: 'الاسم التجاري (إنجليزي)',
    col_trade_name_ar: 'الاسم التجاري (عربي)',
    col_active_ingredient: 'المادة الفعالة',
    col_price: 'السعر',
    col_quantity: 'الكمية',
    col_barcode: 'الباركود',
    col_min_stock: 'حد المخزون المنخفض',
    col_is_available: 'متوفر',
    upload_title: 'رفع الملف',
    upload_hint: 'الصيغ المدعومة: xlsx، xls، csv — بحد أقصى :max ميجابايت و:rows سطر.',
    upload_choose: 'اختر ملفاً',
    upload_submit: 'تحليل الملف',
    upload_processing: 'جاري تحليل الملف… قد يستغرق لحظات.',
    table_title: 'أسطر الملف',
    /** From `resources/lang/ar/pharmacy_import.php` — used for the preview card. */
    summary_title: 'ملخّص المعاينة',
    summary_total: 'إجمالي الأسطر',
    file_name: 'الملف',
    export_status: 'الحالة',
    rate_limit_remaining: 'متبقٍ لك :count من :limit عمليات استيراد خلال الساعة.',
    rate_limit_exhausted:
      'استنفدت حصتك من عمليات الاستيراد. تتجدد تلقائياً بعد :minutes دقيقة — لا حاجة لإعادة تحميل الصفحة.',
  },

  users: {
    role_admin: 'مدير',
    role_pharmacy: 'صيدلية',
    role_patient: 'مريض',
  },
} as const;

/** Map a backend role key to its Arabic label (`users.role_*`). */
export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: AR.users.role_admin,
    pharmacy: AR.users.role_pharmacy,
    patient: AR.users.role_patient,
  };
  return map[role] ?? role;
}

/**
 * Look up a label in one of the `as const` maps above using a key that came
 * from the API.
 *
 * The API sends raw machine keys (`sale`, `cash`, `partially_paid`) while these
 * maps are `as const`, so `AR.accounting.payment_types[tx.type]` does not
 * typecheck — `tx.type` is `string`, and the map has no index signature.
 *
 * An unknown key falls back to the key itself rather than `undefined`, so a new
 * backend enum value shows up as a readable token instead of a blank cell.
 */
export function labelOf(
  map: Record<string, string>,
  key: string | null | undefined,
  fallback = '—',
): string {
  if (!key) return fallback;
  return map[key] ?? key;
}
