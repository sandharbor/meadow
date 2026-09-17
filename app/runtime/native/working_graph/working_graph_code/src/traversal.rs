use crate::types::FileBundleNode;

#[derive(Debug, Clone)]
pub struct MultiSeed {
    pub file: FileBundleNode,
    pub outlinks_depth: i32,
    pub inlinks_depth: i32,
    pub structural_path: Vec<String>,
}
