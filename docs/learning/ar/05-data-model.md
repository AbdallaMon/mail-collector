---
title: "الجداول والحالات واتساق البيانات"
category: "Mail Collector"
overview: "schema.prisma يستخدم MySQL و prisma-client-js. معرفات الكيانات String UUID، وليست Int مثل Transaction-app. database.js هو Prisma singleton لمسار التطبيق. seed برنامج CLI مستقل يحتفظ بمساره القديم. لم تُغير هذه الدفعة الـ schema أو SQL migrations."
---

# الجداول والحالات واتساق البيانات

[English](../en/05-data-model.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. مخزن البيانات

[schema.prisma](../../../prisma/schema.prisma) يستخدم MySQL و prisma-client-js. معرفات الكيانات String UUID، وليست Int مثل Transaction-app. [database.js](../../../src/config/database.js) هو Prisma singleton لمسار التطبيق. seed برنامج CLI مستقل يحتفظ بمساره القديم. لم تُغير هذه الدفعة الـ schema أو SQL migrations.

| Model | جدول MySQL | ما يحفظه/القيود المهمة |
|---|---|---|
| AdminUser | admin_users | email فريد، bcrypt password، name/role/isActive وتواريخ |
| MailAccount | mail_accounts | email فريد، msUserId، displayName، status، isEnabled، أوقات آخر نشاط، lastError، errorCount وعدادا التسليم |
| MailToken | mail_tokens | accountId فريد، access/refresh مشفران، scope/type و expiresAt |
| MailSyncState | mail_sync_state | accountId فريد، deltaLink، lastDeltaAt، lastMessageDateTime، syncCursor |
| MailMessageLog | mail_message_log | message metadata، attempts، error، timestamps، forwardStatus؛ unique(accountId, graphMessageId) و internetMessageId فريد عالميًا |
| SystemLog | system_logs | level/category/message و metadata JSON و accountId اختياري |
| JobState | job_states | جدول تاريخي لحالة job؛ لا يوجد استعمال runtime حالي له |
| SystemSetting | system_settings | key فريد و value؛ المفتاح المستخدم forwardToEmail |
| WebhookSubscription | webhook_subscriptions | accountId و subscriptionId فريدان، resource/changeType/URL/expiry/clientState |

## 2. العلاقات الفعلية

MailToken و MailSyncState و MailMessageLog مرتبطون بـ MailAccount عبر relation مع onDelete: Cascade. WebhookSubscription يحمل accountId كسلسلة فريدة لكنه لا يملك relation/foreign key إلى الحساب في هذا الـ schema. لذلك حذف الحساب لا يحذف subscription تلقائيًا. SystemLog و JobState ليس لهما relation تحذفهما مع الحساب أيضًا.

```prisma
account MailAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
```

السطر أعلاه مثال علاقة موجودة، وليس migration مقترحة. قاعدة IncomingCodes على Shared Hosting مستقلة؛ أعمدتها المستخدمة مثبتة في PHP، لكن schema الكامل للموقع الآخر غير موجود محليًا.

## 3. حالة الحساب مقابل تفعيله

| الحالة | الاستخدام الحالي |
|---|---|
| PENDING | حساب أُنشئ عبر POST /accounts وينتظر OAuth |
| CONNECTED | OAuth ناجح أو manual sync أعاد الحالة؛ لا يضمن subscription سليمًا |
| NEEDS_REAUTH | غياب/رفض تفويض الحساب أوإيقاف صريح له |
| ERROR | حالة قديمة؛ أخطاء webhook المؤقتة لم تعد تضعها |
| DISABLED | قيمة enum موجودة؛ toggle الحالي يغيّر isEnabled فقط |

isEnabled مستقل عن status. webhook يتطلب CONNECTED و isEnabled=true. manual sync يسمح CONNECTED أو ERROR؛ طلب sync لحساب منفرد لا يفحص isEnabled، بينما sync-all يفلتر الحسابات المفعلة. تغيير toggle لا يغيّر حالة OAuth ولا يلغي الاشتراك في Microsoft.

## 4. سجلات الرسائل والعدادات

ForwardStatus باقٍ PENDING أوFORWARDED أوFAILED أوSKIPPED. نجاح webhook يحفظ FORWARDED ويزيد forwardedCount ذريًا في [MessageLogRepo.completeForward](../../../src/repositories/messageLog.repo.js). يبدأ بقفل صف الحساب قبل قراءة المفتاح المركب للحساب والرسالة، فلا تزيد الإعادة العداد مرتين. recordFailure لا يحول FORWARDED إلىFAILED. التخطي لا يحتسب تسليمًا؛ failedForwardCount يزيد عند فشل الـQueue النهائي فقط.

سجل النجاح الجديد يستخدم accountId/graphMessageId الموجود، ولا يملأ internetMessageId الاختياري ذي القيد الفريد العالمي لأنه قد يتكرر عبر حسابات مختلفة. الـschema لم تتغير، وبعض مسارات السجل القديمة ما زالت تستخدم هذا الحقل. attempts لمسار webhook هو رقم محاولة Bull وليس عدد كل طلباتHTTP. العدادات التاريخية لم تُعد حسابها، ومسارات sync/retry اليدوية تحتفظ بقيود العد القديمة. فحص PHP بالاسم والكود والتاريخ قد يطابق رسائل ذات معرفات مختلفة.

## 5. delta sync اليدوي

عند غياب deltaLink، initializeDelta يمر على الرسائل الموجودة للحصول على cursor ويتجاهلها، فلا يعيد تلقائيًا كل البريد القديم. getDeltaMessages يتابع الصفحات، يستبعد removed، ويحدّث cursor قبل اكتمال التسليم. عند Graph 410 يمسح cursor ويعيد التهيئة. SyncService يعالج الرسائل في batches من 8، والحسابات في batches من 5. توجد فجوات retry موثقة في [المشكلات](10-known-issues.md)، لذا لا تعتبر هذا المسار ضمان استرداد تلقائي لكل الرسائل المفقودة.

## للتعمق

**اسم الموضوع:** Prisma relations and Microsoft Graph delta queries

**ابحث عن:** Prisma relations and Microsoft Graph delta queries official documentation

**مصادر موثوقة:** [Official reference](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)

[السابق](04-steam-php.md) · [التالي](06-api-reference.md) · [الفهرس](00-overview.md)
