---
title: "مرجع API وعقود الردود"
category: "Mail Collector"
overview: "الأساس /api، والـ JWT في Authorization: Bearer. كل مسارات accounts عدا reauth/:id تستخدم authenticate؛ dashboard و logs محميان بالكامل. auth/login و auth/microsoft/callback و webhooks/mail و health عامة. لا توجد أدوار/صلاحيات object scope إضافية في الراوترات الحالية؛ وجود role في JWT لا يعني تطبيق role guard."
---

# مرجع API وعقود الردود

[English](../en/06-api-reference.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. المصادقة وشكل الرد

الأساس /api، والـ JWT في Authorization: Bearer. كل مسارات accounts عدا reauth/:id تستخدم authenticate؛ dashboard و logs محميان بالكامل. auth/login و auth/microsoft/callback و webhooks/mail و health عامة. لا توجد أدوار/صلاحيات object scope إضافية في الراوترات الحالية؛ وجود role في JWT لا يعني تطبيق role guard.

النجاح غالبًا success:true مع data وأحيانًا message. ApiError يرجع success:false و error و details، بينما بعض controllers تستخدم message. Prisma P2002 يرجع 409 و P2025 يرجع 404. الأخطاء غير المعروفة قد ترجع 500. هذا هو العقد الحالي، وليس envelope الخاص بـ Transaction-app. واجهة Api.request تقرأ json.message عند non-2xx؛ لذلك بعض error النصية لا تظهر كما هي.

القائمة التالية تغطي 33 endpoint: 31 في auth/accounts/dashboard/logs، و webhook و health. كلمة «عام» لا تعني أن الطلب بلا آثار؛ callback و reauth يشاركان في ربط الحساب. test و sync يمكن أن يجددوا توكنًا ويكتبوا في قاعدة البيانات.

| Method / path | الوصول | المدخلات | النتيجة |
|---|---|---|---|
| `POST /api/auth/login` | public | email, password | JWT + user |
| `GET /api/auth/me` | JWT | — | المستخدم الحالي |
| `GET /api/auth/microsoft/connect` | JWT | accountId? query | url + state |
| `GET /api/auth/microsoft/callback` | public | code/state أو error | كتابات الربط ثم redirect |
| `POST /api/auth/change-password` | JWT | currentPassword, newPassword | تحديث bcrypt password |
| `GET /api/accounts/reauth/:id` | public | id | 404 HTML أو redirect Microsoft |
| `GET /api/accounts/oauth/url` | JWT | — | url + state لحساب جديد |
| `GET /api/accounts` | JWT | page, limit, status, health, q | accounts + pagination.pages |
| `POST /api/accounts/sync-all` | JWT | — | results + summary + message |
| `GET /api/accounts/:id` | JWT | id | account + syncState + token metadata |
| `POST /api/accounts` | JWT | email | 201 جديد /200 موجود؛ account + connectUrl |
| `POST /api/accounts/:id/reconnect` | JWT | id | connectUrl؛ لا ينفذ الربط بذاته |
| `POST /api/accounts/:id/sync` | JWT | id | نتيجة sync أو خطأ وفق العقد |
| `POST /api/accounts/:id/test` | JWT | id | data.connected؛ قد يجدد token |
| `PATCH /api/accounts/:id` | JWT | isEnabled | account بعد update |
| `DELETE /api/accounts/:id` | JWT | id | حذف ثم SystemLog |
| `GET /api/accounts/:id/messages` | JWT | status, page, limit | messages + pagination.pages |
| `GET /api/dashboard/stats` | JWT | — | accounts/messages counters |
| `GET /api/dashboard/accounts-overview` | JWT | — | accounts + grouped |
| `GET /api/dashboard/recent-activity` | JWT | limit | system logs + message logs |
| `POST /api/dashboard/sync-all` | JWT | — | results + summary |
| `POST /api/dashboard/retry-failed` | JWT | — | مسار يدوي به method مفقودة حاليًا |
| `GET /api/dashboard/health` | JWT | — | MySQL check + counters + process stats |
| `GET /api/dashboard/config` | JWT | — | forwardTo, syncInterval, forwardMethod |
| `POST /api/dashboard/config` | JWT | forwardToEmail | upsert + clear cache + audit |
| `GET /api/dashboard/worker-status` | JWT | — | مؤشر مشتق من lastSyncAt |
| `POST /api/dashboard/test-forward` | JWT | — | أول حساب متصل؛ Inbox test فقط |
| `GET /api/logs` | JWT | status, accountId, page, limit, date, search | logs + pagination.totalPages |
| `GET /api/logs/:id` | JWT | id | log DTO أو 404 |
| `POST /api/logs/:id/retry` | JWT | id | PENDING فقط؛ لا enqueue |
| `DELETE /api/logs/cleanup` | JWT | olderThanDays? default 30 | حذف system logs القديمة و FORWARDED القديمة |
| `POST /api/webhooks/mail` | public | validationToken أو value[] | 200 text/plain أو 202 |
| `GET /health` | public | — | status:ok + timestamp |

## 2. pagination والمدخلات

GET /accounts يقبل page و limit و status و q و health. page الافتراضي 1 وحده الأدنى 1، limit الافتراضي 50 والأقصى 200. health=working يفرض CONNECTED؛ not_working يفرض not CONNECTED، وقد يتجاوز status. q يبحث في email بعد trim. account messages تستخدم status/page/limit بلا نفس clamp. logs تستخدم status/accountId/page/limit/date/search؛ date يوم بتوقيت عملية Node، و search يبحث subject/fromAddress.

لا توجد طبقة schema validation مشتركة؛ الشروط في usecases مع coercion يدوي. يرفض create email الفارغ دون email-format validator. إعداد forwardToEmail له regex. تغيير كلمة المرور يتطلب الحالية وصحة bcrypt والجديدة بطول 8 على الأقل. PATCH account يمرر isEnabled كما وصل إن لم يكن undefined.

## 3. الاستثناءات التي تؤثر على العميل

POST /accounts يرجع 201 للحساب الجديد و 200 للموجود، مع connectUrl. /accounts/:id/sync قد يرجع HTTP 200 و success:false عند فشل داخلي، وقد يرجع success:true مع data.errors لأن SyncService يلتقط بعض الأخطاء. ملخص sync-all يحسب !r.error، ولا يفحص جميع عناصر r.errors. retry-log يكتب PENDING لكنه لا يضيف job. test-forward يختبر الوصول إلى Inbox فقط، ولا يرسل Steam إلى PHP أو يختبر SMTP.

GET /accounts/:id يرجع token expiry/scope/updatedAt ولا يرجع access/refresh plaintext. GET /health يعيد status:ok و timestamp فقط ولا يختبر Redis أو MySQL. health داخل dashboard يفحص MySQL ويعرض counters/memory/uptime، وليس فحص تسليم شاملًا. مرجع المصدر: [routes](../../../src/routes)، [controllers](../../../src/controllers)، [usecases](../../../src/modules).

## للتعمق

**اسم الموضوع:** Express routes and HTTP contracts

**ابحث عن:** Express routes and HTTP contracts official documentation

**مصادر موثوقة:** [Official reference](https://expressjs.com/en/guide/routing.html)

[السابق](05-data-model.md) · [التالي](07-frontend.md) · [الفهرس](00-overview.md)
