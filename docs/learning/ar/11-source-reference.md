---
title: "مرجع كل ملفات المصدر"
category: "Mail Collector"
overview: "هذا الجدول يربط كل ملف داخل src و public و prisma، ومستقبل PHP، وأدوات/اختبارات المشروع. عمود الأعضاء يعرض methods المعرّفة في class أو functions العليا كدليل بحث، وليس وعدًا بأن كل method مسار مستخدم تلقائيًا. اقرأ الفصل المختص لتفاصيل العقد والآثار. التوثيق يظل ملف Markdown قابلًا للتحرير؛ فحص docs:check يبلغ عن ملف جديد لم تتم إضافته للمرجع."
---

# مرجع كل ملفات المصدر

[English](../en/11-source-reference.md)

> مراجعة المصدر: 2026-10-20. يتضمن إصلاحات الاعتمادية المحلية؛ لا يعني نشرها على الإنتاج. الأمثلة صناعية.

## 1. كيف تستخدم المرجع

هذا الجدول يربط كل ملف داخل src و public و prisma، ومستقبل PHP، وأدوات/اختبارات المشروع. عمود الأعضاء يعرض methods المعرّفة في class أو functions العليا كدليل بحث، وليس وعدًا بأن كل method مسار مستخدم تلقائيًا. اقرأ الفصل المختص لتفاصيل العقد والآثار. التوثيق يظل ملف Markdown قابلًا للتحرير؛ فحص docs:check يبلغ عن ملف جديد لم تتم إضافته للمرجع.

| File | المسؤولية | Members |
|---|---|---|
| [prisma/migrations/20260204162144_init/migration.sql](../../../prisma/migrations/20260204162144_init/migration.sql) | SQL تاريخي؛ يُطبق عبر Prisma migration فقط | — |
| [prisma/migrations/20260205123504_change_some/migration.sql](../../../prisma/migrations/20260205123504_change_some/migration.sql) | SQL تاريخي؛ يُطبق عبر Prisma migration فقط | — |
| [prisma/migrations/20260206123821_change_mail_account/migration.sql](../../../prisma/migrations/20260206123821_change_mail_account/migration.sql) | SQL تاريخي؛ يُطبق عبر Prisma migration فقط | — |
| [prisma/migrations/20260206153702_added/migration.sql](../../../prisma/migrations/20260206153702_added/migration.sql) | SQL تاريخي؛ يُطبق عبر Prisma migration فقط | — |
| [prisma/migrations/20260207055352_added_subs/migration.sql](../../../prisma/migrations/20260207055352_added_subs/migration.sql) | SQL تاريخي؛ يُطبق عبر Prisma migration فقط | — |
| [prisma/migrations/migration_lock.toml](../../../prisma/migrations/migration_lock.toml) | تثبيت مزود المهاجرات mysql | — |
| [prisma/schema.prisma](../../../prisma/schema.prisma) | نماذج MySQL والعلاقات والـ enums | — |
| [prisma/seed.js](../../../prisma/seed.js) | CLI قديم لإنشاء administrator؛ له بيانات ثابتة | main |
| [public/accounts.html](../../../public/accounts.html) | صفحة HTML ثابتة | — |
| [public/css/styles.css](../../../public/css/styles.css) | تنسيق صفحات التطبيق | — |
| [public/dashboard.html](../../../public/dashboard.html) | صفحة HTML ثابتة | — |
| [public/index.html](../../../public/index.html) | صفحة HTML ثابتة | — |
| [public/js/accounts.js](../../../public/js/accounts.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | — |
| [public/js/api.js](../../../public/js/api.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | getHeaders, request, get, post, put, patch, delete |
| [public/js/auth.js](../../../public/js/auth.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | isLoggedIn, getUser, getToken, login, logout, requireAuth |
| [public/js/dashboard.js](../../../public/js/dashboard.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | loadDashboard, loadRecentLogs, logout |
| [public/js/login.js](../../../public/js/login.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | — |
| [public/js/logs.js](../../../public/js/logs.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | loadLogs, prevPage, nextPage, logout |
| [public/js/modal.js](../../../public/js/modal.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | — |
| [public/js/oauth-callback.js](../../../public/js/oauth-callback.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | handleCallback |
| [public/js/settings.js](../../../public/js/settings.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | loadConfig, loadWorkerStatus, handleForwardEmailChange, testForward, handlePasswordChange, logout |
| [public/js/ui.js](../../../public/js/ui.js) | سلوك صفحة/helper في المتصفح؛ راجع فصل الواجهة | formatDate, formatRelativeTime, statusBadge, showLoading, showEmpty, showError, toast, confirm, renderSidebar |
| [public/logs.html](../../../public/logs.html) | صفحة HTML ثابتة | — |
| [public/oauth-callback.html](../../../public/oauth-callback.html) | صفحة HTML ثابتة | — |
| [public/settings.html](../../../public/settings.html) | صفحة HTML ثابتة | — |
| [scripts/check-docs-coverage.mjs](../../../scripts/check-docs-coverage.mjs) | فحص تغطية API/env/models/files والأمثلة | — |
| [scripts/check-learning-docs.mjs](../../../scripts/check-learning-docs.mjs) | فحص تطابق الفصول والروابط | walkMarkdownFiles, pathExists, findRepairedTarget, normalizeMarkdownTarget, hasLearningSection, hasExplicitLearningGuide |
| [scripts/check.js](../../../scripts/check.js) | فحص syntax/imports دون تنفيذ runtime | — |
| [scripts/docs-site-server.mjs](../../../scripts/docs-site-server.mjs) | عرض HTML محليًا وإعادة البناء | sendJson, runBuild, sanitizePath |
| [scripts/docs-site.css](../../../scripts/docs-site.css) | ثيم توثيق RTL/LTR من Transaction-app | — |
| [scripts/generate-docs-site.mjs](../../../scripts/generate-docs-site.mjs) | توليد HTML من Markdown | measureTopbar, syncNavigation, collect, slugify, stripExt, toTitleCase, trimQuotes, parseFrontmatter, headingMatch, tableSeparator, parseTable, countIndent, parseList, parseBlockquote, parseBlocks, findHeadingIndices, isNumberedTitle, parseSectionContent, cleanSectionId, parseMarkdownDocument, safeDescription, findFirstParagraph, escapeHtml, renderInline, renderListHtml, renderTableHtml, renderBlockHtml, renderBlocksHtml, splitLeadingNumber, renderSectionHtml, buildSidebarHtml, breadcrumbHtml, renderDocPage, renderIndexPage, folderCardHtml, docCardHtml, renderFolderIndexPage, formatPhaseLabel, renderRootIndexPage, interactiveJsContent, ensureDir, readMarkdownFiles, dirExists, readMarkdownFilesRecursive, posixNormalize, makeDocKey, posixDirname, relFromTo, relIndex, assetPrefixFor, folderLabel, docPageRel, buildDocTree, sortedChildren, countItems, buildDocLinkIndex, rewriteInternalDocLinks, buildSection, resolvePhases, build |
| [src/app.js](../../../src/app.js) | تجميع Express وترتيب middleware | create |
| [src/config/database.js](../../../src/config/database.js) | Prisma singleton ودورة الاتصال | — |
| [src/config/index.js](../../../src/config/index.js) | قراءة وتحويل 37 إعدادًا للتطبيق | — |
| [src/config/logger.js](../../../src/config/logger.js) | Winston console/files وتدوير الحجم | — |
| [src/controllers/accounts.controller.js](../../../src/controllers/accounts.controller.js) | HTTP adapter للطلبات والردود | reauthenticate, oauthUrl, list, getById, create, reconnect, sync, syncAll, test, update, remove, messages |
| [src/controllers/auth.controller.js](../../../src/controllers/auth.controller.js) | HTTP adapter للطلبات والردود | login, me, connectMicrosoft, microsoftCallback, changePassword |
| [src/controllers/dashboard.controller.js](../../../src/controllers/dashboard.controller.js) | HTTP adapter للطلبات والردود | stats, accountsOverview, recentActivity, syncAll, retryFailed, health, getConfig, workerStatus, updateConfig, testForward |
| [src/controllers/logs.controller.js](../../../src/controllers/logs.controller.js) | HTTP adapter للطلبات والردود | list, getById, retry, cleanup |
| [src/controllers/webhooks.controller.js](../../../src/controllers/webhooks.controller.js) | HTTP adapter للطلبات والردود | receive |
| [src/middleware/auth.middleware.js](../../../src/middleware/auth.middleware.js) | التحقق من JWT والمستخدم | — |
| [src/middleware/error.middleware.js](../../../src/middleware/error.middleware.js) | تحويل أخطاء HTTP | — |
| [src/modules/accounts/accounts.usecase.js](../../../src/modules/accounts/accounts.usecase.js) | قواعد وتنسيق usecase | findById, requireAccount, list, getById, create, reconnect, sync, syncAll, test, update, remove, messages |
| [src/modules/auth/auth.usecase.js](../../../src/modules/auth/auth.usecase.js) | قواعد وتنسيق usecase | login, me, changePassword |
| [src/modules/dashboard/dashboard.usecase.js](../../../src/modules/dashboard/dashboard.usecase.js) | قواعد وتنسيق usecase | stats, accountsOverview, recentActivity, syncAll, retryFailed, health, getConfig, workerStatus, updateConfig, findConnectedAccount |
| [src/modules/logs/logs.usecase.js](../../../src/modules/logs/logs.usecase.js) | قواعد وتنسيق usecase | list, getById, retry, cleanup |
| [src/modules/webhooks/webhooks.policy.js](../../../src/modules/webhooks/webhooks.policy.js) | قواعد الفلترة والأخطاء | isAuthOrSuspendError, isSteamMessage, isImportantSender, buildErrorDetails |
| [src/modules/webhooks/webhooks.usecase.js](../../../src/modules/webhooks/webhooks.usecase.js) | قواعد وتنسيق usecase | processMessage, enqueueNotification |
| [src/queues/forward.queue.js](../../../src/queues/forward.queue.js) | تسجيل مستهلك webhook-forward وخياراته | — |
| [src/repositories/account.repo.js](../../../src/repositories/account.repo.js) | استعلامات Prisma لهذه المسؤولية | findUnique, findMany, count, create, update, delete, aggregate, findFirst, upsert, groupBy |
| [src/repositories/admin.repo.js](../../../src/repositories/admin.repo.js) | استعلامات Prisma لهذه المسؤولية | findUnique, create, update |
| [src/repositories/messageLog.repo.js](../../../src/repositories/messageLog.repo.js) | استعلامات Prisma لهذه المسؤولية | findMany, count, findUnique, update, deleteMany, upsert |
| [src/repositories/setting.repo.js](../../../src/repositories/setting.repo.js) | استعلامات Prisma لهذه المسؤولية | findUnique, upsert |
| [src/repositories/subscription.repo.js](../../../src/repositories/subscription.repo.js) | استعلامات Prisma لهذه المسؤولية | upsert, findUnique, update, deleteMany, findMany |
| [src/repositories/syncState.repo.js](../../../src/repositories/syncState.repo.js) | استعلامات Prisma لهذه المسؤولية | update, findUnique, upsert |
| [src/repositories/system.repo.js](../../../src/repositories/system.repo.js) | استعلامات Prisma لهذه المسؤولية | ping |
| [src/repositories/systemLog.repo.js](../../../src/repositories/systemLog.repo.js) | استعلامات Prisma لهذه المسؤولية | create, findMany, deleteMany |
| [src/repositories/token.repo.js](../../../src/repositories/token.repo.js) | استعلامات Prisma لهذه المسؤولية | upsert, findUnique |
| [src/routes/accounts.routes.js](../../../src/routes/accounts.routes.js) | مسارات HTTP وحماية وربط controller | asyncHandler |
| [src/routes/auth.routes.js](../../../src/routes/auth.routes.js) | مسارات HTTP وحماية وربط controller | asyncHandler |
| [src/routes/dashboard.routes.js](../../../src/routes/dashboard.routes.js) | مسارات HTTP وحماية وربط controller | asyncHandler |
| [src/routes/logs.routes.js](../../../src/routes/logs.routes.js) | مسارات HTTP وحماية وربط controller | — |
| [src/routes/webhooks.routes.js](../../../src/routes/webhooks.routes.js) | مسارات HTTP وحماية وربط controller | — |
| [src/server.js](../../../src/server.js) | بدء/إنهاء HTTP والاتصال وإنشاء admin | start, shutdown |
| [src/services/admin.service.js](../../../src/services/admin.service.js) | إنشاء admin الافتراضي عند startup | ensureDefaultAdmin |
| [src/services/forwarder.service.js](../../../src/services/forwarder.service.js) | تنسيق Steam وتسليم/تسجيل وتنبيه مع cache الإعداد | constructor, getForwardToEmail, clearForwardToCache, forwardGraphMessage, logForward, sendViaSMTP, sendImportantEmailViaSMTP, sendReauthNotification, sendErrorNotificationToDev |
| [src/services/graph.service.js](../../../src/services/graph.service.js) | Graph client و retry ورسائل و delta واختبار Inbox | constructor, createClient, withRetry, sleep, initializeDelta, getDeltaMessages, getMessage, getMessageForWebhook, testConnection |
| [src/services/microsoftAuth.service.js](../../../src/services/microsoftAuth.service.js) | OAuth والتوكنات والربط | constructor, generateAuthUrl, exchangeCodeForTokens, refreshAccessToken, getUserProfile, storeTokens, getValidAccessToken, completeOAuthFlow |
| [src/services/notification.service.js](../../../src/services/notification.service.js) | تنبيهات SMTP وقوالبها | constructor, sendViaSMTP, sendImportantEmailViaSMTP, sendReauthNotification, sendErrorNotificationToDev |
| [src/services/steamApi.service.js](../../../src/services/steamApi.service.js) | parser والتوقيع و HTTP إلى PHP | signApiPayload, sendSteamToApi, extractSteamCodeAndUsername |
| [src/services/sync.service.js](../../../src/services/sync.service.js) | delta/retry اليدوي والإحصائيات | sleep, processMessage, syncMailbox, syncAllMailboxes, retryFailedMessages, retryMessage, getStatistics |
| [src/services/webhook.service.js](../../../src/services/webhook.service.js) | إنشاء/تجديد/تحقق اشتراك Microsoft | constructor, generateClientState, getExpirationDateTime, createSubscription, _deleteOldSubscriptionFromMicrosoft, renewSubscription, getAccountsNeedingSubscription, getExpiringSubscriptions, validateNotification, getSubscriptionStatus |
| [src/utils/ApiError.js](../../../src/utils/ApiError.js) | خطأ HTTP مع status/details | constructor |
| [src/utils/asyncHandler.js](../../../src/utils/asyncHandler.js) | تمريررفض Promise إلى next | — |
| [src/utils/encryption.js](../../../src/utils/encryption.js) | CryptoJS AES لحماية tokens | constructor, encrypt, decrypt |
| [src/worker.js](../../../src/worker.js) | نقطة بدء عامل الصيانة | — |
| [src/workers/webhookMaintenance.worker.js](../../../src/workers/webhookMaintenance.worker.js) | planner و create/renew ودورة حياة الصيانة | constructor, planMaintenance, createSubscription, renewSubscription, start, shutdown |
| [steam_inbound.php](../../../steam_inbound.php) | عقد الاستقبال والتوقيع والفلترة وحفظ PHP | — |
| [test/http.test.js](../../../test/http.test.js) | اختبارات HTTP بعقود حقيقية وخدمات معزولة | — |
| [test/mail-flow.test.js](../../../test/mail-flow.test.js) | اختبارات مسار الرسالة والتوكن والتوافق | — |
| [test/support/load-app.js](../../../test/support/load-app.js) | VM وبدائل I/O للاختبارات | createHarness |

| [local-demo/compose.env](../../../local-demo/compose.env) | ملف فارغ يمنع قراءة Compose لبيئة الإنتاج | — |
| [local-demo/compose.yaml](../../../local-demo/compose.yaml) | MySQL وRedis وPHP مستقلون ومنافذ loopback | — |
| [local-demo/mysql/init.sql](../../../local-demo/mysql/init.sql) | جدول IncomingCodes صناعي وصلاحيات قاعدة الاستقبال المحلية | — |
| [local-demo/php/Dockerfile](../../../local-demo/php/Dockerfile) | صورة PHP الرسمية مع mysqli | — |
| [local-demo/php/functions.php](../../../local-demo/php/functions.php) | اتصال قاعدة PHP التجريبية فقط | — |
| [local-demo/php/router.php](../../../local-demo/php/router.php) | توجيه المستقبل الحقيقي وhealth وقراءة صفوف التجربة | — |
| [local-demo/php/steam_secret.php](../../../local-demo/php/steam_secret.php) | سر HMAC صناعي خاص بالتجربة | — |
| [scripts/local-demo/bootstrap.js](../../../scripts/local-demo/bootstrap.js) | تحميل إعدادات محلية ومنع dotenv الإنتاج وتوجيه Microsoft | — |
| [scripts/local-demo/client.js](../../../scripts/local-demo/client.js) | أوامر إرسال رسالة صناعية وإيقاف بيئة التجربة | — |
| [scripts/local-demo/events.js](../../../scripts/local-demo/events.js) | أحداث JSON موسومة LOCAL_SIMULATION | — |
| [scripts/local-demo/mock-microsoft.js](../../../scripts/local-demo/mock-microsoft.js) | بديل OAuth وGraph والاشتراكات دون اتصال خارجي | constructor, issueTokens, requireToken, createSubscription, inject, createApp |
| [scripts/local-demo/run.js](../../../scripts/local-demo/run.js) | تشغيل Docker والمهاجرات والعمليات والسيناريو والإيقاف | constructor, execute, compose, ensurePortAvailable, launch, migrate, run, stop |
| [scripts/local-demo/scenario.js](../../../scripts/local-demo/scenario.js) | الربط وrefresh وحقن Steam والتحقق من سجل PHP وصف MySQL وSMTP | constructor, verifySession, sendSteam, run |
| [scripts/local-demo/server.js](../../../scripts/local-demo/server.js) | تشغيل التطبيق الفعلي على loopback مع قاعدة الاختبار | — |
| [scripts/local-demo/services.js](../../../scripts/local-demo/services.js) | بدء HTTP Microsoft المحاكى وSMTP المحلي | — |
| [scripts/local-demo/settings.js](../../../scripts/local-demo/settings.js) | إعدادات صناعية ثابتة وحراسة أهداف التشغيل المحلي | constructor, environment, assertLocalUrl, assertLocalDocker |
| [scripts/local-demo/smtp-sink.js](../../../scripts/local-demo/smtp-sink.js) | التقاط SMTP وكتابة ملفات EML محلية | constructor, accept, listen, close |
| [scripts/local-demo/worker.js](../../../scripts/local-demo/worker.js) | تشغيل عامل الصيانة الفعلي بإعدادات التجربة | — |
| [test/local-demo.test.js](../../../test/local-demo.test.js) | فحص عزل الإعدادات ورفض الأهداف الخارجية | — |

## 2. أين تبدأ عند تعديل معين

إضافة endpoint تبدأ من routes ثم controller/usecase ثم repo؛ تعديل Microsoft authorization يبدأ من MicrosoftAuthService؛ تعديل الفلترة يبدأ من webhooks.policy و ForwarderService معًا؛ تعديل parsing/HMAC من SteamApiService و PHP؛ تغيير retry أو job identity من queue/worker مع مراجعة البيانات القديمة في Redis؛ تعديل العرض من HTML و JavaScript المرتبطين مع الحفاظ على عقد API.

لا تنقل قواعد العمل إلى الراوتر، ولا تنسخ secrets إلى docs. تتبع callers قبل حذف method. المهاجرات سجل تاريخي وليست كودًا زائدًا يُحذف لمجرد عدم استدعائها من Node. SOURCE_TABLE يغطي الملفات؛ الشرح السلوكي موزع على الفصول السابقة.

مصادر إصلاح الاعتمادية: [upstreamErrorPolicy.js](../../../src/utils/upstreamErrorPolicy.js)، [reliability.test.js](../../../test/reliability.test.js)، [verify-repairs.js](../../../scripts/local-demo/verify-repairs.js).

## للتعمق

**اسم الموضوع:** Code navigation and module responsibilities

**ابحث عن:** Code navigation and module responsibilities official documentation

**مصادر موثوقة:** [Official reference](https://nodejs.org/api/modules.html)

[السابق](10-known-issues.md) · [الفهرس](00-overview.md)

[التالي](12-local-demo.md)
