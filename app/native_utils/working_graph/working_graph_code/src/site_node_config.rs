use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteNodeConfigYaml {
    pub nodes: Vec<SiteNodeConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "siteNodeKind", deny_unknown_fields)]
pub enum SiteNodeConfig {
    #[serde(rename = "file")]
    File {
        #[serde(rename = "siteNodeName")]
        site_node_name: String,
        #[serde(default, rename = "sourceGraphSubdirectory")]
        source_graph_subdirectory: Option<String>,
        #[serde(rename = "fileType")]
        file_type: String,
        #[serde(rename = "siteNodeId")]
        site_node_id: String,
        #[serde(rename = "listType")]
        list_type: String,
        #[serde(default, rename = "outlinksDepth")]
        outlinks_depth: Option<i32>,
        #[serde(default, rename = "inlinksDepth")]
        inlinks_depth: Option<i32>,
    },
    #[serde(rename = "folder")]
    Folder {
        #[serde(rename = "siteNodeName")]
        site_node_name: String,
        #[serde(rename = "sourceGraphSubdirectory")]
        source_graph_subdirectory: String,
        #[serde(rename = "siteNodeId")]
        site_node_id: String,
        #[serde(rename = "listType")]
        list_type: String,
        #[serde(default, rename = "outlinksDepth")]
        outlinks_depth: Option<i32>,
        #[serde(default, rename = "inlinksDepth")]
        inlinks_depth: Option<i32>,
    },
    #[serde(rename = "collection")]
    Collection {
        #[serde(rename = "siteNodeName")]
        site_node_name: String,
        #[serde(rename = "siteNodeId")]
        site_node_id: String,
        #[serde(rename = "listType")]
        list_type: String,
        #[serde(rename = "memberSiteNodeIds")]
        member_site_node_ids: Vec<String>,
    },
}

impl SiteNodeConfig {
    pub fn file(
        site_node_name: String,
        source_graph_subdirectory: Option<String>,
        file_type: String,
        site_node_id: String,
        list_type: String,
        outlinks_depth: Option<i32>,
        inlinks_depth: Option<i32>,
    ) -> Self {
        Self::File {
            site_node_name,
            source_graph_subdirectory,
            file_type,
            site_node_id,
            list_type,
            outlinks_depth,
            inlinks_depth,
        }
    }

    pub fn site_node_name(&self) -> &str {
        match self {
            Self::File { site_node_name, .. }
            | Self::Folder { site_node_name, .. }
            | Self::Collection { site_node_name, .. } => site_node_name,
        }
    }

    pub fn site_node_id(&self) -> &str {
        match self {
            Self::File { site_node_id, .. }
            | Self::Folder { site_node_id, .. }
            | Self::Collection { site_node_id, .. } => site_node_id,
        }
    }

    pub fn list_type(&self) -> &str {
        match self {
            Self::File { list_type, .. }
            | Self::Folder { list_type, .. }
            | Self::Collection { list_type, .. } => list_type,
        }
    }

    pub fn source_graph_subdirectory(&self) -> Option<&str> {
        match self {
            Self::File {
                source_graph_subdirectory,
                ..
            } => source_graph_subdirectory.as_deref().or(Some("")),
            Self::Folder {
                source_graph_subdirectory,
                ..
            } => Some(source_graph_subdirectory),
            Self::Collection { .. } => None,
        }
    }

    pub fn file_type(&self) -> Option<&str> {
        match self {
            Self::File { file_type, .. } => Some(file_type),
            _ => None,
        }
    }

    pub fn outlinks_depth(&self) -> Option<i32> {
        match self {
            Self::File { outlinks_depth, .. } | Self::Folder { outlinks_depth, .. } => {
                *outlinks_depth
            }
            Self::Collection { .. } => None,
        }
    }

    pub fn inlinks_depth(&self) -> Option<i32> {
        match self {
            Self::File { inlinks_depth, .. } | Self::Folder { inlinks_depth, .. } => {
                *inlinks_depth
            }
            Self::Collection { .. } => None,
        }
    }

    pub fn member_site_node_ids(&self) -> Option<&[String]> {
        match self {
            Self::Collection {
                member_site_node_ids,
                ..
            } => Some(member_site_node_ids),
            _ => None,
        }
    }

    pub fn site_node_key(&self) -> String {
        match self {
            Self::File {
                site_node_name,
                source_graph_subdirectory,
                file_type,
                ..
            } => format!(
                "{}/{}.{}",
                source_graph_subdirectory.as_deref().unwrap_or(""),
                site_node_name,
                file_type
            ),
            Self::Folder {
                source_graph_subdirectory,
                ..
            } => format!("folder:{source_graph_subdirectory}"),
            Self::Collection { site_node_id, .. } => format!("collection:{site_node_id}"),
        }
    }

    fn logical_locator_key(&self) -> String {
        match self {
            Self::File {
                site_node_name,
                source_graph_subdirectory,
                file_type,
                ..
            } => format!(
                "{site_node_name}\0{}\0file\0{file_type}",
                source_graph_subdirectory.as_deref().unwrap_or("")
            ),
            Self::Folder {
                source_graph_subdirectory,
                ..
            } => format!("folder:{source_graph_subdirectory}"),
            Self::Collection { .. } => "collection".to_string(),
        }
    }
}

pub fn normalize_folder_source_graph_subdirectory(value: &str) -> anyhow::Result<String> {
    anyhow::ensure!(!value.contains('\\'), "must use '/' separators");
    anyhow::ensure!(
        !value.starts_with('/')
            && !(value.len() >= 3
                && value.as_bytes()[0].is_ascii_alphabetic()
                && value.as_bytes()[1] == b':'
                && value.as_bytes()[2] == b'/'),
        "must be relative"
    );
    let mut segments = Vec::new();
    for segment in value.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        anyhow::ensure!(segment != "..", "must not contain '..'");
        segments.push(segment);
    }
    Ok(segments.join("/"))
}

pub fn parse_site_node_config_yaml(yaml_content: &str) -> anyhow::Result<Vec<SiteNodeConfig>> {
    let parsed: SiteNodeConfigYaml = serde_yaml::from_str(yaml_content)?;
    let valid_file_types = [
        "md",
        "jpg",
        "jpeg",
        "png",
        "gif",
        "svg",
        "webp",
        "pdf",
        "txt",
        "excalidraw",
        "other",
    ];
    let mut ids = HashSet::new();
    let mut locators = HashSet::new();
    let by_id: HashMap<&str, &SiteNodeConfig> = parsed
        .nodes
        .iter()
        .map(|node| (node.site_node_id(), node))
        .collect();
    let collection_count = parsed
        .nodes
        .iter()
        .filter(|node| matches!(node, SiteNodeConfig::Collection { .. }))
        .count();
    anyhow::ensure!(collection_count <= 1, "only one collection is permitted");

    for (index, node) in parsed.nodes.iter().enumerate() {
        anyhow::ensure!(
            !node.site_node_name().trim().is_empty(),
            "record {} field 'siteNodeName': must be non-empty",
            index + 1
        );
        if let SiteNodeConfig::File { file_type, .. } = node {
            anyhow::ensure!(
                valid_file_types.contains(&file_type.as_str()),
                "record {} field 'fileType': invalid value",
                index + 1
            );
        }
        if let SiteNodeConfig::Folder {
            site_node_name,
            source_graph_subdirectory,
            ..
        } = node
        {
            let normalized = normalize_folder_source_graph_subdirectory(source_graph_subdirectory)
                .map_err(|error| anyhow::anyhow!(
                    "record {} field 'sourceGraphSubdirectory': {}",
                    index + 1,
                    error
                ))?;
            anyhow::ensure!(
                normalized == *source_graph_subdirectory,
                "record {} field 'sourceGraphSubdirectory': must be normalized as '{}'",
                index + 1,
                normalized
            );
            if !normalized.is_empty() {
                anyhow::ensure!(
                    normalized.rsplit('/').next() == Some(site_node_name),
                    "record {} field 'siteNodeName': must equal the folder basename",
                    index + 1
                );
            }
        }
        anyhow::ensure!(
            node.site_node_id().len() == 12
                && node
                    .site_node_id()
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
            "record {} field 'siteNodeId': must match [a-z0-9]{{12}}",
            index + 1
        );
        anyhow::ensure!(
            node.list_type() == "whitelist" || node.list_type() == "blacklist",
            "record {} field 'listType': invalid value",
            index + 1
        );
        anyhow::ensure!(
            node.outlinks_depth().is_none_or(|depth| depth >= 0),
            "record {} field 'outlinksDepth': must be non-negative",
            index + 1
        );
        anyhow::ensure!(
            node.inlinks_depth().is_none_or(|depth| depth >= 0),
            "record {} field 'inlinksDepth': must be non-negative",
            index + 1
        );
        anyhow::ensure!(
            ids.insert(node.site_node_id().to_string()),
            "record {} field 'siteNodeId': duplicate ID",
            index + 1
        );
        anyhow::ensure!(
            locators.insert(node.logical_locator_key()),
            "record {} field 'source locator': duplicate locator",
            index + 1
        );
        if let SiteNodeConfig::Collection {
            list_type,
            member_site_node_ids,
            ..
        } = node
        {
            anyhow::ensure!(list_type == "whitelist", "collection nodes must be whitelisted");
            anyhow::ensure!(
                member_site_node_ids.len() >= 2,
                "collection memberSiteNodeIds must contain at least two IDs"
            );
            let mut members = HashSet::new();
            for member_id in member_site_node_ids {
                anyhow::ensure!(members.insert(member_id), "collection member IDs must be unique");
                let member = by_id.get(member_id.as_str()).ok_or_else(|| {
                    anyhow::anyhow!("collection memberSiteNodeId does not resolve: {member_id}")
                })?;
                anyhow::ensure!(
                    matches!(member, SiteNodeConfig::Folder { .. })
                        && member.list_type() == "whitelist",
                    "collection member must resolve to a whitelisted folder: {member_id}"
                );
            }
        }
    }
    Ok(parsed.nodes)
}

pub fn find_matching_config<'a>(
    configs: &'a [SiteNodeConfig],
    site_node_name: &str,
    source_graph_subdirectory: &str,
    file_type: &str,
) -> Option<&'a SiteNodeConfig> {
    configs.iter().find(|config| {
        matches!(config, SiteNodeConfig::File { .. })
            && config.site_node_name() == site_node_name
            && config.source_graph_subdirectory().unwrap_or("") == source_graph_subdirectory
            && config.file_type() == Some(file_type)
    })
}

pub fn find_config_by_id<'a>(
    configs: &'a [SiteNodeConfig],
    site_node_id: &str,
) -> Option<&'a SiteNodeConfig> {
    configs
        .iter()
        .find(|config| config.site_node_id() == site_node_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANONICAL: &str = r#"
nodes:
  - siteNodeName: Example
    sourceGraphSubdirectory: Projects
    siteNodeKind: file
    fileType: md
    siteNodeId: a1b2c3d4e5f6
    listType: whitelist
    outlinksDepth: 3
    inlinksDepth: 1
"#;

    #[test]
    fn parses_canonical_file_node_configuration() {
        let nodes = parse_site_node_config_yaml(CANONICAL).expect("canonical config parses");
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].site_node_key(), "Projects/Example.md");
        assert_eq!(nodes[0].site_node_id(), "a1b2c3d4e5f6");
    }

    #[test]
    fn rejects_unknown_legacy_fields() {
        let legacy = CANONICAL.replace("    listType: whitelist", "    listType: whitelist\n    tracked: true");
        let error = parse_site_node_config_yaml(&legacy).expect_err("legacy field must fail");
        assert!(error.to_string().contains("unknown field `tracked`"));
    }

    #[test]
    fn rejects_duplicate_ids_and_locators() {
        let duplicate_id = CANONICAL.replace(
            "nodes:\n",
            "nodes:\n  - siteNodeName: Other\n    siteNodeKind: file\n    fileType: md\n    siteNodeId: a1b2c3d4e5f6\n    listType: whitelist\n",
        );
        assert!(parse_site_node_config_yaml(&duplicate_id)
            .expect_err("duplicate ID must fail")
            .to_string()
            .contains("duplicate ID"));

        let duplicate_locator = CANONICAL.replace(
            "nodes:\n",
            "nodes:\n  - siteNodeName: Example\n    sourceGraphSubdirectory: Projects\n    siteNodeKind: file\n    fileType: md\n    siteNodeId: b1b2c3d4e5f6\n    listType: blacklist\n",
        );
        assert!(parse_site_node_config_yaml(&duplicate_locator)
            .expect_err("duplicate locator must fail")
            .to_string()
            .contains("duplicate locator"));
    }

    #[test]
    fn parses_folder_and_collection_variants_with_kind_aware_keys() {
        let yaml = r#"
nodes:
  - siteNodeName: Projects
    sourceGraphSubdirectory: Projects
    siteNodeKind: folder
    siteNodeId: f1b2c3d4e5f6
    listType: whitelist
    outlinksDepth: 1
    inlinksDepth: 0
  - siteNodeName: Research
    siteNodeKind: collection
    siteNodeId: c1b2c3d4e5f6
    listType: whitelist
    memberSiteNodeIds:
      - f1b2c3d4e5f6
      - g1b2c3d4e5f6
  - siteNodeName: Writing
    sourceGraphSubdirectory: Writing
    siteNodeKind: folder
    siteNodeId: g1b2c3d4e5f6
    listType: whitelist
"#;
        let nodes = parse_site_node_config_yaml(yaml).expect("folder-derived config parses");
        assert_eq!(nodes[0].site_node_key(), "folder:Projects");
        assert_eq!(nodes[1].site_node_key(), "collection:c1b2c3d4e5f6");
        assert_eq!(
            nodes[1].member_site_node_ids().unwrap(),
            &["f1b2c3d4e5f6", "g1b2c3d4e5f6"]
        );
    }

    #[test]
    fn rejects_invalid_folder_locators_and_collection_members() {
        let invalid_folder = r#"
nodes:
  - siteNodeName: Projects
    sourceGraphSubdirectory: ../Projects
    siteNodeKind: folder
    siteNodeId: f1b2c3d4e5f6
    listType: whitelist
"#;
        assert!(parse_site_node_config_yaml(invalid_folder)
            .expect_err("escaping folder locator must fail")
            .to_string()
            .contains("must not contain '..'"));

        let invalid_collection = r#"
nodes:
  - siteNodeName: Projects
    sourceGraphSubdirectory: Projects
    siteNodeKind: folder
    siteNodeId: f1b2c3d4e5f6
    listType: whitelist
  - siteNodeName: Research
    siteNodeKind: collection
    siteNodeId: c1b2c3d4e5f6
    listType: whitelist
    memberSiteNodeIds:
      - f1b2c3d4e5f6
      - missing00000
"#;
        assert!(parse_site_node_config_yaml(invalid_collection)
            .expect_err("missing collection member must fail")
            .to_string()
            .contains("does not resolve"));
    }
}
