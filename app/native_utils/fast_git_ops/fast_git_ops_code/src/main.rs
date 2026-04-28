#![deny(warnings)]

use std::collections::HashSet;
use std::io::Read;
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use ignore::WalkBuilder;
use rayon::prelude::*;
use scraper::{Html, Selector};
use serde::Serialize;
use sha1::{Digest, Sha1};
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

#[derive(Parser, Debug)]
#[clap(author, version, about = "Fast git operations using gitoxide", long_about = None)]
struct Cli {
    #[clap(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Check git status for files in a directory
    Status {
        /// The directory to check git status in (must be within a git repository)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
    },
    /// List commits that touched files within a directory (like `git log -- <dir>`)
    DirLog {
        /// The directory to scope history to (must be within a git repository)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
        /// Max number of commits to return
        #[clap(long, default_value_t = 50)]
        limit: usize,
    },
    /// List files changed in a commit vs its first parent
    CommitFiles {
        /// Any directory within the git repository (used for repo discovery)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
        /// Commit SHA
        #[clap(required = true)]
        sha: String,
    },
    /// Read a file's contents as stored at a specific commit
    CatFile {
        /// Any directory within the git repository (used for repo discovery)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
        /// Commit SHA
        #[clap(required = true)]
        sha: String,
        /// Path relative to repo root
        #[clap(required = true)]
        path: String,
    },
    /// List commits that changed a single file (newest-first, no merges)
    FileLog {
        /// Any directory within the git repository (used for repo discovery)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
        /// Path relative to repo root
        #[clap(required = true)]
        path: String,
        /// Max number of commits to return
        #[clap(long, default_value_t = 50)]
        limit: usize,
    },
    /// Commit changes in multiple directories as a single commit
    CommitChanges {
        /// Directories to commit (all must be within the same git repository)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directories: Vec<PathBuf>,
        /// Commit message
        #[clap(short, long)]
        message: String,
        /// Author name
        #[clap(short = 'n', long, default_value = "Meadow")]
        author_name: String,
        /// Author email
        #[clap(short = 'e', long, default_value = "meadow@local")]
        author_email: String,
        /// Allow creating a commit even if there are no changes (empty commit)
        #[clap(long)]
        allow_empty: bool,
    },
    /// Initialize a new git repository in a directory
    Init {
        /// The directory to initialize a git repository in
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
        /// The default branch name (defaults to 'main')
        #[clap(long, default_value = "main")]
        default_branch: String,
    },
    /// Diff HTML sections (head/header/main/footer) for changed files under a directory.
    ///
    /// Modes:
    /// - Without --sha: compare working tree vs index (fast) for changed files under directory.
    /// - With --sha: compare the given commit vs its first parent (or empty tree if root),
    ///   scoped to files under directory.
    HtmlSectionDiff {
        /// Any directory within the git repository (used for repo discovery and scoping)
        #[clap(required = true, value_parser = clap::value_parser!(PathBuf))]
        directory: PathBuf,
        /// Commit SHA to diff (commit vs first parent). If omitted, diffs working tree vs index.
        #[clap(long)]
        sha: Option<String>,
    },
}

#[derive(Serialize, Debug)]
struct FileStatus {
    path: String,
    status: String,
}

#[derive(Serialize, Debug)]
struct CommitResult {
    success: bool,
    sha: Option<String>,
    files_committed: usize,
    message: Option<String>,
}

#[derive(Serialize, Debug)]
struct DirLogCommit {
    sha: String,
    parent_sha: Option<String>,
    subject: String,
    author_name: String,
    author_time: i64,
    files_changed_count: usize,
}

#[derive(Serialize, Debug)]
struct DirLogResult {
    commits: Vec<DirLogCommit>,
}

#[derive(Serialize, Debug)]
struct CommitFileEntry {
    path: String,
    status: String, // "A" | "M" | "D"
}

#[derive(Serialize, Debug)]
struct CommitFilesResult {
    sha: String,
    parent_sha: Option<String>,
    files: Vec<CommitFileEntry>,
}

#[derive(Serialize, Debug)]
struct CatFileResult {
    found: bool,
    kind: Option<String>, // "blob" | "blob-exec" | "link" | "tree" | "commit"
    data_base64: Option<String>,
}

#[derive(Serialize, Debug)]
struct FileLogCommit {
    sha: String,
    parent_sha: Option<String>,
    subject: String,
    author_name: String,
    author_time: i64,
}

#[derive(Serialize, Debug)]
struct FileLogResult {
    commits: Vec<FileLogCommit>,
}

#[derive(Serialize, Debug, Clone)]
struct HtmlSectionChanges {
    head: bool,
    header: bool,
    main: bool,
    footer: bool,
}

#[derive(Serialize, Debug, Clone)]
struct HtmlSectionDiffFile {
    /// Absolute path on disk (matches other APIs)
    path: String,
    /// Repo-relative path (forward slashes)
    repo_path: String,
    /// "A" | "M" | "D"
    status: String,
    sections: HtmlSectionChanges,
}

#[derive(Serialize, Debug)]
struct HtmlSectionDiffResult {
    files: Vec<HtmlSectionDiffFile>,
}

/// Compute the git blob hash for a file's content.
/// Git blob format: "blob {size}\0{content}"
fn compute_blob_hash(path: &std::path::Path) -> Result<gix::ObjectId, Box<dyn std::error::Error>> {
    let mut file = std::fs::File::open(path)?;
    let metadata = file.metadata()?;
    let size = metadata.len();
    
    let mut hasher = Sha1::new();
    
    // Write git blob header: "blob {size}\0"
    hasher.update(format!("blob {}\0", size).as_bytes());
    
    // Stream the file content through the hasher
    let mut buffer = [0u8; 8192];
    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    
    let hash: [u8; 20] = hasher.finalize().into();
    Ok(gix::ObjectId::from(hash))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Status { directory } => run_status(directory)?,
        Commands::DirLog { directory, limit } => run_dir_log(directory, limit)?,
        Commands::CommitFiles { directory, sha } => run_commit_files(directory, sha)?,
        Commands::CatFile { directory, sha, path } => run_cat_file(directory, sha, path)?,
        Commands::FileLog { directory, path, limit } => run_file_log(directory, path, limit)?,
        Commands::CommitChanges { directories, message, author_name, author_email, allow_empty } => {
            run_commit_changes(directories, message, author_name, author_email, allow_empty)?
        }
        Commands::Init { directory, default_branch } => run_init(directory, default_branch)?,
        Commands::HtmlSectionDiff { directory, sha } => run_html_section_diff(directory, sha)?,
    }
    
    Ok(())
}

fn normalize_repo_path(p: &std::path::Path) -> String {
    p.to_string_lossy().to_string().replace('\\', "/")
}

fn is_html_path(repo_rel: &str) -> bool {
    repo_rel.to_lowercase().ends_with(".html")
}

fn read_blob_by_oid(repo: &gix::Repository, oid: gix::ObjectId) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let obj = repo.find_object(oid)?;
    Ok(obj.data.to_vec())
}

fn extract_sections(html: &str) -> (String, String, String, String) {
    let doc = Html::parse_document(html);
    // Selector::parse only fails for invalid selector strings; ours are constant.
    let sel_head = Selector::parse("head").unwrap();
    let sel_header = Selector::parse("body > header").unwrap();
    let sel_main = Selector::parse("body > main").unwrap();
    let sel_footer = Selector::parse("body > footer").unwrap();

    let head = doc
        .select(&sel_head)
        .next()
        .map(|e| e.inner_html())
        .unwrap_or_default()
        .trim()
        .to_string();
    let header = doc
        .select(&sel_header)
        .next()
        .map(|e| e.inner_html())
        .unwrap_or_default()
        .trim()
        .to_string();
    let main = doc
        .select(&sel_main)
        .next()
        .map(|e| e.inner_html())
        .unwrap_or_default()
        .trim()
        .to_string();
    let footer = doc
        .select(&sel_footer)
        .next()
        .map(|e| e.inner_html())
        .unwrap_or_default()
        .trim()
        .to_string();

    (head, header, main, footer)
}

fn compute_section_changes(old_html: Option<&str>, new_html: Option<&str>) -> HtmlSectionChanges {
    match (old_html, new_html) {
        (Some(o), Some(n)) => {
            let (oh, ohr, om, of) = extract_sections(o);
            let (nh, nhr, nm, nf) = extract_sections(n);
            HtmlSectionChanges {
                head: oh != nh,
                header: ohr != nhr,
                main: om != nm,
                footer: of != nf,
            }
        }
        // Added or deleted file: treat everything as changed so it shows up under any active section.
        _ => HtmlSectionChanges { head: true, header: true, main: true, footer: true },
    }
}

#[derive(Debug, Clone)]
struct WorktreeChangedFile {
    abs_path: PathBuf,
    repo_rel: String,
    status: String, // "A" | "M" | "D"
    old_oid: Option<gix::ObjectId>,
}

fn list_changed_files_worktree_vs_index(
    repo: &gix::Repository,
    target_dir: &std::path::Path,
    git_root: &std::path::Path,
) -> Result<Vec<WorktreeChangedFile>, Box<dyn std::error::Error>> {
    let mut results: Vec<WorktreeChangedFile> = Vec::new();

    let index = repo.index()?;
    let mut indexed_paths: HashSet<String> = HashSet::new();

    for entry in index.entries() {
        let entry_path_str = entry.path(&index).to_string(); // repo-relative
        let full_path = git_root.join(&entry_path_str);

        if !full_path.starts_with(target_dir) {
            continue;
        }

        indexed_paths.insert(entry_path_str.clone());

        if !full_path.exists() {
            results.push(WorktreeChangedFile {
                abs_path: full_path,
                repo_rel: entry_path_str,
                status: "D".to_string(),
                old_oid: Some(entry.id),
            });
        } else {
            let metadata = std::fs::metadata(&full_path)?;
            let mtime = metadata.modified()?;
            let file_size = metadata.len();

            let index_mtime = entry.stat.mtime.secs as u64;
            let index_size = entry.stat.size as u64;
            let mtime_secs = mtime.duration_since(std::time::UNIX_EPOCH)?.as_secs();

            if mtime_secs != index_mtime || file_size != index_size {
                let current_hash = compute_blob_hash(&full_path)?;
                let index_hash = entry.id;
                if current_hash != index_hash {
                    results.push(WorktreeChangedFile {
                        abs_path: full_path,
                        repo_rel: entry_path_str,
                        status: "M".to_string(),
                        old_oid: Some(entry.id),
                    });
                }
            }
        }
    }

    // Untracked files under target_dir (respect .gitignore)
    let walker = WalkBuilder::new(target_dir)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| entry.file_name() != ".git")
        .build();

    for result in walker {
        if let Ok(entry) = result {
            let path = entry.path();
            if path.is_dir() {
                continue;
            }
            let full_path = path.to_path_buf();
            // Only consider within target_dir (walker should already guarantee)
            if !full_path.starts_with(target_dir) {
                continue;
            }
            // Convert to repo-relative path
            let Ok(rel) = full_path.strip_prefix(git_root) else {
                continue;
            };
            let repo_rel = normalize_repo_path(rel);
            if indexed_paths.contains(&repo_rel) {
                continue;
            }
            results.push(WorktreeChangedFile {
                abs_path: full_path,
                repo_rel,
                status: "A".to_string(),
                old_oid: None,
            });
        }
    }

    Ok(results)
}

fn run_html_section_diff(directory: PathBuf, sha: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
    let original_dir = directory;
    let target_dir = original_dir.canonicalize()?;
    let repo = gix::discover(&target_dir)?;
    // For bare repos (where .git dir lives inside the worktree), find the git
    // root manually by walking up from the target directory.
    let git_root = match repo.work_dir() {
        Some(wd) => wd.to_path_buf(),
        None => {
            let mut search = target_dir.clone();
            loop {
                if search.join(".git").exists() {
                    break search;
                }
                match search.parent() {
                    Some(p) => search = p.to_path_buf(),
                    None => return Err("No git repository found".into()),
                }
            }
        }
    };

    #[derive(Debug, Clone)]
    struct HtmlJob {
        path: String,
        repo_path: String,
        status: String,
        old_html: Option<String>,
        new_html: Option<String>,
    }

    let jobs: Vec<HtmlJob> = if let Some(sha) = sha {
        // Commit mode: compare commit vs its first parent, scoped to target_dir.
        let oid = parse_hex_oid(&sha)?;
        let commit = repo.find_object(oid)?.into_commit();

        let tree_id = commit.tree_id()?.detach();
        let parent_id = commit.parent_ids().next().map(|p| p.detach());
        let parent_tree_id = match parent_id {
            Some(p) => repo.find_object(p)?.into_commit().tree_id()?.detach(),
            None => repo.empty_tree().id,
        };

        // Prefix relative to repo root (with trailing slash), or empty if at root.
        let prefix = if target_dir == git_root {
            "".to_string()
        } else {
            let rel = target_dir.strip_prefix(&git_root)?;
            let rel = rel.to_string_lossy().to_string().replace('\\', "/");
            format!("{}/", rel)
        };

        let changed = diff_trees_paths(&repo, parent_tree_id, tree_id)?
            .into_iter()
            .filter(|e| prefix.is_empty() || e.path.starts_with(&prefix))
            .filter(|e| is_html_path(&e.path))
            .collect::<Vec<_>>();

        // Read git content sequentially (gix::Repository is not Sync), then parallelize parsing/diffing.
        let mut out: Vec<HtmlJob> = Vec::with_capacity(changed.len());
        for e in changed {
            let abs_path = git_root.join(&e.path);

            let old_bytes_opt: Option<Vec<u8>> = match e.status.as_str() {
                "A" => None,
                _ => match read_file_at_tree(&repo, parent_tree_id, &e.path) {
                    Ok(Some(b)) => Some(b),
                    _ => None,
                },
            };
            let new_bytes_opt: Option<Vec<u8>> = match e.status.as_str() {
                "D" => None,
                _ => match read_file_at_tree(&repo, tree_id, &e.path) {
                    Ok(Some(b)) => Some(b),
                    _ => None,
                },
            };

            let old_html = old_bytes_opt.and_then(|b| String::from_utf8(b).ok());
            let new_html = new_bytes_opt.and_then(|b| String::from_utf8(b).ok());

            out.push(HtmlJob {
                path: abs_path.to_string_lossy().to_string(),
                repo_path: e.path.clone(),
                status: e.status.clone(),
                old_html,
                new_html,
            });
        }
        out
    } else {
        // Working tree mode: diff working tree vs index (fast) for changed files under directory.
        let changed = list_changed_files_worktree_vs_index(&repo, &target_dir, &git_root)?
            .into_iter()
            .filter(|e| is_html_path(&e.repo_rel))
            .collect::<Vec<_>>();

        // Read file contents sequentially (repo not Sync), then parallelize parsing/diffing.
        let mut out: Vec<HtmlJob> = Vec::with_capacity(changed.len());
        for e in changed {
            let old_html: Option<String> = match e.old_oid {
                Some(oid) => match read_blob_by_oid(&repo, oid) {
                    Ok(bytes) => String::from_utf8(bytes).ok(),
                    Err(_) => None,
                },
                None => None,
            };
            let new_html: Option<String> = match e.status.as_str() {
                "D" => None,
                _ => std::fs::read_to_string(&e.abs_path).ok(),
            };
            out.push(HtmlJob {
                path: e.abs_path.to_string_lossy().to_string(),
                repo_path: e.repo_rel.clone(),
                status: e.status.clone(),
                old_html,
                new_html,
            });
        }
        out
    };

    let files: Vec<HtmlSectionDiffFile> = jobs
        .par_iter()
        .map(|j| HtmlSectionDiffFile {
            path: j.path.clone(),
            repo_path: j.repo_path.clone(),
            status: j.status.clone(),
            sections: compute_section_changes(j.old_html.as_deref(), j.new_html.as_deref()),
        })
        .collect();

    let mut files = files;
    let canonical_prefix = target_dir.to_string_lossy();
    let original_prefix = original_dir.to_string_lossy();
    if canonical_prefix != original_prefix {
        for file in &mut files {
            if file.path.starts_with(canonical_prefix.as_ref()) {
                file.path = format!("{}{}", original_prefix, &file.path[canonical_prefix.len()..]);
            }
        }
    }

    // Sort stable output by path for easier debugging.
    files.sort_by(|a, b| a.path.cmp(&b.path));
    println!("{}", serde_json::to_string(&HtmlSectionDiffResult { files })?);
    Ok(())
}

fn run_status(directory: PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    // Canonicalize for internal use (gix needs canonical paths), but keep the
    // original directory prefix so output paths match what the caller passed in.
    let target_dir = directory.canonicalize()?;
    let original_dir = &directory;

    // Open the repository (will find .git by walking up)
    let repo = gix::discover(&target_dir)?;
    // For bare repos (where .git dir lives inside the worktree), find the git
    // root manually by walking up from the target directory.
    let git_root = match repo.work_dir() {
        Some(wd) => wd.to_path_buf(),
        None => {
            let mut search = target_dir.clone();
            loop {
                if search.join(".git").exists() {
                    break search;
                }
                match search.parent() {
                    Some(p) => search = p.to_path_buf(),
                    None => return Err("No git repository found".into()),
                }
            }
        }
    };
    
    let mut results: Vec<FileStatus> = Vec::new();
    
    // Get the index
    let index = repo.index()?;
    
    // Track which paths we've seen in the index (relative to git root)
    let mut indexed_paths: HashSet<String> = HashSet::new();
    
    // Check each entry in the index against the worktree
    for entry in index.entries() {
        let entry_path_str = entry.path(&index).to_string();
        let full_path = git_root.join(&entry_path_str);
        
        // Only process files within our target directory
        if !full_path.starts_with(&target_dir) {
            continue;
        }
        
        indexed_paths.insert(entry_path_str.clone());
        
        if !full_path.exists() {
            // File was deleted
            results.push(FileStatus {
                path: full_path.to_string_lossy().to_string(),
                status: "deleted".to_string(),
            });
        } else {
            // Check if file was modified by comparing stat info
            let metadata = std::fs::metadata(&full_path)?;
            let mtime = metadata.modified()?;
            let file_size = metadata.len();
            
            // Compare with index entry
            let index_mtime = entry.stat.mtime.secs as u64;
            let index_size = entry.stat.size as u64;
            
            // Check modification time and size as quick indicators
            let mtime_secs = mtime.duration_since(std::time::UNIX_EPOCH)?.as_secs();
            
            if mtime_secs != index_mtime || file_size != index_size {
                // mtime/size don't match - need to verify by comparing content hash
                // This handles cases where files were touched but content is unchanged
                let current_hash = compute_blob_hash(&full_path)?;
                let index_hash = entry.id;
                
                if current_hash != index_hash {
                    results.push(FileStatus {
                        path: full_path.to_string_lossy().to_string(),
                        status: "modified".to_string(),
                    });
                }
            }
        }
    }
    
    // Use the `ignore` crate to walk the directory respecting .gitignore
    // This handles all gitignore patterns correctly
    let walker = WalkBuilder::new(&target_dir)
        .hidden(false)        // Don't skip hidden files (git tracks them)
        .git_ignore(true)     // Respect .gitignore
        .git_global(true)     // Respect global gitignore
        .git_exclude(true)    // Respect .git/info/exclude
        .filter_entry(|entry| {
            // Skip .git directories entirely
            entry.file_name() != ".git"
        })
        .build();
    
    for result in walker {
        match result {
            Ok(entry) => {
                let path = entry.path();
                
                // Skip directories
                if path.is_dir() {
                    continue;
                }
                
                // Get relative path from git root
                if let Ok(relative_path) = path.strip_prefix(&git_root) {
                    let relative_str = relative_path.to_string_lossy().to_string();
                    
                    // Check if this file is in the index
                    if !indexed_paths.contains(&relative_str) {
                        results.push(FileStatus {
                            path: path.to_string_lossy().to_string(),
                            status: "new".to_string(),
                        });
                    }
                }
            }
            Err(_) => continue,
        }
    }
    
    // Remap paths from canonical prefix back to original input prefix so
    // callers get paths matching what they passed in (e.g. /var/... not /private/var/...).
    let canonical_prefix = target_dir.to_string_lossy();
    let original_prefix = original_dir.to_string_lossy();
    if canonical_prefix != original_prefix {
        for entry in &mut results {
            if entry.path.starts_with(canonical_prefix.as_ref()) {
                entry.path = format!("{}{}", original_prefix, &entry.path[canonical_prefix.len()..]);
            }
        }
    }

    // Sort by path for consistent output
    results.sort_by(|a, b| a.path.cmp(&b.path));

    // Remove duplicates (keep first occurrence)
    results.dedup_by(|a, b| a.path == b.path);

    println!("{}", serde_json::to_string(&results)?);

    Ok(())
}

fn read_file_at_tree(
    repo: &gix::Repository,
    tree_id: gix_hash::ObjectId,
    repo_rel_path: &str,
) -> Result<Option<Vec<u8>>, Box<dyn std::error::Error>> {
    // Traverse tree entries similar to `cat-file`, but return bytes directly.
    let tree = repo.find_object(tree_id)?.into_tree();
    let mut current_tree = tree;
    let mut entry_oid: Option<gix_hash::ObjectId> = None;
    let mut entry_kind: Option<gix_object::tree::EntryKind> = None;

    let comps: Vec<&str> = repo_rel_path.split('/').filter(|c| !c.is_empty()).collect();
    for (i, comp) in comps.iter().enumerate() {
        let tree_ref = current_tree.decode()?;
        let found = tree_ref.entries.iter().find(|e| e.filename.to_string() == *comp);
        let Some(e) = found else {
            return Ok(None);
        };
        let kind = e.mode.kind();
        let oid = e.oid.to_owned();
        if i == comps.len() - 1 {
            entry_oid = Some(oid);
            entry_kind = Some(kind);
            break;
        }
        if kind != gix_object::tree::EntryKind::Tree {
            return Ok(None);
        }
        current_tree = repo.find_object(oid)?.into_tree();
    }

    let Some(kind) = entry_kind else { return Ok(None); };
    let Some(oid) = entry_oid else { return Ok(None); };
    if kind == gix_object::tree::EntryKind::Tree {
        return Ok(None);
    }
    let obj = repo.find_object(oid)?;
    Ok(Some(obj.data.to_vec()))
}

fn parse_hex_oid(sha: &str) -> Result<gix_hash::ObjectId, Box<dyn std::error::Error>> {
    Ok(gix_hash::ObjectId::from_hex(sha.as_bytes())?)
}

fn commit_subject(commit: &gix::Commit<'_>) -> Result<String, Box<dyn std::error::Error>> {
    let raw = commit.message_raw_sloppy().to_string();
    Ok(raw.lines().next().unwrap_or("").trim().to_string())
}

fn commit_author(commit: &gix::Commit<'_>) -> Result<(String, i64), Box<dyn std::error::Error>> {
    let author = commit.author()?;
    Ok((author.name.to_string(), author.time.seconds))
}

fn commit_first_parent_sha(commit: &gix::Commit<'_>) -> Option<String> {
    commit.parent_ids().next().map(|id| id.to_string())
}

fn collect_tree_paths(
    repo: &gix::Repository,
    tree_id: gix_hash::ObjectId,
    prefix: &str,
    out: &mut std::collections::BTreeMap<String, (gix_object::tree::EntryKind, gix_hash::ObjectId)>,
) -> Result<(), Box<dyn std::error::Error>> {
    let tree = repo.find_object(tree_id)?.into_tree();
    let tree_ref = tree.decode()?;

    for entry in tree_ref.entries {
        let name = entry.filename.to_string();
        let full_path = if prefix.is_empty() {
            name
        } else {
            format!("{}/{}", prefix, name)
        };
        let kind = entry.mode.kind();
        let oid = entry.oid.to_owned();
        match kind {
            gix_object::tree::EntryKind::Tree => {
                collect_tree_paths(repo, oid, &full_path, out)?;
            }
            _ => {
                out.insert(full_path, (kind, oid));
            }
        }
    }

    Ok(())
}

fn diff_trees_paths(
    repo: &gix::Repository,
    parent_tree: gix_hash::ObjectId,
    current_tree: gix_hash::ObjectId,
) -> Result<Vec<CommitFileEntry>, Box<dyn std::error::Error>> {
    let mut parent_map = std::collections::BTreeMap::new();
    let mut current_map = std::collections::BTreeMap::new();
    collect_tree_paths(repo, parent_tree, "", &mut parent_map)?;
    collect_tree_paths(repo, current_tree, "", &mut current_map)?;

    let mut paths: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for k in parent_map.keys() {
        paths.insert(k.clone());
    }
    for k in current_map.keys() {
        paths.insert(k.clone());
    }

    let mut out = Vec::new();
    for path in paths {
        match (parent_map.get(&path), current_map.get(&path)) {
            (None, Some(_)) => out.push(CommitFileEntry { path, status: "A".to_string() }),
            (Some(_), None) => out.push(CommitFileEntry { path, status: "D".to_string() }),
            (Some((k1, o1)), Some((k2, o2))) => {
                if k1 != k2 || o1 != o2 {
                    out.push(CommitFileEntry { path, status: "M".to_string() });
                }
            }
            (None, None) => {}
        }
    }
    Ok(out)
}

fn run_dir_log(directory: PathBuf, limit: usize) -> Result<(), Box<dyn std::error::Error>> {
    let target_dir = directory.canonicalize()?;
    let repo = gix::discover(&target_dir)?;
    let git_root = repo.work_dir().ok_or("Not a working tree")?.to_path_buf();

    // Prefix relative to repo root (with trailing slash), or empty if at root.
    let prefix = if target_dir == git_root {
        "".to_string()
    } else {
        let rel = target_dir.strip_prefix(&git_root)?;
        let rel = rel.to_string_lossy().to_string().replace('\\', "/");
        format!("{}/", rel)
    };

    // Determine HEAD tip.
    let head_id = repo.head()?.id().ok_or("Unborn HEAD")?.detach();

    let mut commits = Vec::new();
    let walk = repo
        .rev_walk([head_id])
        .sorting(gix::revision::walk::Sorting::ByCommitTime(gix_traverse::commit::simple::CommitTimeOrder::NewestFirst))
        .all()?;

    for info in walk {
        let info = info?;
        if commits.len() >= limit {
            break;
        }
        let commit = info.object()?;
        // No merges: skip commits with more than 1 parent
        let parent_count = commit.parent_ids().count();
        if parent_count > 1 {
            continue;
        }

        let tree_id = commit.tree_id()?.detach();
        let parent_tree_id = match commit.parent_ids().next() {
            Some(p) => p.object()?.peel_to_commit()?.tree_id()?.detach(),
            None => repo.empty_tree().id,
        };

        let changed_files = diff_trees_paths(&repo, parent_tree_id, tree_id)?;
        if !prefix.is_empty() && !changed_files.iter().any(|e| e.path.starts_with(&prefix)) {
            continue;
        }

        let (author_name, author_time) = commit_author(&commit)?;
        let subject = commit_subject(&commit)?;
        let parent_sha = commit_first_parent_sha(&commit);

        commits.push(DirLogCommit {
            sha: commit.id().to_string(),
            parent_sha,
            subject,
            author_name,
            author_time,
            files_changed_count: changed_files.len(),
        });
    }

    println!("{}", serde_json::to_string(&DirLogResult { commits })?);
    Ok(())
}

fn run_commit_files(directory: PathBuf, sha: String) -> Result<(), Box<dyn std::error::Error>> {
    let target_dir = directory.canonicalize()?;
    let repo = gix::discover(&target_dir)?;
    let oid = parse_hex_oid(&sha)?;
    let commit = repo.find_object(oid)?.into_commit();

    let tree_id = commit.tree_id()?.detach();
    let parent_id = commit.parent_ids().next().map(|p| p.detach());
    let parent_tree_id = match parent_id {
        Some(p) => repo.find_object(p)?.into_commit().tree_id()?.detach(),
        None => repo.empty_tree().id,
    };

    let files = diff_trees_paths(&repo, parent_tree_id, tree_id)?;

    println!(
        "{}",
        serde_json::to_string(&CommitFilesResult {
            sha: commit.id().to_string(),
            parent_sha: commit_first_parent_sha(&commit),
            files
        })?
    );
    Ok(())
}

fn run_cat_file(directory: PathBuf, sha: String, path: String) -> Result<(), Box<dyn std::error::Error>> {
    let target_dir = directory.canonicalize()?;
    let repo = gix::discover(&target_dir)?;
    // Support symbolic references like "HEAD" in addition to hex SHAs.
    let oid = if sha == "HEAD" {
        repo.head()?.id().ok_or("Unborn HEAD")?.detach()
    } else {
        parse_hex_oid(&sha)?
    };
    let commit = repo.find_object(oid)?.into_commit();
    let tree = commit.tree()?;

    let mut current_tree = tree;
    let mut entry_oid: Option<gix_hash::ObjectId> = None;
    let mut entry_kind: Option<gix_object::tree::EntryKind> = None;

    let comps: Vec<&str> = path.split('/').filter(|c| !c.is_empty()).collect();
    for (i, comp) in comps.iter().enumerate() {
        let tree_ref = current_tree.decode()?;
        let found = tree_ref
            .entries
            .iter()
            .find(|e| e.filename.to_string() == *comp);
        let Some(e) = found else {
            println!("{}", serde_json::to_string(&CatFileResult { found: false, kind: None, data_base64: None })?);
            return Ok(());
        };
        let kind = e.mode.kind();
        let oid = e.oid.to_owned();
        if i == comps.len() - 1 {
            entry_oid = Some(oid);
            entry_kind = Some(kind);
            break;
        }
        if kind != gix_object::tree::EntryKind::Tree {
            println!("{}", serde_json::to_string(&CatFileResult { found: false, kind: None, data_base64: None })?);
            return Ok(());
        }
        current_tree = repo.find_object(oid)?.into_tree();
    }

    let Some(kind) = entry_kind else {
        println!("{}", serde_json::to_string(&CatFileResult { found: false, kind: None, data_base64: None })?);
        return Ok(());
    };
    let Some(oid) = entry_oid else {
        println!("{}", serde_json::to_string(&CatFileResult { found: false, kind: None, data_base64: None })?);
        return Ok(());
    };

    if kind == gix_object::tree::EntryKind::Tree {
        println!("{}", serde_json::to_string(&CatFileResult { found: true, kind: Some("tree".to_string()), data_base64: None })?);
        return Ok(());
    }

    use base64::Engine;
    let obj = repo.find_object(oid)?;
    let bytes = obj.data.to_vec();
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let kind_str = match kind {
        gix_object::tree::EntryKind::Blob => "blob",
        gix_object::tree::EntryKind::BlobExecutable => "blob-exec",
        gix_object::tree::EntryKind::Link => "link",
        gix_object::tree::EntryKind::Commit => "commit",
        gix_object::tree::EntryKind::Tree => "tree",
    }
    .to_string();

    println!(
        "{}",
        serde_json::to_string(&CatFileResult {
            found: true,
            kind: Some(kind_str),
            data_base64: Some(encoded),
        })?
    );
    Ok(())
}

fn run_file_log(directory: PathBuf, path: String, limit: usize) -> Result<(), Box<dyn std::error::Error>> {
    let target_dir = directory.canonicalize()?;
    let repo = gix::discover(&target_dir)?;
    let head_id = repo.head()?.id().ok_or("Unborn HEAD")?.detach();

    let mut commits = Vec::new();
    let walk = repo
        .rev_walk([head_id])
        .sorting(gix::revision::walk::Sorting::ByCommitTime(gix_traverse::commit::simple::CommitTimeOrder::NewestFirst))
        .all()?;

    for info in walk {
        let info = info?;
        if commits.len() >= limit {
            break;
        }
        let commit = info.object()?;
        if commit.parent_ids().count() > 1 {
            continue;
        }

        let tree_id = commit.tree_id()?.detach();
        let parent_tree_id = match commit.parent_ids().next() {
            Some(p) => p.object()?.peel_to_commit()?.tree_id()?.detach(),
            None => repo.empty_tree().id,
        };

        let changed_files = diff_trees_paths(&repo, parent_tree_id, tree_id)?;
        if !changed_files.iter().any(|e| e.path == path) {
            continue;
        }

        let (author_name, author_time) = commit_author(&commit)?;
        let subject = commit_subject(&commit)?;
        commits.push(FileLogCommit {
            sha: commit.id().to_string(),
            parent_sha: commit_first_parent_sha(&commit),
            subject,
            author_name,
            author_time,
        });
    }

    println!("{}", serde_json::to_string(&FileLogResult { commits })?);
    Ok(())
}

#[derive(Serialize, Debug)]
struct InitResult {
    success: bool,
    already_existed: bool,
    message: Option<String>,
}

fn run_init(directory: PathBuf, default_branch: String) -> Result<(), Box<dyn std::error::Error>> {
    let git_dir = directory.join(".git");
    if git_dir.exists() {
        let result = InitResult {
            success: true,
            already_existed: true,
            message: Some("Git repository already exists".to_string()),
        };
        println!("{}", serde_json::to_string(&result)?);
        return Ok(());
    }

    // Create the directory if it doesn't exist
    if !directory.exists() {
        std::fs::create_dir_all(&directory)?;
    }

    // Initialize a normal (non-bare) repository: pass the worktree root, not
    // `.git`. Using `init_bare` here previously set core.bare=true, which made
    // plain `git status` reject the repo with "fatal: this operation must be
    // run in a work tree".
    gix::init(&directory)?;

    // Set the default branch by writing HEAD to point to the desired branch
    let head_path = git_dir.join("HEAD");
    std::fs::write(&head_path, format!("ref: refs/heads/{}\n", default_branch))?;

    let result = InitResult {
        success: true,
        already_existed: false,
        message: Some(format!("Initialized git repository with default branch '{}'", default_branch)),
    };
    println!("{}", serde_json::to_string(&result)?);
    Ok(())
}

fn run_commit_changes(
    directories: Vec<PathBuf>,
    message: String,
    author_name: String,
    author_email: String,
    allow_empty: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if directories.is_empty() {
        let result = CommitResult {
            success: false,
            sha: None,
            files_committed: 0,
            message: Some("No directories provided".to_string()),
        };
        println!("{}", serde_json::to_string(&result)?);
        return Ok(());
    }
    
    // Canonicalize all directories
    let mut canonical_dirs: Vec<PathBuf> = Vec::new();
    for dir in &directories {
        if !dir.exists() {
            continue; // Skip non-existent directories
        }
        canonical_dirs.push(dir.canonicalize()?);
    }
    
    if canonical_dirs.is_empty() {
        let result = CommitResult {
            success: false,
            sha: None,
            files_committed: 0,
            message: Some("No valid directories found".to_string()),
        };
        println!("{}", serde_json::to_string(&result)?);
        return Ok(());
    }

    // Find the git root BEFORE opening the repo so we can fix config first
    // We need to walk up from the first directory to find .git
    let mut search_dir = canonical_dirs[0].clone();
    let git_root = loop {
        let git_dir = search_dir.join(".git");
        if git_dir.exists() {
            break search_dir;
        }
        match search_dir.parent() {
            Some(parent) => search_dir = parent.to_path_buf(),
            None => return Err("No git repository found".into()),
        }
    };

    // Ensure user.name and user.email are set in git config BEFORE opening repo
    // (required by gitoxide for reflogs). This handles repos initialized by
    // isomorphic-git which don't set these.
    let config_path = git_root.join(".git").join("config");
    if config_path.exists() {
        let config_content = std::fs::read_to_string(&config_path).unwrap_or_default();
        if !config_content.contains("[user]") {
            // Append user section with the author info we're using
            let user_section = format!("\n[user]\n\tname = {}\n\temail = {}\n", author_name, author_email);
            std::fs::write(&config_path, config_content + &user_section)?;
        }
    }

    // Now open the repository (it will read the updated config)
    let repo = gix::discover(&canonical_dirs[0])?;
    
    // Verify all directories are within the same git root
    for dir in &canonical_dirs {
        if !dir.starts_with(&git_root) {
            return Err(format!("Directory {} is not within git root {}", 
                dir.display(), git_root.display()).into());
        }
    }
    
    // Collect all files from all directories
    let mut all_files: Vec<PathBuf> = Vec::new();
    for target_dir in &canonical_dirs {
        let walker = WalkBuilder::new(target_dir)
            .hidden(false)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .filter_entry(|entry| entry.file_name() != ".git")
            .build();
        
        for result in walker {
            if let Ok(entry) = result {
                let path = entry.path();
                if path.is_file() {
                    all_files.push(path.to_path_buf());
                }
            }
        }
    }
    
    // Check if HEAD exists (i.e., there's at least one commit)
    // If HEAD is unborn, all files should be treated as new
    let head_exists = repo.head().ok().and_then(|h| h.id()).is_some();

    // Get the index and check for changes
    // Handle the case where index file doesn't exist (fresh repo with no commits)
    let index_opt = repo.index().ok();
    let mut files_with_changes: Vec<(PathBuf, String)> = Vec::new(); // (full_path, relative_path)

    // Build a set of indexed paths for quick lookup
    let mut indexed_entries: std::collections::HashMap<String, gix::ObjectId> = std::collections::HashMap::new();
    if let Some(ref index) = index_opt {
        for entry in index.entries() {
            let path_str = entry.path(index).to_string();
            indexed_entries.insert(path_str, entry.id);
        }
    }

    // Check each file for changes
    for file_path in &all_files {
        let relative_path = file_path.strip_prefix(&git_root)?;
        let relative_str = relative_path.to_string_lossy().to_string();

        if !head_exists {
            // No commits yet - all files are new and need to be committed
            files_with_changes.push((file_path.clone(), relative_str));
        } else if let Some(index_hash) = indexed_entries.get(&relative_str) {
            // File exists in index, check if modified
            let current_hash = compute_blob_hash(file_path)?;
            if current_hash != *index_hash {
                files_with_changes.push((file_path.clone(), relative_str));
            }
        } else {
            // New file
            files_with_changes.push((file_path.clone(), relative_str));
        }
    }

    // Build a set of actual filesystem relative paths for ghost entry detection.
    // On case-insensitive filesystems (macOS/APFS), the WalkBuilder returns the
    // actual stored casing, which may differ from stale index entries.
    let fs_relative_set: std::collections::HashSet<String> = all_files.iter()
        .filter_map(|p| p.strip_prefix(&git_root).ok())
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    // Also check for deleted files and ghost case-variant entries (only if HEAD exists)
    if head_exists {
        for (indexed_path, _) in &indexed_entries {
            let full_path = git_root.join(indexed_path);

            // Check if this file is within any of our target directories
            let in_target_dir = canonical_dirs.iter().any(|dir| full_path.starts_with(dir));

            if in_target_dir && !full_path.exists() {
                files_with_changes.push((full_path, indexed_path.clone()));
            } else if in_target_dir && !fs_relative_set.contains(indexed_path) && full_path.exists() {
                // Ghost case-variant: the index path (e.g. "Hello World.html") isn't
                // in the filesystem walk results (which has "hello world.html"), but
                // full_path.exists() returns true on case-insensitive FS. This is a
                // stale entry left over from a case-only rename.
                files_with_changes.push((full_path, indexed_path.clone()));
            }
        }
    }
    
    if files_with_changes.is_empty() {
        if !allow_empty {
            let result = CommitResult {
                success: true,
                sha: None,
                files_committed: 0,
                message: Some("No changes to commit".to_string()),
            };
            println!("{}", serde_json::to_string(&result)?);
            return Ok(());
        }

        // Create empty commit using HEAD's tree
        let head_id = repo.head()?.id().ok_or("No HEAD commit for empty commit")?;
        let head_commit = repo.find_object(head_id)?.into_commit();
        let tree_id = head_commit.tree_id()?.detach();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let sig_time = gix_date::Time {
            seconds: now,
            offset: 0,
            sign: gix_date::time::Sign::Plus,
        };
        let author = gix_actor::Signature {
            name: author_name.clone().into(),
            email: author_email.clone().into(),
            time: sig_time,
        };
        let committer = author.clone();

        let commit_id = repo.commit_as(
            gix_actor::SignatureRef {
                name: committer.name.as_ref(),
                email: committer.email.as_ref(),
                time: committer.time,
            },
            gix_actor::SignatureRef {
                name: author.name.as_ref(),
                email: author.email.as_ref(),
                time: author.time,
            },
            "HEAD",
            &message,
            tree_id,
            vec![head_id.detach()],
        )?;

        let result = CommitResult {
            success: true,
            sha: Some(commit_id.to_string()),
            files_committed: 0,
            message: Some("Empty commit created".to_string()),
        };
        println!("{}", serde_json::to_string(&result)?);
        return Ok(());
    }

    // ===== Stage changes into the index (no git CLI) =====
    let mut index_file = match repo.open_index() {
        Ok(index) => index,
        Err(_) => gix_index::File::from_state(gix_index::State::new(repo.object_hash()), repo.index_path()),
    };
    let (mut index_state, index_path) = index_file.into_parts();

    // Helper: build entry stat from filesystem metadata (symlink-aware).
    fn stat_from_path(p: &std::path::Path) -> std::io::Result<gix_index::entry::Stat> {
        let md = std::fs::symlink_metadata(p)?;
        let mtime = md
            .modified()
            .unwrap_or(std::time::UNIX_EPOCH)
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let (ctime_secs, ctime_nsecs, dev, ino, uid, gid): (u64, u32, u32, u32, u32, u32) = {
            #[cfg(unix)]
            {
                (
                    md.ctime().try_into().unwrap_or(0),
                    md.ctime_nsec().try_into().unwrap_or(0),
                    md.dev().try_into().unwrap_or(0),
                    md.ino().try_into().unwrap_or(0),
                    md.uid().try_into().unwrap_or(0),
                    md.gid().try_into().unwrap_or(0),
                )
            }
            #[cfg(windows)]
            {
                // `std::os::windows::fs::MetadataExt` exists, but doesn't provide uid/gid/dev/ino.
                // For index-stats purposes, we only need a stable-ish timestamp and a size; the
                // remaining fields can be set to 0 on Windows.
                let created = md
                    .created()
                    .unwrap_or_else(|_| md.modified().unwrap_or(std::time::UNIX_EPOCH));
                let created_dur = created
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default();

                (
                    created_dur.as_secs(),
                    created_dur.subsec_nanos(),
                    0,
                    0,
                    0,
                    0,
                )
            }
        };

        Ok(gix_index::entry::Stat {
            mtime: gix_index::entry::stat::Time {
                secs: mtime.as_secs().try_into().unwrap_or(u32::MAX),
                nsecs: mtime.subsec_nanos(),
            },
            ctime: gix_index::entry::stat::Time {
                secs: ctime_secs.try_into().unwrap_or(u32::MAX),
                nsecs: ctime_nsecs,
            },
            dev,
            ino,
            uid,
            gid,
            size: md.len().try_into().unwrap_or(u32::MAX),
        })
    }

    fn mode_from_path(p: &std::path::Path) -> std::io::Result<gix_index::entry::Mode> {
        let md = std::fs::symlink_metadata(p)?;
        if md.file_type().is_symlink() {
            return Ok(gix_index::entry::Mode::SYMLINK);
        }
        // Regular file modes. We ignore special files.
        let is_exec = {
            #[cfg(unix)]
            {
                (md.mode() & 0o111) != 0
            }
            #[cfg(windows)]
            {
                // Windows doesn't have an executable bit in the same sense as Unix.
                // Use common executable extensions to approximate.
                let ext = p
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                matches!(
                    ext.as_str(),
                    "exe" | "com" | "bat" | "cmd" | "ps1" | "vbs" | "vbe" | "msi"
                )
            }
        };
        Ok(if is_exec {
            gix_index::entry::Mode::FILE_EXECUTABLE
        } else {
            gix_index::entry::Mode::FILE
        })
    }

    // Stage changes in three passes to preserve index sort order:
    //   1. Update existing entries (binary search works on sorted index)
    //   2. Push new entries (dangerously_push_entry breaks sort order)
    //   3. Re-sort, then mark deleted entries for removal
    //
    // We must update existing entries before any push, because
    // dangerously_push_entry invalidates the binary search that
    // entry_mut_by_path_and_stage relies on.

    // Pre-compute blobs for all existing files and classify into update/new/deleted.
    struct NewEntry {
        stat: gix_index::entry::Stat,
        oid: gix_hash::ObjectId,
        mode: gix_index::entry::Mode,
        path: String,
    }
    let mut new_entries: Vec<NewEntry> = Vec::new();
    let mut deleted_paths: Vec<&str> = Vec::new();

    for (full_path, relative_path) in &files_with_changes {
        if !full_path.exists() {
            deleted_paths.push(relative_path.as_str());
            continue;
        }
        let rel_bstr: &gix::bstr::BStr = relative_path.as_str().into();
        // Write blob to ODB
        let oid = if std::fs::symlink_metadata(full_path)?.file_type().is_symlink() {
            let target = std::fs::read_link(full_path)?;
            repo.write_blob(target.to_string_lossy().as_bytes())?.detach()
        } else {
            let mut f = std::fs::File::open(full_path)?;
            repo.write_blob_stream(&mut f)?.detach()
        };
        let stat = stat_from_path(full_path)?;
        let mode = mode_from_path(full_path)?;

        // Pass 1: update entries already in the index (binary search is valid).
        if let Some(entry) = index_state.entry_mut_by_path_and_stage(rel_bstr, gix_index::entry::Stage::Unconflicted) {
            entry.id = oid;
            entry.stat = stat;
            entry.mode = mode;
            entry.flags.remove(gix_index::entry::Flags::REMOVE | gix_index::entry::Flags::UPDATE);
            entry.flags.insert(gix_index::entry::Flags::HASHED | gix_index::entry::Flags::UPTODATE);
        } else {
            // Defer new entries to pass 2.
            new_entries.push(NewEntry { stat, oid, mode, path: relative_path.clone() });
        }
    }

    // Pass 2: push new entries (breaks sort order).
    for ne in new_entries {
        let rel_bstr: &gix::bstr::BStr = ne.path.as_str().into();
        let mut flags = gix_index::entry::Flags::from_stage(gix_index::entry::Stage::Unconflicted);
        flags.insert(gix_index::entry::Flags::HASHED | gix_index::entry::Flags::UPTODATE);
        index_state.dangerously_push_entry(ne.stat, ne.oid, flags, ne.mode, rel_bstr);
    }

    // Pass 3: re-sort so binary-search lookups work, then mark deletions.
    index_state.sort_entries();

    for rel_path in &deleted_paths {
        let rel_bstr: &gix::bstr::BStr = (*rel_path).into();
        if let Some(entry) = index_state.entry_mut_by_path_and_stage(rel_bstr, gix_index::entry::Stage::Unconflicted) {
            entry.flags.insert(gix_index::entry::Flags::REMOVE);
        }
    }

    // On case-insensitive filesystems (macOS/APFS), renaming "Foo.html" to "foo.html"
    // leaves the old "Foo.html" entry in the index because full_path.exists() returns
    // true for both cases. Detect and remove these ghost entries by comparing index
    // paths against the actual filesystem paths returned by the directory walker.
    // (fs_relative_set was built earlier during change detection.)
    let stale_paths: Vec<String> = index_state.entries().iter()
        .filter_map(|entry| {
            if entry.flags.contains(gix_index::entry::Flags::REMOVE) {
                return None;
            }
            let entry_path = entry.path(&index_state).to_string();
            let full = git_root.join(&entry_path);
            let in_target = canonical_dirs.iter().any(|dir| full.starts_with(dir));
            // Entry is in our target dirs, NOT in the filesystem walk results,
            // but the path "exists" (case-insensitive match) → stale case-variant
            if in_target && !fs_relative_set.contains(&entry_path) && full.exists() {
                Some(entry_path)
            } else {
                None
            }
        })
        .collect();

    for stale_path in &stale_paths {
        let rel_bstr: &gix::bstr::BStr = stale_path.as_str().into();
        if let Some(entry) = index_state.entry_mut_by_path_and_stage(
            rel_bstr, gix_index::entry::Stage::Unconflicted
        ) {
            entry.flags.insert(gix_index::entry::Flags::REMOVE);
        }
    }

    // Ensure index invariants for path lookup/writing.
    index_state.sort_entries();

    // Persist index to disk.
    index_file = gix_index::File::from_state(index_state.clone(), index_path.clone());
    index_file.write(gix_index::write::Options::default())?;

    // ===== Build a tree from the index and create commit (no git CLI) =====
    let mut editor = repo.empty_tree().edit()?;
    for entry in index_state.entries() {
        if entry.flags.contains(gix_index::entry::Flags::REMOVE) {
            continue;
        }
        if entry.stage() != gix_index::entry::Stage::Unconflicted {
            continue;
        }
        let path = entry.path(&index_state).to_string();
        let entry_mode = entry.mode.to_tree_entry_mode().ok_or("Invalid entry mode")?;
        let kind: gix_object::tree::EntryKind = entry_mode.kind();
        editor.upsert(path, kind, entry.id)?;
    }
    let tree_id = editor.write()?.detach();

    let parent_ids: Vec<gix_hash::ObjectId> = match repo.head()?.id() {
        Some(id) => vec![id.detach()],
        None => Vec::new(),
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let sig_time = gix_date::Time {
        seconds: now,
        offset: 0,
        sign: gix_date::time::Sign::Plus,
    };
    let author = gix_actor::Signature {
        name: author_name.into(),
        email: author_email.into(),
        time: sig_time,
    };
    let committer = author.clone();

    let commit_id = repo.commit_as(
        gix_actor::SignatureRef {
            name: committer.name.as_ref(),
            email: committer.email.as_ref(),
            time: committer.time,
        },
        gix_actor::SignatureRef {
            name: author.name.as_ref(),
            email: author.email.as_ref(),
            time: author.time,
        },
        "HEAD",
        &message,
        tree_id,
        parent_ids,
    )?;

    // Clean up the index: remove entries flagged REMOVE so that subsequent
    // status queries don't report stale "deleted" files.
    index_state.remove_entries(|_, _, entry| entry.flags.contains(gix_index::entry::Flags::REMOVE));
    index_state.sort_entries();
    let mut cleaned_index = gix_index::File::from_state(index_state, index_path);
    cleaned_index.write(gix_index::write::Options::default())?;

    let result = CommitResult {
        success: true,
        sha: Some(commit_id.to_string()),
        files_committed: files_with_changes.len(),
        message: None,
    };
    println!("{}", serde_json::to_string(&result)?);

    Ok(())
}
