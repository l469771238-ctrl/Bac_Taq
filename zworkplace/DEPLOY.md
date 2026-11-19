# Z-Project — دليل النشر المجاني

## الهدف

التطبيق يشتغل على النت، الطلاب يفتحوه من أي مكان، **والملفات مبتضيعش**.

السر: **الملفات متخزنة خارج السيرفر**. السيرفر بيحتفظ بالقاعدة الصغيرة بس
(طلاب، فصول، مجموعات، مطلوبات، دردشة = كيلوبايتات) والملفات في تخزين خارجي مجاني.

---

## الخطوات

### ١. اختار تخزين مجاني

| الخدمة | المجاني | كارت؟ | ليه |
|---|---|---|---|
| **Backblaze B2** | ١٠ جيجا | ❌ | أسهل واحدة، والتسجيل دقيقة |
| **Cloudflare R2** | ١٠ جيجا + بلا رسوم نقل | ❌ | الأسرع |
| **iDrive e2** | ١٠ جيجا | ❌ | أرخص رفع |
| **Google Drive** | ١٥ جيجا (٢ تيرا لو مدرسي) | ❌ | لو المس عندها حساب مدرسي |

> **٥٠ جيجا** = توزّع الملفات على أكتر من حساب، أو تفتح حساب تاني لما تتملى.

### ٢. جهّز التخزين

#### لو اخترت Backblaze B2 (الأسهل)

1. اعمل حساب على `backblaze.com` — مجاني، من غير كارت
2. **My Settings** → **Application Keys** → **Add a New Application Key**
3. اكتب اسم، وسيب Buckets على `All`
4. هيديك:
   - `keyID` → ده `ZS3_KEY`
   - `applicationKey` → ده `ZS3_SECRET`
5. **Buckets** → **Create a Bucket** → اسمه `z-project-files`
6. من صفحة الـBucket هتلاقي **Endpoint** شكله:
   `s3.us-west-004.backblazeb2.com` → ده `ZS3_ENDPOINT` (حط `https://` قبله)
7. **Region** = `us-west-004` → ده `ZS3_REGION`

#### لو اخترت Cloudflare R2

1. `dash.cloudflare.com` → **R2** → **Create bucket**
2. **Manage R2 API Tokens** → **Create API token** → صلاحية **Object Read & Write**
3. هيديك Access Key ID و Secret
4. الـEndpoint: `https://<account-id>.r2.cloudflarestorage.com`
5. Region = `auto`

#### لو اخترت Google Drive

1. `console.cloud.google.com` → مشروع جديد
2. **APIs & Services** → **Enable APIs** → دوّر على **Google Drive API** → Enable
3. **IAM & Admin** → **Service Accounts** → **Create Service Account**
4. ادخل عليه → **Keys** → **Add Key** → **Create new key** → **JSON** → هينزّل ملف
5. افتح الملف، هتلاقي `client_email` و `private_key`
6. من Drive: اعمل فولدر اسمه `Z-Project` → **مشاركة** → الصق `client_email` → صلاحية **Editor**
7. افتح الفولدر، خد الـID من الرابط: `drive.google.com/drive/folders/`**`<الـID هنا>`**

### ٣. ارفع الكود على GitHub

الريبو موجود بالفعل: `l469771238-ctrl/Bac_Taq`

### ٤. اعمل السيرفر على Render

1. `render.com` → **Sign up** بـGitHub — مجاني، من غير كارت
2. **New** → **Web Service** → اختار الريبو `Bac_Taq`
3. الإعدادات:
   - **Root Directory**: `zworkplace`
   - **Runtime**: `Docker`
   - **Instance Type**: `Free`
4. **Environment Variables** — حط دول:

```
ZSTORAGE      = s3
ZS3_ENDPOINT  = https://s3.us-west-004.backblazeb2.com
ZS3_BUCKET    = z-project-files
ZS3_KEY       = <keyID>
ZS3_SECRET    = <applicationKey>
ZS3_REGION    = us-west-004
ZTEACHER_PASS = <كلمة مرور قوية للمس>
```

5. **Create Web Service** → استنى ٣ دقايق
6. هيديك رابط شكله: `https://z-project-xxxx.onrender.com`

### ٥. اربط التطبيق

افتح الرابط → زرار **أنا مس أسماء** → ادخل بكلمة المرور → **قاعدة البيانات** → ارفع كشف الطلاب.

بعد كده الطلاب يفتحوا نفس الرابط من أي موبايل.

---

## حاجات لازم تعرفها

### السيرفر بينام

الخطة المجانية على Render بتنام بعد ١٥ دقيقة خمول.
أول طالب يفتح التطبيق هيستنى **~٣٠ ثانية**، بعد كده سريع.

**الحل:** خلّي حد يفتح الرابط كل ١٠ دقايق، أو استخدم خدمة زي `uptimerobot.com` (مجانية) تفتحه كل ٥ دقايق.

### القاعدة ممكن تتمسح

قرص Render المجاني مؤقت. يعني **الحسابات** كمان ممكن تضيع لو السيرفر أعاد التشغيل.

**الحل:** نسخة احتياطية تلقائية (شغالة — شوف تحت).

### الملفات آمنة

الملفات مش على Render أصلًا — على B2 أو Drive. **دي مش بتتمسح** مهما حصل للسيرفر.

---

## بعد النشر — تأكد إن كل حاجة شغالة

افتح: `https://<رابطك>/api/health`

لازم تشوف:

```json
{
  "ok": true,
  "storage": "s3",
  "roster": 273,
  "students": 0,
  "files": 0
}
```

لو `"storage": "local"` — يبقى `ZSTORAGE` مش متظبط.
لو `"ok": false` — شوف الرسالة.

---

## التشغيل عندك على الكمبيوتر

```bash
cd zworkplace
npm start
```

هيفتح على `http://localhost:3100` — بيشتغل بـ`local` storage.

---

## نسخة احتياطية للقاعدة

```bash
node server/backup.js
```

بتحفظ نسخة في `backups/` — ارفعها على Drive أو GitHub كل فترة.
