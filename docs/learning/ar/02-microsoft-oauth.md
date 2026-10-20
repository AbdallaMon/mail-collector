---
title: "ربط Microsoft والتوكنات"
category: "Mail Collector"
overview: "JWT الخاص باللوحة يصدر من POST /api/auth/login بعد bcrypt.compare، ويحمل userId و email و role، بعمر JWT_EXPIRES_IN. authenticate يتحقق من توقيعه ووجود AdminUser فعّال في كل طلب. لا توجد آلية refresh خاصة بـ JWT؛ انتهاء الجلسة يعيد المستخدم إلى تسجيل الدخول للوحة."
---

# ربط Microsoft والتوكنات

[English](../en/02-microsoft-oauth.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. جلسة اللوحة ليست ربط البريد

JWT الخاص باللوحة يصدر من POST /api/auth/login بعد bcrypt.compare، ويحمل userId و email و role، بعمر JWT_EXPIRES_IN. authenticate يتحقق من توقيعه ووجود AdminUser فعّال في كل طلب. لا توجد آلية refresh خاصة بـ JWT؛ انتهاء الجلسة يعيد المستخدم إلى تسجيل الدخول للوحة.

توكنات Microsoft منفصلة لكل MailAccount داخل MailToken: accessToken لطلبات Graph و refreshToken للحصول على بديل. تعديل JWT_SECRET لا يجدّد حساب Microsoft. client secret يخص تسجيل التطبيق في Microsoft وليس كلمة مرور أي mailbox.

## 2. المسار من زر Connect إلى قاعدة البيانات

1. [accounts.js](../../../public/js/accounts.js) يطلب GET /api/accounts/oauth/url ثم ينقل المتصفح إلى الرابط.
2. generateAuthUrl يصنع state من accountId و nonce و timestamp ثم يحوّله إلى base64url؛ يرسل response_type=code و response_mode=query و prompt=consent والصلاحيات المضبوطة.
3. Microsoft يرجع إلى MICROSOFT_REDIRECT_URI، وهو callback في الباك إند.
4. [auth.controller](../../../src/controllers/auth.controller.js) يعالج error أو غياب code/state. عند نجاح الاستكمال يوجّه إلى /oauth/callback?success=true مع البريد ومعرف الحساب.
5. completeOAuthFlow يفك state، يبادل code على token endpoint، ثم يستدعي /me. البريد هو profile.mail أو userPrincipalName.
6. إذا تضمن state معرفًا، يحدّث الحساب به؛ وإلا upsert بالبريد. يجعل الحالة CONNECTED ويمسح lastError و errorCount، ثم يحفظ tokens و syncState ويحاول إنشاء subscription.

فشل إنشاء الاشتراك الأخير يُسجّل دون إفشال OAuth. لذلك success=true يعني اكتمال الربط في هذه الدالة، ولا يثبت وجود subscription صالح أو وصول كود إلى PHP. الكتابات المتعددة ليست transaction واحدة.

## 3. التجديد والتشفير

[getValidAccessToken](../../../src/services/microsoftAuth.service.js) يقرأ صف التوكن. إذا بقي أكثر من خمس دقائق في expiresAt يعيد accessToken بعد فك التشفير؛ وإلا يفك refreshToken ويرسله إلى token endpoint. العمر الجديد مشتق من expires_in، و refreshToken البديل يُحفظ إن أرسلته Microsoft؛ عند update لا يُستبدل القديم إن غاب البديل.

[encryption.js](../../../src/utils/encryption.js) يستخدم CryptoJS.AES مع ENCRYPTION_KEY كعبارة سرية، وليس تشفير GCM الخاص بمشروع Transaction-app ولا raw hex key مثبت الطول. لا تغيّر المفتاح مع قاعدة حالية دون خطة لتحويل البيانات المشفرة. توجد معالجة للنتيجة الفارغة وفشل فك التشفير. المعالجة الحالية لا تسلسل refresh المتزامن لكل حساب.

## 4. ما يطبقه الكود وما يحتاج إصلاحًا مستقلًا

التجديد يستخدم [upstreamErrorPolicy](../../../src/utils/upstreamErrorPolicy.js) لتصنيف آمن: عطل الشبكة و429 و5xx يحتفظون بحالة الاتصال، بينما غياب التوكن أو invalid_grant/interaction_required الحقيقي قد يتطلب إعادة الربط. بيانات التطبيق غير الصالحة، ومنها AADSTS7000222، مشكلة إعداد التطبيق ولا تفصل كل الحسابات. الخطأ يحتفظ بالحالة وOAuth/AAD codes وRetry-After دون Axios request/config المحتوي على أسرار. فشل فك التشفير أو التخزين وحده لا يعني إلغاء الموافقة. قراءة الرسالة من Graph تطلب refresh إجباريًا مرة واحدة بعد401، ثم تبلغ عن الرفض التالي دون دورة غير محدودة.

state الحالي يُفك كـ JSON، ولا توجد مقارنة nonce بجلسة محفوظة أو فحص لعمر timestamp في completeOAuthFlow. وصفه بأنه حماية CSRF مكتملة غير دقيق. مسار reauth/:id عام لتسهيل رابط البريد. هذه حدود موجودة وليست إصلاحات تمت في التنظيم.

الصلاحيات الافتراضية offline_access و User.Read و Mail.Read و Mail.Send محفوظة. المسار الحالي لم يعد يستدعي Graph forward، لكن إزالة Mail.Send من تسجيل التطبيق أو الموافقة تغيير صلاحيات مستقل. راجع [الأسباب المؤجلة](10-known-issues.md) قبل ربط أي عطل تلقائي بانتهاء refresh token.

## للتعمق

**اسم الموضوع:** OAuth authorization code and refresh tokens

**ابحث عن:** OAuth authorization code and refresh tokens official documentation

**مصادر موثوقة:** [Official reference](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)

[السابق](01-architecture.md) · [التالي](03-webhooks-queues.md) · [الفهرس](00-overview.md)
