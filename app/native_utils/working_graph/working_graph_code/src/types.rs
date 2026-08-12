use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FileSiteNode {
    pub source_graph_subdirectory: String,
    pub site_node_name: String,
    pub file_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_node_id: Option<String>,
    #[serde(default)]
    pub is_sensitive: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub conf_outlinks_depth: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conf_inlinks_depth: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conf_is_blacklisted: Option<bool>,
}

impl FileSiteNode {
    pub fn site_node_key(&self) -> String {
        format!(
            "{}/{}.{}",
            self.source_graph_subdirectory, self.site_node_name, self.file_type
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TraversalDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlinks_depth_set_first_time: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlinks_depth_inherited: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outlinks_depth_overridden: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inlinks_depth_set_first_time: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inlinks_depth_inherited: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inlinks_depth_overridden: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_type: Option<LinkType>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LinkType {
    Start,
    Outlink,
    Inlink,
    Bidirectional,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkingNode {
    pub file: FileSiteNode,
    pub depth: i32,
    pub remaining_depth: i32,
    pub remaining_inlinks_depth: i32,
    pub path: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub traversal_details: Option<TraversalDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_frontier_node: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_frontier_image_extension: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub traversal_states: Option<Vec<TraversalStateSummary>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TraversalStateSummary {
    pub remaining_outlinks_depth: i32,
    pub remaining_inlinks_depth: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BasicEdge {
    pub source: FileSiteNode,
    pub target: FileSiteNode,
    pub is_bidirectional: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkingEdge {
    pub from: String,
    pub to: String,
    pub site_edge_kind: SiteEdgeKind,
    pub is_bidirectional: bool,
    pub is_traversal_only: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SiteEdgeKind {
    SemanticLink,
}

pub fn is_image_file_type(file_type: &str) -> bool {
    matches!(file_type, "png" | "jpg" | "jpeg" | "gif")
}
