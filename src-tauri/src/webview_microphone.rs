//! Autorise `getUserMedia({ audio: true })` dans la WebView (dictée push-to-talk).
//!
//! WebView2 termine le process hôte (`0xC0000005`) si une demande micro retombe
//! sur `COREWEBVIEW2_PERMISSION_STATE_DEFAULT`. Le handler ne renvoie donc jamais
//! de HRESULT d'échec et marque la demande comme traitée.
//!
//! `reset_webview_microphone_permission` est async : un commande synchrone s'exécute
//! dans `WebMessageReceived`, et `with_webview` y rappellerait COM de façon réentrante.

use tauri::{AppHandle, Runtime};

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicBool, Ordering};

    use tauri::webview::PlatformWebview;
    use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler};
    use windows_core::{Interface, PCWSTR};

    const ORIGINS: &[&str] = &[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ];

    static MIC_HANDLER_INSTALLED: AtomicBool = AtomicBool::new(false);

    pub fn install<R: Runtime>(app: &AppHandle<R>) {
        for (_label, window) in app.webview_windows() {
            let origins = microphone_origins(&window);
            let _ = window.with_webview(move |platform| {
                if let Err(e) = install_on_webview(platform, &origins) {
                    eprintln!("[RustyMail] accès micro WebView2 : {e}");
                }
            });
        }
    }

    pub fn reset_to_allow<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let app_ui = app.clone();
        app.run_on_main_thread(move || {
            let result = set_allow_on_main(&app_ui);
            let _ = tx.send(result);
        })
        .map_err(|e| format!("file UI micro: {e}"))?;
        rx.recv()
            .map_err(|_| "réinitialisation micro interrompue".to_string())?
    }

    fn set_allow_on_main<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
        let windows: Vec<WebviewWindow<R>> = app.webview_windows().into_values().collect();
        if windows.is_empty() {
            return Err("aucune fenêtre pour autoriser le micro".into());
        }
        let mut errors = Vec::new();
        let mut allowed = false;
        for window in windows {
            let origins = microphone_origins(&window);
            let (tx, rx) = std::sync::mpsc::sync_channel(1);
            if let Err(e) = window.with_webview(move |platform| {
                let result = allow_platform(platform, &origins);
                let _ = tx.send(result);
            }) {
                errors.push(e.to_string());
                continue;
            }
            // Sur le thread UI, `with_webview` exécute la closure tout de suite.
            // `try_recv` évite de bloquer ce thread si l'appel était seulement posté.
            match rx.try_recv() {
                Ok(Ok(())) => allowed = true,
                Ok(Err(e)) => errors.push(e),
                Err(_) => errors.push("accès WebView2 micro non exécuté".into()),
            }
        }
        if allowed {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    fn install_on_webview(webview: PlatformWebview, origins: &[String]) -> Result<(), String> {
        unsafe {
            let core = webview
                .controller()
                .CoreWebView2()
                .map_err(|e| e.to_string())?;
            if !MIC_HANDLER_INSTALLED.swap(true, Ordering::SeqCst) {
                let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
                    if let Some(args) = args {
                        allow_microphone_request(&args);
                    }
                    Ok(())
                }));
                let mut token: i64 = 0;
                if let Err(e) = core.add_PermissionRequested(&handler, &mut token) {
                    MIC_HANDLER_INSTALLED.store(false, Ordering::SeqCst);
                    return Err(e.to_string());
                }
                // Le WebView doit garder le handler. `forget` couvre un AddRef manquant.
                std::mem::forget(handler);
            }
            allow_microphone_origins(&core, origins)
        }
    }

    fn allow_platform(webview: PlatformWebview, origins: &[String]) -> Result<(), String> {
        unsafe {
            let core = webview
                .controller()
                .CoreWebView2()
                .map_err(|e| e.to_string())?;
            allow_microphone_origins(&core, origins)
        }
    }

    fn allow_microphone_request(args: &ICoreWebView2PermissionRequestedEventArgs) {
        unsafe {
            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
            if args.PermissionKind(&mut kind).is_err() {
                return;
            }
            if kind != COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                return;
            }
            let _ = args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
            if let Ok(args2) = Interface::cast::<ICoreWebView2PermissionRequestedEventArgs2>(args) {
                let _ = args2.SetHandled(true);
            }
        }
    }

    fn allow_microphone_origins(core: &ICoreWebView2, origins: &[String]) -> Result<(), String> {
        unsafe {
            let core13 = Interface::cast::<ICoreWebView2_13>(core).map_err(|e| e.to_string())?;
            let profile = core13.Profile().map_err(|e| e.to_string())?;
            let profile4 =
                Interface::cast::<ICoreWebView2Profile4>(&profile).map_err(|e| e.to_string())?;
            let mut errors = Vec::new();
            let mut allowed = 0usize;
            for origin in origins {
                let mut wide: Vec<u16> = origin.encode_utf16().collect();
                wide.push(0);
                match profile4.SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    PCWSTR::from_raw(wide.as_ptr()),
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    None,
                ) {
                    Ok(()) => allowed += 1,
                    Err(e) => {
                        eprintln!("[RustyMail] micro WebView2 {origin}: {e}");
                        errors.push(format!("{origin}: {e}"));
                    }
                }
            }
            if allowed > 0 {
                Ok(())
            } else if errors.is_empty() {
                Err("aucune origine micro".into())
            } else {
                Err(errors.join("; "))
            }
        }
    }

    fn microphone_origins<R: Runtime>(window: &WebviewWindow<R>) -> Vec<String> {
        let mut origins: Vec<String> = ORIGINS.iter().map(|origin| (*origin).to_string()).collect();
        if let Ok(url) = window.url() {
            if let Some(host) = url.host_str() {
                let origin = match url.port() {
                    Some(port) => format!("{}://{host}:{port}", url.scheme()),
                    None => format!("{}://{host}", url.scheme()),
                };
                if !origins.iter().any(|existing| existing == &origin) {
                    origins.push(origin);
                }
            }
        }
        origins
    }
}

pub fn install_webview_microphone_access<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    win::install(app);
    #[cfg(not(windows))]
    {
        let _ = app;
    }
}

#[tauri::command]
pub async fn reset_webview_microphone_permission(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move || win::reset_to_allow(app))
            .await
            .map_err(|e| format!("réinitialisation micro: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Ok(())
    }
}
