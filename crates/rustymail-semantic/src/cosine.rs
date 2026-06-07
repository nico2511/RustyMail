/// In-place L2 normalization; returns the same slice for chaining.
pub fn l2_normalize(v: &mut [f32]) {
    let s: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if s > 1e-12 {
        for x in v.iter_mut() {
            *x /= s;
        }
    }
}

/// Cosine similarity for two **L2-normalized** vectors of equal length.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_identical_normalized() {
        let mut v = vec![3.0_f32, 4.0];
        l2_normalize(&mut v);
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-5);
    }
}
