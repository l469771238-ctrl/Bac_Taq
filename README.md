# Bac-Taq + Z-Project Workplace

مستودع فيه **تطبيقين أندرويد** مستقلين بنفس الهوية البصرية، بيتبنوا من نفس الأدوات.

| التطبيق | الفكرة | الحزمة | حجم APK |
|---|---|---|---|
| **Bac-Taq** | مكتبة كتب الثانوية العامة (4 مواد) + قارئ PDF + إشارات — أوفلاين 100% | `com.bactaq.app` | 51 م.ب |
| **Z-Project Workplace** | ورك سبيس الفصل: طلاب، حضور، واجبات، إعلانات | `com.bactaq.zwork` | 0.35 م.ب |

## الهيكل

```
bactaq/          web/ (html+css+js+books)  android/ (manifest, res, src)
zworkplace/      index.html, css/, js/, android/, assets/
dist/            Bac-Taq-1.8.apk + Z-Project-0.1.apk
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
bash tools/build_apk.sh 0.1 1 zworkplace   # dist/Z-Project-0.1.apk
```

## الفحص

```bash
python3 tools/check_assets.py dist/<any>.apk     # كل أصل لازم يتحل صح
cd tests && npm test                             # Bac-Taq: 76 فحص
cd zworkplace/tests && npm test                  # Z-Project: 37 فحص
node tools/deep_test.js                          # جولة كاملة في Chrome حقيقي
```

## التفعيل (Bac-Taq)
كلمة سر واحدة: `3mk.gasser.2026` — أول مرة بس بعد التثبيت.

## التوقيع
- Bac-Taq: `keystore/bactaq.jks` · alias `bactaq` · pass `bactaq2026` (**متغيّرش** لو عايز التحديثات تتثبت فوق بعضها)
- Z-Project: `keystore/zwork.jks` · alias `zwork` · pass `bactaq2026`

## الترخيص
MIT — راجع `LICENSE`.
