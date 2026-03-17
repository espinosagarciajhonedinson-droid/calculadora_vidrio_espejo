package com.espinosa.cortesvidrio;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Ensure pinch-zoom works inside the Capacitor WebView (APK).
    try {
      WebView webView = this.getBridge().getWebView();
      WebSettings settings = webView.getSettings();
      settings.setSupportZoom(true);
      settings.setBuiltInZoomControls(true);
      settings.setDisplayZoomControls(false);
      settings.setUseWideViewPort(true);
      settings.setLoadWithOverviewMode(true);
    } catch (Exception ignored) {
      // If anything goes wrong, keep default behavior.
    }
  }
}
