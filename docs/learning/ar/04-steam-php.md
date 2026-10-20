---
title: "استخراج Steam وعقد PHP والتنبيهات"
category: "Mail Collector"
overview: "webhooks.policy يقارن عنوان المرسل أو domain بالـ allowlists بعد lowercase. إذا كان STEAM_ONLY=true وكانت القائمتان فارغتين، فلن تمر رسائل Steam العادية من هذا الفلتر. بعد ذلك ForwarderService يختبر أن عنوان المرسل يحتوي steampowered.com وأن العنوان يحتوي access from new أو نص الرسالة بعد تنظيف HTML يحتوي here is the steam guard code، دون حساسية لحالة الحروف. تعطيل STEAM_ONLY لا يلغي الفلتر الثاني ولا يحول التطبيق إلى جامع لكل الرسائل."
---

# استخراج Steam وعقد PHP والتنبيهات

[English](../en/04-steam-php.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. مرحلتان للفلترة

[webhooks.policy](../../../src/modules/webhooks/webhooks.policy.js) يقارن عنوان المرسل أو domain بالـ allowlists بعد lowercase. إذا كان STEAM_ONLY=true وكانت القائمتان فارغتين، فلن تمر رسائل Steam العادية من هذا الفلتر. بعد ذلك [ForwarderService](../../../src/services/forwarder.service.js) يختبر أن عنوان المرسل يحتوي steampowered.com وأن العنوان يحتوي access from new أو نص الرسالة بعد تنظيف HTML يحتوي here is the steam guard code، دون حساسية لحالة الحروف. تعطيل STEAM_ONLY لا يلغي الفلتر الثاني ولا يحول التطبيق إلى جامع لكل الرسائل.

[SteamApiService](../../../src/services/steamApi.service.js) يحذف style/script/tags وبعض HTML entities، ثم يأخذ أول token مستقل من خمسة أحرف كبيرة/أرقام بعد عبارة Steam Guard إن وجدت، وإلا يبحث في الجسم. بذلك لا تُعتبر STEAM أو GUARD المكتوبتان بحروف كبيرة كودًا لمجرد ظهورهما في العبارة. يبحث عن username عبر مجموعة أنماط تحية بلغات مختلفة ثم Dear. هذا parsing بقواعد محددة؛ ليس فهمًا عامًا لكل رسائل Steam. جسم فارغ يسبب STEAM_BODY_MISSING. غياب الاسم أو الكود لا يمنع Node من الإرسال؛ PHP قد يتجاهل الطلب.

علامة تطابق النص تُحسب بعد حذف HTML وتوحيد المسافات، ويشملها توقيع HMAC الموجود. PHP يقبل boolean true فقط، وليس النص "true". جسم البريد لا يُرسل. يلزم نشر تعديل الفلتر في الطرفين، PHP أولًا. تطابق الفلتر ما زال يحتاج استخراج username/code قبل الحفظ.

## 2. عقد النقل والتوقيع

الـ JSON يحمل source و fromAccount و from و to و subject و receivedDateTime و internetMessageId و graphMessageId و username و code و hasSteamGuardCodeText. to قائمة عناوين مجمعة بفاصلة. body و attachments لا يدخلان الطلب. source قيمته mail-collector-graph. مسار webhook يملأ التاريخ الغائب من timestamp ثابت للمهمة حتى لا يتغير بين المحاولات.

X-Timestamp هو Unix seconds كسلسلة نصية، و X-Signature هو HMAC-SHA256 hex على timestamp ثم نقطة ثم **نفس JSON string المرسل**، باستخدام STEAM_API_SECRET. إعادة تنسيق JSON بعد التوقيع تغيّر البايتات. المثال المشترك في آخر الفصل لا يرسل طلبًا.

الطلب POST بـapplication/json ومهلة AbortController منSTEAM_API_TIMEOUT_MS، افتراضيًا5000ms. saved:true وDUPLICATE_RECENT الموجودان يؤكدان التسليم؛ ignored:true تعني تخطيًا. JSON غير المتوقع مع2xx يصبح خطأ عقد دائمًا. non-2xx يحتفظ بالمصدر والحالة وRetry-After؛ الشبكة والمهلة قابلتان للإعادة. ForwarderService ما زال يسجل ويرسل للمطور، والـQueue يحتفظ بمسار التنبيه الثاني الموجود، حتى في المحاولات القابلة للإعادة. فشل التخزين لا يمنع إرسال هذه التنبيهات.

## 3. ما ينفذه PHP بالترتيب

[steam_inbound.php](../../../steam_inbound.php) يعتمد على ../includes/functions.php و../../secrets/steam_secret.php. ملف السر يعيد array تحتوي STEAM_API_SECRET بطول لا يقل عن 16 حرفًا. إعداد الاتصال بقاعدة الموقع يأتي من get_mysql_connection؛ هذا المشروع لا يحتوي باقي الموقع.

| الفحص/النتيجة | HTTP | JSON المهم |
|---|---|---|
| السر غائب/غير صالح | 500 | SECRET_NOT_CONFIGURED |
| جسم فارغ أو JSON غير صالح | 400 | EMPTY_BODY أو INVALID_JSON |
| headers توقيع غائبة | 401 | MISSING_SIGNATURE_HEADERS |
| timestamp أقدم من 300 ثانية أو أكثر من 60 ثانية مستقبلًا | 401 | BAD_TIMESTAMP |
| HMAC مختلف | 401 | BAD_SIGNATURE |
| ليست Steam أو subject غير مطابق | 200 | ignored:true وسبب |
| username أو code فارغ | 200 | MISSING_USERNAME_OR_CODE مع ignored:true |
| تكرار حديث | 200 | saved:false و DUPLICATE_RECENT |
| حفظ ناجح | 200 | saved:true و user/code |
| تعذر حجز قفل الحفظ | 503 | SAVE_LOCK_TIMEOUT وRetry-After: 2 |
| فشل اتصال/حفظ | 500 | DB_CONNECT_FAIL أو SAVE_FAIL |

التحقق من HMAC يستخدم hash_equals. PHP يقبل steampowered.com فيfrom أوsteam فيsubject، ثم يشترط access from new في العنوان أو العلامة الموقعة hasSteamGuardCodeText=true. تحويل التاريخ ومعايير التكرار وأعمدة INSERT محفوظة. قبل SELECT/INSERT يُؤخذ GET_LOCK خاص بالقاعدة والاسم الموحّد والكود بانتظار حتى ثانيتين؛ finally يحرره قبل الرد. mysqli strict يمنع الإبلاغ عن INSERT فاشل كحفظ ناجح. لا توجد أعمدة أوفهارس أوجداول أومهاجرات جديدة. فحص التكرار الحالي هو LOWER(TRIM(UserName)) والكود وDateTime >= تاريخ الرسالة الأصلي ناقص60 ثانية، دون حد أعلى. هذا يحمي retries والطلبات المتزامنة المتعاونة على نفس MySQL؛ ليس حفظًا بمعرّف رسالة ثابت أوضمان exactly-once عام. أي كاتب آخر يجب أن يستخدم نفس القفل؛ حذف الصفوف القديمة يزيل دليل التكرار.

## 4. SMTP والسجلات

[NotificationService](../../../src/services/notification.service.js) يرسل تنبيهات الأمان وإعادة الربط والأخطاء عبر Nodemailer. رسائل app-access المعروفة تُتجاهل. باقي رسائل Microsoft المهمة تذهب إلى forwardTo وإلى DEV_EMAIL إن كان مختلفًا. تنبيه إعادة الربط له نفس الوجهتين، وتنبيه الخطأ العام هنا للـ developer فقط. عنوان forwardTo يُقرأ من SystemSetting ثم البيئة، مع cache خمس دقائق تُمسح عند تعديل الإعداد. تغيير عنوان التنبيه لا يغير STEAM_API_URL.

sendViaSMTP يعيد false بدل رمي الخطأ عند فشل SMTP. عدم وصول التنبيه لا يعني عدم وجود العطل الأصلي. PHP يكتب steam_api_requests.log، وملفات منفصلة للأخطاء ومشكلات السر والتوقيع عند حدوثها. قد تسجل هذه الملفات أسماء المستخدمين والأكواد؛ استخدم أمثلة صناعية عند مشاركة التشخيص.

```js
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const payload = {
  source: "mail-collector-graph",
  fromAccount: "mailbox@example.test",
  from: "noreply@steampowered.com",
  to: "mailbox@example.test",
  subject: "Steam access from new computer",
  receivedDateTime: "2026-10-19T10:00:00Z",
  internetMessageId: "<synthetic@example.test>",
  graphMessageId: "synthetic-message-1",
  username: "demo",
  code: "A1B2C",
  hasSteamGuardCodeText: false
};
const body = JSON.stringify(payload);
const timestamp = "1792404000";
const secret = "synthetic-example-only";
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${body}`).digest("hex");
assert.equal(signature.length, 64);
assert.equal(Object.hasOwn(payload, "body"), false);
// No network request is sent by this example.
```

## للتعمق

**اسم الموضوع:** HMAC signed HTTP payloads

**ابحث عن:** HMAC signed HTTP payloads official documentation

**مصادر موثوقة:** [Official reference](https://www.php.net/manual/en/function.hash-hmac.php)

[السابق](03-webhooks-queues.md) · [التالي](05-data-model.md) · [الفهرس](00-overview.md)
