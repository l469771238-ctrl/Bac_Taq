# Bac-Taq — ملاحظات المالك (سرّي)

> ⚠️ **الريبو ده public** — الملف متسجّل في git، فأي حد بيفتح الريبو يقرأ الماستر باسورد.
> لو عايز الباسورد يبقى سرّي: خلّي الريبو private من Settings ← General ← Danger Zone،
> أو شيل الملف من git (`git rm --cached tools/OWNER.md`) وحطه في `.gitignore`.
> التطبيق نفسه شغّال عادي جدًا بدون الملف ده.

## الماستر باسورد
الكود اللي انت كتبته في أول رسالة:

```
3mk.gasser.2026
```

اتحوّل لـ SHA-256 وبيتخزن في التطبيق كـ fingerprint — مش النص نفسه:

```
d0f50357e82ceffe696fd36ce08a835da33b3d81fa07dd82bacac3415b21381b
```

والتطبيق بيقبل النقطة `.` أو الشرطة السفلية `_` أو المسافة مكان النقطة، وبيتجاهل حالة الحروف
(يعني `3mk_gasser_2026` شغال برضه).

### تغيير الكود بعدين
```bash
python3 -c "import hashlib;print(hashlib.sha256('الكود-الجديد'.encode()).hexdigest())"
```
حط الناتج مكان `MASTER_HASH` في `app/web/js/security.js`، واعمل build جديد بـ
`bash tools/build_apk.sh`.

## مفاتيح الأجهزة (Device keys)
- جدول الـ 32 كود: `dist/Bac-Taq-Keys.html` (اطبعه أو ابعت PDF).
- كود جديد لأي خانة: `python3 tools/make_keys.py 33`
- الكود شكله `xxxx-xxx-xxx` وبيتحفظ عادي على الجهاز بعد التفعيل.
- الخانة الافتراضية 1..4095، وكل كود شغال على جهاز واحد (مفيش سيرفر، التحقق محلي).

## التوقيع
- الـ keystore: `keystore/bactaq.jks` — لازم تحتفظ بيه في مكان آمن، أي تحديث لازم يتوقّع بنفس المفتاح.
- كلمة السر: `bactaq2026`

## إعادة البناء
```bash
bash tools/build_apk.sh 1.0 1     # النسخة والـ versionCode
python3 tools/release.py          # build + نشر على GitHub Releases
```

## الإشارات المرجعية (1.1)
- بتتحفظ في `localStorage` تحت `bactaq.bookmarks` — مفتاح لكل كتاب، ومفيش حد أقصى للعدد.
- شكل العنصر: `{id, page, name, at}` — الترتيب في القائمة حسب رقم الصفحة.
- التفعيل مش بيتأثر بأي تحديث: `bactaq.activated` = `true` وبيتحافظ عليه.
- لو غيّرت `appId`/الـ keystore، التحديثات الجديدة مش هتتثبت فوق القديمة — خليك على `keystore/bactaq.jks`.
