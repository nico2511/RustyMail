//! Grammaire GBNF (llama-server) pour la sortie JSON de l’analyse sécurité LLM.

/// Objet `{"findings":[{code,severity,messageFr},…]}` — au plus 3 findings imposés côté post-parse.
pub const SECURITY_FINDINGS_GBNF: &str = r#"
root ::= "{" space findings-kv "}"
findings-kv ::= "\"findings\"" space ":" space findings-arr
findings-arr ::= "[" space (finding ("," space finding)*)? space "]"
finding ::= "{" space code-kv "," space sev-kv "," space msg-kv "}"
code-kv ::= "\"code\"" space ":" space string
sev-kv ::= "\"severity\"" space ":" space severity-lit
msg-kv ::= "\"messageFr\"" space ":" space string
severity-lit ::= "\"info\"" | "\"attention\"" | "\"suspicion\""
string ::= "\"" char* "\""
char ::= [^"\\] | "\\" .
space ::= [ \t\n]*
"#;
