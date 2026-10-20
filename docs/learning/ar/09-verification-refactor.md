---
title: "التنظيم والاختبارات وصيانة التوثيق"
category: "Mail Collector"
overview: "انتقلت أجسام handlers من routes إلى classes في controllers و usecases، واستعلامات Prisma إلى repositories. انقسم ملف webhooks إلى controller و policy و usecase و queue. انقسم ForwarderService إلى تنسيق التسليم و SteamApiService و NotificationService. فصل app عن server، ونقل worker إلى class مخصص. حافظ التنظيم علىURLs وعقود الردود وpayload وتشفير التوكنات. دفعة الإصلاح اللاحقة غيّرت إعادة المحاولة وتصنيف الأخطاء والاحتفاظ بالمهام."
---

# التنظيم والاختبارات وصيانة التوثيق

[English](../en/09-verification-refactor.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. ما تغير في الكود

انتقلت أجسام handlers من routes إلى classes في controllers و usecases، واستعلامات Prisma إلى repositories. انقسم ملف webhooks إلى controller و policy و usecase و queue. انقسم ForwarderService إلى تنسيق التسليم و SteamApiService و NotificationService. فصل app عن server، ونقل worker إلى class مخصص. حافظ التنظيم علىURLs وعقود الردود وpayload وتشفير التوكنات. دفعة الإصلاح اللاحقة غيّرت إعادة المحاولة وتصنيف الأخطاء والاحتفاظ بالمهام.

أزيلت طرق Graph غير المستدعاة getMessagePreview/getMessageAttachments/forwardMessage و adminOnly غير المستخدم و CSS قديم، ومعالج زر sync غير المرتبط، وسكربتا setup و rate-limit القديمان غير المستخدمين في commands الحالية. لم يحذف ذلك endpoints اليدوية أو schema/history. الحزمة crypto استبدلت بالمكتبة المدمجة، و UUID المباشر صار randomUUID. حزم mailparser/ioredis المباشرة/cookie-parser غير اللازمة أزيلت، مع بقاء Redis dependency الداخلية لـ Bull. node --watch حل محل nodemon.

## 2. تحديث الاعتماديات السابق

التحديث السابق رفع Prisma/client إلى 6.19.3 مع بقائهما متساويين، و Axios1.20.0 و bcryptjs3.0.3 و Express4.22.3 و Helmet8.3.0 و Nodemailer10.1.7، مع package-lock. Express 5 و Prisma7 لم يدخلا هذا التنظيم. overrides تثبت uuid 11.1.1 داخل Bull و deepmerge-ts8 داخل Prisma config؛ لا تعني أن uuid مكتبة مباشرة للتطبيق. الحد الأدنى Node22.12 والمستهدف Node24.

دفعة إصلاح20 أكتوبر لا تُرقّي اعتماديات التشغيل مجددًا. فحص npm audit السابق بتاريخ 19 أكتوبر انتهى بصفر ثغرات معروفة؛ هذه نتيجة في ذلك التاريخ وليست ضمانًا دائمًا. المرجع الحالي للإصدارات هو [package.json](../../../package.json) و[package-lock.json](../../../package-lock.json).

## 3. ماذا تختبر الاختبارات

[mail-flow.test.js](../../../test/mail-flow.test.js) يغطي توقيع PHP و payload بلا body، parsing/filters، منع معالجة inactive، رفض clientState غير الصحيح، refresh/tokens encryption، الحفاظ على سلوك الخطأ الحالي، وجدولة الصيانة وتوافق bcrypt/JWT/Nodemailer/UUID. [http.test.js](../../../test/http.test.js) يشغل Express محليًا لصفحات HTTP و 401 و validationToken/login/list/log details.

[load-app.js](../../../test/support/load-app.js) يحمّل الوحدات فيVM ويستبدل config/database/Bull/Axios/SMTP؛ fetch الخارجي مرفوض افتراضيًا. [reliability.test.js](../../../test/reliability.test.js) يتحقق من التصنيف واستعادة المهام وrefresh واحد بعد401 ونتائجAPI ومنع تكرار النجاح وتنبيهات المطور حتى عند فشل تسجيل الخطأ. الاختبار الحالي يشترط بقاء الاتصال بعد خطأ refresh مؤقت. أمر local:verify يستخدم PHP/MySQL/Redis حقيقيين محليًا ويختبر أعطالًا صناعية قبل/بعد الحفظ والطلبات المتزامنة ومهمة Redis قديمة فاشلة. البريد كله يُلتقط محليًا.

المقارنة المحلية السابقة مع baseline الأصلي طابقت 31 endpoint وردودها وتسلسل استعلاماتها على fixtures محددة. ليست تغطية لكل المدخلات. check يفحص syntax/imports دون تشغيل التطبيق، و Prisma validate/generate لا يطبقان migration. لا يوجد ادعاء بنشر نسخة جديدة أو اختبار end-to-end حقيقي على حساب Microsoft.

## 4. كيف تعدل هذه الوثائق

تُكتب مصادر docs/learning/ar و docs/learning/en بأسماء فصول متقابلة، مع روابط تبديل اللغة وروابط الكود. كل فصل يحتوي موضوعًا وكلمات بحث ومصدرًا للتعمق. أمثلة JavaScript/JSON/Prisma متطابقة بين اللغتين، والبيانات صناعية. يُستخدم نفس مولد HTML و CSS الخاص بـ Transaction-app بعد تكييف الاسم ومنفذ العرض المحلي.

شغّل docs:check بعد أي تعديل؛ يفحص أزواج اللغات والروابط والأمثلة وتغطية endpoints/env/models/source. docs:build يعيد بناء docs/html، و docs:serve يعرضه. html مخرجات مستثناة من Git. عند نقل ملف حدّث روابطه في اللغتين؛ عند تغيير endpoint أو env أو model راجع الفصل المختص ومرجع الملفات. فحوص التغطية تثبت وجود المرجع، وليست بديلًا عن مراجعة صحة الشرح.

```sh
npm run check
npm test
npm run docs:check
npm run docs:build
```

## للتعمق

**اسم الموضوع:** Node test runner and behavior-preserving refactoring

**ابحث عن:** Node test runner and behavior-preserving refactoring official documentation

**مصادر موثوقة:** [Official reference](https://nodejs.org/api/test.html)

[السابق](08-configuration-operations.md) · [التالي](10-known-issues.md) · [الفهرس](00-overview.md)
