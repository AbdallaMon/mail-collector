---
title: "الإشعارات والـQueues والتجديد"
category: "Mail Collector"
overview: "webhooks.controller يرد على validationToken بـ 200 و text/plain يحمل نفس القيمة. في الإشعارات العادية يرسل 202 أولًا، ثم يعالج value[] ويضيف jobs. هذا الرد يسبق اكتمال الحفظ في Redis؛ فشل enqueue لاحقًا يُسجّل ولا يغير الرد الذي وصل Microsoft."
---

# الإشعارات والـQueues والتجديد

[English](../en/03-webhooks-queues.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. استقبال الإشعار

[webhooks.controller](../../../src/controllers/webhooks.controller.js) يرد على validationToken بـ 200 و text/plain يحمل نفس القيمة. في الإشعارات العادية يرسل 202 أولًا، ثم يعالج value[] ويضيف jobs. هذا الرد يسبق اكتمال الحفظ في Redis؛ فشل enqueue لاحقًا يُسجّل ولا يغير الرد الذي وصل Microsoft.

[WebhooksUsecase.enqueueNotification](../../../src/modules/webhooks/webhooks.usecase.js) يتحقق من subscriptionId و clientState، يقرأ الحساب، ويشترط CONNECTED و isEnabled. يستخرج messageId من resourceData.id أو من resource بعد /messages/. ثم يضيف accountId و accountEmail و messageId، بمعرّف job يساوي accountId:messageId.

## 2. Queue تسليم الرسائل

| الخاصية | القيمة الحالية |
|---|---|
| الاسم | webhook-forward |
| المستهلك | عملية HTTP؛ [forward.queue.js](../../../src/queues/forward.queue.js) |
| concurrency | 1 لكل مستهلك |
| attempts | حتى 5 محاولات إجمالًا؛ للأخطاء المؤقتة فقط |
| removeOnComplete | true |
| removeOnFail | آخر 100 مهمة |
| تأخير ما بعد التسليم | FORWARD_DELAY_MS، fallback 500ms |

المعالجة تعيد فحص الحساب وسجل الرسالة؛ وجود FORWARDED يمنع إرسالًا جديدًا. تجلب الحقول دون attachments، وعند401 من Graph تطلب refresh إجباريًا مرة واحدة. فلتر STEAM_ONLY ومسار SMTP لرسائل الأمان محفوظان. فقط نتيجة API المؤكدة saved أوalready-saved تصل إلى completeForward، الذي يحفظ FORWARDED ويزيد عداد الحساب داخل transaction واحدة في قاعدة الـCollector.

نتائج ignored/skipped لا تزيد عداد webhook. أخطاء الشبكة و408 و425 و429 و5xx وبعض أعطال القاعدة يعاد تنفيذها بانتظار أُسّي من5 ثوانٍ مع احترام Retry-After الأطول؛ الخطأ الدائم يتوقف مبكرًا. تنبيهات المطور موجودة في كل محاولة فاشلة. failedForwardCount يزيد عند الفشل النهائي فقط إذا لم يكن السجل FORWARDED. منع إعادة التسليم في Node يعتمد على بقاء سجل الرسالة؛ تنظيف السجلات قد يحذفه.

## 3. إنشاء الاشتراك وتجديده

[WebhookService](../../../src/services/webhook.service.js) يطلب created على /me/mailFolders('Inbox')/messages، لمدة 4230 دقيقة (70.5 ساعة)، مع clientState عشوائي 32 byte بصيغة hex. يحاول حذف الاشتراك القديم من Microsoft قبل إنشاء بديل، ويتجاهل فشل الحذف. يحفظ subscriptionId و expiresAt وبقية البيانات في MySQL.

renewSubscription ينفذ PATCH، وينشئ عند غياب السجل، ويعيد إنشاء الاشتراك عند Graph400 أو404 أوInvalidSubscription. قائمتا missing وexpiring تشترطان CONNECTED وisEnabled؛ وexpiring تختار انتهاء خلال12 ساعة. المستهلك يعيد فحص الحساب عند التنفيذ. الاشتراكات اليتيمة تُستبعد من التخطيط ولا تُحذف.

## 4. Queue الصيانة

| الخاصية | القيمة الحالية |
|---|---|
| الاسم | mail-sync |
| planner | webhook:plan-maintenance؛ concurrency 1؛ فوري ثم كل ساعة |
| create | webhook:create-subscription؛ concurrency 2؛ stagger 300ms |
| renew | webhook:renew-subscription؛ concurrency 2؛ stagger 200ms |
| attempts/backoff | حتى 5؛ انتظار أُسّي يبدأ من 5 ثوانٍ ويحترم Retry-After الأطول |
| الاحتفاظ | حذف النجاح والاحتفاظ بآخر 200 فشل |
| jobId | webhook:create:accountId و webhook:renew:accountId |

[Worker](../../../src/workers/webhookMaintenance.worker.js) يفحص jobId الثابت قبل الإضافة: يحذف المهمة completed/failed ويعيد إنشائها، ويترك waiting/delayed/active كما هي. بهذا تستعاد المهام القديمة التي يختارها تخطيط البداية أوالساعة التالية دون مسح Redis. شغّل نسخة واحدة من maintenance worker؛ فحص/حذف/إضافة ليس قفلًا موزعًا بين planners متعددة. التوكن يتجدد عند الطلب؛ مهمة الساعة للاشتراكات.

## 5. أثر الحالة والأخطاء

الـQueues يستخدمان سياسة الأخطاء المؤقتة المشتركة. withRetry القديم باقٍ في مسارات delta اليدوية؛ قراءة رسالة webhook تترك إعادة الأخطاء المؤقتة لـBull. AADSTS70000 ما زال يحتاج تحقق Microsoft. lifecycle notifications واسترداد الرسائل المفقودة لم يُنفذا؛ online فيPM2 أوCONNECTED وحدهما لا يثبتان سلامة التسليم بالكامل.

## للتعمق

**اسم الموضوع:** Bull job retention and Graph subscription lifecycle

**ابحث عن:** Bull job retention and Graph subscription lifecycle official documentation

**مصادر موثوقة:** [Official reference](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)

[السابق](02-microsoft-oauth.md) · [التالي](04-steam-php.md) · [الفهرس](00-overview.md)
