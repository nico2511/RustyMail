const SIGNATURE_MARKERS: &[&str] = &[
    "-- ",
    "Best,",
    "Best regards,",
    "Kind regards,",
    "Regards,",
    "Thanks,",
    "Cordialement,",
    "Bien cordialement,",
    "Salutations,",
    "Sent from my",
    "Envoyé depuis",
];

pub fn strip_signature(input: &str) -> String {
    let mut kept = Vec::new();
    for line in input.lines() {
        if SIGNATURE_MARKERS
            .iter()
            .any(|marker| line.trim_start().starts_with(marker))
        {
            break;
        }
        kept.push(line);
    }
    kept.join("\n").trim().to_string()
}
