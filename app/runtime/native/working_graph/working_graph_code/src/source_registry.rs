use crate::bundle_node_config::BundleNodeConfig;
use anyhow::{Context, Result};
use linkrange::{parse_source_locator, source_locator, FileInfo, Graph, IndexOptions, Source};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BundleSource {
    pub id: String,
    pub name: String,
    pub directory: PathBuf,
    #[serde(default)]
    pub aliases: Vec<String>,
}

pub struct SourceRegistry {
    pub sources: Option<Vec<BundleSource>>,
}

pub fn source_graph_path(id: &str, relative: &str) -> String {
    if relative.is_empty() {
        format!("_mw_sources/{id}")
    } else {
        format!("_mw_sources/{id}/{relative}")
    }
}

impl SourceRegistry {
    pub fn parse(json: Option<&str>) -> Result<Self> {
        let sources: Option<Vec<BundleSource>> = json.map(serde_json::from_str).transpose()?;
        if let Some(sources) = &sources {
            anyhow::ensure!(!sources.is_empty(), "At least one source is required");
            let mut ids = HashSet::new();
            for source in sources {
                anyhow::ensure!(
                    source.id.len() == 12
                        && source
                            .id
                            .bytes()
                            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
                    "Invalid source identity: {}",
                    source.id
                );
                anyhow::ensure!(
                    ids.insert(&source.id),
                    "Duplicate source identity: {}",
                    source.id
                );
            }
        }
        Ok(Self { sources })
    }

    pub fn open(&self, root: &Path, options: &IndexOptions) -> Result<Graph> {
        let sources = match &self.sources {
            None => vec![Source {
                name: "source".into(),
                directory: root.into(),
                aliases: Vec::new(),
            }],
            Some(sources) => sources
                .iter()
                .map(|source| Source {
                    name: source.name.clone(),
                    directory: source.directory.clone(),
                    aliases: source.aliases.clone(),
                })
                .collect(),
        };
        Graph::open(&sources, options)
    }

    pub fn project_configs(&self, configs: &mut [BundleNodeConfig]) -> Result<()> {
        for config in configs {
            if self.sources.is_some() && !matches!(config, BundleNodeConfig::Collection { .. }) {
                anyhow::ensure!(
                    config.source_id().is_some(),
                    "A source registry requires sourceId on file and folder configuration"
                );
            } else if self.sources.is_none() {
                anyhow::ensure!(
                    config.source_id().is_none(),
                    "sourceId requires a source registry"
                );
            }
            config.project_source_directory();
        }
        Ok(())
    }

    /// Convert canonical Linkrange paths to stable graph and captured-file identities.
    pub fn graph_path(&self, path: &str) -> Result<String> {
        let (name, relative) = parse_source_locator(path)?;
        let Some(sources) = &self.sources else {
            anyhow::ensure!(
                name == "source",
                "Linkrange returned an unknown canonical source"
            );
            return Ok(relative);
        };
        let source = sources
            .iter()
            .find(|source| source.name == name)
            .context("Linkrange returned an unknown canonical source")?;
        Ok(source_graph_path(&source.id, &relative))
    }

    pub fn project_file(&self, file: &FileInfo) -> Result<FileInfo> {
        Ok(FileInfo {
            directory: self.graph_path(&file.directory)?,
            ..file.clone()
        })
    }

    pub fn parts<'a>(&'a self, graph_path: &'a str) -> Option<(&'a BundleSource, &'a str)> {
        let sources = self.sources.as_ref()?;
        let path = graph_path.strip_prefix("_mw_sources/")?;
        let (id, relative) = path.split_once('/').unwrap_or((path, ""));
        sources
            .iter()
            .find(|source| source.id == id)
            .map(|source| (source, relative))
    }

    pub fn linkrange_path(&self, graph_path: &str) -> Option<String> {
        if self.sources.is_none() {
            return Some(source_locator("source", graph_path.trim_start_matches('/')));
        }
        self.parts(graph_path)
            .map(|(source, path)| source_locator(&source.name, path))
    }
}
