---
title: "تشغيل محلي كامل برسالة Steam تجريبية"
category: "Mail Collector"
overview: "أمر واحد يشغّل التطبيق وMySQL وRedis وPHP محليًا، ويحاكي ربط Microsoft وتجديد التوكن واستقبال رسالة Steam مع التحقق من الحفظ والتنبيه."
---

# تشغيل محلي كامل برسالة Steam تجريبية

[English](../en/12-local-demo.md)

> هذا وضع LOCAL_SIMULATION. الحساب ورسالة Steam صناعيان. يعمل كود التطبيق وPHP الفعليان، بينما Microsoft وGraph وSMTP الخارجيون مستبدلون بخدمات محلية. يشغّل الكود المحلي بعد الإصلاحات؛ لم تُنشر على الإنتاج.

## 1. ابدأ بأمر واحد

تحتاج Node 24 وDocker Desktop يعمل بحاويات Linux، واعتماديات المشروع مثبتة بواسطة npm ci. أول بناء قد ينزل صورة PHP الرسمية ويثبت mysqli داخلها. من جذر المشروع:

```sh
npm run local
```

الأمر ينشئ حاويات مستقلة باسم مشروع mail-collector-local، ينتظر صحتها، ويطبق المهاجرات الخمس الموجودة على **mail_collector_demo** فقط. ثم يشغّل بديل Microsoft المحلي وعملية HTTP وعامل الصيانة الأصليين، وينفذ سيناريو التحقق تلقائيًا. يظل يعمل بعد النجاح لتفتح اللوحة وتجرب بنفسك.

اللوحة: [http://127.0.0.1:5560](http://127.0.0.1:5560). بيانات المستخدم التجريبي فقط: admin@local.test وكلمة المرور LocalDemo123!. الحساب المرتبط هو steam-demo@outlook.local.test؛ ليس حساب Outlook حقيقيًا.

## 2. ما الذي يعمل فعليًا

| الجزء | التنفيذ المحلي | العنوان |
|---|---|---|
| واجهة/API التطبيق | Express وclasses الحالية | 127.0.0.1:5560 |
| Microsoft OAuth وGraph | محاكي HTTP ببيانات صناعية | 127.0.0.1:5561 |
| Steam receiver | نفس steam_inbound.php مركب read-only داخل PHP 8.3 + mysqli | 127.0.0.1:5562 |
| SMTP | مستقبِل محلي يحفظ EML دون إرسال خارجي | 127.0.0.1:5563 |
| قاعدة Collector | MySQL 8.4، mail_collector_demo | 127.0.0.1:3368 |
| قاعدة استقبال PHP | steam_receiver_demo في نفس حاوية الاختبار | داخل MySQL المحلي |
| Queue | Bull الحقيقي وRedis 7 مستقل | 127.0.0.1:6398 |

تستخدم PHP نسخة محلية صغيرة من includes/functions.php وملف السر لأن باقي موقع Shared Hosting غير موجود في المستودع. جدول IncomingCodes المحلي يعكس الأعمدة التي يستعملها المستقبل الحالي، وليس نسخة من بيانات الموقع. لا يستخدم التشغيل MariaDB المحلية على3306 أوMySQL/Redis الخاصة بمشاريع أخرى.

## 3. السيناريو الذي يُثبت النجاح

1. تسجيل دخول الإدارة عبر API الحقيقي.
2. طلب رابط الربط، والمرور بمحاكي Microsoft ثم callback الحقيقي.
3. التأكد من حالة CONNECTED واشتراك واحد بعد validationToken الحقيقي.
4. التحقق من تخزين التوكن مشفرًا، ثم جعل تاريخ انتهاء **التوكن الصناعي المحلي فقط** قديمًا.
5. إنشاء رسالة Steam صناعية وإرسال webhook إلى التطبيق.
6. قراءة الرسالة عبر Graph المحلي، وتجديد التوكن، واستخراج الاسم والكود وتوقيع الطلب.
7. وصول الطلب إلى PHP الفعلي، والتحقق من وجود صف IncomingCodes الموافق للاسم والكود.
8. حقن رسالة أمان صناعية والتحقق من التقاط تنبيه SMTP في ملف EML.

لا يطبع السكربت نجاح الحفظ لمجرد حصوله على202؛ ينتظر صف قاعدة PHP فعلًا. النتيجة النهائية FLOW_COMPLETE تظهر بعد نجاح الخطوات. هذا يختبر الربط الداخلي والتشفير والصف والطابور، ولا يثبت قبول Microsoft الحقيقي أو صحة إعداد Entra أووصول webhook عبر الإنترنت.

## 4. أوامر التجربة والإيقاف

```sh
npm run local:steam
npm run local:steam -- --username demo_user --code A1B2C
npm run local:steam -- --variant web
npm run local:steam -- --variant guard-body
npm run local:stop
npm run local:smoke
npm run local:verify
```

local:steam يحتاج local شغالًا؛ يرسل رسالة صناعية أخرى ويؤكد الحفظ. اسم المستخدم حروف/أرقام/underscore، والكود خمسة أحرف كبيرة/أرقام. local:stop أوCtrl+C يوقف عمليات Node وحاويات **هذا المشروع فقط** مع إبقاء بيانات التجربة. local:smoke يبدأ من وضع متوقف، ينفذ السيناريو ثم يوقف البيئة تلقائيًا. لا تشغّل local:smoke فوق local شغال؛ رفض المنفذ المشغول يمنع بدء نسختين بالخطأ.

الخيار web يختبر عنوان الويب والموبايل، وguard-body يختبر عنوانًا مختلفًا مع عبارة Steam Guard موزعة بين HTML tags. أمر local:verify يختبر الحالتين حتى الحفظ في PHP الفعلي، ويتحقق من رفض علامة تطابق النص الغائبة أو false أو المكتوبة كنص.

## 5. اللوجات والعزل

المجلد الناتج .local-demo مستثنى منGit، ويحتوي:

| الملف | الاستخدام |
|---|---|
| scenario.log | أحداث JSON مرتبة: OAUTH_CONNECTED وTOKEN_REFRESHED وCODE_SAVED وSMTP_CAPTURED وFLOW_COMPLETE |
| last-run.json | آخر نتيجة كاملة: الحساب والرسالة وصف الحفظ والتحقق من refresh/SMTP |
| server.log وworker.log وservices.log | stdout/stderr للعمليات الثلاث |
| app.log وerror.log | Winston المحلي |
| php-logs/steam_api_requests.log | اللوج الذي يكتبه PHP الحالي |
| smtp/*.eml | رسائل SMTP الصناعية الملتقطة |
| session.json | معرف التشغيل والتحكم المحلي؛ لا تشاركه أثناء التشغيل |

[settings.js](../../../scripts/local-demo/settings.js) يحدد endpoints وقاعدة ومفاتيح صناعية ثابتة؛ [bootstrap.js](../../../scripts/local-demo/bootstrap.js) يحمّلها في child processes فقط ويمنع تحميل .env و.env.test. إعدادات Microsoft تُوجّه إلى127.0.0.1 قبل استيراد services. ملف compose.env الفارغ يمنع Compose من التقاط .env الإنتاج تلقائيًا. Docker يستخدم default context محليًا ويرفض endpoint بعيدًا عند البدء. كل المنافذ المنشورة مربوطة بـ127.0.0.1.

## 6. الأعطال وحدود المحاكي

إذا Docker غير شغال، افتح Docker Desktop وانتظر جاهزيته. إن كان المنفذ مشغولًا، أوقف التشغيل السابق أوالعملية المالكة؛ السكربت لا يقتل برنامجًا آخر ليستحوذ عليه. لا يغير السكربت كلمات مرور volumes موجودة؛ بيانات الحاويات تبقى بين التشغيلات. عند فشل السيناريو يوقف الموارد التي بدأها ويحفظ اللوج بدل الادعاء بالنجاح.

المحاكي يغطي OAuth و/me وقراءة الرسائل والاشتراكات واختبارInbox؛ لا يحاكي delta كاملة أوسياسات أمان Microsoft. local:verify يضيف503 قبل الحفظ وضياع رد النجاح بعد الحفظ و6 طلباتPHP متزامنة واستعادة مهمةRedis فاشلة. يتحقق من صفPHP واحد وعداد واحد ومحاولتين وتنبيهات developer المحلية. النتيجة فيrepairs-result.json. حقن الأعطال فيrouter المحلي فقط، وليس فيsteam_inbound.php الإنتاجي. لم تتغير schema لاختبار هذه الإصلاحات.

## للتعمق

**اسم الموضوع:** Docker Compose healthchecks and local integration testing

**ابحث عن:** service_healthy isolated test databases simulated OAuth

**مصادر موثوقة:** [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/)

[السابق](11-source-reference.md) · [التالي](13-reliability-fixes.md) · [الفهرس](00-overview.md)
