//! Bundle graph addresses. Paths are source-relative; only this codec renders keys.

use anyhow::{ensure, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundleNodeKey(Key);

#[derive(Debug, Clone, PartialEq, Eq)]
enum Key {
    File(String),
    Folder(String),
    Collection(String),
}

fn validate_path(path: &str, allow_empty: bool) -> Result<()> {
    ensure!(allow_empty || !path.is_empty(), "file key requires a path");
    ensure!(
        !path.starts_with('/') && !path.contains('\\') && !path.contains('\0'),
        "key path must be source-relative"
    );
    ensure!(
        !(path.len() >= 3
            && path.as_bytes()[0].is_ascii_alphabetic()
            && path.as_bytes()[1] == b':'
            && path.as_bytes()[2] == b'/'),
        "key path must be source-relative"
    );
    ensure!(
        path.is_empty()
            || path
                .split('/')
                .all(|part| !part.is_empty() && part != "." && part != ".."),
        "key path must be normalized"
    );
    if let Some(qualified) = path.strip_prefix("_mw_sources/") {
        let id = qualified.split('/').next().unwrap_or_default();
        ensure!(
            id.len() == 12
                && id
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
            "invalid source identity"
        );
        ensure!(
            allow_empty || qualified.len() > id.len() + 1,
            "file key requires a source-relative file path"
        );
    }
    Ok(())
}

impl BundleNodeKey {
    pub fn file(path: &str) -> Result<Self> {
        validate_path(path, false)?;
        Ok(Self(Key::File(path.into())))
    }
    pub fn folder(path: &str) -> Result<Self> {
        validate_path(path, true)?;
        Ok(Self(Key::Folder(path.into())))
    }
    pub fn collection(id: &str) -> Result<Self> {
        ensure!(
            id.len() == 12
                && id
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
            "invalid collection identity"
        );
        Ok(Self(Key::Collection(id.into())))
    }
    pub fn parse(value: &str) -> Result<Self> {
        let (kind, locator) = value
            .split_once(':')
            .ok_or_else(|| anyhow::anyhow!("invalid bundle node key"))?;
        match kind {
            "file" => Self::file(locator),
            "folder" => Self::folder(locator),
            "collection" => Self::collection(locator),
            _ => anyhow::bail!("invalid bundle node kind"),
        }
    }
    pub fn source_graph_path(&self) -> Option<&str> {
        match &self.0 {
            Key::File(path) | Key::Folder(path) => Some(path),
            Key::Collection(_) => None,
        }
    }
}

impl std::fmt::Display for BundleNodeKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (kind, locator) = match &self.0 {
            Key::File(path) => ("file", path),
            Key::Folder(path) => ("folder", path),
            Key::Collection(id) => ("collection", id),
        };
        write!(f, "{kind}:{locator}")
    }
}

pub fn file_key(directory: &str, name: &str, file_type: &str) -> String {
    let filename = format!("{name}.{file_type}");
    let path = if directory.is_empty() {
        filename
    } else {
        format!("{directory}/{filename}")
    };
    BundleNodeKey::file(&path)
        .unwrap_or_else(|error| panic!("Invalid file locator {path:?}: {error}"))
        .to_string()
}

pub fn folder_key(path: &str) -> String {
    BundleNodeKey::folder(path)
        .expect("validated folder locator")
        .to_string()
}

pub fn collection_key(id: &str) -> String {
    BundleNodeKey::collection(id)
        .expect("validated collection identity")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conforms_to_the_shared_key_grammar() {
        let cases: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../../shared_data/bundle-node-key-conformance.json"
        ))
        .unwrap();
        for value in cases["valid"].as_array().unwrap() {
            let encoded = value.as_str().unwrap();
            assert_eq!(BundleNodeKey::parse(encoded).unwrap().to_string(), encoded);
        }
        for value in cases["invalid"].as_array().unwrap() {
            let encoded = value.as_str().unwrap();
            assert!(
                BundleNodeKey::parse(encoded).is_err(),
                "accepted invalid key: {encoded}"
            );
        }
    }
}
