use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TraversalFile {
    pub directory: String,
    pub title: String,
    pub file_type: String,
    #[serde(default)]
    pub is_sensitive: bool,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub conf_outlinks_depth: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conf_inlinks_depth: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conf_is_blacklisted: Option<bool>,
}

impl TraversalFile {
    pub fn ident(&self) -> String {
        format!("{}/{}.{}", self.directory, self.title, self.file_type)
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
pub struct WorkingPage {
    pub file: TraversalFile,
    pub depth: i32,
    pub remaining_depth: i32,
    pub remaining_inlinks_depth: i32,
    pub path: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub traversal_details: Option<TraversalDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_frontier_page: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_frontier_image_extension: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BasicEdge {
    pub source: TraversalFile,
    pub target: TraversalFile,
    pub is_bidirectional: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkingEdge {
    pub from: String,
    pub to: String,
    pub is_bidirectional: bool,
    pub is_traversal_only: bool,
}

pub fn is_image_file_type(file_type: &str) -> bool {
    matches!(file_type, "png" | "jpg" | "jpeg" | "gif")
}


