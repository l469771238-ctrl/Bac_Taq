# مجلد الصور — renderer

بما إن مفيش براوزر في البيئة، الصور بترسم بـPIL + HarfBuzz
بنفس مقاسات `css/app.css` بالبكسل.

```
python3 tools/shots/screens.py     # يرسم كل الشاشات في shots/zproj/
```

| ملف | ايه |
|---|---|
| `render.py` | المقاسات، الألوان، الظلال، دوال الرسم |
| `ar2.py` | تشكيل عربي بـuharfbuzz + رسم الجليفات |
| `ic.py` | SVG path parser — يرسم أيقونات `js/icons.js` الحقيقية |
| `screens.py` | تعريف الشاشات |
| `fonts/` | Cairo (من `zworkplace/fonts/`) + خط لاتيني للأرقام |

**مهم:** خط Cairo العربي مفيهوش أرقام — الأرقام لازم ترسم بالخط اللاتيني.
