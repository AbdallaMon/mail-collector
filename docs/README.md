# توثيق Mail Collector

شرح الكود الحالي كاملًا بالعربية والإنجليزية، بنفس تقسيم الفصول وربط المصادر وأسلوب عرض HTML المستخدم في Transaction-app. ابدأ باللغة المناسبة؛ الفصلان متقابلان في كل موضوع، والأمثلة متطابقة.

| الموضوع / Topic | العربية | English |
|---|---|---|
| Overview | [الفكرة ومسار الرسالة](learning/ar/00-overview.md) | [Overview](learning/en/00-overview.md) |
| Architecture | [الملفات والطبقات](learning/ar/01-architecture.md) | [Architecture](learning/en/01-architecture.md) |
| Microsoft OAuth | [الربط والتوكنات](learning/ar/02-microsoft-oauth.md) | [OAuth and tokens](learning/en/02-microsoft-oauth.md) |
| Webhooks and queues | [الإشعارات والتجديد](learning/ar/03-webhooks-queues.md) | [Webhooks and queues](learning/en/03-webhooks-queues.md) |
| Steam and PHP | [عقد النقل والاستقبال](learning/ar/04-steam-php.md) | [Steam/PHP contract](learning/en/04-steam-php.md) |
| Data model | [الجداول والحالات](learning/ar/05-data-model.md) | [Data model](learning/en/05-data-model.md) |
| API | [كل المسارات والعقود](learning/ar/06-api-reference.md) | [API reference](learning/en/06-api-reference.md) |
| Frontend | [الصفحات وحدودها](learning/ar/07-frontend.md) | [Frontend](learning/en/07-frontend.md) |
| Operations | [الإعدادات والتشغيل](learning/ar/08-configuration-operations.md) | [Configuration and operations](learning/en/08-configuration-operations.md) |
| Verification | [التنظيم والاختبارات](learning/ar/09-verification-refactor.md) | [Verification and refactor](learning/en/09-verification-refactor.md) |
| Deferred issues | [الأدلة والحلول المقترحة](learning/ar/10-known-issues.md) | [Known issues](learning/en/10-known-issues.md) |
| Source reference | [كل ملفات المصدر](learning/ar/11-source-reference.md) | [Source reference](learning/en/11-source-reference.md) |
| Complete local run | [محاكاة Microsoft وSteam محليًا](learning/ar/12-local-demo.md) | [Complete local simulation](learning/en/12-local-demo.md) |
| Reliability repairs | [الإصلاحات وحدود النشر](learning/ar/13-reliability-fixes.md) | [Repairs and deployment boundaries](learning/en/13-reliability-fixes.md) |

المصدر هو Markdown داخل learning؛ المخرجات داخل html مولدة ولا تُحرَّر مباشرة. أوامر العرض والفحص:

```sh
npm run docs:check
npm run docs:build
npm run docs:serve
```

The sources are paired Arabic/English Markdown chapters under learning. Generated HTML lives under html and is rebuilt rather than edited. The local documentation server defaults to [127.0.0.1:5501](http://127.0.0.1:5501/). Source-file links work in Markdown and become plain references in HTML; the documentation server does not expose application files or credentials.

التوثيق يتضمن تنظيم الكود وإصلاحات20 أكتوبر المحلية، دون نشر على الإنتاج أوتغيير schema. [تقرير التحقيق الأصلي](DIAGNOSIS.ar.md) لقطة مؤرخة؛ فصل المشكلات يوضح ما أُصلح وما بقي باللغتين.

The documentation includes the organized code and locally implemented 20 October repairs, without deployment or schema changes. The original investigation is a dated snapshot; the known-issues chapter distinguishes repaired behavior from remaining limitations.
