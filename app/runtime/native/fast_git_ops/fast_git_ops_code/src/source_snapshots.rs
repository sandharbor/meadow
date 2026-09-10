//! Source history shares Git objects while leaving the user's checkout and index alone.
use std::{collections::BTreeMap, io::Read, path::PathBuf};
use sha2::{Digest, Sha256};
use super::identity::{DEFAULT_EMAIL, DEFAULT_NAME};
use super::{collect_tree_paths, insert_tree_build_path, parse_hex_oid, write_tree_build_node, TreeBuildNode};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

fn validate_path(value: &str) -> Result<()> {
    if value.is_empty() || value.contains('\\') || value.split('/').any(|part| part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git")) {
        return Err("Invalid snapshot file path".into());
    }
    Ok(())
}

fn update_branch(repo: &mut gix::Repository, branch: &str, commit: gix::ObjectId) -> Result<()> {
    if !branch.starts_with("refs/heads/meadow-sources/") { return Err("Not a source-history branch".into()); }
    let expected = match repo.try_find_reference(branch)? {
        Some(mut reference) => gix::refs::transaction::PreviousValue::MustExistAndMatch(gix::refs::Target::Object(reference.peel_to_id_in_place()?.detach())),
        None => gix::refs::transaction::PreviousValue::MustNotExist,
    };
    // Reflogs need their own identity even though the snapshot commit already
    // has one. Override only this repository handle, never the user's config.
    let mut config = repo.config_snapshot_mut();
    config.set_value(&gix::config::tree::Committer::NAME, DEFAULT_NAME)?;
    config.set_value(&gix::config::tree::Committer::EMAIL, DEFAULT_EMAIL)?;
    let repo = config.commit_auto_rollback()?;
    repo.reference(branch, commit, expected, "source snapshot")?;
    Ok(())
}

pub fn capture(directory: PathBuf, source: PathBuf, branch: String, parent: Option<String>) -> Result<()> {
    if !branch.starts_with("refs/heads/meadow-sources/") { return Err("Not a source-history branch".into()); }
    let mut repo = gix::discover(directory)?;
    let source = source.canonicalize()?;
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input)?;
    let selected: BTreeMap<String, serde_json::Value> = serde_json::from_str(&input)?;
    let mut tree = TreeBuildNode::default();
    let mut files = BTreeMap::new();
    for (filename, expected) in selected {
        validate_path(&filename)?;
        let file = source.join(&filename);
        if !file.canonicalize()?.starts_with(&source) || !std::fs::symlink_metadata(&file)?.is_file() {
            return Err(format!("Source is not a regular file: {filename}").into());
        }
        let bytes = std::fs::read(file)?;
        let digest = format!("{:x}", Sha256::digest(&bytes));
        if expected["digest"].as_str() != Some(digest.as_str()) || expected["size"].as_u64() != Some(bytes.len() as u64) {
            return Err("Source files changed during capture; the existing candidate has been kept".into());
        }
        let oid = repo.write_blob(&bytes)?.detach();
        insert_tree_build_path(&mut tree, &filename.split('/').collect::<Vec<_>>(), gix_object::tree::EntryKind::Blob.into(), oid, &filename)?;
        files.insert(filename, serde_json::json!({"digest": digest, "size": bytes.len(), "objectId": oid.to_string()}));
    }
    let tree_id = write_tree_build_node(&repo, &tree)?;
    let parent = parent.map(|value| parse_hex_oid(&value)).transpose()?;
    if let Some(id) = parent { repo.find_object(id)?.try_into_commit()?; }
    let parents = parent.into_iter().collect();
    let signature = gix_actor::Signature { name: DEFAULT_NAME.into(), email: DEFAULT_EMAIL.into(), time: gix_date::Time::now_utc() };
    let commit = gix_object::Commit { tree: tree_id, parents, author: signature.clone(), committer: signature, encoding: None, message: "Capture source snapshot".into(), extra_headers: Default::default() };
    let commit_id = repo.write_object(commit)?.detach();
    update_branch(&mut repo, &branch, commit_id)?;
    println!("{}", serde_json::json!({"commit": commit_id.to_string(), "tree": tree_id.to_string(), "files": files}));
    Ok(())
}

pub fn materialize(directory: PathBuf, commit: String, destination: PathBuf) -> Result<()> {
    if destination.exists() { return Err("Snapshot destination must not exist".into()); }
    let repo = gix::discover(directory)?;
    let tree_id = repo.find_object(parse_hex_oid(&commit)?)?.try_into_commit()?.tree_id()?.detach();
    let mut files = BTreeMap::new();
    collect_tree_paths(&repo, tree_id, "", &mut files)?;
    for (filename, (kind, _)) in &files {
        validate_path(filename)?;
        if *kind != gix_object::tree::EntryKind::Blob { return Err("Unexpected source snapshot entry type".into()); }
    }
    std::fs::create_dir_all(&destination)?;
    for (filename, (_, oid)) in files {
        let target = destination.join(filename);
        std::fs::create_dir_all(target.parent().ok_or("Missing parent")?)?;
        std::fs::write(target, &repo.find_object(oid)?.data)?;
    }
    println!("{{\"success\":true}}");
    Ok(())
}

pub fn accept(directory: PathBuf, branch: String, commit: String) -> Result<()> {
    let mut repo = gix::discover(directory)?;
    let commit = repo.find_object(parse_hex_oid(&commit)?)?.try_into_commit()?.id().detach();
    update_branch(&mut repo, &branch, commit)?;
    println!("{{\"success\":true}}");
    Ok(())
}
