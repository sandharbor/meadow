#![deny(warnings)]

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use clap::Parser;
use serde::Serialize;
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Cli {
    /// Root directory to scan for markdown files.
    #[clap(long, required = true, value_parser = clap::value_parser!(PathBuf))]
    root: PathBuf,
}

#[derive(Serialize, Debug, Clone)]
struct SourcePageFileInfo {
    title: String,
    /// Subdirectory (relative to root). Empty string means root.
    directory: String,
    /// Logical file type. Excalidraw drawings are stored as `.excalidraw.md`
    /// files, but exposed as file_type "excalidraw".
    file_type: String,
    /// Path relative to root, using forward slashes.
    #[serde(rename = "fullPath")]
    full_path: String,
    /// File modified time in ms since epoch (used for sorting newest -> oldest).
    #[serde(rename = "modifiedTimeMs")]
    modified_time_ms: u64,
}

fn os_str_to_string_lossy(s: &OsStr) -> String {
    s.to_string_lossy().into_owned()
}

fn is_markdown_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => ext.eq_ignore_ascii_case("md"),
        None => false,
    }
}

fn is_excalidraw_markdown(content: &str) -> bool {
    if !content.starts_with("---") {
        return false;
    }
    let after_open = &content[3..];
    let close_rel = match after_open.find("\n---") {
        Some(idx) => idx,
        None => return false,
    };
    let frontmatter = &after_open[..close_rel];
    frontmatter.contains("excalidraw-plugin: parsed")
}

fn strip_block_id_suffix(title: &str) -> &str {
    // Matches fs_search behavior: filenames like "My Note#^abc123.md" represent block-refs and
    // should be treated as the base page title.
    if let Some(idx) = title.rfind("#^") {
        &title[..idx]
    } else {
        title
    }
}

fn path_to_forward_slashes(path: &Path) -> String {
    // `display()` uses OS separators; normalize to '/' for consistency with existing tooling.
    path.to_string_lossy().replace('\\', "/")
}

fn modified_time_ms(path: &Path) -> u64 {
    match std::fs::metadata(path).and_then(|m| m.modified()) {
        Ok(t) => system_time_to_ms(t).unwrap_or(0),
        Err(_) => 0,
    }
}

fn system_time_to_ms(t: SystemTime) -> Option<u64> {
    let dur = t.duration_since(UNIX_EPOCH).ok()?;
    Some(dur.as_millis() as u64)
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let root = cli
        .root
        .canonicalize()
        .with_context(|| format!("Failed to resolve root directory: {}", cli.root.display()))?;

    let mut results: Vec<SourcePageFileInfo> = Vec::new();

    for entry in WalkDir::new(&root).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        if !is_markdown_file(path) {
            continue;
        }

        let rel = match path.strip_prefix(&root) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let file_stem = match path.file_stem() {
            Some(s) => os_str_to_string_lossy(s),
            None => continue,
        };
        let mut title = strip_block_id_suffix(&file_stem).to_string();
        let mut file_type = "md".to_string();

        if let Ok(content) = std::fs::read_to_string(path) {
            if is_excalidraw_markdown(&content) {
                file_type = "excalidraw".to_string();
                if let Some(stripped) = title.strip_suffix(".excalidraw") {
                    title = stripped.to_string();
                }
            }
        }

        let directory = rel
            .parent()
            .map(|p| path_to_forward_slashes(p))
            .unwrap_or_else(String::new);

        let full_path = path_to_forward_slashes(rel);

        results.push(SourcePageFileInfo {
            title,
            directory,
            file_type,
            full_path: full_path,
            modified_time_ms: modified_time_ms(path),
        });
    }

    // Deterministic ordering; callers can re-sort/rank as needed.
    results.sort_by(|a, b| {
        if a.full_path != b.full_path {
            return a.full_path.cmp(&b.full_path);
        }
        a.title.cmp(&b.title)
    });

    let out = serde_json::to_string(&results)?;
    print!("{}", out);
    Ok(())
}
