use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct SitePageConfigYaml {
    // Support both `pages:` (new) and `nodes:` (old) keys for backward compatibility
    #[serde(default)]
    pub pages: Option<Vec<SitePageConfigYamlPage>>,
    #[serde(default)]
    pub nodes: Option<Vec<SitePageConfigYamlPage>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SitePageConfigYamlPage {
    pub title: String,
    #[serde(default, rename = "sourceGraphSubdirectory")]
    pub source_graph_subdirectory: Option<String>,
    #[serde(default, rename = "fileType")]
    pub file_type: Option<String>,
    #[serde(rename = "listType")]
    pub list_type: String, // "blacklist" | "whitelist"
    #[serde(default, rename = "outlinksDepth")]
    pub outlinks_depth: Option<i32>,
    #[serde(default, rename = "inlinksDepth")]
    pub inlinks_depth: Option<i32>,
    #[serde(default)]
    pub tracked: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct SitePageConfig {
    pub title: String,
    pub source_graph_subdirectory: Option<String>,
    pub file_type: Option<String>,
    pub config: SitePageConfigConfig,
}

#[derive(Debug, Clone)]
pub struct SitePageConfigConfig {
    pub list_type: String, // "blacklist" | "whitelist"
    pub outlinks_depth: Option<i32>,
    pub inlinks_depth: Option<i32>,
    pub tracked: Option<bool>,
}

pub fn parse_site_page_config_yaml(yaml_content: &str) -> anyhow::Result<Vec<SitePageConfig>> {
    let parsed: SitePageConfigYaml = serde_yaml::from_str(yaml_content)?;
    // Support both `pages:` (new) and `nodes:` (old) keys for backward compatibility
    let items = parsed.pages.or(parsed.nodes).unwrap_or_default();
    let mut out = Vec::with_capacity(items.len());
    for n in items {
        out.push(SitePageConfig {
            title: n.title,
            source_graph_subdirectory: n.source_graph_subdirectory,
            file_type: n.file_type,
            config: SitePageConfigConfig {
                list_type: n.list_type,
                outlinks_depth: n.outlinks_depth,
                inlinks_depth: n.inlinks_depth,
                tracked: n.tracked,
            },
        });
    }
    Ok(out)
}

pub fn config_matches_page(config: &SitePageConfig, page_title: &str, source_graph_subdirectory: &str, file_type: &str) -> bool {
    let title_matches = config.title == page_title;
    let subdirectory_matches = config.source_graph_subdirectory.as_deref().unwrap_or("") == source_graph_subdirectory;
    let file_type_matches = config.file_type.as_deref().map(|ft| ft == file_type).unwrap_or(true);
    title_matches && subdirectory_matches && file_type_matches
}

pub fn find_matching_config<'a>(
    configs: &'a [SitePageConfig],
    page_title: &str,
    source_graph_subdirectory: &str,
    file_type: &str,
) -> Option<&'a SitePageConfig> {
    configs
        .iter()
        .find(|c| config_matches_page(c, page_title, source_graph_subdirectory, file_type))
}

