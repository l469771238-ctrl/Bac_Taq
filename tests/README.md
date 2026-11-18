# Tests

اختبارات سلوكية للـ web app بتشتغل بـ jsdom (بدون متصفح):

```bash
npm i jsdom
node tests/bookmarks.test.js     # الإشارات المرجعية: إضافة/تسمية/تعديل/حذف/فتح الصفحة/الحفظ
node tests/app.test.js           # التفعيل، المكتبة، القارئ، التقدّم
```

اختبار الواجهة في Chrome حقيقي + سكرين شوتس: `.github/workflows/visual-test.yml` (بيشغّل `tools/visual_test.js`).
