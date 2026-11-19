# Bac-Taq + Z-Project Workplace

مستودع فيه **تطبيقين أندرويد** مستقلين بنفس الهوية البصرية، بيتبنوا من نفس الأدوات.

| التطبيق | الفكرة | الحزمة | حجم APK |
|---|---|---|---|
| **Bac-Taq** | مكتبة كتب الثانوية العامة (4 مواد) + قارئ PDF + إشارات — أوفلاين 100% | `com.bactaq.app` | 51 م.ب |
| **Z-Project Workplace** | ورك سبيس الفصل: **حسابات الطلاب على سيرفر الفصل** + كشف + موافقات المدرس + فصول ومجموعات | `com.bactaq.zwork` | 0.37 م.ب |

## الهيكل

```
bactaq/          web/ (html+css+js+books)  android/ (manifest, res, src)
zworkplace/      index.html, css/, js/     ← واجهة الويب (شل محلي)
zworkplace/server/  index.js + db.js + auth.js + seed.js   ← سيرفر الفصل (Node)
zworkplace/android/ manifest, res, src      ← تطبيق أندرويد بسلك للـ API
dist/            Bac-Taq-1.8.apk + Z-Project-0.2.apk
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
bash tools/build_apk.sh 0.2 2 zworkplace   # dist/Z-Project-0.2.apk

# تغيير عنوان سيرفر الفصل وقت البناء (الافتراضي من res/values/strings.xml)
ZAPI_BASE=https://my-server.example.com bash tools/build_apk.sh 0.2 2 zworkplace
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

### تدفّق الحسابات

1. الطالب يكتب **رقم الجلوس (9 أرقام)** → الاسم بيظهر لوحده من كشف الفصل
   (الطالب **مش** بيكتب اسمه).
2. يحط كلمة مرور + سؤال سري وإجابته → يتعمل طلب **مستني**.
3. المدرس يقبل الطلب و**لازم** يحدد فصل + مجموعة (المجموعة 5 أفراد افتراضيًا،
   والسيرفر بيرفض لو كملت).
4. بعد القبول الطالب يدخل برقم الجلوس وكلمة المرور، ويشوف فصله ومجموعته.
5. نسيت كلمة المرور → السؤال السري.

### قاعدة البيانات

`node:sqlite` (مدمج في Node 22) — ملف واحد، 8 جداول:
`teachers, roster, classes, groups, students, requests, sessions, audit`.
بحجم ~300 طالب الجدول صغير جدًا (أقل من ١ م.ب) والاستعلامات مفهرسة على رقم الجلوس.

### الاختبارات

```bash
bash zworkplace/tests/run.sh     # 43 فحص API + 49 فحص واجهة + كشف تجريبي
```

الاختبارات بتضرب سيرفر حقيقي على بورت عشوائي وقاعدة بيانات مؤقتة — مش mocks.

## الفحص

```bash
python3 tools/check_assets.py dist/<any>.apk     # كل أصل لازم يتحل صح
cd tests && npm test                             # Bac-Taq: 76 فحص
bash zworkplace/tests/run.sh                     # Z-Project: 92 فحص (API + واجهة)
node tools/deep_test.js                          # جولة كاملة في Chrome حقيقي
```

## التفعيل (Bac-Taq)
كلمة سر واحدة: `3mk.gasser.2026` — أول مرة بس بعد التثبيت.

## التوقيع
- Bac-Taq: `keystore/bactaq.jks` · alias `bactaq` · pass `bactaq2026` (**متغيّرش** لو عايز التحديثات تتثبت فوق بعضها)
- Z-Project: `keystore/zwork.jks` · alias `zwork` · pass `bactaq2026`

## الترخيص
MIT — راجع `LICENSE`.
