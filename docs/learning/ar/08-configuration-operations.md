---
title: "الإعدادات والتشغيل واللوجات"
category: "Mail Collector"
overview: "config/index.js يقرأ dotenv من .env في working directory، ويحوّل الأرقام/القوائم ويصدّر config واحدًا. مصدر المثال القابل للمشاركة هو .env.example، وليس ملفات الاعتمادات المحلية. DATABASE_URL تقرؤه Prisma من الـ schema. الجدول التالي يغطي المتغيرات الـ 37؛ قيم fallback ليست توصية إعداد إنتاج."
---

# الإعدادات والتشغيل واللوجات

[English](../en/08-configuration-operations.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. مصدر الإعدادات

[config/index.js](../../../src/config/index.js) يقرأ dotenv من .env في working directory، ويحوّل الأرقام/القوائم ويصدّر config واحدًا. مصدر المثال القابل للمشاركة هو [.env.example](../../../.env.example)، وليس ملفات الاعتمادات المحلية. DATABASE_URL تقرؤه Prisma من الـ schema. الجدول التالي يغطي المتغيرات الـ 37؛ قيم fallback ليست توصية إعداد إنتاج.

| Variable | Fallback | الدور |
|---|---|---|
| `NODE_ENV` | development | وضع اللوج وتفاصيل الأخطاء |
| `PORT` | 5000 | منفذ Express |
| `API_URL` | http://localhost:5000 | عنوان الخدمة وروابط إعادة الربط |
| `FRONTEND_URL` | http://localhost:3000 | CORS و redirect؛ مثال نفس-origin في .env.example |
| `WEBHOOK_URL` | API_URL + /api/webhooks/mail | عنوان Microsoft notification |
| `DATABASE_URL` | required | اتصال Prisma MySQL |
| `REDIS_HOST` | localhost | مضيف Bull Redis |
| `REDIS_PORT` | 6379 | منفذ Redis |
| `REDIS_PASSWORD` | unset | كلمة مرور Redis إن وجدت |
| `JWT_SECRET` | unsafe source fallback | توقيع جلسة اللوحة؛ اضبط قيمة خاصة |
| `JWT_EXPIRES_IN` | 7d | عمر جلسة اللوحة |
| `ENCRYPTION_KEY` | required | عبارة تشفير Microsoft tokens؛ ثابتة مع البيانات |
| `ADMIN_EMAIL` | admin@example.com | هوية startup admin؛ ليس seed |
| `ADMIN_PASSWORD` | unsafe source fallback | كلمة مرور المستخدم عند إنشائه فقط |
| `MICROSOFT_CLIENT_ID` | required | تسجيل التطبيق |
| `MICROSOFT_CLIENT_SECRET` | required | سر التطبيق |
| `MICROSOFT_REDIRECT_URI` | required | callback الباك إند المسجل |
| `MICROSOFT_SCOPES` | offline_access User.Read Mail.Read Mail.Send | قائمة مفصولة بمسافات |
| `STEAM_API_URL` | required for delivery | عنوان PHP POST |
| `STEAM_API_SECRET` | empty | سر HMAC المشترك؛ PHP يطلب 16 حرفًا على الأقل |
| `STEAM_API_TIMEOUT_MS` | 5000 | مهلة fetch؛ parseInt |
| `STEAM_ONLY` | true | تفعيل allowlists قبل forwarder |
| `STEAM_ALLOWED_DOMAINS` | empty list | domains مفصولة بفواصل |
| `STEAM_ALLOWED_SENDERS` | empty list | عناوين مرسل محددة مفصولة بفواصل |
| `FORWARD_DELAY_MS` | 500 | تأخير معالجة webhook بعد عودة forwarder |
| `DEV_EMAIL` | null | مستقبل تنبيهات المطور |
| `FORWARD_TO_EMAIL` | built-in address fallback | عنوان SMTP الاحتياطي؛ SystemSetting أسبق |
| `SMTP_HOST` | unset | خادم SMTP |
| `SMTP_PORT` | 465 | منفذ SMTP |
| `SMTP_SECURE` | false unless literal true | اتصال SMTP مشفر من البداية |
| `SMTP_USER` | unset | مستخدم SMTP |
| `SMTP_PASS` | unset | كلمة مرور SMTP |
| `SMTP_FROM` | SMTP_USER | عنوان/اسم مرسل التنبيه |
| `MAX_RETRIES` | 1 | حد مسار retry اليدوي؛ ليس attempts لـ Bull |
| `POLL_INTERVAL_MS` | 10000 | مؤشرات Dashboard القديمة فقط |
| `LOG_LEVEL` | info | مستوى Winston |
| `LOG_FILE` | logs/app.log | مسار ملف Winston |

العناوين المحلية localhost تخص الجهاز الذي يشغل Node. نسخ .env من VPS لا يوفّر MySQL أو Redis محليين ولا يجعل الاتصال يتجه تلقائيًا إلى VPS. إعداد fallback للـ webhook يستخدم process.env.API_URL مباشرة؛ لذلك اضبط WEBHOOK_URL صراحة. مفاتيح التشفير والـ JWT و Microsoft و Steam تؤدي أدوارًا مختلفة ولا تستبدل أحدها بالآخر.

## 2. أوامر المشروع وما تغيره

| الأمر | الأثر |
|---|---|
| npm ci | تثبيت lockfile؛ postinstall يولد Prisma Client |
| npm run check | syntax/import resolution دون تشغيل services |
| npm test | اختبارات صناعية مع HTTP محلي وبدائل للخدمات الخارجية |
| npm run db:generate | توليد العميل محليًا، دون migration |
| npx prisma validate | التحقق من schema |
| npm start / npm run worker | تشغيل عملية HTTP/forwarding وعملية الصيانة؛ يمكنهما الكتابة والإرسال فعليًا |
| npm run dev | العمليتان باستخدام node --watch و concurrently |
| npm run prod | العمليتان معًا عبر concurrently؛ ليس بديلًا عن إدارة العمليات بالمضيف |
| npm run db:migrate | prisma migrate dev؛ يعدل قاعدة التطوير المحددة |
| npx prisma migrate deploy | تطبيق migrations الموجودة على القاعدة المحددة |
| npm run db:push | مزامنة schema إلى القاعدة؛ ليس فحصًا للقراءة |
| npm run db:seed / npm run setup | إنشاء بيانات؛ setup يتضمن db:push؛ ليسا مطلوبين لمراجعة الكود |
| npm run db:studio | واجهة قادرة على قراءة/تعديل قاعدة الإعداد الحالية |
| npm run docs:check / docs:build / docs:serve | فحص التوثيق أو توليد HTML أو عرضه محليًا |

قبل أي أمر يكتب قاعدة، حدد DATABASE_URL المقصود دون طباعة كلمة المرور. الإجراء المناسب لتجهيز بيئة جديدة لا يُنفذ تلقائيًا على الإنتاج أثناء المراجعة. startup يستخدم AdminService و ADMIN_*، بينما seed له بيانات/role و bcrypt rounds مختلفة ثابتة في ملفه؛ تشغيل الاثنين قد ينشئ مستخدمين مختلفين.

## 3. معرفة موضع العطل

Winston يكتب LOG_FILE و error.log مع حجم 5MiB وخمس نسخ لكل منهما. console.log/error في OAuth/queues/SMTP تظهر في stdout/stderr ومدير العمليات، وليست بالضرورة في LOG_FILE. SystemLog جدول تدقيق منفصل و MailMessageLog يسجل نتائج رسائل. لا تعادل أي قناة منها كل قنوات التشخيص.

على المضيف يمكن قراءة pm2 list و pm2 logs --lines 100 --nostream للعمليتين المحددتين، ثم ربط الوقت بالحساب والاشتراك والمهمة و graphMessageId. لا تطبع .env أو token records عند جمع الأدلة. فحص GET /health يثبت استجابة HTTP فقط؛ تحقق أيضًا من عمر subscriptions وحالة jobs ونتيجة API/PHP.

## 4. تشغيل التوثيق

npm run docs:serve يبني الصفحات ثم يعرض docs/html على 127.0.0.1:5501 افتراضيًا. DOCS_SITE_HOST و DOCS_SITE_PORT يخصان أداة التوثيق فقط، وليسا من متغيرات Collector الـ 37. السكربت لا يحمّل .env الخاصة بالتطبيق. لا يعرض .env أو source عبر HTTP؛ روابط المصدر تبقى صالحة في Markdown وتظهر كنص في HTML. عدّل Markdown وأعد البناء بدل تعديل HTML الناتج.

## للتعمق

**اسم الموضوع:** Environment configuration and local verification

**ابحث عن:** Environment configuration and local verification official documentation

**مصادر موثوقة:** [Official reference](https://nodejs.org/api/cli.html)

[السابق](07-frontend.md) · [التالي](09-verification-refactor.md) · [الفهرس](00-overview.md)
