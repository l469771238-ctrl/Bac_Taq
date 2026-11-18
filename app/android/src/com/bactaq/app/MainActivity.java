package com.bactaq.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * Bac-Taq — offline study library.
 * A single WebView hosts the bundled web app (assets/web). Everything works offline:
 * activation is stored locally, the PDFs are packaged inside the APK and rendered by
 * the bundled PDF.js build.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/web/index.html";
    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(Color.parseColor("#0A1F4D"));
        w.setNavigationBarColor(Color.parseColor("#071A3F"));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#071A3F"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setLoadsImagesAutomatically(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }
        // The bundled web app is the only thing we load, downloaded code is not needed.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT && isDebuggable()) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Keep the UI crisp and edge-to-edge friendly.
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(Color.parseColor("#0A1F4D"));

        CookieManager.getInstance().setAcceptCookie(false);

        web.addJavascriptInterface(new Bridge(), "BacTaqBridge");

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternal(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternal(request.getUrl().toString());
            }
        });

        web.loadUrl(START_URL);
    }

    private boolean isDebuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** Never let the WebView leave the app; hand external links to the system browser. */
    private boolean handleExternal(String url) {
        if (url == null) return true;
        if (url.startsWith("file://")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
        return true;
    }

    /** Small JS bridge so the web app feels native. */
    private class Bridge {
        @JavascriptInterface
        public void haptic() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
                }
            });
        }

        @JavascriptInterface
        public void toast(final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void exit() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }
    }

    private boolean navigateBack() {
        final boolean[] handled = {true};
        web.evaluateJavascript(
                "(function(){try{return window.BacTaqBack?window.BacTaqBack():false}catch(e){return false}})()",
                value -> {
                    if (value == null || "false".equals(value)) {
                        handled[0] = false;
                    }
                });
        return handled[0];
    }

    @Override
    public void onBackPressed() {
        // Ask the web app first (sheet open, reader, library...). The callback is async,
        // so give it a tick before falling back to finishing the activity.
        web.evaluateJavascript(
                "(function(){try{return window.BacTaqBack?window.BacTaqBack():false}catch(e){return false}})()",
                value -> {
                    if (value == null || "false".equals(value)) {
                        finish();
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
