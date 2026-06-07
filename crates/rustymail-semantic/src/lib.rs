//! Local semantic embeddings (all-MiniLM-L6-v2 style ONNX) and vector helpers.

mod cosine;

#[cfg(feature = "embeddings-onnx")]
mod minilm;

pub use cosine::{cosine_similarity, l2_normalize};

#[cfg(feature = "embeddings-onnx")]
pub use minilm::{MiniLmEmbedder, MiniLmError};

/// Default subdirectory under app data: `models/all-MiniLM-L6-v2/`
/// Expect `model.onnx` and `tokenizer.json` inside.
pub fn default_minilm_model_dir(app_data_dir: &std::path::Path) -> std::path::PathBuf {
    app_data_dir.join("models").join("all-MiniLM-L6-v2")
}
