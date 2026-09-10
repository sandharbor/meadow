// Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0.

//! Disposable, per-source-directory parse index. Every request reconciles metadata;
//! cached links remain unresolved so target additions/deletions can redirect old links.
use crate::{is_pagespec_sidecar, is_supported_source_extension, scan_file, ScanResult};
use anyhow::{ensure, Context, Result};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use walkdir::WalkDir;

const FORMAT_VERSION: u32 = 1;
// Changes to extraction, classification, or serialized parse semantics invalidate every entry.
// Include the parser sources so a release cannot accidentally reuse an older interpretation.
const PARSER_SOURCES: &[&str] = &[
    include_str!("main.rs"),
    include_str!("source_index.rs"),
    include_str!("../link_parser/src/lib.rs"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourceFile {
    pub path: String,
    pub digest: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Stamp {
    size: u64,
    modified: (i64, i64),
    changed: (i64, i64),
    device: u64,
    inode: u64,
}

impl Stamp {
    #[cfg(unix)]
    fn from(metadata: &fs::Metadata) -> Result<Self> {
        use std::os::unix::fs::MetadataExt;
        Ok(Self {
            size: metadata.len(),
            modified: (metadata.mtime(), metadata.mtime_nsec()),
            changed: (metadata.ctime(), metadata.ctime_nsec()),
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(not(unix))]
    fn from(metadata: &fs::Metadata) -> Result<Self> {
        let time = metadata.modified()?.duration_since(std::time::UNIX_EPOCH)?;
        Ok(Self {
            size: metadata.len(),
            modified: (time.as_secs() as i64, time.subsec_nanos() as i64),
            changed: (0, 0),
            device: 0,
            inode: 0,
        })
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Entry {
    stamp: Stamp,
    source: SourceFile,
    scan: ScanResult,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Index {
    source_root: PathBuf,
    format_version: u32,
    parser_version: String,
    root_identity: (u64, u64),
    /// Durable diagnostic evidence for forced rebuilds, including ones with unchanged output.
    generation: u64,
    rebuilt: bool,
    files_read: usize,
    files: BTreeMap<String, Entry>,
    pub directories: HashSet<String>,
}

impl Index {
    pub fn scans(&self) -> Vec<ScanResult> {
        let mut scans: Vec<_> = self
            .files
            .values()
            .map(|entry| entry.scan.clone())
            .collect();
        scans.sort_by(|a, b| a.source_file.path.cmp(&b.source_file.path));
        scans
    }
    pub fn source_files(&self) -> std::collections::HashMap<String, SourceFile> {
        self.files
            .values()
            .map(|entry| (entry.scan.source_file.path.clone(), entry.source.clone()))
            .collect()
    }
}

fn inventory(root: &Path) -> Result<(BTreeMap<String, Stamp>, HashSet<String>)> {
    let mut files = BTreeMap::new();
    let mut directories = HashSet::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || (!entry.file_name().to_string_lossy().starts_with('.')
                    && !is_pagespec_sidecar(entry.path()))
        })
    {
        let entry = entry.context("Could not inspect source directory; the index has been kept")?;
        ensure!(
            !entry.path_is_symlink(),
            "Cannot index symbolic link {}",
            entry.path().display()
        );
        let relative = entry
            .path()
            .strip_prefix(root)?
            .to_str()
            .context("Source path is not UTF-8")?
            .to_string();
        if entry.file_type().is_dir() {
            directories.insert(relative);
        } else if entry.file_type().is_file() {
            let extension = entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("")
                .to_lowercase();
            if is_supported_source_extension(&extension) {
                files.insert(relative, Stamp::from(&entry.metadata()?)?);
            }
        }
    }
    Ok((files, directories))
}

pub(crate) fn load(root: &Path, cache_root: &Path, force: bool) -> Result<Index> {
    let root = root
        .canonicalize()
        .context("Source directory is unavailable; the accepted snapshot has been kept")?;
    ensure!(
        root.is_dir(),
        "Source directory is unavailable; the accepted snapshot has been kept"
    );
    let root_stamp = Stamp::from(&fs::metadata(&root)?)?;
    let source_root = root.to_str().context("Source directory is not UTF-8")?;
    let key = format!("{:x}", Sha256::digest(source_root.as_bytes()));
    fs::create_dir_all(cache_root)?;
    ensure!(
        !cache_root.canonicalize()?.starts_with(&root),
        "Source index storage must be outside the source directory"
    );
    let directory = cache_root.join(key);
    fs::create_dir_all(&directory)?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(directory.join("index.lock"))?;
    let started = Instant::now();
    loop {
        match lock.try_lock_exclusive() {
            Ok(()) => break,
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    && started.elapsed() < Duration::from_secs(45) =>
            {
                std::thread::sleep(Duration::from_millis(20))
            }
            Err(error) => return Err(error).context("Could not lock source index"),
        }
    }
    // An interrupted writer leaves only a disposable staging file; holding the lock makes cleanup safe.
    let staged = directory.join("index.next.json");
    if staged.exists() {
        fs::remove_file(&staged)?;
    }
    let filename = directory.join("index.json");
    let parser_version = format!("{:x}", Sha256::digest(PARSER_SOURCES.concat().as_bytes()));
    let previous: Option<Index> = match File::open(&filename) {
        Ok(file) => match serde_json::from_reader(BufReader::new(file)) {
            Ok(index) => Some(index),
            Err(error) => {
                eprintln!("Rebuilding unreadable source index: {error}");
                None
            }
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error).context("Could not read source index"),
    };
    let valid = previous.as_ref().is_some_and(|index| {
        index.source_root == root
            && index.format_version == FORMAT_VERSION
            && index.parser_version == parser_version
            && index.root_identity == (root_stamp.device, root_stamp.inode)
    });
    let rebuild = force || !valid;
    let (stamps, directories) = inventory(&root)?;
    let mut next = Index {
        source_root: root.clone(),
        format_version: FORMAT_VERSION,
        parser_version,
        root_identity: (root_stamp.device, root_stamp.inode),
        generation: previous
            .as_ref()
            .map_or(1, |index| index.generation.saturating_add(1)),
        rebuilt: rebuild,
        files_read: 0,
        files: BTreeMap::new(),
        directories,
    };
    for (relative, stamp) in &stamps {
        let cached = previous
            .as_ref()
            .and_then(|index| index.files.get(relative));
        // Without Unix change time and file identity, favor rereading over weak metadata reuse.
        if !rebuild && cfg!(unix) && cached.is_some_and(|entry| entry.stamp == *stamp) {
            next.files.insert(relative.clone(), cached.unwrap().clone());
            continue;
        }
        let path = root.join(relative);
        let bytes = fs::read(&path)
            .with_context(|| format!("Could not read source file {}", path.display()))?;
        ensure!(
            Stamp::from(&fs::metadata(&path)?)? == *stamp,
            "Source files changed while indexing; check again"
        );
        let source = SourceFile {
            path: relative.clone(),
            digest: format!("{:x}", Sha256::digest(&bytes)),
            size: bytes.len() as u64,
        };
        next.files.insert(
            relative.clone(),
            Entry {
                stamp: stamp.clone(),
                source,
                scan: scan_file(&path, &root, &bytes),
            },
        );
        next.files_read += 1;
    }
    let changed = rebuild
        || next.files_read > 0
        || previous.as_ref().is_none_or(|index| {
            index.files.len() != next.files.len() || index.directories != next.directories
        });
    if changed {
        ensure!(
            inventory(&root)? == (stamps, next.directories.clone()),
            "Source files changed while indexing; check again"
        );
        let mut writer = BufWriter::new(File::create(&staged)?);
        serde_json::to_writer(&mut writer, &next)?;
        writer.flush()?;
        writer.get_ref().sync_all()?;
        fs::rename(&staged, &filename)?;
        File::open(&directory)?.sync_all()?;
    }
    // Dropping the OS lock releases it even after a process crash; no stale lock-file recovery protocol.
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resolve_links;
    use std::io::Write;

    struct Fixture {
        _temp: tempfile::TempDir,
        root: PathBuf,
        cache: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().join("vault");
            fs::create_dir(&root).unwrap();
            let cache = temp.path().join("cache");
            Self {
                _temp: temp,
                root,
                cache,
            }
        }
        fn write(&self, path: &str, content: &str) {
            let path = self.root.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        fn load(&self, force: bool) -> Index {
            load(&self.root, &self.cache, force).unwrap()
        }
        fn filename(&self) -> PathBuf {
            fs::read_dir(&self.cache)
                .unwrap()
                .next()
                .unwrap()
                .unwrap()
                .path()
                .join("index.json")
        }
    }
    fn graph(index: &Index) -> serde_json::Value {
        serde_json::to_value(resolve_links(index.scans())).unwrap()
    }
    fn assert_rebuild_matches(fixture: &Fixture, expected_reads: usize) {
        let incremental = fixture.load(false);
        assert_eq!(incremental.files_read, expected_reads);
        let rebuilt = fixture.load(true);
        assert_eq!(rebuilt.files_read, rebuilt.files.len());
        assert_eq!(graph(&incremental), graph(&rebuilt));
        assert_eq!(
            serde_json::to_value(incremental.source_files()).unwrap(),
            serde_json::to_value(rebuilt.source_files()).unwrap()
        );
    }

    #[test]
    fn restart_reuses_parsing_and_updates_links_when_targets_change() {
        let fixture = Fixture::new();
        fixture.write("main.md", "[[Ideas]] [[Missing]]");
        fixture.write("nested/Ideas.md", "[[main]]");
        assert_rebuild_matches(&fixture, 2);
        assert_rebuild_matches(&fixture, 0);
        fixture.write("Ideas.md", "root takes precedence");
        fixture.write("Missing.md", "previously unresolved");
        assert_rebuild_matches(&fixture, 2);
        let current = resolve_links(fixture.load(false).scans());
        let main = current
            .iter()
            .find(|scan| scan.source_file.path == "main.md")
            .unwrap();
        assert_eq!(
            main.outgoing_links[0]
                .link_resolved_target_path
                .trim_start_matches('/'),
            "Ideas.md"
        );
        fs::remove_file(fixture.root.join("Ideas.md")).unwrap();
        fs::rename(
            fixture.root.join("Missing.md"),
            fixture.root.join("Renamed.md"),
        )
        .unwrap();
        assert_rebuild_matches(&fixture, 1);
        fs::create_dir(fixture.root.join("empty folder")).unwrap();
        assert_rebuild_matches(&fixture, 0);
        assert!(fixture.load(false).directories.contains("empty folder"));
    }

    #[test]
    fn changed_time_catches_same_size_edit_with_restored_modification_time() {
        let fixture = Fixture::new();
        fixture.write("main.md", "[[Alpha]]");
        let first = fixture.load(false);
        let path = fixture.root.join("main.md");
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        std::thread::sleep(Duration::from_millis(5));
        let mut file = OpenOptions::new().write(true).open(&path).unwrap();
        file.write_all(b"[[Bravo]]").unwrap();
        file.set_modified(modified).unwrap();
        let next = fixture.load(false);
        assert_eq!(
            first.files["main.md"].stamp.modified,
            next.files["main.md"].stamp.modified
        );
        assert_eq!(
            first.files["main.md"].source.size,
            next.files["main.md"].source.size
        );
        assert_ne!(
            first.files["main.md"].source.digest,
            next.files["main.md"].source.digest
        );
        assert_eq!(next.files_read, 1);
        assert_eq!(graph(&next), graph(&fixture.load(true)));
    }

    #[test]
    fn replacement_and_excalidraw_physical_paths_and_assets_are_indexed() {
        let fixture = Fixture::new();
        fixture.write("main.md", "[[Alpha]]");
        fixture.write(
            "drawing.md",
            "---\nexcalidraw-plugin: parsed\n---\n[[main]]",
        );
        fixture.write("image.png", "first");
        fixture.load(false);
        fixture.write("replacement.md", "[[Bravo]]");
        fs::rename(
            fixture.root.join("replacement.md"),
            fixture.root.join("main.md"),
        )
        .unwrap();
        fixture.write("image.png", "second");
        assert_rebuild_matches(&fixture, 2);
        assert_eq!(
            fixture.load(false).source_files()["drawing.excalidraw"].path,
            "drawing.md"
        );
    }

    #[test]
    fn invalid_cache_and_parser_versions_rebuild_through_the_index() {
        let fixture = Fixture::new();
        fixture.write("main.md", "[[Alpha]]");
        fixture.load(false);
        let mut stored: serde_json::Value =
            serde_json::from_slice(&fs::read(fixture.filename()).unwrap()).unwrap();
        stored["parserVersion"] = "old parser".into();
        fs::write(fixture.filename(), serde_json::to_vec(&stored).unwrap()).unwrap();
        assert!(fixture.load(false).rebuilt);
        fs::write(fixture.filename(), b"interrupted garbage").unwrap();
        assert_rebuild_matches(&fixture, 1);
    }

    #[test]
    fn rebuild_is_observable_and_failure_preserves_previous_index() {
        let fixture = Fixture::new();
        fixture.write("main.md", "[[Alpha]]");
        let first = fixture.load(false);
        let next = fixture.load(true);
        assert!(next.generation > first.generation);
        assert!(next.rebuilt);
        assert_eq!(next.files_read, 1);
        let original = fs::read(fixture.filename()).unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("main.md", fixture.root.join("link.md")).unwrap();
            assert!(load(&fixture.root, &fixture.cache, true).is_err());
            assert_eq!(fs::read(fixture.filename()).unwrap(), original);
            fs::remove_file(fixture.root.join("link.md")).unwrap();
        }
        fs::write(
            fixture.filename().with_file_name("index.next.json"),
            b"abandoned",
        )
        .unwrap();
        assert_eq!(fixture.load(false).files_read, 0);
        assert!(!fixture
            .filename()
            .with_file_name("index.next.json")
            .exists());
    }

    #[test]
    fn concurrent_updates_serialize_and_each_return_a_complete_index() {
        let fixture = Fixture::new();
        for index in 0..20 {
            fixture.write(&format!("{index}.md"), "[[target]]");
        }
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4).map(|_| scope.spawn(|| fixture.load(true))).collect();
            let mut generations = Vec::new();
            for handle in handles {
                let index = handle.join().unwrap();
                assert_eq!(index.files.len(), 20);
                generations.push(index.generation);
            }
            generations.sort();
            generations.dedup();
            assert_eq!(generations.len(), 4);
        });
        assert_eq!(fixture.load(false).files_read, 0);
    }
}
