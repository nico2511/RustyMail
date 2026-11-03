//! Parité list_threads / filter_counts, migration des index perf, SQLCipher fast path.

use super::*;
use rusqlite::{params, Connection};
use std::sync::{Mutex, MutexGuard};

static SQLITE_PERF_TEST_LOCK: Mutex<()> = Mutex::new(());

fn sqlite_perf_test_guard() -> MutexGuard<'static, ()> {
    SQLITE_PERF_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
const NEW_LIST_THREADS_PAGE_SQL: &str = "
        WITH cand AS (
          SELECT DISTINCT thread_id FROM messages
          WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
        )
        SELECT t.id, t.subject, t.tags, COALESCE(t.is_followed, 0)
        FROM cand JOIN threads t ON t.id = cand.thread_id
        WHERE t.account_id = ?1
        ORDER BY (SELECT max(received_at) FROM messages WHERE thread_id = t.id) DESC, t.id
        LIMIT ?3 OFFSET ?4
        ";

#[cfg(test)]
const LEGACY_LIST_THREADS_PAGE_SQL: &str = "
        SELECT id, subject, tags, COALESCE(is_followed, 0) FROM threads
        WHERE account_id = ?1
          AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.thread_id = threads.id
              AND m.account_id = ?1
              AND lower(trim(m.mailbox)) = lower(trim(?2))
          )
        ORDER BY
          (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
          id
        LIMIT ?3 OFFSET ?4
        ";

#[cfg(test)]
const LEGACY_FILTER_ALL_SQL: &str = "
            SELECT COUNT(DISTINCT t.id) FROM threads t
            WHERE t.account_id = ?1
              AND EXISTS (
                SELECT 1 FROM messages m
                WHERE m.thread_id = t.id AND m.account_id = ?1
                  AND lower(trim(m.mailbox)) = lower(trim(?2))
              )
            ";

#[cfg(test)]
const LEGACY_FILTER_UNREAD_SQL: &str = "
            SELECT CAST(SUM(
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.thread_id = t.id AND COALESCE(m.is_read, 0) = 0
                )
                THEN 1
                ELSE 0
              END
            ) AS INTEGER)
            FROM threads t
            WHERE t.account_id = ?1
              AND EXISTS (
                SELECT 1 FROM messages m2
                WHERE m2.thread_id = t.id AND m2.account_id = ?1
                  AND lower(trim(m2.mailbox)) = lower(trim(?2))
              )
            ";

fn insert_account(conn: &Connection, id: &str, email: &str) {
    conn.execute(
        "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, imap_allow_invalid_tls, smtp_host, smtp_port, smtp_security, smtp_allow_invalid_tls)
         VALUES (?1, 'Test', ?2, 'h', 993, 'tls', 0, 'h', 465, 'tls', 0)",
        params![id, email],
    )
    .expect("account");
}

static FIXTURE_MSG_UID: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(1);

fn insert_thread_msg(
    conn: &Connection,
    account_id: &str,
    thread_id: &str,
    mailbox: &str,
    received_at: &str,
    subject: &str,
    is_read: i64,
) {
    let imap_uid = FIXTURE_MSG_UID.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    conn.execute(
        "INSERT OR IGNORE INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags, is_followed)
         VALUES (?1, ?2, ?3, ?4, ?5, '', 0)",
        params![
            thread_id,
            account_id,
            mailbox,
            format!("root-{thread_id}"),
            subject
        ],
    )
    .expect("thread");
    conn.execute(
        "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, is_read, position)
         VALUES (?1, ?2, ?3, ?4, ?5, 'A', 'a@example.com', ?6, ?7, 'body', ?8, 0)",
        params![
            format!("msg-{thread_id}-{mailbox}-{received_at}"),
            thread_id,
            account_id,
            mailbox,
            imap_uid,
            subject,
            received_at,
            is_read
        ],
    )
    .expect("message");
}

fn build_multi_mailbox_fixture(path: &std::path::Path) {
    reset_sqlite_migrated_memo_for_tests();
    let conn = open_sqlite_migrated(path).expect("migrate");
    insert_account(&conn, "acc-a", "a@example.com");
    insert_account(&conn, "", "legacy@example.com");
    insert_account(&conn, "acc-b", "b@example.com");

    insert_thread_msg(
        &conn,
        "acc-a",
        "t-inbox",
        "INBOX",
        "2026-03-01T10:00:00Z",
        "Inbox",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-inbox-space",
        " Inbox ",
        "2026-03-02T10:00:00Z",
        "Spaced",
        1,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-lower",
        "inbox",
        "2026-03-03T10:00:00Z",
        "Lower",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-sent",
        "Sent",
        "2026-04-01T10:00:00Z",
        "Sent local",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-gmail-sent",
        "[Gmail]/Sent Mail",
        "2026-04-02T10:00:00Z",
        "Gmail sent",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-trash",
        "INBOX.Trash",
        "2026-05-01T10:00:00Z",
        "Trash imap",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-corbeille",
        "Corbeille",
        "2026-05-02T10:00:00Z",
        "Corbeille",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-archive",
        "Archives",
        "2026-06-01T10:00:00Z",
        "Archive",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-multi",
        "INBOX",
        "2026-02-01T10:00:00Z",
        "Multi inbox",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-multi",
        "Sent",
        "2026-07-01T12:00:00Z",
        "Multi reply sent",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-tie-a",
        "INBOX",
        "2026-01-15T10:00:00Z",
        "Tie A",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-tie-b",
        "INBOX",
        "2026-01-15T10:00:00Z",
        "Tie B",
        0,
    );
    insert_thread_msg(
        &conn,
        "",
        "t-legacy",
        "INBOX",
        "2026-01-01T08:00:00Z",
        "Legacy account",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-b",
        "t-shared",
        "INBOX",
        "2026-08-01T10:00:00Z",
        "Shared acc b",
        0,
    );
    insert_thread_msg(
        &conn,
        "acc-a",
        "t-shared",
        "INBOX",
        "2026-08-02T10:00:00Z",
        "Shared acc a",
        0,
    );
    drop(conn);
}

fn explain_plan_with_params(conn: &Connection, sql: &str, bind: impl rusqlite::Params) -> String {
    let full = format!("EXPLAIN QUERY PLAN {sql}");
    let mut stmt = conn.prepare(&full).expect("explain prep");
    let rows = stmt
        .query_map(bind, |row| row.get::<_, String>(3))
        .expect("explain rows");
    rows.filter_map(|r| r.ok()).collect::<Vec<_>>().join("\n")
}

fn legacy_list_ids(
    conn: &Connection,
    account_id: &str,
    resolved: &str,
    limit: i64,
    offset: i64,
) -> Vec<String> {
    let mut stmt = conn
        .prepare(LEGACY_LIST_THREADS_PAGE_SQL)
        .expect("legacy list sql");
    stmt.query_map(params![account_id, resolved, limit, offset], |row| {
        row.get::<_, String>(0)
    })
    .expect("legacy query")
    .map(|r| r.expect("row"))
    .collect()
}

fn new_list_ids(
    conn: &Connection,
    account_id: &str,
    resolved: &str,
    limit: i64,
    offset: i64,
) -> Vec<String> {
    let mut stmt = conn
        .prepare(NEW_LIST_THREADS_PAGE_SQL)
        .expect("new list sql");
    stmt.query_map(params![account_id, resolved, limit, offset], |row| {
        row.get::<_, String>(0)
    })
    .expect("new query")
    .map(|r| r.expect("row"))
    .collect()
}

fn legacy_filter_all(conn: &Connection, account_id: &str, resolved: &str) -> i64 {
    conn.query_row(
        LEGACY_FILTER_ALL_SQL,
        params![account_id, resolved],
        |row| row.get(0),
    )
    .expect("legacy all")
}

fn new_filter_all(conn: &Connection, account_id: &str, resolved: &str) -> i64 {
    conn.query_row(
        "
            SELECT COUNT(DISTINCT m.thread_id) FROM messages m
            JOIN threads t ON t.id = m.thread_id AND t.account_id = ?1
            WHERE m.account_id = ?1 AND lower(trim(m.mailbox)) = lower(trim(?2))
            ",
        params![account_id, resolved],
        |row| row.get(0),
    )
    .expect("new all")
}

#[test]
fn list_threads_and_filter_counts_parity_multi_mailbox() {
    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("parity.db");
    build_multi_mailbox_fixture(&path);

    let conn = open_sqlite_migrated(&path).expect("open");
    let cases: Vec<(&str, &str)> = vec![
        ("acc-a", "INBOX"),
        ("acc-a", "inbox"),
        ("acc-a", "Sent"),
        ("acc-a", "Corbeille"),
        ("acc-a", "Archives"),
        ("", "INBOX"),
        ("acc-b", "INBOX"),
    ];
    let limits = [2_i64, 50];
    let offsets = [0_i64, 2, 50, 200];

    for (account, mailbox) in cases {
        let resolved =
            resolve_scoped_mailbox_for_account(&conn, account, mailbox).expect("resolve");
        for limit in limits {
            for offset in offsets {
                let legacy = legacy_list_ids(&conn, account, &resolved, limit, offset);
                let modern = new_list_ids(&conn, account, &resolved, limit, offset);
                assert_eq!(
                    legacy, modern,
                    "list parity account={account} mailbox={mailbox} limit={limit} offset={offset}"
                );
            }
        }
        let legacy_all = legacy_filter_all(&conn, account, &resolved);
        let new_all = new_filter_all(&conn, account, &resolved);
        assert_eq!(legacy_all, new_all, "all count parity {account}/{mailbox}");
    }
}

#[test]
fn explain_query_plan_uses_perf_indexes() {
    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("plan.db");
    build_multi_mailbox_fixture(&path);
    let conn = open_sqlite_migrated(&path).expect("open");
    let resolved = resolve_scoped_mailbox_for_account(&conn, "acc-a", "INBOX").expect("resolve");

    let list_plan = explain_plan_with_params(
        &conn,
        NEW_LIST_THREADS_PAGE_SQL,
        params!["acc-a", resolved.as_str(), 50_i64, 0_i64],
    );
    assert!(list_plan.contains("idx_messages_account_mbnorm_thread"));
    assert!(list_plan.contains("idx_messages_thread_received"));
    assert!(!list_plan.contains("SCAN threads"));

    let count_plan = explain_plan_with_params(
        &conn,
        "
            SELECT COUNT(DISTINCT m.thread_id) FROM messages m
            JOIN threads t ON t.id = m.thread_id AND t.account_id = ?1
            WHERE m.account_id = ?1 AND lower(trim(m.mailbox)) = lower(trim(?2))
            ",
        params!["acc-a", resolved.as_str()],
    );
    assert!(count_plan.contains("idx_messages_account_mbnorm_thread"));
    let _ = resolved;
}

#[test]
fn migrate_creates_perf_indexes_on_empty_db() {
    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("empty.db");
    reset_sqlite_migrated_memo_for_tests();
    let conn = open_sqlite_migrated(&path).expect("open");
    for name in [
        "idx_messages_account_mbnorm_thread",
        "idx_messages_thread_received",
    ] {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?1",
                [name],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(n, 1, "missing index {name}");
    }
}

#[test]
fn migrate_perf_indexes_idempotent() {
    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("idem.db");
    build_multi_mailbox_fixture(&path);
    reset_sqlite_migrated_memo_for_tests();
    let conn = open_sqlite_migrated(&path).expect("open1");
    migrate(&conn).expect("migrate again");
}

#[test]
fn migrate_index_failure_does_not_block_open() {
    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("idxfail.db");
    reset_sqlite_migrated_memo_for_tests();
    let conn = open_sqlite_migrated(&path).expect("open");
    conn.execute(
        "DROP INDEX IF EXISTS idx_messages_account_mbnorm_thread",
        [],
    )
    .expect("drop index");
    conn.execute(
        "CREATE TABLE idx_messages_account_mbnorm_thread (id INTEGER)",
        [],
    )
    .expect("block index name");
    migrate(&conn).expect("migrate with blocked index name");
    let n: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_messages_account_mbnorm_thread'",
            [],
            |row| row.get(0),
        )
        .expect("count");
    assert_eq!(n, 0);
    conn.execute("DROP TABLE idx_messages_account_mbnorm_thread", [])
        .expect("drop blocker");
    migrate(&conn).expect("migrate after fix");
    let n2: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_messages_account_mbnorm_thread'",
            [],
            |row| row.get(0),
        )
        .expect("count2");
    assert_eq!(n2, 1);
}

#[test]
fn sqlcipher_second_open_uses_fast_path() {
    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("fast.db");
    reset_sqlite_migrated_memo_for_tests();
    let _ = open_sqlite_migrated(&path).expect("first");
    let _ = open_sqlite_migrated(&path).expect("second");
    assert!(
        sqlite_crypto::sqlcipher_fast_path_open_count_for_tests() >= 1,
        "fast path expected on second open"
    );
}

#[test]
fn perf_list_threads_log_has_no_personal_data() {
    let _guard = sqlite_perf_test_guard();
    let line = format_perf_list_threads_log(42, 3, "inbox");
    assert!(line.contains("perf list_threads"));
    assert!(!line.contains('@'));
    assert!(!line.contains("INBOX"));
    assert!(!line.contains("acc-a"));
}

#[test]
#[ignore = "bench_folder_switch — génère ~250 Mo SQLCipher, lancer avec --ignored"]
fn bench_folder_switch_large_encrypted_db() {
    use std::time::Instant;

    let _guard = sqlite_perf_test_guard();
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("bench.db");
    reset_sqlite_migrated_memo_for_tests();

    {
        let conn = open_sqlite_migrated(&path).expect("open empty");
        insert_account(&conn, "bench", "bench@example.com");
        let mut msg_id = 0usize;
        for t in 0..20_000 {
            let mb = match t % 100 {
                0..=69 => "INBOX",
                70..=84 => "Sent",
                85..=94 => "Archives",
                _ => "Corbeille",
            };
            let tid = format!("t-{t}");
            let body_plain = "x".repeat(3000 + (t % 3000));
            let body_html = format!("<p>{}</p>", "y".repeat(8000 + (t % 12_000)));
            conn.execute(
                "INSERT OR IGNORE INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags, is_followed)
                 VALUES (?1, 'bench', ?2, ?3, ?4, '', 0)",
                params![tid, mb, format!("root-{tid}"), format!("Subject {t}")],
            )
            .expect("thread");
            conn.execute(
                "INSERT INTO messages (id, thread_id, account_id, mailbox, imap_uid, sender_name, sender_email, subject, received_at, body, body_plain, body_html, is_read, position)
                 VALUES (?1, ?2, 'bench', ?3, ?4, 'A', 'a@example.com', ?5, ?6, ?7, ?7, ?8, 0, 0)",
                params![
                    format!("m-{msg_id}"),
                    tid,
                    mb,
                    msg_id as i64,
                    format!("Subject {t}"),
                    format!("2026-01-{:02}T10:00:00Z", (t % 28) + 1),
                    body_plain,
                    body_html
                ],
            )
            .expect("message");
            msg_id += 1;
        }
    }

    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    eprintln!("bench db size bytes={size}");

    {
        let conn = open_sqlite_migrated(&path).expect("open for drop");
        conn.execute(
            "DROP INDEX IF EXISTS idx_messages_account_mbnorm_thread",
            [],
        )
        .expect("drop1");
        conn.execute("DROP INDEX IF EXISTS idx_messages_thread_received", [])
            .expect("drop2");
    }
    reset_sqlite_migrated_memo_for_tests();
    let idx_start = Instant::now();
    let conn = open_sqlite_migrated(&path).expect("migrate indexes");
    let idx_elapsed = idx_start.elapsed();
    eprintln!("index creation (first migrate with data) {:?}", idx_elapsed);
    assert!(
        idx_elapsed.as_secs() <= 15,
        "index creation exceeded 15s: {:?}",
        idx_elapsed
    );
    drop(conn);

    for mb in ["INBOX", "Sent", "Archives", "Corbeille"] {
        let mut legacy_ms = Vec::new();
        let mut modern_ms = Vec::new();
        for _ in 0..5 {
            reset_sqlite_migrated_memo_for_tests();
            let t0 = Instant::now();
            let conn = open_sqlite_migrated(&path).expect("open");
            let resolved = resolve_scoped_mailbox_for_account(&conn, "bench", mb).expect("resolve");
            let _legacy = legacy_list_ids(&conn, "bench", &resolved, 50, 0);
            legacy_ms.push(t0.elapsed().as_millis());

            reset_sqlite_migrated_memo_for_tests();
            let t1 = Instant::now();
            let _ = sqlite_list_threads_page_scoped(&path, "bench", mb, 50, 0).expect("list");
            modern_ms.push(t1.elapsed().as_millis());
        }
        legacy_ms.sort_unstable();
        modern_ms.sort_unstable();
        eprintln!(
            "bench {mb} legacy median ms={} modern median ms={}",
            legacy_ms[2], modern_ms[2]
        );
    }
}
