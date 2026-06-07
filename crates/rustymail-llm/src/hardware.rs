//! Détection mémoire + profil GGUF suggéré (Qwen2.5-Instruct).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Accelerator {
    Auto,
    Cpu,
    Cuda,
    Vulkan,
    Metal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HardwareModelTier {
    /// RAM totale < 4 GiB ou disponible < 2 GiB → pas de modèle local conseillé.
    Insufficient,
    Tiny,
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareModelProfile {
    pub tier: HardwareModelTier,
    /// Dépôt Hugging Face GGUF officiel du modèle conseillé.
    pub recommended_repo: String,
    pub recommended_file: String,
    pub accel_suggested: Accelerator,
    pub local_runnable: bool,
    pub reason: Option<String>,
}

fn tier_for_ram_bytes(total_ram: u64, avail_ram: u64) -> (HardwareModelTier, Option<&'static str>) {
    const GIB: u64 = 1024 * 1024 * 1024;
    if total_ram < 4 * GIB || avail_ram < 2 * GIB {
        return (
            HardwareModelTier::Insufficient,
            Some("RAM totale < 4 Go ou disponible < 2 Go."),
        );
    }
    match avail_ram {
        r if r < 6 * GIB => (HardwareModelTier::Tiny, None),
        r if r < 10 * GIB => (HardwareModelTier::Small, None),
        r if r < 16 * GIB => (HardwareModelTier::Medium, None),
        _ => (HardwareModelTier::Large, None),
    }
}

fn file_for_tier(tier: HardwareModelTier) -> &'static str {
    match tier {
        HardwareModelTier::Insufficient => "",
        HardwareModelTier::Tiny => "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        HardwareModelTier::Small => "qwen2.5-3b-instruct-q4_k_m.gguf",
        HardwareModelTier::Medium => "qwen2.5-7b-instruct-q4_k_m.gguf",
        HardwareModelTier::Large => "qwen2.5-14b-instruct-q4_k_m.gguf",
    }
}

/// Dépôt HF aligné sur la variante (un fichier 14B n’existe pas sous le repo 7B → 404).
///
/// Qwen **officiel** 7B / 14B ne publie pas de `…-q4_k_m.gguf` monolithique (souvent des shards
/// `…-00001-of-…`). Pour le couple repo + fichier conseillé dans l’UI on pointe des miroirs
/// **fichier unique** (TheRains / Q4_K_M) afin d’éviter les 404 au téléchargement.
fn repo_for_tier(tier: HardwareModelTier) -> &'static str {
    match tier {
        HardwareModelTier::Insufficient => "",
        HardwareModelTier::Tiny => "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        HardwareModelTier::Small => "Qwen/Qwen2.5-3B-Instruct-GGUF",
        HardwareModelTier::Medium => "TheRains/Qwen2.5-7B-Instruct-Q4_K_M-GGUF",
        HardwareModelTier::Large => "TheRains/Qwen2.5-14B-Instruct-Q4_K_M-GGUF",
    }
}

/// Pré-sélection accélérateur (heuristique légère, pas de scan pilotes) : Metal sur macOS, **Vulkan** ailleurs
/// pour refléter l’usage GPU typique de llama-server ; la garde produit combine avec le tier RAM.
fn accel_heuristic() -> Accelerator {
    if cfg!(target_os = "macos") {
        Accelerator::Metal
    } else {
        Accelerator::Vulkan
    }
}

/// `true` si on autorise le chemin **llama-server** (GPU plausible) : pas de RAM insuffisante, et
/// accélérateur suggéré non-CPU **ou** override explicite dans les prefs.
pub fn llama_server_gpu_gate_ok(profile: &HardwareModelProfile, allow_cpu_override: bool) -> bool {
    if profile.tier == HardwareModelTier::Insufficient {
        return false;
    }
    if allow_cpu_override {
        return true;
    }
    profile.accel_suggested != Accelerator::Cpu
}

/// Profil pour les réglages `auto`.
/// RAM hôte pour l’UI (gibioctets arrondis, basé sur `sysinfo`).
pub fn host_memory_gib() -> (f64, f64) {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let total_kib = sys.total_memory() as f64;
    let avail_kib = sys.available_memory() as f64;
    let gib = |kib: f64| kib / (1024.0 * 1024.0);
    (gib(total_kib), gib(avail_kib))
}

pub fn detect_profile() -> HardwareModelProfile {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let total_ram = sys.total_memory() * 1024; // sysinfo KiB → bytes
    let avail_ram = sys.available_memory() * 1024;

    let (tier, reason) = tier_for_ram_bytes(total_ram, avail_ram);
    let accel_suggested = accel_heuristic();

    if tier == HardwareModelTier::Insufficient {
        return HardwareModelProfile {
            tier,
            recommended_repo: String::new(),
            recommended_file: String::new(),
            accel_suggested,
            local_runnable: false,
            reason: reason.map(|s| s.to_string()),
        };
    }

    HardwareModelProfile {
        tier,
        recommended_repo: repo_for_tier(tier).into(),
        recommended_file: file_for_tier(tier).into(),
        accel_suggested,
        local_runnable: true,
        reason: reason.map(|s| s.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tier_repo_matches_gguf_basename() {
        let repos = [
            (
                HardwareModelTier::Tiny,
                "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
                "1.5b",
            ),
            (
                HardwareModelTier::Small,
                "Qwen/Qwen2.5-3B-Instruct-GGUF",
                "3b",
            ),
            (
                HardwareModelTier::Medium,
                "TheRains/Qwen2.5-7B-Instruct-Q4_K_M-GGUF",
                "7b",
            ),
            (
                HardwareModelTier::Large,
                "TheRains/Qwen2.5-14B-Instruct-Q4_K_M-GGUF",
                "14b",
            ),
        ];
        for (tier, repo, slug) in repos {
            let f = super::file_for_tier(tier);
            let r = super::repo_for_tier(tier);
            assert_eq!(r, repo);
            assert!(
                f.to_ascii_lowercase().contains(slug),
                "tier {tier:?}: file {f} should contain {slug}, repo {r}",
            );
        }
    }

    #[test]
    fn detect_profile_ok() {
        let p = detect_profile();
        assert!(matches!(
            p.tier,
            HardwareModelTier::Insufficient
                | HardwareModelTier::Tiny
                | HardwareModelTier::Small
                | HardwareModelTier::Medium
                | HardwareModelTier::Large
        ));
    }
}
