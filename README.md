# Bac-Taq + Z-Project Workplace

مستودع فيه **تطبيقين أندرويد** مستقلين بنفس الهوية البصرية، بيتبنوا من نفس الأدوات.

| التطبيق | الفكرة | الحزمة | حجم APK |
|---|---|---|---|
| **Bac-Taq** | مكتبة كتب الثانوية العامة (4 مواد) + قارئ PDF + إشارات — أوفلاين 100% | `com.bactaq.app` | 51 م.ب |
| **Z-Project Workplace** | ورك سبيس الفصل: **الطالب بيكتب كوده → اسمه يظهر → يسجّل وحسابه يتحفظ** + لوحة مدرس | `com.bactaq.zwork` | 0.38 م.ب |

## الهيكل

```
bactaq/          web/ (html+css+js+books)  android/ (manifest, res, src)
zworkplace/      index.html, css/, js/     ← واجهة الويب (شل محلي)
zworkplace/server/  index.js + db.js + auth.js + seed.js   ← سيرفر الفصل (Node)
zworkplace/samples/  نماذج قاعدة البيانات (CSV / JSON / الشرح)
zworkplace/android/ manifest, res, src      ← تطبيق أندرويد بسلك للـ API
dist/            Bac-Taq-1.8.apk + Z-Project-0.3.apk
keystore/        bactaq.jks (Bac-Taq) + zwork.jks (Z-Project) — نفس كلمة السر
tools/           build_apk.sh (المبني الموحّد) + فحوص + سكربتات
tests/           اختبارات Bac-Taq (jsdom)
```

## البناء

```bash
# أدوات مرة واحدة
pip install jdk4py
export JAVA=$(python3 -c "import jdk4py;print(jdk4py.JAVA_HOME)")/bin/java
export JAVAC_JAR=/path/to/tools.jar

bash tools/build_apk.sh 1.8 9 bactaq       # dist/Bac-Taq-1.8.apk
bash tools/build_apk.sh 0.3 3 zworkplace   # dist/Z-Project-0.3.apk

# تغيير عنوان سيرفر الفصل وقت البناء (الافتراضي من res/values/strings.xml)
ZAPI_BASE=https://my-server.example.com bash tools/build_apk.sh 0.3 3 zworkplace
```

## سيرفر الفصل (Z-Project)

الواجهة في `zworkplace/` بتحتاج سيرفر. تشغيله:

```bash
cd zworkplace
node server/index.js          # http://0.0.0.0:3100   (PORT لتغييره)
ZDB=/var/lib/zwork.db node server/index.js   # مسار قاعدة البيانات

node server/seed.js 300 --reset              # كشف تجريبي 300 طالب
```

أول تشغيل بينشئ مدرس: **`gasser@z-school.local` / `zwork2026`**
(غيّرها بـ `TEACHER_EMAIL` / `TEACHER_PASS` / `TEACHER_NAME` قبل أول تشغيل).

### الفكرة

المدرس عنده قاعدة بيانات فيها **كود كل طالب واسمه**. الطالب بيكتب الكود، اسمه
بيظهر لوحده، ويسجّل. **التسجيل بيتحفظ** — لما يرجع يفتح التطبيق يلاقي حسابه
مفتوح، إلا لو سجّل خروج.

### تدفّق الطالب

1. **اكتب كودك** → الاسم بيظهر من قاعدة البيانات (الطالب **مش** بيكتب اسمه).
2. كلمة مرور + سؤال سري → **الحساب بيتعمل على طول** والدخول بيتم فورًا.
3. بعد كده: كل مرة يفتح التطبيق يلاقي نفسه داخل (`/api/me` بالجلسة المحفوظة).
4. لو سجّل خروج → يدخل بالكود + كلمة المرور (الكود بيفضل محفوظ في الخانة).
5. نسيت كلمة المرور → يجاوب السؤال السري.

### قاعدة بيانات الطلاب (اللي بترفعها)

من لوحة المدرس → تاب **قاعدة البيانات** → **رفع ملف**.

| المدعوم | ملاحظة |
|---|---|
| CSV / TSV | فواصل `,` أو `;` أو Tab، بعناوين عربية أو إنجليزية أو من غيرها |
| JSON | مصفوفة كائنات أو `{ "students": [...] }` |
| Excel (.xlsx) | أول ورقة شغل — بيتقرا في المتصفح نفسه |

الأعمدة المطلوبة: **الكود** و**الاسم**. اختياري: الرقم القومي، الموبايل،
ولي الأمر، الصف. النماذج في `zworkplace/samples/`.

الكود أي شكل من 3 لـ 40 حرف: `100000001` · `A12` · `S-2026-004` · `3-2-15`.

### مراجعة التسجيلات (اختياري)

الافتراضي **التسجيل فوري** — الطالب يدخل على طول. لو عايز تراجع كل تسجيل قبل
ما يدخل، فعّل **«مراجعة التسجيلات»** من تاب المراجعة، وساعتها الطالب بيستنى
لحد ما تقبله. القبول ممكن من غير فصل، أو تحطه في فصل + مجموعة (5 أفراد
والسيرفر بيرفض لو كملت).

### الاستيراد والتصدير

- `POST /api/teacher/roster` — يضيف/يحدّث
- `PUT /api/teacher/roster` — يستبدل بالكامل
- نفس الـ endpoints بتقبل `{ rows: [...] }` أو `{ csv: "..." }`

### قاعدة البيانات

`node:sqlite` (مدمج في Node 22) — ملف واحد، 9 جداول:
`teachers, roster, classes, groups, students, requests, sessions, audit, settings`.
بحجم ~300 طالب الجدول صغير جدًا (أقل من ١ م.ب) والاستعلامات مفهرسة على رقم الجلوس.

### الاختبارات

```bash
bash zworkplace/tests/run.sh     # 59 API + 49 واجهة + 6 Excel = 114 فحص
```

الاختبارات بتضرب سيرفر حقيقي على بورت عشوائي وقاعدة بيانات مؤقتة — مش mocks.

## الفحص

```bash
python3 tools/check_assets.py dist/<any>.apk     # كل أصل لازم يتحل صح
cd tests && npm test                             # Bac-Taq: 76 فحص
bash zworkplace/tests/run.sh                     # Z-Project: 114 فحص (API + واجهة + Excel)
node tools/deep_test.js                          # جولة كاملة في Chrome حقيقي
```

## التفعيل (Bac-Taq)
كلمة سر واحدة: `3mk.gasser.2026` — أول مرة بس بعد التثبيت.

## التوقيع
- Bac-Taq: `keystore/bactaq.jks` · alias `bactaq` · pass `bactaq2026` (**متغيّرش** لو عايز التحديثات تتثبت فوق بعضها)
- Z-Project: `keystore/zwork.jks` · alias `zwork` · pass `bactaq2026`

## الترخيص
MIT — راجع `LICENSE`.
