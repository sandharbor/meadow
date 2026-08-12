use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteNodeConfigYaml {
    pub nodes: Vec<SiteNodeConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiteNodeConfig {
    #[serde(rename = "siteNodeName")]
    pub site_node_name: String,
    #[serde(default, rename = "sourceGraphSubdirectory")]
    pub source_graph_subdirectory: Option<String>,
    #[serde(rename = "siteNodeKind")]
    pub site_node_kind: String,
    #[serde(rename = "fileType")]
    pub file_type: String,
    #[serde(rename = "siteNodeId")]
    pub site_node_id: String,
    #[serde(rename = "listType")]
    pub list_type: String,
    #[serde(default, rename = "outlinksDepth")]
    pub outlinks_depth: Option<i32>,
    #[serde(default, rename = "inlinksDepth")]
    pub inlinks_depth: Option<i32>,
}

impl SiteNodeConfig {
    pub fn site_node_key(&self) -> String {
        let directory = self.source_graph_subdirectory.as_deref().unwrap_or("");
        format!("{}/{}.{}", directory, self.site_node_name, self.file_type)
    }
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
    for (index, node) in parsed.nodes.iter().enumerate() {
        anyhow::ensure!(
            !node.site_node_name.trim().is_empty(),
            "record {} field 'siteNodeName': must be non-empty",
            index + 1
        );
        anyhow::ensure!(
            node.site_node_kind == "file",
            "record {} field 'siteNodeKind': must be exactly 'file'",
            index + 1
        );
        anyhow::ensure!(
            valid_file_types.contains(&node.file_type.as_str()),
            "record {} field 'fileType': invalid value",
            index + 1
        );
        anyhow::ensure!(
            node.site_node_id.len() == 12
                && node
                    .site_node_id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()),
            "record {} field 'siteNodeId': must match [a-z0-9]{{12}}",
            index + 1
        );
        anyhow::ensure!(
            node.list_type == "whitelist" || node.list_type == "blacklist",
            "record {} field 'listType': invalid value",
            index + 1
        );
        anyhow::ensure!(
            node.outlinks_depth.is_none_or(|depth| depth >= 0),
            "record {} field 'outlinksDepth': must be non-negative",
            index + 1
        );
        anyhow::ensure!(
            node.inlinks_depth.is_none_or(|depth| depth >= 0),
            "record {} field 'inlinksDepth': must be non-negative",
            index + 1
        );
        anyhow::ensure!(
            ids.insert(node.site_node_id.clone()),
            "record {} field 'siteNodeId': duplicate ID",
            index + 1
        );
        anyhow::ensure!(
            locators.insert(node.site_node_key()),
            "record {} field 'source locator': duplicate locator",
            index + 1
        );
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
        config.site_node_name == site_node_name
            && config.source_graph_subdirectory.as_deref().unwrap_or("")
                == source_graph_subdirectory
            && config.file_type == file_type
    })
}

pub fn find_config_by_id<'a>(
    configs: &'a [SiteNodeConfig],
    site_node_id: &str,
) -> Option<&'a SiteNodeConfig> {
    configs
        .iter()
        .find(|config| config.site_node_id == site_node_id)
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
        assert_eq!(nodes[0].site_node_id, "a1b2c3d4e5f6");
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
}
