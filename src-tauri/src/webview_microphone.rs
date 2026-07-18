//! Autorise `getUserMedia({ audio: true })` dans la WebView (dictée push-to-talk).

use tauri::{AppHandle, Runtime};

#[cfg(windows)]
mod win {
    use tauri::webview::PlatformWebview;
    use tauri::{AppHandle, Manager, Runtime};
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler};
    use windows_core::{Interface, PCWSTR};

    const ORIGINS: &[&str] = &[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ];

    pub fn install(app: &AppHandle<impl Runtime>) {
        for (_label, window) in app.webview_windows() {
            let _ = window.with_webview(|platform| {
                if let Err(e) = install_on_webview(platform) {
                    eprintln!("[RustyMail] accès micro WebView2 : {e}");
                }
            });
        }
    }

    pub fn reset_to_allow(app: &AppHandle<impl Runtime>) -> std::result::Result<(), String> {
        install(app);
        Ok(())
    }

    fn install_on_webview(webview: PlatformWebview) -> webview2_com::Result<()> {
        unsafe {
            let core = webview.controller().CoreWebView2()?;
            let mut token: i64 = 0;
            core.add_PermissionRequested(
                &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                    args.PermissionKind(&mut kind)?;
                    if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                        args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                    }
                    Ok(())
                })),
                &mut token,
            )?;
        }
        allow_microphone_origins(webview)
    }

    fn allow_microphone_origins(webview: PlatformWebview) -> webview2_com::Result<()> {
        unsafe {
            let core = webview.controller().CoreWebView2()?;
            let core13 = Interface::cast::<ICoreWebView2_13>(&core)?;
            let profile = core13.Profile()?;
            let profile4 = Interface::cast::<ICoreWebView2Profile4>(&profile)?;
            for origin in ORIGINS {
                let mut wide: Vec<u16> = origin.encode_utf16().collect();
                wide.push(0);
                profile4.SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    PCWSTR::from_raw(wide.as_ptr()),
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    None,
                )?;
            }
        }
        Ok(())
    }
}

pub fn install_webview_microphone_access<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    win::install(app);
}

#[tauri::command]
pub fn reset_webview_microphone_permission(app: AppHandle<impl Runtime>) -> Result<(), String> {
    #[cfg(windows)]
    {
        return win::reset_to_allow(&app);
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Ok(())
    }
}
