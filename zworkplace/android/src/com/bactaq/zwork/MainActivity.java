package com.bactaq.zwork;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Z Project Workspace
 *
 * التطبيق بيفتح نسخة الويب من نفس السيرفر، فالبيانات واحدة:
 * طالب يفتح من الـAPK وطالب من المتصفح بيشوفوا نفس الحاجة.
 *
 * أول تشغيل: بيسأل عن عنوان السيرفر ويحفظه.
 * بعد كده بيفتح على طول.
 *
 * لو فشل التحميل (نت مقطوع أو السيرفر نايم) بيوري شاشة فيها زرار "جرّب تاني"
 * وزرار "غيّر العنوان" — لأن السيرفر المجاني بينام.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "zwork";
    private static final String KEY_BASE = "api_base";

    private WebView web;
    private FrameLayout root;
    private SharedPreferences prefs;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0D1B33"));
        w.setNavigationBarColor(Color.parseColor("#0D1B33"));

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0D1B33"));
        setContentView(root);

        /*
         * ترتيب الأولوية:
         *   ١. اللينك المدمج وقت البناء (الوضع الطبيعي — الطالب مش بيشوف أي شاشة)
         *   ٢. لينك اتغيّر من داخل التطبيق (لو المس ضغط "غيّر العنوان" مرة)
         *   ٣. مفيش حاجة خالص → شاشة الإعداد (وضع المطوّر بس)
         *
         * الطالب العادي: بياخد رقم ١ دايمًا ويدخل على طول.
         */
        String baked = getString(R.string.zapi_base).trim();
        String override = prefs.getString(KEY_BASE, "").trim();

        String base;
        if (!override.isEmpty()) base = override;
        else if (!baked.isEmpty() && !baked.contains("example.com")) base = baked;
        else base = "";

        if (base.isEmpty()) {
            showSetup("");
        } else {
            openApp(base);
        }
    }

    /** شاشة إعداد العنوان — أول تشغيل أو لما يغيّره */
    private void showSetup(String initial) {
        root.removeAllViews();

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView logo = new TextView(this);
        logo.setText("Z");
        logo.setTextColor(Color.parseColor("#E0B467"));
        logo.setTextSize(46);
        logo.setGravity(Gravity.CENTER);
        box.addView(logo);

        TextView title = new TextView(this);
        title.setText("Z Project Workspace");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(10), 0, dp(6));
        box.addView(title);

        TextView sub = new TextView(this);
        sub.setText("عشان التطبيق يشتغل، لازم تحدد مكان السيرفر\n(hitm: لازم يكون منشور على النت)");
        sub.setTextColor(Color.parseColor("#9FB0CC"));
        sub.setTextSize(12);
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 0, 0, dp(20));
        box.addView(sub);

        EditText input = new EditText(this);
        input.setHint("https://example.onrender.com");
        input.setText(initial);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.parseColor("#6B7A94"));
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_CLASS_TEXT);
        input.setGravity(Gravity.CENTER);
        input.setBackgroundColor(Color.parseColor("#132647"));
        input.setPadding(dp(14), dp(14), dp(14), dp(14));
        box.addView(input);

        Button go = new Button(this);
        go.setText("فتح التطبيق");
        go.setTextColor(Color.parseColor("#22160A"));
        go.setBackgroundColor(Color.parseColor("#E0B467"));
        LinearLayout.LayoutParams gp =
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        gp.topMargin = dp(16);
        go.setLayoutParams(gp);
        box.addView(go);

        final EditText ref = input;
        go.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String v2 = ref.getText().toString().trim();
                if (v2.isEmpty()) {
                    Toast.makeText(MainActivity.this, "اكتب عنوان السيرفر", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!v2.startsWith("http://") && !v2.startsWith("https://")) {
                    v2 = "https://" + v2;
                }
                while (v2.endsWith("/")) v2 = v2.substring(0, v2.length() - 1);
                prefs.edit().putString(KEY_BASE, v2).apply();
                openApp(v2);
            }
        });

        root.addView(box);
    }

    /** شاشة فشل التحميل */
    private void showError(final String base) {
        root.removeAllViews();

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView ico = new TextView(this);
        ico.setText("📡");
        ico.setTextSize(46);
        ico.setGravity(Gravity.CENTER);
        box.addView(ico);

        TextView t = new TextView(this);
        t.setText("مفيش اتصال");
        t.setTextColor(Color.WHITE);
        t.setTextSize(19);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(12), 0, dp(6));
        box.addView(t);

        TextView s = new TextView(this);
        s.setText("اتأكد من النت وجرّب تاني.\nلو المشكلة مستمرة، السيرفر ممكن يكون بيصحى — استنى نص دقيقة.");
        s.setTextColor(Color.parseColor("#9FB0CC"));
        s.setTextSize(13f);
        s.setGravity(Gravity.CENTER);
        s.setPadding(0, 0, 0, dp(20));
        box.addView(s);

        Button retry = new Button(this);
        retry.setText("جرّب تاني");
        retry.setTextColor(Color.parseColor("#22160A"));
        retry.setBackgroundColor(Color.parseColor("#E0B467"));
        LinearLayout.LayoutParams rp =
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        retry.setLayoutParams(rp);
        box.addView(retry);

        Button change = new Button(this);
        change.setText("غيّر العنوان");
        change.setTextColor(Color.parseColor("#C9D6EA"));
        change.setBackgroundColor(Color.parseColor("#132647"));
        LinearLayout.LayoutParams cp =
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        cp.topMargin = dp(10);
        change.setLayoutParams(cp);
        box.addView(change);

        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openApp(base);
            }
        });
        change.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSetup(base);
            }
        });

        root.addView(box);
    }

    @SuppressLint({"SetJavaScriptEnabled"})
    private void openApp(final String base) {
        root.removeAllViews();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // بنحقن عنوان السيرفر قبل تحميل الصفحة — الواجهة بتقراه من window.ZAPI
        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public String base() {
                return base;
            }
        }, "ZNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                // لازم قبل أي سكربت — beforePageFinished بيكون متأخر
                view.evaluateJavascript("window.ZAPI='" + base + "';", null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("window.ZAPI='" + base + "';", null);
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int errorCode,
                                        String description, String failingUrl) {
                if (failingUrl != null && failingUrl.startsWith(base)) {
                    showError(base);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient());
        web.loadUrl(base + "/?zapi=" + android.net.Uri.encode(base));
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
