# أدوات البناء (Build tools)

الأدوات دي متسجّلة في git مخصوص عشان الـ build يشتغل **أوفلاين** من غير ما ينزّل حاجة
(شبكة الساندبوكس مقفولة على معظم المواقع):

| الملف | إيه ده |
|---|---|
| `aapt2` | Android Asset Packaging Tool 2 (من Android SDK build-tools 34) |
| `android.jar` | Android 14 platform API 34 |
| `zipalign` | الأصلي من SDK (مش مستخدم — عندنا `tools/zipalign.py`) |
| `lib/d8.jar` | R8/D8 لتحويل الـ class files لـ dex |
| `lib/apksigner.jar` | apksigner للتوقيع والتحقق |

الـ JDK (17) بيتبعت كـ Python wheel اسمه `jdk4py` وبيتفك في الساندبوكس لوحده.
