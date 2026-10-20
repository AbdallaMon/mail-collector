---
title: "خريطة الملفات والطبقات"
category: "Mail Collector"
overview: "كان تعريف URL والتعامل مع HTTP واستعلامات Prisma وتجهيز Queue ومعالجة الرسائل متداخلًا في ملفات routes طويلة. التقسيم الحالي يحافظ على المسارات والردود ويعطي كل مسؤولية مكانًا واضحًا. الأسلوب مستلهم من classes وطبقات Transaction-app، لكن هذا المشروع يظل CommonJS و Express 4 بعقوده الحالية؛ لم ننسخ نظام صلاحيات أو i18n من مشروع آخر."
---

# خريطة الملفات والطبقات

[English](../en/01-architecture.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. لماذا تم التقسيم

كان تعريف URL والتعامل مع HTTP واستعلامات Prisma وتجهيز Queue ومعالجة الرسائل متداخلًا في ملفات routes طويلة. التقسيم الحالي يحافظ على المسارات والردود ويعطي كل مسؤولية مكانًا واضحًا. الأسلوب مستلهم من classes وطبقات Transaction-app، لكن هذا المشروع يظل CommonJS و Express 4 بعقوده الحالية؛ لم ننسخ نظام صلاحيات أو i18n من مشروع آخر.

| الطبقة | المكان | المسؤولية |
|---|---|---|
| Assembly | [app.js](../../../src/app.js) | ترتيب middleware والراوترات والصفحات |
| Routes | [routes](../../../src/routes) | URL، HTTP method، authenticate وربط controller |
| Controllers | [controllers](../../../src/controllers) | قراءة req، استدعاء الخدمات، status/JSON/redirect |
| Usecases | [modules](../../../src/modules) | قواعد الحسابات والإعدادات ومعالجة الإشعارات |
| Services | [services](../../../src/services) | Microsoft و Graph و Steam و SMTP والتنسيق اليدوي |
| Repositories | [repositories](../../../src/repositories) | تنفيذ Prisma عبر singleton واحد |
| Queues/workers | [queues](../../../src/queues) و[workers](../../../src/workers) | تسجيل المستهلكين وجدولة التنفيذ |
| Utilities/config | [utils](../../../src/utils) و[config](../../../src/config) | الأخطاء والتشفير والإعدادات واللوجر |

## 2. ترتيب بدء التطبيق

[server.js](../../../src/server.js) يحمّل الإعدادات والتطبيق، يتصل بقاعدة البيانات، ثم ينشئ مستخدم الإدارة الافتراضي إن لم يوجد، وأخيرًا يستمع على PORT. استيراد app يحمّل forward.queue، ولذلك يسجل مستهلك Bull في عملية HTTP نفسها. استيراد app في سكربت حقيقي ليس عملية خالية من اتصالات Redis.

داخل Express الترتيب هو Helmet، ثم CORS، ثم body parsers، ثم /api/webhooks، ثم rate limiter على /api، ثم Morgan، ثم health وباقي API والملفات الثابتة، وأخيرًا معالج 404 والأخطاء. ترتيب webhook قبل limiter و Morgan محفوظ. الحد الحالي 100 طلب لكل IP خلال 15 دقيقة؛ لا يوجد trust proxy مضبوط في التطبيق.

[worker.js](../../../src/worker.js) ينشئ WebhookMaintenanceWorker ويسجل SIGINT/SIGTERM ثم يبدأه. الـ Worker يختبر MySQL و Redis، ويضيف planner فوريًا وجدولة كل ساعة. لا يشغل SyncService تلقائيًا.

## 3. خريطة الخدمات

| Class | ما تملكه |
|---|---|
| MicrosoftAuthService | رابط الموافقة، تبادل code، refresh، تشفير/حفظ tokens، استكمال الربط |
| GraphService | جلب الرسائل و delta واختبار Inbox و retry لطلبات Graph |
| WebhookService | إنشاء وتجديد الاشتراك والتحقق من clientState |
| WebhooksUsecase | أهلية الحساب، قراءة الرسالة، الفلترة، التسليم، العدادات والأخطاء |
| SteamApiService | استخراج username/code، توقيع JSON، و HTTP إلى PHP |
| ForwarderService | قرار Steam/subject، تنسيق التسليم وتسجيل نتائجه، cache عنوان التنبيه |
| NotificationService | تكوين تنبيهات SMTP وإرسالها |
| SyncService | delta sync اليدوي، retry اليدوي، وإحصائيات اللوحة |
| AdminService | إنشاء مستخدم الإدارة الافتراضي عند startup |

## 4. حدود الاعتماد

Routes لا تنفذ Prisma. الاستعلامات داخل repositories تُمرَّر لها نفس arguments المستخدمة سابقًا؛ ليس هنا data layer جديد يغير شروط الاستعلام. MicrosoftAuthService يؤخر تحميل WebhookService لتجنب circular dependency، لأن إنشاء الاشتراك يحتاج بدوره access token. أخطاء API تمر عبر [asyncHandler](../../../src/utils/asyncHandler.js) و[error.middleware](../../../src/middleware/error.middleware.js).

تبقى helpers الصغيرة functions عادية حين لا تحمل state أو دورة حياة؛ إضافة class لكل دالة ليست هدفًا. أسماء مثل forwardGraphMessage بقيت واجهات توافق رغم أن التسليم الحالي فيها إلى PHP API.

## للتعمق

**اسم الموضوع:** Express middleware and CommonJS modules

**ابحث عن:** Express middleware and CommonJS modules official documentation

**مصادر موثوقة:** [Official reference](https://expressjs.com/en/guide/using-middleware.html)

[السابق](00-overview.md) · [التالي](02-microsoft-oauth.md) · [الفهرس](00-overview.md)
