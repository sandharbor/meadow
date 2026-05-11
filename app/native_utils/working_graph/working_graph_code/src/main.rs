use clap::Parser;
use link_parser_lib::{parse_link_text, parse_markdown_link_href, AnchorType as LibAnchorType};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use working_graph::site_page_config::{parse_site_page_config_yaml, SitePageConfig};
use working_graph::traversal::{get_working_graph, TraverseOpts};
use working_graph::types::{BasicEdge, TraversalDetails, TraversalFile};

#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Args {
    #[arg(long)]
    graph_root: PathBuf,

    #[arg(long)]
    site_page_config: PathBuf,

    #[arg(long)]
    initial_title: String,
    #[arg(long)]
    initial_directory: String,
    #[arg(long)]
    initial_file_type: String,

    #[arg(long)]
    traversal_title: String,
    #[arg(long)]
    traversal_directory: String,
    #[arg(long)]
    traversal_file_type: String,

    #[arg(long, default_value_t = 0)]
    frontier_depth: i32,

    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    allow_images_to_extend_to_frontier: bool,

    #[arg(long, default_value_t = false)]
    allow_lower_depths: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct PageIdentifier {
    directory: String,
    title: String,
    file_type: String,
    path: String, // no leading "/" (matches fs_search `path`)
}

#[derive(Debug, Clone)]
struct LinkOut {
    link_original_text: String,
    link_source_page_path: String,

    link_parsed_directory: String,
    link_parsed_title: String,
    link_parsed_file_type: String,
    link_parsed_anchor: Option<String>,
    link_parsed_anchor_type: Option<LibAnchorType>,
    link_parsed_alias: Option<String>,
    link_parsed_media_size: Option<u32>,

    link_resolved_target_directory: String,
    link_resolved_target_path: String,

    /// True for standard markdown links `[text](href)` where paths are relative to the source file.
    /// False for wiki-links `[[inner]]` where paths are resolved by fuzzy search.
    is_relative_path_link: bool,
}

#[derive(Debug, Clone, PartialEq)]
enum ExtractedLink {
    Wiki(String),
    Markdown { text: String, href: String },
}

#[derive(Debug, Clone)]
struct ScanResult {
    source_file: PageIdentifier,
    is_sensitive: bool,
    outgoing_links: Vec<LinkOut>,
}

#[allow(non_snake_case)]
#[derive(Serialize)]
struct OutputPage {
    id: String,
    title: String,
    sourceGraphSubdirectory: String,
    file_type: String,
    depth: i32,
    remaining_depth: i32,
    remaining_inlinks_depth: i32,
    path: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    traversal_details: Option<TraversalDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isFrontierPage: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isFrontierImageExtension: Option<bool>,
    is_sensitive: bool,
}

#[allow(non_snake_case)]
#[derive(Serialize, Clone)]
struct OutputEdge {
    source: String,
    target: String,
    isBidirectional: bool,
    link_source_page_path: String,
    link_original_text: String,
    link_parsed_directory: String,
    link_parsed_title: String,
    link_parsed_file_type: String,
    link_parsed_anchor: Option<String>,
    link_parsed_anchor_type: Option<LibAnchorType>,
    link_parsed_alias: Option<String>,
    link_parsed_media_size: Option<u32>,
    link_resolved_target_directory: String,
    link_resolved_target_path: String,
}

#[allow(non_snake_case)]
#[derive(Serialize)]
struct OutputGraph {
    pages: Vec<OutputPage>,
    edges: Vec<OutputEdge>,
    allLinkResolutionMaps: HashMap<String, HashMap<String, LinkResolvedInfo>>,
    allInlinkSources: HashMap<String, Vec<String>>,
    allOutlinkTargets: HashMap<String, Vec<String>>,
}

#[derive(Serialize, Clone)]
struct LinkResolvedInfo {
    link_resolved_target_directory: String,
    link_resolved_target_path: Option<String>,
}

const IMAGE_EXTENSIONS_MAIN: &[&str] = &["jpg", "jpeg", "png", "gif", "svg", "webp", "excalidraw"];

/// Sidecar pagespec files like `foo.svg.pagespec.yaml` or `foo.excalidraw.pagespec.yaml`
/// carry test metadata for files that cannot embed pagespecs inline. The graph scanner
/// must not treat them as pages.
fn is_pagespec_sidecar(path: &std::path::Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.ends_with(".pagespec.yaml"))
        .unwrap_or(false)
}

/// Detects whether a markdown file is an Obsidian Excalidraw drawing by content.
/// Obsidian's Excalidraw plugin writes `excalidraw-plugin: parsed` into the YAML
/// frontmatter. We only inspect the leading frontmatter region to keep this cheap.
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

fn extract_page_identifier(path: &std::path::Path, base_dir: &std::path::Path) -> PageIdentifier {
    let mut directory = path
        .parent()
        .unwrap_or_else(|| std::path::Path::new(""))
        .strip_prefix(base_dir)
        .unwrap_or_else(|_| path.parent().unwrap_or_else(|| std::path::Path::new("")))
        .to_string_lossy()
        .into_owned();
    if directory.starts_with("./") {
        directory = directory[2..].to_string();
    }

    let file_name_full = path.file_name().unwrap_or_default().to_string_lossy();
    let (name_part, file_type_str) = if let Some(dot_pos) = file_name_full.rfind('.') {
        let stem_candidate = &file_name_full[..dot_pos];
        let mut ext = file_name_full[dot_pos + 1..].to_lowercase();

        const KNOWN_PARSEABLE_EXTENSIONS: &[&str] = &["md", "txt"];
        const KNOWN_OTHER_DOCUMENT_EXTENSIONS: &[&str] = &["pdf"];

        if !(KNOWN_PARSEABLE_EXTENSIONS.contains(&ext.as_str())
            || KNOWN_OTHER_DOCUMENT_EXTENSIONS.contains(&ext.as_str())
            || IMAGE_EXTENSIONS_MAIN.contains(&ext.as_str()))
        {
            ext = "other".to_string();
        }
        (stem_candidate.to_string(), ext)
    } else {
        (file_name_full.to_string(), "md".to_string())
    };

    let title = if let Some(hash_pos) = name_part.rfind("#^") {
        name_part[..hash_pos].to_string()
    } else {
        name_part
    };

    let path = if directory.is_empty() {
        format!("{}.{}", title, file_type_str)
    } else {
        format!("{}/{}.{}", directory, title, file_type_str)
    };

    PageIdentifier {
        directory,
        title,
        file_type: file_type_str,
        path,
    }
}

fn calculate_normalized_directory(source_dir_path_str: &str, link_path_prefix_opt: Option<&String>) -> String {
    let initial_path_to_normalize: std::path::PathBuf = match link_path_prefix_opt {
        None => std::path::PathBuf::from(source_dir_path_str),
        Some(prefix_str) => std::path::PathBuf::from(prefix_str.strip_prefix('/').unwrap_or(prefix_str)),
    };

    let mut normalized_components = Vec::new();
    for component in initial_path_to_normalize.components() {
        match component {
            std::path::Component::ParentDir => {
                if normalized_components
                    .last()
                    .map_or(false, |c| matches!(c, std::path::Component::Normal(_)))
                {
                    normalized_components.pop();
                } else {
                    normalized_components.push(component);
                }
            }
            std::path::Component::CurDir => {}
            _ => normalized_components.push(component),
        }
    }

    let final_path: std::path::PathBuf = normalized_components.into_iter().collect();
    let mut path_str = final_path.to_string_lossy().into_owned();
    if path_str == "." {
        path_str = String::new();
    }
    path_str
}

fn extract_links(content: &str) -> Vec<ExtractedLink> {
    let mut out = Vec::new();
    let mut i = 0;
    let bytes = content.as_bytes();
    let len = bytes.len();
    // Track whether we are inside a fenced code block or inline code span
    let mut in_fenced_code = false;

    while i < len {
        // Check for fenced code block delimiter (``` at start of line)
        if i + 2 < len && &bytes[i..i + 3] == b"```" && (i == 0 || bytes[i - 1] == b'\n') {
            in_fenced_code = !in_fenced_code;
            i += 3;
            continue;
        }

        // Skip inline code spans: `...`
        if !in_fenced_code && bytes[i] == b'`' {
            if let Some(end_rel) = content[i + 1..].find('`') {
                // Jump past the closing backtick
                i = i + 1 + end_rel + 1;
                continue;
            }
        }

        // Look for links only outside code
        if !in_fenced_code {
            // Wiki links: [[...]]
            if i + 1 < len && &bytes[i..i + 2] == b"[[" {
                let start_idx = i + 2;
                if let Some(end_rel) = content[start_idx..].find("]]") {
                    let end_idx = start_idx + end_rel;
                    out.push(ExtractedLink::Wiki(content[start_idx..end_idx].to_string()));
                    i = end_idx + 2;
                    continue;
                }
            }

            // Standard markdown links: [text](href) and ![alt](href)
            // For ![alt](href), the `!` is at i-1. Both are extracted for graph edge building.
            if bytes[i] == b'[' && (i == 0 || bytes[i - 1] != b'[') {
                // Check this isn't part of a [[ wiki link (already handled above)
                if i + 1 < len && bytes[i + 1] == b'[' {
                    i += 1;
                    continue;
                }

                if let Some(extracted) = try_extract_markdown_link(content, i) {
                    i = extracted.end_pos;
                    out.push(extracted.link);
                    continue;
                }
            }

            // Also catch ![alt](href) where ! is at current position
            if bytes[i] == b'!' && i + 1 < len && bytes[i + 1] == b'[' {
                if let Some(extracted) = try_extract_markdown_link(content, i + 1) {
                    i = extracted.end_pos;
                    out.push(extracted.link);
                    continue;
                }
            }
        }

        i += 1;
    }
    out
}

struct ExtractedMarkdownLink {
    link: ExtractedLink,
    end_pos: usize,
}

/// Tries to extract a markdown link starting at `start` which points to the opening `[`.
/// Returns the extracted link and the position after the closing `)`, or None if not a valid link.
fn try_extract_markdown_link(content: &str, start: usize) -> Option<ExtractedMarkdownLink> {
    let bytes = content.as_bytes();
    let len = bytes.len();

    // Find the matching `]` for `[text]`
    let mut depth = 0;
    let mut j = start;
    while j < len {
        if bytes[j] == b'[' {
            depth += 1;
        } else if bytes[j] == b']' {
            depth -= 1;
            if depth == 0 {
                break;
            }
        } else if bytes[j] == b'\n' {
            // Don't span across newlines for the text part
            return None;
        }
        j += 1;
    }
    if depth != 0 || j >= len {
        return None;
    }

    let text = &content[start + 1..j];
    let after_bracket = j + 1;

    // Must be immediately followed by `(`
    if after_bracket >= len || bytes[after_bracket] != b'(' {
        return None;
    }

    // Find the matching `)` for `(href)`
    let href_start = after_bracket + 1;
    let mut paren_depth = 1;
    let mut k = href_start;
    while k < len && paren_depth > 0 {
        if bytes[k] == b'(' {
            paren_depth += 1;
        } else if bytes[k] == b')' {
            paren_depth -= 1;
        } else if bytes[k] == b'\n' {
            return None;
        }
        k += 1;
    }
    if paren_depth != 0 {
        return None;
    }

    let href = content[href_start..k - 1].trim();

    // Skip external links
    if href.starts_with("http://") || href.starts_with("https://") {
        return None;
    }
    // Skip anchor-only links
    if href.starts_with('#') {
        return None;
    }
    // Skip empty hrefs
    if href.is_empty() {
        return None;
    }

    Some(ExtractedMarkdownLink {
        link: ExtractedLink::Markdown {
            text: text.to_string(),
            href: href.to_string(),
        },
        end_pos: k,
    })
}

fn make_source_page_path(source_page: &PageIdentifier) -> String {
    if source_page.directory.is_empty() {
        format!("{}.{}", source_page.title, source_page.file_type)
    } else {
        format!("{}/{}.{}", source_page.directory, source_page.title, source_page.file_type)
    }
}

fn parse_out_link(inner_link_text: &str, source_page: &PageIdentifier) -> LinkOut {
    let semantics = parse_link_text(inner_link_text);

    LinkOut {
        link_original_text: inner_link_text.to_string(),
        link_source_page_path: make_source_page_path(source_page),
        link_parsed_directory: semantics.target_path_prefix,
        link_parsed_title: semantics.title,
        link_parsed_file_type: semantics.file_type,
        link_parsed_anchor: semantics.anchor,
        link_parsed_anchor_type: semantics.anchor_type,
        link_parsed_alias: semantics.alias,
        link_parsed_media_size: semantics.media_size,
        link_resolved_target_directory: String::new(),
        link_resolved_target_path: String::new(),
        is_relative_path_link: false,
    }
}

fn parse_out_markdown_link(display_text: &str, href: &str, source_page: &PageIdentifier) -> LinkOut {
    let mut semantics = parse_markdown_link_href(href);

    // Resolve the relative path against the source file's directory.
    // Markdown links are relative to the source file, so we prepend the source directory
    // and let calculate_normalized_directory handle `..` and `.` segments.
    let resolved_prefix = if semantics.target_path_prefix.is_empty() {
        // Same-directory reference: use source page's directory
        if source_page.directory.is_empty() {
            String::new()
        } else {
            format!("{}/", source_page.directory)
        }
    } else {
        // Combine source dir with relative path
        if source_page.directory.is_empty() {
            semantics.target_path_prefix.clone()
        } else {
            format!("{}/{}", source_page.directory, semantics.target_path_prefix)
        }
    };

    // Normalize the combined path (resolves `..` and `.` segments)
    let normalized_dir = if resolved_prefix.is_empty() {
        String::new()
    } else {
        let trailing_slash = resolved_prefix.ends_with('/');
        let normalized = calculate_normalized_directory("", Some(&resolved_prefix));
        if trailing_slash && !normalized.is_empty() && !normalized.ends_with('/') {
            format!("{}/", normalized)
        } else if trailing_slash && normalized.is_empty() {
            String::new()
        } else {
            normalized
        }
    };

    // Override alias with the display text from [text](href)
    semantics.alias = Some(display_text.to_string());

    LinkOut {
        link_original_text: href.to_string(),
        link_source_page_path: make_source_page_path(source_page),
        link_parsed_directory: normalized_dir,
        link_parsed_title: semantics.title,
        link_parsed_file_type: semantics.file_type,
        link_parsed_anchor: semantics.anchor,
        link_parsed_anchor_type: semantics.anchor_type,
        link_parsed_alias: semantics.alias,
        link_parsed_media_size: semantics.media_size,
        link_resolved_target_directory: String::new(),
        link_resolved_target_path: String::new(),
        is_relative_path_link: true,
    }
}

fn target_text_without_alias_or_size(link_text: &str) -> String {
    let mut last_unescaped_pipe = None;
    let mut escaped = false;
    for (idx, ch) in link_text.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '|' {
            last_unescaped_pipe = Some(idx);
        }
    }
    let target = last_unescaped_pipe
        .map(|idx| &link_text[..idx])
        .unwrap_or(link_text);
    target.replace("\\|", "|")
}

fn strip_anchor_markers_for_extension_check(name: &str) -> &str {
    if let Some(pos) = name.rfind("#^") {
        &name[..pos]
    } else if let Some(pos) = name.rfind('^') {
        &name[..pos]
    } else if let Some(pos) = name.rfind('#') {
        &name[..pos]
    } else {
        name
    }
}

fn wiki_link_has_explicit_file_type(link: &LinkOut) -> bool {
    if link.is_relative_path_link {
        return true;
    }
    if link.link_parsed_file_type != "md" {
        return true;
    }

    let target_text = target_text_without_alias_or_size(&link.link_original_text);
    let filename = target_text.rsplit('/').next().unwrap_or(target_text.as_str());
    let filename_without_anchor = strip_anchor_markers_for_extension_check(filename);
    Path::new(filename_without_anchor)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn file_type_sort_rank(file_type: &str) -> usize {
    match file_type {
        "md" => 0,
        "excalidraw" => 1,
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" => 2,
        "pdf" | "txt" => 3,
        _ => 4,
    }
}

fn sort_resolution_candidates(candidates: &mut Vec<(String, String)>) {
    candidates.sort_by(|(dir_a, ft_a), (dir_b, ft_b)| {
        let depth_a = if dir_a.is_empty() { 0 } else { dir_a.matches('/').count() + 1 };
        let depth_b = if dir_b.is_empty() { 0 } else { dir_b.matches('/').count() + 1 };
        match depth_a.cmp(&depth_b) {
            std::cmp::Ordering::Equal => match dir_a.cmp(dir_b) {
                std::cmp::Ordering::Equal => match file_type_sort_rank(ft_a).cmp(&file_type_sort_rank(ft_b)) {
                    std::cmp::Ordering::Equal => ft_a.cmp(ft_b),
                    other => other,
                },
                other => other,
            },
            other => other,
        }
    });
}

fn exact_any_file_type_candidate(file_index_map: &HashMap<(String, String, String), usize>, directory: &str, title: &str) -> Option<(String, String)> {
    let mut candidates: Vec<(String, String)> = Vec::new();
    for (key_dir, key_title, key_ft) in file_index_map.keys() {
        if key_dir == directory && key_title == title {
            candidates.push((key_dir.clone(), key_ft.clone()));
        }
    }
    sort_resolution_candidates(&mut candidates);
    candidates.into_iter().next()
}

fn scan_graph(graph_root: &std::path::Path) -> anyhow::Result<Vec<ScanResult>> {
    let mut results: Vec<ScanResult> = Vec::new();

    for entry in WalkDir::new(graph_root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if is_pagespec_sidecar(path) {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let include = ext == "md" || IMAGE_EXTENSIONS_MAIN.contains(&ext.as_str());
        if !include {
            continue;
        }

        let mut source_page_identifier = extract_page_identifier(path, graph_root);
        let mut outgoing_links: Vec<LinkOut> = Vec::new();
        let mut found_sensitive = false;

        if source_page_identifier.file_type == "md" {
            if let Ok(file_content) = fs::read_to_string(path) {
                if is_excalidraw_markdown(&file_content) {
                    // Reclassify the page as an excalidraw drawing. Strip a trailing
                    // `.excalidraw` from the title so links like `[[name.excalidraw]]`
                    // resolve to title=`name`, file_type=`excalidraw` (mirroring SVG).
                    source_page_identifier.file_type = "excalidraw".to_string();
                    if let Some(stripped) = source_page_identifier.title.strip_suffix(".excalidraw") {
                        source_page_identifier.title = stripped.to_string();
                    }
                    let path_str = if source_page_identifier.directory.is_empty() {
                        format!("{}.{}", source_page_identifier.title, source_page_identifier.file_type)
                    } else {
                        format!(
                            "{}/{}.{}",
                            source_page_identifier.directory,
                            source_page_identifier.title,
                            source_page_identifier.file_type,
                        )
                    };
                    source_page_identifier.path = path_str;
                }
                // Wiki/markdown link extraction runs for both regular .md and excalidraw
                // pages. The Text Elements section of an Excalidraw file is plain markdown
                // and may contain `[[wiki-links]]` to other pages.
                for extracted in extract_links(&file_content) {
                    match extracted {
                        ExtractedLink::Wiki(inner) => {
                            outgoing_links.push(parse_out_link(&inner, &source_page_identifier));
                        }
                        ExtractedLink::Markdown { text, href } => {
                            outgoing_links.push(parse_out_markdown_link(&text, &href, &source_page_identifier));
                        }
                    }
                }
                if file_content.contains("meadow-sensitive: true") {
                    found_sensitive = true;
                }
            }
        }

        results.push(ScanResult {
            source_file: source_page_identifier,
            is_sensitive: found_sensitive,
            outgoing_links,
        });
    }

    results.sort_by(|a, b| a.source_file.path.cmp(&b.source_file.path));
    Ok(results)
}

fn resolve_links(mut scans: Vec<ScanResult>) -> Vec<ScanResult> {
    let mut file_index_map_for_resolution: HashMap<(String, String, String), usize> = HashMap::new();
    for (idx, res) in scans.iter().enumerate() {
        let key = (
            res.source_file.directory.clone(),
            res.source_file.title.clone(),
            res.source_file.file_type.clone(),
        );
        file_index_map_for_resolution.insert(key, idx);
    }

    for scan in scans.iter_mut() {
        for link in scan.outgoing_links.iter_mut() {
            let implicit_wiki_file_type = !wiki_link_has_explicit_file_type(link);
            let (dir, file_type) = if link.is_relative_path_link {
                // Markdown links: directory was already resolved in parse_out_markdown_link.
                // The link_parsed_directory is already normalized (combined with source dir).
                // Strip any trailing slash for consistency with wiki-link resolution.
                let d = link.link_parsed_directory.trim_end_matches('/').to_string();
                // If the normalized path still contains `..` it means the link escapes the
                // source graph root. Treat it as unresolvable by clearing the directory.
                let dir = if d.contains("..") {
                    String::new()
                } else {
                    d
                };
                (dir, link.link_parsed_file_type.clone())
            } else if !link.link_parsed_directory.is_empty() {
                let raw_dir = calculate_normalized_directory("", Some(&link.link_parsed_directory));
                let exact_key = (
                    raw_dir.clone(),
                    link.link_parsed_title.clone(),
                    link.link_parsed_file_type.clone(),
                );
                if file_index_map_for_resolution.contains_key(&exact_key) {
                    (raw_dir, link.link_parsed_file_type.clone())
                } else {
                    // Strict match missed — fall back to suffix-matching. This handles
                    // graphs where the user pointed `sourceDirectory` at a directory that
                    // wraps the actual notes one level deeper: a wiki link like
                    // `[[t006/foo.png]]` should still find `wrapper/.../t006/foo.png`,
                    // not just a top-level `t006/foo.png`. The shallowest match wins, so
                    // a true root-rooted hit (when one exists) outranks deeper ones.
                    let suffix = if raw_dir.is_empty() {
                        String::new()
                    } else {
                        format!("/{}", raw_dir)
                    };
                    let mut potential_dirs: Vec<String> = Vec::new();
                    for (key_dir, key_title, key_ft) in file_index_map_for_resolution.keys() {
                        if key_title != &link.link_parsed_title || key_ft != &link.link_parsed_file_type {
                            continue;
                        }
                        if key_dir == &raw_dir || (!suffix.is_empty() && key_dir.ends_with(&suffix)) {
                            potential_dirs.push(key_dir.clone());
                        }
                    }
                    if !potential_dirs.is_empty() {
                        potential_dirs.sort_by(|a, b| {
                            let depth_a = if a.is_empty() { 0 } else { a.matches('/').count() + 1 };
                            let depth_b = if b.is_empty() { 0 } else { b.matches('/').count() + 1 };
                            match depth_a.cmp(&depth_b) {
                                std::cmp::Ordering::Equal => a.cmp(b),
                                other => other,
                            }
                        });
                        (potential_dirs[0].clone(), link.link_parsed_file_type.clone())
                    } else if implicit_wiki_file_type {
                        let mut candidates: Vec<(String, String)> = Vec::new();
                        for (key_dir, key_title, key_ft) in file_index_map_for_resolution.keys() {
                            if key_title != &link.link_parsed_title {
                                continue;
                            }
                            if key_dir == &raw_dir || (!suffix.is_empty() && key_dir.ends_with(&suffix)) {
                                candidates.push((key_dir.clone(), key_ft.clone()));
                            }
                        }
                        sort_resolution_candidates(&mut candidates);
                        candidates.into_iter().next().unwrap_or((raw_dir, link.link_parsed_file_type.clone()))
                    } else {
                        (raw_dir, link.link_parsed_file_type.clone())
                    }
                }
            } else {
                let root_key = (String::new(), link.link_parsed_title.clone(), link.link_parsed_file_type.clone());
                if file_index_map_for_resolution.contains_key(&root_key) {
                    (String::new(), link.link_parsed_file_type.clone())
                } else {
                    let source_dir = &scan.source_file.directory;
                    let same_dir_key = (source_dir.clone(), link.link_parsed_title.clone(), link.link_parsed_file_type.clone());
                    if file_index_map_for_resolution.contains_key(&same_dir_key) {
                        (source_dir.clone(), link.link_parsed_file_type.clone())
                    } else {
                        let mut potential_dirs: Vec<String> = Vec::new();
                        for (key_dir, key_title, key_ft) in file_index_map_for_resolution.keys() {
                            if key_title == &link.link_parsed_title && key_ft == &link.link_parsed_file_type {
                                potential_dirs.push(key_dir.clone());
                            }
                        }
                        if !potential_dirs.is_empty() {
                            potential_dirs.sort_by(|a, b| {
                                let depth_a = if a.is_empty() { 0 } else { a.matches('/').count() + 1 };
                                let depth_b = if b.is_empty() { 0 } else { b.matches('/').count() + 1 };
                                match depth_a.cmp(&depth_b) {
                                    std::cmp::Ordering::Equal => a.cmp(b),
                                    other => other,
                                }
                            });
                            (potential_dirs[0].clone(), link.link_parsed_file_type.clone())
                        } else if implicit_wiki_file_type {
                            if let Some(root_candidate) = exact_any_file_type_candidate(&file_index_map_for_resolution, "", &link.link_parsed_title) {
                                root_candidate
                            } else if let Some(same_dir_candidate) = exact_any_file_type_candidate(&file_index_map_for_resolution, source_dir, &link.link_parsed_title) {
                                same_dir_candidate
                            } else {
                                let mut candidates: Vec<(String, String)> = Vec::new();
                                for (key_dir, key_title, key_ft) in file_index_map_for_resolution.keys() {
                                    if key_title == &link.link_parsed_title {
                                        candidates.push((key_dir.clone(), key_ft.clone()));
                                    }
                                }
                                sort_resolution_candidates(&mut candidates);
                                candidates.into_iter().next().unwrap_or((String::new(), link.link_parsed_file_type.clone()))
                            }
                        } else {
                            (String::new(), link.link_parsed_file_type.clone())
                        }
                    }
                }
            };

            link.link_parsed_file_type = file_type.clone();
            link.link_resolved_target_directory = dir.clone();
            link.link_resolved_target_path = if dir.is_empty() {
                format!("{}.{}", link.link_parsed_title, file_type)
            } else {
                format!("{}/{}.{}", dir, link.link_parsed_title, file_type)
            };
        }
    }

    scans
}

fn traversal_file_from_page(p: &PageIdentifier, is_sensitive: bool) -> TraversalFile {
    TraversalFile {
        directory: p.directory.clone(),
        title: p.title.clone(),
        file_type: p.file_type.clone(),
        is_sensitive,
        conf_outlinks_depth: None,
        conf_inlinks_depth: None,
        conf_is_blacklisted: None,
    }
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let graph_root = args.graph_root.canonicalize()?;
    let config_content = fs::read_to_string(&args.site_page_config)?;
    let site_page_configs: Vec<SitePageConfig> = parse_site_page_config_yaml(&config_content)?;

    // Scan and resolve links
    let scans = resolve_links(scan_graph(&graph_root)?);

    // Build page lookup by (dir,title,file_type)
    let mut page_lookup: HashMap<(String, String, String), (PageIdentifier, bool)> = HashMap::new();
    for s in &scans {
        page_lookup.insert(
            (
                s.source_file.directory.clone(),
                s.source_file.title.clone(),
                s.source_file.file_type.clone(),
            ),
            (s.source_file.clone(), s.is_sensitive),
        );
    }

    // Build per-link edges + basic edges for traversal
    let mut per_link_edges: Vec<OutputEdge> = Vec::new();
    let mut basic_edges: Vec<BasicEdge> = Vec::new();
    let mut all_link_resolution_maps: HashMap<String, HashMap<String, LinkResolvedInfo>> = HashMap::new();

    for s in &scans {
        let source_tf = traversal_file_from_page(&s.source_file, s.is_sensitive);
        let source_id = source_tf.ident();
        let entry = all_link_resolution_maps.entry(source_id.clone()).or_default();
        for l in &s.outgoing_links {
            // Store link resolution map for outgoing links even if the target file is missing.
            // This matches the historical fs_search behavior and is important for the HTML layer
            // to correctly show "link not whitelisted" vs resolving to an unintended duplicate.
            entry.insert(
                l.link_original_text.clone(),
                LinkResolvedInfo {
                    link_resolved_target_directory: l.link_resolved_target_directory.clone(),
                    link_resolved_target_path: Some(l.link_resolved_target_path.clone()),
                },
            );

            // Only keep edges that resolve to an existing file
            let target_key = (
                l.link_resolved_target_directory.clone(),
                l.link_parsed_title.clone(),
                l.link_parsed_file_type.clone(),
            );
            if let Some((target_page, target_sensitive)) = page_lookup.get(&target_key) {
                let target_tf = traversal_file_from_page(target_page, *target_sensitive);

                basic_edges.push(BasicEdge {
                    source: source_tf.clone(),
                    target: target_tf.clone(),
                    is_bidirectional: false,
                });

                per_link_edges.push(OutputEdge {
                    source: source_tf.ident(),
                    target: target_tf.ident(),
                    isBidirectional: false, // filled in after we build the full set
                    link_source_page_path: l.link_source_page_path.clone(),
                    link_original_text: l.link_original_text.clone(),
                    link_parsed_directory: l.link_parsed_directory.clone(),
                    link_parsed_title: l.link_parsed_title.clone(),
                    link_parsed_file_type: l.link_parsed_file_type.clone(),
                    link_parsed_anchor: l.link_parsed_anchor.clone(),
                    link_parsed_anchor_type: l.link_parsed_anchor_type,
                    link_parsed_alias: l.link_parsed_alias.clone(),
                    link_parsed_media_size: l.link_parsed_media_size,
                    link_resolved_target_directory: l.link_resolved_target_directory.clone(),
                    link_resolved_target_path: l.link_resolved_target_path.clone(),
                });
            }
        }
    }

    // Compute bidirectional per-link marking (if reverse link exists anywhere in the source graph).
    let mut directed_pairs: HashSet<(String, String)> = HashSet::new();
    for e in &per_link_edges {
        directed_pairs.insert((e.source.clone(), e.target.clone()));
    }
    for e in per_link_edges.iter_mut() {
        if directed_pairs.contains(&(e.target.clone(), e.source.clone())) {
            e.isBidirectional = true;
        }
    }

    let initial_page = TraversalFile {
        directory: args.initial_directory.clone(),
        title: args.initial_title.clone(),
        file_type: args.initial_file_type.clone(),
        is_sensitive: false,
        conf_outlinks_depth: None,
        conf_inlinks_depth: None,
        conf_is_blacklisted: None,
    };
    let traversal_page = TraversalFile {
        directory: args.traversal_directory.clone(),
        title: args.traversal_title.clone(),
        file_type: args.traversal_file_type.clone(),
        is_sensitive: false,
        conf_outlinks_depth: None,
        conf_inlinks_depth: None,
        conf_is_blacklisted: None,
    };

    let (working_pages, _working_edges) = get_working_graph(
        &basic_edges,
        &site_page_configs,
        &initial_page,
        &traversal_page,
        TraverseOpts {
            allow_lower_depths: args.allow_lower_depths,
        },
        args.frontier_depth,
        args.allow_images_to_extend_to_frontier,
    )?;

    let working_page_ids: HashSet<String> = working_pages.iter().map(|n| n.file.ident()).collect();

    // Build source graph link count maps from basic_edges
    // Count unique target pages per source (for outlinks)
    // Count unique source pages per target (for inlinks)
    let mut outlink_targets: HashMap<String, HashSet<String>> = HashMap::new();
    let mut inlink_sources: HashMap<String, HashSet<String>> = HashMap::new();

    for e in &basic_edges {
        let source_id = e.source.ident();
        let target_id = e.target.ident();
        outlink_targets.entry(source_id.clone()).or_default().insert(target_id.clone());
        inlink_sources.entry(target_id).or_default().insert(source_id);
    }

    let out_pages: Vec<OutputPage> = working_pages
        .iter()
        .map(|n| {
            OutputPage {
                id: n.file.ident(),
                title: n.file.title.clone(),
                sourceGraphSubdirectory: n.file.directory.clone(),
                file_type: n.file.file_type.clone(),
                depth: n.depth,
                remaining_depth: n.remaining_depth,
                remaining_inlinks_depth: n.remaining_inlinks_depth,
                path: n.path.clone(),
                traversal_details: n.traversal_details.clone(),
                isFrontierPage: n.is_frontier_page,
                isFrontierImageExtension: n.is_frontier_image_extension,
                is_sensitive: n.file.is_sensitive,
            }
        })
        .collect();

    let out_edges: Vec<OutputEdge> = per_link_edges
        .into_iter()
        .filter(|e| working_page_ids.contains(&e.source) && working_page_ids.contains(&e.target))
        .collect();

    // Convert HashSets to sorted Vecs for JSON output
    let all_inlink_sources: HashMap<String, Vec<String>> = inlink_sources
        .into_iter()
        .map(|(k, v)| {
            let mut vec: Vec<String> = v.into_iter().collect();
            vec.sort();
            (k, vec)
        })
        .collect();

    let all_outlink_targets: HashMap<String, Vec<String>> = outlink_targets
        .into_iter()
        .map(|(k, v)| {
            let mut vec: Vec<String> = v.into_iter().collect();
            vec.sort();
            (k, vec)
        })
        .collect();

    let output = OutputGraph {
        pages: out_pages,
        edges: out_edges,
        allLinkResolutionMaps: all_link_resolution_maps,
        allInlinkSources: all_inlink_sources,
        allOutlinkTargets: all_outlink_targets,
    };

    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_links_wiki_basic() {
        let content = "Hello [[page one]] and [[page two]]";
        let links = extract_links(content);
        assert_eq!(links, vec![
            ExtractedLink::Wiki("page one".to_string()),
            ExtractedLink::Wiki("page two".to_string()),
        ]);
    }

    #[test]
    fn test_extract_links_wiki_skips_fenced_code_block() {
        let content = "Before\n```\n[[hidden link]]\n```\nAfter [[visible link]]";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Wiki("visible link".to_string())]);
    }

    #[test]
    fn test_extract_links_wiki_skips_fenced_code_block_with_language() {
        let content = "Before\n```txt\n[[hidden link]]\nsome text\n```\nAfter [[visible link]]";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Wiki("visible link".to_string())]);
    }

    #[test]
    fn test_extract_links_wiki_skips_inline_code() {
        let content = "Before `[[hidden link]]` and [[visible link]]";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Wiki("visible link".to_string())]);
    }

    #[test]
    fn test_extract_links_wiki_skips_both_code_types() {
        let content = "Inline `[[a]]` and fenced:\n```\n[[b]]\n```\nReal [[c]]";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Wiki("c".to_string())]);
    }

    #[test]
    fn test_extract_links_no_links() {
        let content = "No links here, just text.";
        let links = extract_links(content);
        assert!(links.is_empty());
    }

    #[test]
    fn test_extract_links_empty_string() {
        let links = extract_links("");
        assert!(links.is_empty());
    }

    // --- Markdown link extraction tests ---

    #[test]
    fn test_extract_links_markdown_basic() {
        let content = "See [my page](./path/to/file.md) for details.";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "my page".to_string(),
            href: "./path/to/file.md".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_markdown_image_embed() {
        let content = "An image: ![alt text](./images/photo.png)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "alt text".to_string(),
            href: "./images/photo.png".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_markdown_skips_external() {
        let content = "Visit [Google](https://google.com) and [local](./page.md)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "local".to_string(),
            href: "./page.md".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_markdown_skips_anchor_only() {
        let content = "See [section](#heading) and [file](./file.md)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "file".to_string(),
            href: "./file.md".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_markdown_skips_code_block() {
        let content = "Before\n```\n[hidden](./hidden.md)\n```\nAfter [visible](./visible.md)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "visible".to_string(),
            href: "./visible.md".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_markdown_skips_inline_code() {
        let content = "Code `[hidden](./hidden.md)` and [visible](./visible.md)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "visible".to_string(),
            href: "./visible.md".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_mixed_wiki_and_markdown() {
        let content = "Wiki [[page one]] and markdown [page two](./page-two.md)";
        let links = extract_links(content);
        assert_eq!(links, vec![
            ExtractedLink::Wiki("page one".to_string()),
            ExtractedLink::Markdown {
                text: "page two".to_string(),
                href: "./page-two.md".to_string(),
            },
        ]);
    }

    #[test]
    fn test_extract_links_excalidraw_element_links_section() {
        let content = [
            "## Element Links",
            "iWVOgeeI: [[page linked from a non-text element]]",
            "",
            "%%",
            "## Drawing",
            "```compressed-json",
            "[[hidden inside compressed scene text]]",
            "```",
        ].join("\n");
        let links = extract_links(&content);
        assert_eq!(links, vec![
            ExtractedLink::Wiki("page linked from a non-text element".to_string()),
        ]);
    }

    #[test]
    fn test_extract_links_markdown_with_anchor() {
        let content = "See [section](./file.md#heading)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "section".to_string(),
            href: "./file.md#heading".to_string(),
        }]);
    }

    #[test]
    fn test_extract_links_markdown_relative_parent() {
        let content = "Go [up](../parent/file.md)";
        let links = extract_links(content);
        assert_eq!(links, vec![ExtractedLink::Markdown {
            text: "up".to_string(),
            href: "../parent/file.md".to_string(),
        }]);
    }

    // --- resolve_links: wiki link with directory prefix ---
    //
    // Wiki link prefixes (`[[sub/foo.png]]`) match Obsidian's vault-relative
    // semantics: the prefix is matched as a path *suffix* against any file in
    // the graph, not strictly rooted at graph_root. The exact-match fast path
    // covers the simple unwrapped case; the suffix fallback covers the case
    // where the user pointed `sourceDirectory` one level above the actual data.

    fn make_page(directory: &str, title: &str, file_type: &str) -> PageIdentifier {
        let path = if directory.is_empty() {
            format!("{}.{}", title, file_type)
        } else {
            format!("{}/{}.{}", directory, title, file_type)
        };
        PageIdentifier {
            directory: directory.to_string(),
            title: title.to_string(),
            file_type: file_type.to_string(),
            path,
        }
    }

    fn wiki_link(prefix: &str, title: &str, file_type: &str, source: &PageIdentifier) -> LinkOut {
        LinkOut {
            link_original_text: format!("{}{}.{}", prefix, title, file_type),
            link_source_page_path: source.path.clone(),
            link_parsed_directory: prefix.to_string(),
            link_parsed_title: title.to_string(),
            link_parsed_file_type: file_type.to_string(),
            link_parsed_anchor: None,
            link_parsed_anchor_type: None,
            link_parsed_alias: None,
            link_parsed_media_size: None,
            link_resolved_target_directory: String::new(),
            link_resolved_target_path: String::new(),
            is_relative_path_link: false,
        }
    }

    fn extensionless_wiki_link(prefix: &str, title: &str, source: &PageIdentifier) -> LinkOut {
        LinkOut {
            link_original_text: format!("{}{}", prefix, title),
            link_source_page_path: source.path.clone(),
            link_parsed_directory: prefix.to_string(),
            link_parsed_title: title.to_string(),
            link_parsed_file_type: "md".to_string(),
            link_parsed_anchor: None,
            link_parsed_anchor_type: None,
            link_parsed_alias: None,
            link_parsed_media_size: None,
            link_resolved_target_directory: String::new(),
            link_resolved_target_path: String::new(),
            is_relative_path_link: false,
        }
    }

    fn page_only(p: PageIdentifier) -> ScanResult {
        ScanResult { source_file: p, is_sensitive: false, outgoing_links: vec![] }
    }

    fn page_with_link(p: PageIdentifier, link: LinkOut) -> ScanResult {
        ScanResult { source_file: p, is_sensitive: false, outgoing_links: vec![link] }
    }

    #[test]
    fn test_resolve_wiki_link_with_prefix_exact_match() {
        let source = make_page("", "embedded media", "md");
        let target = make_page("t006", "foo", "png");
        let link = wiki_link("t006/", "foo", "png", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(target),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_resolved_target_directory, "t006");
        assert_eq!(resolved.link_resolved_target_path, "t006/foo.png");
    }

    #[test]
    fn test_resolve_wiki_link_with_prefix_falls_back_to_suffix_match() {
        // Wrapper case: graph_root is a directory above the actual notes, so
        // `[[t006/foo.png]]` from `data/embedded media.md` must still find
        // `data/t006/foo.png` even though no `t006/foo.png` exists at root.
        let source = make_page("data", "embedded media", "md");
        let target = make_page("data/t006", "foo", "png");
        let link = wiki_link("t006/", "foo", "png", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(target),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_resolved_target_directory, "data/t006");
        assert_eq!(resolved.link_resolved_target_path, "data/t006/foo.png");
    }

    #[test]
    fn test_resolve_wiki_link_with_prefix_suffix_match_prefers_shallowest() {
        // Two candidates both end with `/sub`: shallowest wins.
        let source = make_page("", "src", "md");
        let shallow = make_page("shallow/sub", "foo", "png");
        let deep = make_page("deep/extra/sub", "foo", "png");
        let link = wiki_link("sub/", "foo", "png", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(shallow),
            page_only(deep),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_resolved_target_directory, "shallow/sub");
    }

    #[test]
    fn test_resolve_wiki_link_with_prefix_root_match_outranks_deeper_suffix() {
        // When both a root-rooted match and a deeper suffix match exist,
        // the exact (root) match wins via the fast path and never enters the
        // fallback.
        let source = make_page("", "src", "md");
        let at_root = make_page("t006", "foo", "png");
        let nested = make_page("data/t006", "foo", "png");
        let link = wiki_link("t006/", "foo", "png", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(at_root),
            page_only(nested),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_resolved_target_directory, "t006");
    }

    #[test]
    fn test_resolve_wiki_link_with_prefix_unresolvable_keeps_prefix() {
        // No file matches by title+file_type at all: leave the resolved
        // directory as the raw prefix so the link stays unresolvable rather
        // than collapsing to an unrelated file.
        let source = make_page("", "src", "md");
        let unrelated = make_page("other", "different", "png");
        let link = wiki_link("t006/", "foo", "png", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(unrelated),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_resolved_target_directory, "t006");
        assert_eq!(resolved.link_resolved_target_path, "t006/foo.png");
    }

    #[test]
    fn test_resolve_extensionless_wiki_link_can_target_excalidraw() {
        let source = make_page("t006", "embedding page", "md");
        let target = make_page("t006 - second directory", "embedded drawing", "excalidraw");
        let link = extensionless_wiki_link("", "embedded drawing", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(target),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_parsed_file_type, "excalidraw");
        assert_eq!(resolved.link_resolved_target_directory, "t006 - second directory");
        assert_eq!(resolved.link_resolved_target_path, "t006 - second directory/embedded drawing.excalidraw");
    }

    #[test]
    fn test_resolve_explicit_md_wiki_link_does_not_target_excalidraw() {
        let source = make_page("t006", "embedding page", "md");
        let target = make_page("t006 - second directory", "embedded drawing", "excalidraw");
        let link = wiki_link("", "embedded drawing", "md", &source);
        let out = resolve_links(vec![
            page_with_link(source, link),
            page_only(target),
        ]);
        let resolved = &out[0].outgoing_links[0];
        assert_eq!(resolved.link_parsed_file_type, "md");
        assert_eq!(resolved.link_resolved_target_directory, "");
        assert_eq!(resolved.link_resolved_target_path, "embedded drawing.md");
    }
}
