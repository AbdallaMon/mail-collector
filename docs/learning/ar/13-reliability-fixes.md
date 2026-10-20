---
title: "إصلاحات الاعتمادية دون تغيير قاعدة الاستضافة"
category: "Mail Collector"
overview: "إصلاحات 20 أكتوبر 2026 تعالج احتجاز مهام التجديد وتصنيف الأخطاء وإعادة تسليم Steam، مع بقاء تنبيهات المطور واستخدام الجداول الموجودة."
---

# إصلاحات الاعتمادية دون تغيير قاعدة الاستضافة

[English](../en/13-reliability-fixes.md)

> نُفذت واختُبرت محليًا يوم 20 أكتوبر 2026. لم تُنشر على VPS أو Shared Hosting، ولم تُكتب بيانات في قواعد الإنتاج.

## 1. الإصلاحات والملفات

| المشكلة | التنفيذ | المصدر |
|---|---|---|
| مهمة قديمة تمنع التجديد التالي | فحص jobId، واستبدال failed/completed فقط؛ حذف النجاح والاحتفاظ بآخر 200 فشل | [WebhookMaintenanceWorker](../../../src/workers/webhookMaintenance.worker.js) |
| تجديد حساب غير مؤهل | اختيار الحساب CONNECTED والمفعّل، وإعادة الفحص عند التنفيذ | [WebhookService](../../../src/services/webhook.service.js) |
| عطل مؤقت يطلب إعادة الربط | فصل network/429/5xx عن رفض تفويض الحساب وعن خطأ إعداد التطبيق؛ مهلة 15 ثانية | [MicrosoftAuthService](../../../src/services/microsoftAuth.service.js)، [UpstreamErrorPolicy](../../../src/utils/upstreamErrorPolicy.js) |
| access token مرفوض قبل انتهاء التاريخ المحلي | refresh إجباري مرة واحدة بعد 401 في قراءة رسالة webhook | [GraphService](../../../src/services/graph.service.js) |
| فشل API بلا إعادة | حتى 5 محاولات، انتظار أُسّي من 5 ثوانٍ، واحترام Retry-After؛ إيقاف الخطأ الدائم | [Forward queue](../../../src/queues/forward.queue.js) |
| عدّ ignored كنجاح أو إعادة تسليم مؤكد | فحص saved/duplicate/ignored؛ سجل FORWARDED بالمفتاح المركب وعدّ داخل نفس transaction | [SteamApiService](../../../src/services/steamApi.service.js)، [WebhooksUsecase](../../../src/modules/webhooks/webhooks.usecase.js)، [MessageLogRepo](../../../src/repositories/messageLog.repo.js) |
| سباق SELECT ثم INSERT في PHP | GET_LOCK باسم مشتق من القاعدة والاسم والكود، ثم فحص التكرار والحفظ، وأخيرًا RELEASE_LOCK | [steam_inbound.php](../../../steam_inbound.php) |

سياسة الأخطاء مشتركة بين الـQueues. مهام الصيانة القديمة النهائية لا تمنع خطة التجديد التالية بعد نشر النسخة. المهمة التي ما زالت active/waiting/delayed تُترك؛ لا نسحب عملًا من مستهلك يعمل.

## 2. تنبيهات المطور وقاعدة الاستضافة

[NotificationService](../../../src/services/notification.service.js) مطابق لنسخة ما قبل الإصلاح byte-for-byte: قوالب البريد وDEV_EMAIL ومستلمو تنبيهات الأمان وإعادة الربط لم تتغير. مسارا تنبيه خطأ API الموجودان باقيان؛ فشل واحد قد يرسل تنبيه forwarder وتنبيه queue، بما في ذلك المحاولات التي ستُعاد. فشل كتابة سجل الخطأ لا يلغي تنبيه المطور. تنبيه sync اليدوي يستخدم طريقة تنبيه المطور الموجودة.

لا يوجد ALTER أو CREATE جديد، ولا عمود graphMessageId في IncomingCodes، ولا إضافة index أو migration. INSERT يستخدم الأعمدة نفسها، والتوقيع والـsecret وتنسيق الـpayload محفوظة. قفل الحفظ حالة مؤقتة في MySQL يُحرر عند الانتهاء أو انقطاع الاتصال. schema وPrisma migrations في قاعدة Collector أيضًا لم تتغير؛ سجل FORWARDED يستخدم الجدول الموجود.

## 3. حدود منع التكرار

المستقبل يستعمل فحصه الموجود: username بعد LOWER/TRIM، والكود، وDateTime >= تاريخ الرسالة ناقص 60 ثانية. التاريخ الأصلي يبقى ثابتًا عبر retries؛ لذلك صف محفوظ من المحاولة الأولى يطابق إعادتها حتى لو تأخرت. قفل الحفظ يجعل الطلبات المتعاونة بنفس المفتاح متسلسلة. غيّرنا كود PHP؛ لم نغيّر قاعدة الموقع.

هذا ليس ضمان exactly-once عام: لا يوجد معرّف رسالة فريد في قاعدة الاستضافة، وقد تطابق معاييرها رسالتين مختلفتين. القفل يحتاج نفس MySQL وكل الكتّاب المتنافسين يستخدمون نفس الأسلوب. حذف صفوف IncomingCodes أو تنظيف FORWARDED في Collector يزيل دليلًا لمنع التكرار. العدادات التاريخية والمسار اليدوي لا يُعاد إصلاحهما بأثر رجعي.

## 4. التحقق القابل للإعادة

```sh
npm run check
npm test
npm run local:verify
npm run docs:check
npm run docs:build
```

نجح 24 اختبارًا معزولًا وقت كتابة الفصل، إلى جانب التحقق المحلي التالي باستخدام MySQL 8.4 وRedis 7 وPHP 8.3:

| السيناريو | النتيجة المتحققة |
|---|---|
| 503 قبل الحفظ | المحاولة الثانية نجحت؛ صف PHP واحد، زيادة عداد واحدة، الحساب CONNECTED |
| حفظ ثم ضياع رد النجاح كـ503 | الإعادة أرجعت DUPLICATE_RECENT؛ صف واحد، ومحاولتان، وزيادة عداد واحدة |
| 6 طلبات PHP متزامنة | حفظ واحد، وخمسة DUPLICATE_RECENT |
| مهمة Redis فاشلة محفوظة بنفس ID | استُبدلت ونُفذت؛ لم تُضف نسخة لمهمة معلقة، وحُذفت بعد النجاح |
| تنبيه عند الفشل | لكل 503 التُقط تنبيها المطور الموجودان محليًا؛ لم يُرسل بريد خارجي |

السكربت [verify-repairs.js](../../../scripts/local-demo/verify-repairs.js) يُشغّله launcher في بيئة وهمية مستقلة ويوقف موارده بعد الاختبار. الدليل `.local-demo/repairs-result.json`، والتفاصيل في `.local-demo/scenario.log` وserver.log وsmtp/*.eml. حقن الأعطال في router الاختبار فقط؛ لا يوجد حقن عطل داخل ملف PHP القابل للنشر.

## 5. ترتيب النشر بعد المراجعة

1. احتفظ بنسخة الملفات الحالية وإعدادات التشغيل قبل التغيير. نشر الإصلاح لا يحتاج تشغيل db:push أو setup أو migration على قاعدة الاستضافة.
2. ارفع steam_inbound.php المعدّل إلى مساره الحالي أولًا، مع بقاء includes/functions.php وملف السر. تأكد أن مضيف MySQL يدعم GET_LOCK؛ اختبر الحفظ والتكرار والتنبيه على البيئة المقصودة.
3. انشر Node واعتمادياته المقفلة، وشغّل HTTP server ونسخة واحدة من maintenance worker. عند البداية يخطط الـworker ويستبدل المهام النهائية المؤهلة؛ لا تستخدم FLUSHALL أو مسح Redis.
4. راقب expiry الفعلي للاشتراكات والتنفيذ، ثم مسار رسالة اختبار مصرح بها. PM2 online وحده لا يكفي. راجع حالات ERROR/NEEDS_REAUTH القديمة منفردة؛ الكود لا يعيد تعيينها تلقائيًا، ولا يعيد إرسال كل أكواد Steam القديمة.
5. احتفظ بالنسخة السابقة للتراجع. بعد تشغيل النسخة الجديدة، راجع مهام Redis أولًا: المهام الجديدة تستخدم backoff باسم `upstream` لا يعرفه الكود القديم، لذلك إعادة الملفات وحدها ليست تراجعًا كاملًا. يلزم توافق سياسة الـQueue دون مسح مهامها. يمكن إبقاء PHP المعدّل لأنه متوافق مع عقد Node السابق. لا يوجد schema rollback لهذه الدفعة.

هذه خطوات موثقة ولم تُنفذ على الإنتاج. فحص المضيف وصلاحية client secret والتحقق الأمني الحقيقي لا يثبتهم الاختبار المحلي.

## 6. Microsoft وما بقي

AADSTS70000 الذي يطلب security proof يحتاج استكمال التحقق على الحساب ثم إعادة الربط عند الحاجة؛ الكود لا يتجاوز Microsoft. AADSTS7000222 يعني انتهاء سر التطبيق في السجل؛ راجع انتهاء السر الفعلي في Entra وحدّث قيمته عند الحاجة، دون اعتبار كل الحسابات منفصلة. الاختبار المحلي لا يحتاج Entra، أما الربط الحقيقي فيحتاج App Registration.

لم تتضمن تلك الدفعة lifecycle notifications أو تغيير 202-before-enqueue أو إصلاح كل المسارات اليدوية والواجهة. راجع [حالة المشكلات](10-known-issues.md) للفصل بين الإصلاح المنفذ والعمل المتبقي.

## للتعمق

**اسم الموضوع:** Retry policies and MySQL advisory locks

**ابحث عن:** Bull custom backoff Retry-After MySQL GET_LOCK RELEASE_LOCK

**مصادر موثوقة:** [Bull reference](https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md)، [MySQL locking functions](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html)، [Microsoft errors](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes)

[السابق](12-local-demo.md) · [الفهرس](00-overview.md)
