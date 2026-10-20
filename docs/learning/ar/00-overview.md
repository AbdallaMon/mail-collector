---
title: "Mail Collector من الحساب إلى كود Steam"
category: "Mail Collector"
overview: "يربط النظام حساب Microsoft بصلاحيات مفوّضة من صاحب الحساب، يستقبل إشعار وصول رسالة إلى Inbox، يقرأ الرسالة من Graph، ثم يرسل بيانات Steam المستخرجة إلى PHP على Shared Hosting. PHP يحفظ الكود في جدول IncomingCodes الخاص بالموقع الآخر. SMTP له مسار منفصل لإرسال تنبيهات الأمان والأخطاء."
---

# Mail Collector من الحساب إلى كود Steam

[English](../en/00-overview.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. ما الذي يفعله المشروع

يربط النظام حساب Microsoft بصلاحيات مفوّضة من صاحب الحساب، يستقبل إشعار وصول رسالة إلى Inbox، يقرأ الرسالة من Graph، ثم يرسل بيانات Steam المستخرجة إلى PHP على Shared Hosting. PHP يحفظ الكود في جدول IncomingCodes الخاص بالموقع الآخر. SMTP له مسار منفصل لإرسال تنبيهات الأمان والأخطاء.

مثال تعليمي: تصل رسالة من noreply@steampowered.com بعنوان يحتوي access from new، وجسمها يحتوي اسم demo والكود A1B2C. Node يرسل الاسم والكود ومعرف الرسالة وبياناتها الأساسية، ولا يرسل جسم البريد إلى PHP. استقبال الإشعار، قراءة الرسالة، وقبول PHP وحفظه خطوات مختلفة؛ نجاح خطوة لا يثبت نجاح ما بعدها.

## 2. أين يعمل كل جزء

| الجزء | دوره |
|---|---|
| Browser | لوحة الإدارة وربط الحساب؛ يحتفظ بـ JWT الخاص باللوحة |
| Node HTTP process | Express، OAuth callback، قراءة/تعديل الحسابات، استقبال webhooks، وتنفيذ forwarding queue |
| Maintenance worker process | تخطيط وتجديد وإنشاء اشتراكات Graph |
| MySQL الخاص بالـ Collector | الحسابات والتوكنات المشفرة والاشتراكات والسجلات والإعدادات |
| Redis / Bull | مهام التسليم وصيانة الاشتراكات؛ ليس مصدر التوكنات |
| Microsoft Graph | الملف الشخصي والرسائل والاشتراكات |
| PHP shared hosting | التحقق من توقيع الطلب وحفظ IncomingCodes في قاعدة مستقلة |
| SMTP | تنبيهات وليست الوجهة الأساسية لأكواد Steam |

```text
Browser -> OAuth -> Microsoft -> Node callback -> Collector MySQL
Microsoft webhook -> Node HTTP -> Redis webhook-forward
Node queue consumer -> Graph message -> Steam parser -> signed HTTP -> PHP -> IncomingCodes
Maintenance worker -> Redis mail-sync -> Graph subscription create/renew
Errors / security messages -> SMTP -> configured notification recipients
```

## 3. ترتيب القراءة

ابدأ بـ[خريطة الكود](01-architecture.md)، ثم [OAuth](02-microsoft-oauth.md)، و[الـ webhooks والـ queues](03-webhooks-queues.md)، ثم [عقد Steam و PHP](04-steam-php.md). مرجع [قاعدة البيانات](05-data-model.md) و[API](06-api-reference.md) يفصّلان الحقول والطلبات. [الواجهة](07-frontend.md) تشرح حدود ما تعرضه، و[التشغيل](08-configuration-operations.md) يغطي كل المتغيرات. اقرأ [التحقق والتنظيم](09-verification-refactor.md) و[المشكلات المؤجلة](10-known-issues.md) قبل النشر. [مرجع الملفات](11-source-reference.md) يربط كل ملف مصدر بمسؤوليته.

## 4. حدود هذه النسخة

هذا شرح للكود المحلي بعد التنظيم وإصلاحات20 أكتوبر، وليس ادعاءً بنشره. المسار التلقائي يعتمد علىwebhooks. delta sync اليدوي ما زال متاحًا لكنه ليس polling في الخلفية. لم تتغير الجداول أوالمهاجرات. راجع [الإصلاحات وحدود النشر](13-reliability-fixes.md) وما تبقى في فصل المشكلات.

## للتعمق

**اسم الموضوع:** Microsoft Graph change notifications

**ابحث عن:** Microsoft Graph change notifications official documentation

**مصادر موثوقة:** [Official reference](https://learn.microsoft.com/en-us/graph/change-notifications-overview)

[التالي](01-architecture.md) · [الفهرس](00-overview.md)

لتجربة المسار كاملًا على جهازك، اقرأ [التشغيل المحلي برسالة Steam صناعية](12-local-demo.md).
