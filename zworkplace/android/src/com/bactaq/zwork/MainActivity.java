package com.bactaq.zwork;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Z-Project Workplace - classroom workspace for Mr Gasser.
 *
 * The UI shell (html/css/js/fonts) ships inside the APK and is served to the WebView
 * from the virtual https origin https://appassets.androidplatform.net/web/* so the
 * app opens instantly and survives flaky connections.
 *
 * Everything that matters lives on the school server: student codes, accounts, the roster,
 * and the teacher's dashboard. A student signs up once with the code the teacher gave
 * him; the account stays on the server after that. The base URL is injected as
 * window.ZAPI at load time (never baked into the JS bundle), so one APK can point
 * at staging or production. INTERNET permission is therefore required.
 */
public class MainActivity extends Activity {

    /** Where the school server lives. Override per build with -PZAPI_BASE or via BuildConfig. */
    private static final String DEFAULT_API_BASE = "https://z-project.onrender.com";
    private static final String HOST_URL = "https://appassets.androidplatform.net/web/index.html";
    private static final String ASSET_PATH = "web/";
    private static final String BACK_JS =
            "(function(){try{return window.ZBack?window.ZBack():false}catch(e){return false}})()";

    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            w.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        w.setStatusBarColor(Color.parseColor("#0A1F4D"));
        w.setNavigationBarColor(Color.parseColor("#071A3F"));

        final FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#071A3F"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15+ draws edge-to-edge whether we ask or not; keep the content
        // out from under the status/navigation bars instead of clipping it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    int top = insets.getSystemWindowInsetTop();
                    int bottom = insets.getSystemWindowInsetBottom();
                    v.setPadding(0, top, 0, bottom);
                    return insets;
                }
            });
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadsImagesAutomatically(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // The API is https; never let a downgrade slip through.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            s.setSafeBrowsingEnabled(false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT && isDebuggable()) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(Color.parseColor("#0A1F4D"));
        web.addJavascriptInterface(new Bridge(), "ZBridge");

        // Serve the bundled web app over the virtual https origin.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return serve(request.getUrl().toString());
                }
            });
        }
        web.setWebChromeClient(new WebChromeClient());
        CookieManager.getInstance().setAcceptCookie(false);

        web.setWebViewClient(new LocalClient());
        web.loadUrl(HOST_URL);
    }

    /** Server base URL: BuildConfig override, then the compiled-in default. */
    private String apiBase() {
        String fromBuild = null;
        try {
            // Filled in by tools/build_apk.sh through strings.xml -- see README.
            fromBuild = getString(getResources().getIdentifier("zapi_base", "string", getPackageName()));
        } catch (Throwable ignored) {
        }
        if (fromBuild != null && fromBuild.startsWith("http")) return fromBuild.replaceAll("/+$", "");
        return DEFAULT_API_BASE;
    }

    /**
     * index.html ships without a server URL so the same bundle works everywhere.
     * We splice one small script tag in before </head> while streaming the asset,
     * which guarantees window.ZAPI exists before js/app.js executes.
     */
    private static String injectApiBase(String html, String base) {
        String tag = "<script>window.ZAPI=" + jsString(base) + ";</script>";
        int at = html.indexOf("</head>");
        if (at < 0) return html;
        return html.substring(0, at) + tag + html.substring(at);
    }

    /** Minimal JSON string escaping for the injected value. */
    private static String jsString(String raw) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private boolean isDebuggable() {
        return (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".bcmap")) return "application/octet-stream";
        if (p.endsWith(".pfb")) return "application/octet-stream";
        return "application/octet-stream";
    }

    /** Streams a file from assets/web for a local request URL, or null when not local. */
    private WebResourceResponse serve(String url) {
        try {
            return serveInner(url);
        } catch (Throwable t) {
            // Any unexpected failure must degrade to a 404 response, never to a crash.
            return notFound();
        }
    }

    private WebResourceResponse serveInner(String url) {
        if (url == null || !url.startsWith("https://appassets.androidplatform.net/")) return null;
        String path = url.substring("https://appassets.androidplatform.net/".length());
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int h = path.indexOf('#');
        if (h >= 0) path = path.substring(0, h);
        try {
            path = java.net.URLDecoder.decode(path, "UTF-8");
        } catch (Exception ignored) {
        }
        if (path.isEmpty()) path = "web/index.html";
        if (!path.startsWith(ASSET_PATH)) {
            path = ASSET_PATH + path;
        }
        // Basic traversal guard: only assets/web is reachable.
        if (!path.startsWith(ASSET_PATH) || path.contains("..")) {
            return notFound();
        }
        try {
            AssetManager am = getAssets();
            InputStream in = am.open(path);
            String mime = mimeOf(path);
            if (path.endsWith("index.html")) {
                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                in.close();
                String page = new String(buf.toByteArray(), "UTF-8");
                byte[] patched = injectApiBase(page, apiBase()).getBytes("UTF-8");
                in = new ByteArrayInputStream(patched);
            }
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("Access-Control-Allow-Origin", "*");
            WebResourceResponse resp = new WebResourceResponse(mime, "UTF-8", in);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                resp.setStatusCodeAndReasonPhrase(200, "OK");
                resp.setResponseHeaders(headers);
            }
            return resp;
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "UTF-8",
                new ByteArrayInputStream("Not found".getBytes()));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
        }
        return r;
    }

    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            WebResourceResponse local = serve(request.getUrl().toString());
            if (local != null) return local;
            return super.shouldInterceptRequest(view, request);
        }

        /** Never let the WebView navigate away from the bundled app. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String u = request.getUrl().toString();
            if (u.startsWith("https://appassets.androidplatform.net/")) return false;
            String cur = view.getUrl();
            // Same-document (hash / "javascript:") navigation is part of the app.
            if (cur != null && !u.startsWith("http") && !u.startsWith("mailto:")) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u)));
            } catch (Exception ignored) {
            }
            return true;
        }
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
        public String platform() {
            return "android";
        }
    }

    @Override
    public void onBackPressed() {
        // Give the web app a chance to handle it (sheet, reader, library screens).
        web.evaluateJavascript(BACK_JS, new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || "false".equals(value)) {
                    finish();
                }
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
