---
title: "الواجهة وما تعرضه للمستخدم"
category: "Mail Collector"
overview: "public يحتوي HTML و CSS و JavaScript عاديًا، وليس React أو Next أو MUI. Express يخدمه من نفس origin. كل صفحة تحمل helpers مشتركة: Api للطلبات و Auth للـ localStorage و Modal للحوارات و UI للمظهر. ملف CSS المستخدم styles.css؛ style.css القديم غير المستدعى أزيل."
---

# الواجهة وما تعرضه للمستخدم

[English](../en/07-frontend.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. تطبيق ملفات ثابتة

public يحتوي HTML و CSS و JavaScript عاديًا، وليس React أو Next أو MUI. Express يخدمه من نفس origin. كل صفحة تحمل helpers مشتركة: Api للطلبات و Auth للـ localStorage و Modal للحوارات و UI للمظهر. ملف CSS المستخدم styles.css؛ style.css القديم غير المستدعى أزيل.

| الصفحة | JavaScript | العمل الحالي |
|---|---|---|
| / | [login.js](../../../public/js/login.js) | إرسال email/password وحفظ token/user ثم الانتقال للوحة |
| /dashboard | [dashboard.js](../../../public/js/dashboard.js) | إحصائيات الحسابات والعدادات وآخر 5 سجلات |
| /accounts | [accounts.js](../../../public/js/accounts.js) | بحث/filter/pagination، Connect، toggle وحذف |
| /logs | [logs.js](../../../public/js/logs.js) | تحميل /logs مع page/limit وتبديل شكل الجدول |
| /settings | [settings.js](../../../public/js/settings.js) | عنوان التنبيه، اختبار Graph، وكلمة مرور الإدارة |
| /oauth/callback و/oauth-callback | [oauth-callback.js](../../../public/js/oauth-callback.js) | حالات loading/success/error بعد redirect |

## 2. الجلسة والطلبات

[Auth](../../../public/js/auth.js) يعتبر وجود token و user مؤشر تسجيل دخول محلي، لا يتحقق من التوقيع في المتصفح. التحقق الفعلي على السيرفر. [Api](../../../public/js/api.js) يضيف Bearer ويحوّل الرد إلى JSON. عند 401 يمسح الجلسة وينقل إلى /. الطلبات لا تحمل Microsoft tokens.

Connect يطلب رابطًا جديدًا ويغيّر window.location.href. صفحة النجاح تقرأ success/email من query. فرع قديم يستقبل code ويحاول POST /accounts/oauth/callback ما زال في الملف، لكن ذلك endpoint غير مسجل؛ المسار المدعوم هو callback الباك إند ثم redirect بنتيجة. لم يتم تفعيل الفرع القديم أو إنشاء endpoint له أثناء التنظيم.

## 3. مؤشرات قد تبدو أوسع من حقيقتها

CONNECTED في جدول الحسابات ليس اختبار subscription أو وصول الرسالة إلى PHP. ملخص القائمة يعتمد على النتائج المعروضة. Toggle يغير isEnabled، ولا يلغي اشتراك Graph. الحذف يحذف الحساب وعلاقاته ذات Cascade، ولا ينظف subscription الذي بلا foreign key.

شاشة logs تستخدم /logs في وضعي messages/system مع تغيير أعمدة العرض؛ البيانات الحالية من MailMessageLog، وليست SystemLog منفصلة. شاشة settings تسمي الاختبار forward، لكنه يفحص Graph Inbox فقط. loadWorkerStatus موجودة لكن استدعاؤها في DOMContentLoaded معلّق. عنوان forwardToEmail يخص إشعارات SMTP ولا يحدد API الوجهة.

## 4. التحميل والأخطاء

الصفحات تستخدم Modal.loading ثم تغلقه عند النجاح أوالفشل. accounts يعرض حالة فارغة ورسالة عند فشل التحميل. التحقق الأمامي لكلمة المرور الجديدة يقبل 6 أحرف بينما الباك إند يشترط 8؛ هذا اختلاف قد يظهر للمستخدم ولم يتم إصلاحه. بعض catch في settings يشير إلى عناصر عرض قديمة، و Api يعتمد message بينما error middleware يستخدم error. هذه ملاحظات توافق مهمة عند قراءة الواجهة، وليست تغييرات مطلوبة في هذا الشرح.

لأي تعديل UI لاحق، افحص العنصر ومعالج event و endpoint وعقد الرد معًا. لا تعتبر حذف function غير مرتبطة إذنًا بحذف endpoint مكشوف قد يستعمله عميل آخر.

## للتعمق

**اسم الموضوع:** Browser fetch and application sessions

**ابحث عن:** Browser fetch and application sessions official documentation

**مصادر موثوقة:** [Official reference](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

[السابق](06-api-reference.md) · [التالي](08-configuration-operations.md) · [الفهرس](00-overview.md)
