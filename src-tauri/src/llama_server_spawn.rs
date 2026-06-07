//! Lance `llama-server` en sous-processus (GGUF du cache RustyMail) — loopback uniquement.

use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use rustymail_infrastructure::{
    llama_server_api_key_get, llm_gguf_cached, llm_gguf_path_for_runtime,
    parse_llama_loopback_listen_addr, AppPrefs,
};

use crate::AppPaths;

/// Handle de job Windows stocké comme `usize` pour rester `Send` dans le `Mutex` statique.
#[cfg(windows)]
struct WinKillJob(usize);

#[cfg(windows)]
impl WinKillJob {
    fn as_handle(&self) -> windows_sys::Win32::Foundation::HANDLE {
        self.0 as windows_sys::Win32::Foundation::HANDLE
    }

    /// Attache le processus à un job dont la **dernière** fermeture de handle tue les processus du job
    /// (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`). Ainsi, si RustyMail disparaît sans passer par `RunEvent::Exit`
    /// (Ctrl+C sur la console, fin de `cargo tauri dev`, tuer la tâche), Windows termine quand même `llama-server`.
    fn try_assign_process(child: &Child) -> Option<Self> {
        use std::mem::{size_of, zeroed};
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        unsafe {
            let job = CreateJobObjectW(std::ptr::null::<SECURITY_ATTRIBUTES>(), std::ptr::null());
            if job.is_null() {
                log::warn!("CreateJobObjectW a échoué : llama-server ne sera pas lié au cycle de vie du process parent.");
                return None;
            }
            let mut ext: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            ext.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(ext).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                log::warn!("SetInformationJobObject(KILL_ON_JOB_CLOSE) a échoué pour llama-server.");
                let _ = CloseHandle(job);
                return None;
            }
            let ph = child.as_raw_handle() as windows_sys::Win32::Foundation::HANDLE;
            if AssignProcessToJobObject(job, ph) == 0 {
                log::warn!(
                    "AssignProcessToJobObject a échoué (processus déjà dans un autre job ?). llama-server peut rester orphelin si le parent est tué brutalement."
                );
                let _ = CloseHandle(job);
                return None;
            }
            Some(Self(job as usize))
        }
    }
}

#[cfg(windows)]
impl Drop for WinKillJob {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        let h = self.as_handle();
        if !h.is_null() && h != INVALID_HANDLE_VALUE {
            unsafe {
                let _ = CloseHandle(h);
            }
        }
        self.0 = 0;
    }
}

struct ManagedProc {
    /// Conservé pour le `Drop` du job Windows (`KILL_ON_JOB_CLOSE`) — pas lu ailleurs.
    #[cfg(windows)]
    #[allow(dead_code)]
    win_job: Option<WinKillJob>,
    child: Child,
    gguf: PathBuf,
    port: u16,
    /// `-c` passé au lancement (redémarrage si les prefs changent).
    n_ctx: u32,
}

static MANAGED: Mutex<Option<ManagedProc>> = Mutex::new(None);

pub fn stop_managed_llama_server() {
    let Ok(mut g) = MANAGED.lock() else {
        return;
    };
    if let Some(mut m) = g.take() {
        let _ = m.child.kill();
        let _ = m.child.wait();
    }
    invalidate_llama_n_ctx_cache();
}

/// Vide le cache `n_ctx` lu via `/props` (après changement de `-c` ou redémarrage serveur).
pub fn invalidate_llama_n_ctx_cache() {
    if let Ok(mut g) = llama_n_ctx_cache().lock() {
        g.clear();
    }
}

fn tcp_ready_host_port(host: &str, port: u16) -> bool {
    let spec = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    };
    match spec.to_socket_addrs() {
        Ok(mut it) => it.next().map_or(false, |addr| {
            TcpStream::connect_timeout(&addr, Duration::from_millis(600)).is_ok()
        }),
        Err(_) => false,
    }
}

fn kill_managed_if_any() {
    let Ok(mut g) = MANAGED.lock() else {
        return;
    };
    if let Some(mut m) = g.take() {
        let _ = m.child.kill();
        let _ = m.child.wait();
    }
}

/// `GET …/v1/models` — première entrée `id` (Bearer optionnel).
pub fn probe_first_model_id(base_api_v1: &str, bearer: Option<&str>) -> Result<String, String> {
    let url = format!("{}models", base_api_v1.trim_end_matches('/'));
    let auth: Option<String> = bearer.and_then(|t| {
        let t = t.trim();
        if t.is_empty() {
            None
        } else {
            Some(format!("Bearer {t}"))
        }
    });
    let mut req = ureq::get(&url);
    if let Some(ref a) = auth {
        req = req.set("Authorization", a.as_str());
    }
    let resp = req
        .call()
        .map_err(|e| format!("GET {url}: {e}"))?;
    if !(200..300).contains(&resp.status()) {
        return Err(format!("GET {} → HTTP {}", url, resp.status()));
    }
    let body = resp
        .into_string()
        .map_err(|e| format!("corps HTTP /v1/models: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("JSON /v1/models: {e}"))?;
    let id = v
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|a| a.first())
        .and_then(|o| o.get("id"))
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    id.ok_or_else(|| "Réponse /v1/models sans modèle (data vide).".to_string())
}

fn llama_n_ctx_cache() -> &'static Mutex<HashMap<String, u32>> {
    static C: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn parse_n_ctx_from_json(v: &serde_json::Value) -> Option<u32> {
    const KEYS: &[&str] = &["n_ctx", "nCtx", "default_context_length", "context_size"];
    for key in KEYS {
        if let Some(n) = v.get(*key).and_then(|x| x.as_u64()) {
            if n >= 1024 {
                return Some(n as u32);
            }
        }
    }
    if let Some(gs) = v.get("default_generation_settings") {
        if let Some(n) = parse_n_ctx_from_json(gs) {
            return Some(n);
        }
    }
    None
}

/// `GET …/props` (llama-server) — lit `n_ctx` réel si disponible.
pub fn probe_llama_server_n_ctx(base_api_v1: &str, bearer: Option<&str>) -> Option<u32> {
    let trimmed = base_api_v1.trim_end_matches('/');
    let origin = trimmed
        .strip_suffix("/v1")
        .unwrap_or(trimmed)
        .trim_end_matches('/');
    for suffix in ["/props", "/v1/props"] {
        let url = format!("{origin}{suffix}");
        let auth: Option<String> = bearer.and_then(|t| {
            let t = t.trim();
            if t.is_empty() {
                None
            } else {
                Some(format!("Bearer {t}"))
            }
        });
        let mut req = ureq::get(&url);
        if let Some(ref a) = auth {
            req = req.set("Authorization", a.as_str());
        }
        let Ok(resp) = req.call() else {
            continue;
        };
        if !(200..300).contains(&resp.status()) {
            continue;
        }
        let Ok(body) = resp.into_string() else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) else {
            continue;
        };
        if let Some(n) = parse_n_ctx_from_json(&v) {
            return Some(n);
        }
    }
    None
}

/// Une sonde `/props` par couple (base, modèle) — invalidation si l’URL change.
pub fn cached_or_probe_llama_n_ctx(
    base_api_v1: &str,
    model: &str,
    bearer: Option<&str>,
) -> Option<u32> {
    let key = format!("{}|{}", base_api_v1.trim(), model.trim());
    if let Ok(g) = llama_n_ctx_cache().lock() {
        if let Some(&n) = g.get(&key) {
            return Some(n);
        }
    }
    let n = probe_llama_server_n_ctx(base_api_v1, bearer)?;
    if let Ok(mut g) = llama_n_ctx_cache().lock() {
        g.insert(key, n);
    }
    Some(n)
}

/// Chemin absolu vers un exécutable, **ou** nom résolu via le `PATH` (ex. alias winget : `llama-server`).
fn llama_server_program_spec_ok(bin: &str) -> bool {
    let b = bin.trim();
    if b.is_empty() {
        return false;
    }
    if b.contains('/') || b.contains('\\') {
        return Path::new(b).is_file();
    }
    true
}

/// Si les prefs l’exigent : démarre llama-server sur le GGUF du cache ; sinon arrête un éventuel enfant géré.
pub fn ensure_managed_llama_server(paths: &AppPaths, prefs: &AppPrefs) -> Result<(), String> {
    if !prefs.ai.llama_server_spawn_enabled || !prefs.ai.llama_server_enabled {
        kill_managed_if_any();
        return Ok(());
    }

    let bin = prefs.ai.llama_server_binary_path.trim();
    if bin.is_empty() {
        kill_managed_if_any();
        return Ok(());
    }
    if !llama_server_program_spec_ok(bin) {
        kill_managed_if_any();
        return Err(format!(
            "Commande llama-server introuvable : « {bin} » (chemin fichier invalide, ou absent du PATH)."
        ));
    }
    if !llm_gguf_cached(&paths.llm_models_dir, &prefs.ai) {
        kill_managed_if_any();
        return Err("GGUF absent du cache RustyMail — téléchargez le poids ou corrigez dépôt / fichier.".into());
    }

    let gguf = llm_gguf_path_for_runtime(&paths.llm_models_dir, &prefs.ai);
    if !gguf.is_file() {
        kill_managed_if_any();
        return Err(format!("Fichier GGUF introuvable : {}", gguf.display()));
    }

    let (host, port) = parse_llama_loopback_listen_addr(prefs.ai.llama_server_base_url.trim())?;

    let bearer = llama_server_api_key_get().ok().flatten();
    let ctx = prefs.ai.local_llm_context_size.max(256).min(131_072);

    {
        let mut guard = MANAGED
            .lock()
            .map_err(|_| "verrou llama-server interne".to_string())?;

        if let Some(m) = guard.as_mut() {
            if m.port == port
                && m.gguf == gguf
                && m.n_ctx == ctx
                && m.child.try_wait().map(|o| o.is_none()).unwrap_or(false)
            {
                drop(guard);
                return Ok(());
            }
        }

        if tcp_ready_host_port(&host, port) {
            if guard.is_some() {
                if let Some(mut old) = guard.take() {
                    let _ = old.child.kill();
                    let _ = old.child.wait();
                }
            }
            drop(guard);
            return Ok(());
        }

        if let Some(mut old) = guard.take() {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
    }

    invalidate_llama_n_ctx_cache();

    let gguf_str = gguf
        .to_str()
        .ok_or_else(|| format!("Chemin GGUF non UTF-8 : {}", gguf.display()))?
        .to_string();

    let mut cmd = Command::new(bin);
    cmd.arg("-m")
        .arg(&gguf_str)
        .arg("--host")
        .arg(&host)
        .arg("--port")
        .arg(port.to_string())
        .arg("-c")
        .arg(ctx.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("impossible de lancer llama-server ({bin}): {e}"))?;

    #[cfg(windows)]
    let win_job = WinKillJob::try_assign_process(&child);

    {
        let mut guard = MANAGED
            .lock()
            .map_err(|_| "verrou llama-server interne".to_string())?;
        *guard = Some(ManagedProc {
            #[cfg(windows)]
            win_job,
            child,
            gguf: gguf.clone(),
            port,
            n_ctx: ctx,
        });
    }

    let need_model_list = prefs.ai.llama_server_model.trim().is_empty();
    for attempt in 0..100 {
        thread::sleep(Duration::from_millis(200));
        if !tcp_ready_host_port(&host, port) {
            if attempt > 8 {
                let _ = stop_managed_llama_server();
                return Err(
                    "llama-server s’est arrêté immédiatement (vérifiez le binaire, les DLL GPU, etc.).".into(),
                );
            }
            continue;
        }
        if !need_model_list {
            return Ok(());
        }
        match probe_first_model_id(
            prefs.ai.llama_server_base_url.trim(),
            bearer.as_deref(),
        ) {
            Ok(_) => return Ok(()),
            Err(_) => continue,
        }
    }

    stop_managed_llama_server();
    Err("llama-server : pas de réponse HTTP valide après démarrage (timeout ~20 s).".into())
}
