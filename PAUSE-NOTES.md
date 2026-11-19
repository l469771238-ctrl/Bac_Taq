# Bac-Taq — حالة المشروع عند الإيقاف المؤقت

> ملاحظة: الملف ده مرجع عشان نستأنف الشغل بعدين من غير ما نعيد أي تحليل.

## إيه اللي خلص
- تطبيق أندرويد أوفلاين كامل: 4 مواد (عربي، إنجليزي، تاريخ، برمجة) + قارئ PDF + إشارات مرجعية غير محدودة.
- التفعيل: **كلمة سر واحدة** (`3mk.gasser.2026`)، تتطلب **أول مرة بس** بعد التثبيت. لا أكواد أجهزة.
- إصلاح «Not found» (تغليف الأصول تحت `assets/web/`) وإصلاح تداخل النص في 3 كتب (إعادة بناء الصفحات كصور).
- الفحص: 50 فحص في Chrome حقيقي + 76 فحص وحدة + مسح صفحة-بصفحة للكتب الأربعة — كله ناجح.

## آخر إصدار
- **v1.7** — https://github.com/l469771238-ctrl/Bac_Taq/releases/tag/v1.7
- APK: `Bac-Taq-1.7.apk` — 53,805,793 بايت — sha256 `2769d42237803655f47ab0e9ae9e22354b39359a8413ebb33e975def803ab602`
- versionCode 8 · minSdk 23 · targetSdk 34 · موقّع v1+v2+v3

## إزاي تبني أو تفحص
```bash
pip install jdk4py pymupdf pillow            # أدوات البناء
npm pack dataslope-tools-jar && tar xzf *.tgz # tools.jar
export JAVA=$(python3 -c "import jdk4py;print(jdk4py.JAVA_HOME)")/bin/java
export JAVAC_JAR=package/tools.jar
bash tools/build_apk.sh 1.8 9                 # نسخة / versionCode
python3 tools/check_assets.py dist/Bac-Taq-1.8.apk
cd tests && npm i && node app.test.js && node bookmarks.test.js && node jump.test.js
```
- اختبارات المتصفح الحقيقي: `.github/workflows/visual-test.yml` → `tools/visual_test.js`, `deep_test.js`, `small_screens.js`, `page_verify.js` (بتحفظ تقاريرها في `shots/`).

## حاجات معلقة / ملاحظات
1. **محرك الـ PDF (pdf.js 3.11) يحتاج WebView 85+** → أندرويد 10 تقريبًا وما بعده. على أقدم من كده بيطلع رسالة واضحة بدل شاشة بيضا. لو عايزين دعم أقدم: ننزل لـ pdfjs 2.x أو نرفع minSdk لـ 26.
2. مفاتيح التوقيع `keystore/bactaq.jks` (alias `bactaq`, pass `bactaq2026`) — **لازم تفضل موجودة** عشان التحديثات تتثبت فوق بعضها.
3. الـ APK بقى 51 م.ب لأن الكتب صور. لو محتاجين أصغر: نقلل الـ dpi من 96 لـ 84 (`tools/flatten_books.py`).
4. الريبو عام (Public) — `tools/OWNER.md` فيه ملاحظات المالك، ما ينفعش تتحط فيه أسرار.
