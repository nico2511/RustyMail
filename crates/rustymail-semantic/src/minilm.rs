//! ONNX Runtime inference for sentence-transformers–style MiniLM exports.

use std::path::{Path, PathBuf};

use ndarray::Array2;
use ort::session::{Session, SessionOutputs};
use ort::value::TensorRef;
use thiserror::Error;
use tokenizers::Tokenizer;

#[derive(Debug, Error)]
pub enum MiniLmError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("ONNX: {0}")]
    Ort(#[from] ort::Error),
    #[error("tokenizer: {0}")]
    Tokenizer(String),
    #[error("missing model file: {0}")]
    MissingModel(PathBuf),
    #[error("unexpected ONNX outputs: {0}")]
    OutputLayout(String),
}

pub struct MiniLmEmbedder {
    session: Session,
    tokenizer: Tokenizer,
    max_length: usize,
}

impl MiniLmEmbedder {
    pub fn from_dir(dir: &Path) -> Result<Self, MiniLmError> {
        let model_path = dir.join("model.onnx");
        if !model_path.is_file() {
            return Err(MiniLmError::MissingModel(model_path));
        }
        let tok_path = dir.join("tokenizer.json");
        if !tok_path.is_file() {
            return Err(MiniLmError::MissingModel(tok_path));
        }

        let mut builder = Session::builder()?;
        let session = builder.commit_from_file(&model_path)?;
        let tokenizer =
            Tokenizer::from_file(tok_path).map_err(|e| MiniLmError::Tokenizer(e.to_string()))?;

        Ok(Self {
            session,
            tokenizer,
            max_length: 256,
        })
    }

    /// Mean-pooled, L2-normalized sentence embedding (typically dim 384).
    pub fn embed(&mut self, text: &str) -> Result<Vec<f32>, MiniLmError> {
        let text = text.trim();
        if text.is_empty() {
            return Err(MiniLmError::Tokenizer("empty text".into()));
        }

        let enc = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| MiniLmError::Tokenizer(e.to_string()))?;

        let ids = enc.get_ids();
        let mask = enc.get_attention_mask();
        let len = ids.len().min(self.max_length);
        if len == 0 {
            return Err(MiniLmError::Tokenizer("no tokens".into()));
        }

        let mut input_ids = Array2::<i64>::zeros((1, len));
        let mut attention_mask = Array2::<i64>::zeros((1, len));
        for (i, (&id, &m)) in ids.iter().zip(mask.iter()).take(len).enumerate() {
            input_ids[[0, i]] = id as i64;
            attention_mask[[0, i]] = m as i64;
        }
        // Export ONNX sentence-transformers (BERT) : segment A seul → que des zéros.
        let token_type_ids = Array2::<i64>::zeros((1, len));

        let outputs: SessionOutputs = self.session.run(ort::inputs![
            "input_ids" => TensorRef::from_array_view(&input_ids)?,
            "attention_mask" => TensorRef::from_array_view(&attention_mask)?,
            "token_type_ids" => TensorRef::from_array_view(&token_type_ids)?,
        ])?;

        let pooled = mean_pool_last_hidden(&outputs, len, &attention_mask)?;
        let mut out = pooled;
        crate::l2_normalize(&mut out);
        Ok(out)
    }
}

fn mean_pool_last_hidden(
    outputs: &SessionOutputs,
    seq_len: usize,
    attention_mask: &Array2<i64>,
) -> Result<Vec<f32>, MiniLmError> {
    if outputs.len() == 0 {
        return Err(MiniLmError::OutputLayout("no outputs".into()));
    }
    let tensor = if outputs.contains_key("last_hidden_state") {
        outputs.get("last_hidden_state").unwrap()
    } else {
        &outputs[0]
    };

    let view = tensor.try_extract_array::<f32>()?;
    let owned = view.to_owned();
    let shape = owned.shape();
    if shape.len() != 3 {
        return Err(MiniLmError::OutputLayout(format!(
            "expected rank-3 tensor, got {:?}",
            shape
        )));
    }
    let s = shape[1].min(seq_len);
    let hidden = shape[2];

    let mut sum = vec![0.0_f32; hidden];
    let mut denom = 0.0_f32;
    for i in 0..s {
        let m = attention_mask[[0, i]] as f32;
        if m <= 0.0 {
            continue;
        }
        denom += m;
        for h in 0..hidden {
            sum[h] += owned[[0, i, h]] * m;
        }
    }
    if denom < 1e-6 {
        return Err(MiniLmError::OutputLayout("zero attention mass".into()));
    }
    for x in &mut sum {
        *x /= denom;
    }
    Ok(sum)
}
