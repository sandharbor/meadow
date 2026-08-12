use crate::site_node_config::SiteNodeConfig;
use crate::traversal::MultiSeed;
use crate::types::FileSiteNode;
use std::collections::{HashMap, HashSet, VecDeque};

const HARD_EXCLUDED_DIRECTORY_NAMES: &[&str] = &[".git", ".meadow", "_meadow"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StructuralEdge {
    pub source: String,
    pub target: String,
    pub site_edge_kind: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FolderScopeNode {
    pub site_node_key: String,
    pub site_node_id: Option<String>,
    pub site_node_kind: &'static str,
    pub site_node_name: String,
    pub source_graph_subdirectory: Option<String>,
    pub member_site_node_ids: Option<Vec<String>>,
    pub effective_blacklisting_site_node_id: Option<String>,
    pub effective_folder_policy_site_node_id: Option<String>,
    pub path: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct FolderScopeProjection {
    pub selected_roots: Vec<String>,
    pub structural_nodes: Vec<FolderScopeNode>,
    pub structural_edges: Vec<StructuralEdge>,
    pub seeds: Vec<MultiSeed>,
    pub contained_file_keys: HashSet<String>,
    pub blocked_file_keys: HashSet<String>,
    pub missing_selected_roots: Vec<String>,
    pub effective_policy_site_node_ids: HashMap<String, String>,
}

fn is_same_or_descendant(locator: &str, ancestor: &str) -> bool {
    ancestor.is_empty() || locator == ancestor || locator.starts_with(&format!("{ancestor}/"))
}

fn relative_segments<'a>(locator: &'a str, root: &str) -> impl Iterator<Item = &'a str> {
    let relative = if root.is_empty() {
        locator
    } else {
        locator
            .strip_prefix(root)
            .unwrap_or(locator)
            .trim_start_matches('/')
    };
    relative.split('/').filter(|segment| !segment.is_empty())
}

fn is_allowed_below_selected_root(locator: &str, root: &str) -> bool {
    if !is_same_or_descendant(locator, root) {
        return false;
    }
    let all_segments = locator.split('/').filter(|segment| !segment.is_empty());
    if all_segments
        .clone()
        .any(|segment| HARD_EXCLUDED_DIRECTORY_NAMES.contains(&segment))
    {
        return false;
    }
    !relative_segments(locator, root).any(|segment| segment.starts_with('.'))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScopePathClassification {
    Included,
    OutsideScope,
    HiddenDescendant,
    HardExcluded,
}

pub fn classify_directory_for_selected_roots(
    locator: &str,
    roots: &[String],
) -> ScopePathClassification {
    let matching_roots: Vec<&String> = roots
        .iter()
        .filter(|root| is_same_or_descendant(locator, root))
        .collect();
    if matching_roots.is_empty() {
        return ScopePathClassification::OutsideScope;
    }
    if locator
        .split('/')
        .filter(|segment| !segment.is_empty())
        .any(|segment| HARD_EXCLUDED_DIRECTORY_NAMES.contains(&segment))
    {
        return ScopePathClassification::HardExcluded;
    }
    if matching_roots
        .iter()
        .any(|root| is_allowed_below_selected_root(locator, root))
    {
        ScopePathClassification::Included
    } else {
        ScopePathClassification::HiddenDescendant
    }
}

fn selected_root_indexes_for_locator(locator: &str, roots: &[String]) -> Vec<usize> {
    roots
        .iter()
        .enumerate()
        .filter_map(|(index, root)| {
            is_allowed_below_selected_root(locator, root).then_some(index)
        })
        .collect()
}

fn folder_config_at<'a>(
    configs: &'a [SiteNodeConfig],
    locator: &str,
) -> Option<&'a SiteNodeConfig> {
    configs.iter().find(|config| {
        matches!(config, SiteNodeConfig::Folder { .. })
            && config.source_graph_subdirectory() == Some(locator)
    })
}

fn selected_folder_configs<'a>(
    configs: &'a [SiteNodeConfig],
    entry_site_node_id: &str,
) -> anyhow::Result<(Option<&'a SiteNodeConfig>, Vec<&'a SiteNodeConfig>)> {
    let entry = configs
        .iter()
        .find(|config| config.site_node_id() == entry_site_node_id)
        .ok_or_else(|| anyhow::anyhow!("entrySiteNodeId does not resolve: {entry_site_node_id}"))?;
    match entry {
        SiteNodeConfig::Folder { .. } => Ok((None, vec![entry])),
        SiteNodeConfig::Collection {
            member_site_node_ids,
            ..
        } => {
            let members = member_site_node_ids
                .iter()
                .map(|member_id| {
                    configs
                        .iter()
                        .find(|config| config.site_node_id() == member_id)
                        .ok_or_else(|| anyhow::anyhow!("collection member does not resolve: {member_id}"))
                })
                .collect::<anyhow::Result<Vec<_>>>()?;
            Ok((Some(entry), members))
        }
        SiteNodeConfig::File { .. } => {
            anyhow::bail!("folder scope requires a folder or collection entry")
        }
    }
}

fn materialize_chain(folders: &mut HashSet<String>, root: &str, descendant: &str) {
    folders.insert(root.to_string());
    if descendant == root {
        return;
    }
    let relative = if root.is_empty() {
        descendant
    } else {
        descendant
            .strip_prefix(root)
            .unwrap_or(descendant)
            .trim_start_matches('/')
    };
    let mut current = root.to_string();
    for segment in relative.split('/').filter(|segment| !segment.is_empty()) {
        current = if current.is_empty() {
            segment.to_string()
        } else {
            format!("{current}/{segment}")
        };
        folders.insert(current.clone());
    }
}

fn most_specific_folder_config<'a>(
    configs: &'a [SiteNodeConfig],
    locator: &str,
) -> Option<&'a SiteNodeConfig> {
    configs
        .iter()
        .filter(|config| {
            matches!(config, SiteNodeConfig::Folder { .. })
                && config
                    .source_graph_subdirectory()
                    .is_some_and(|folder| is_same_or_descendant(locator, folder))
        })
        .max_by(|a, b| {
            a.source_graph_subdirectory()
                .unwrap_or("")
                .len()
                .cmp(&b.source_graph_subdirectory().unwrap_or("").len())
                .then_with(|| b.site_node_key().cmp(&a.site_node_key()))
        })
}

fn nearest_blacklisted_folder<'a>(
    configs: &'a [SiteNodeConfig],
    locator: &str,
) -> Option<&'a SiteNodeConfig> {
    configs
        .iter()
        .filter(|config| {
            matches!(config, SiteNodeConfig::Folder { .. })
                && config.list_type() == "blacklist"
                && config
                    .source_graph_subdirectory()
                    .is_some_and(|folder| is_same_or_descendant(locator, folder))
        })
        .max_by_key(|config| config.source_graph_subdirectory().unwrap_or("").len())
}

fn parent_folder(locator: &str, materialized: &HashSet<String>) -> Option<String> {
    if locator.is_empty() {
        return None;
    }
    let mut candidate = locator.rsplit_once('/').map_or("", |(parent, _)| parent);
    loop {
        if materialized.contains(candidate) {
            return Some(candidate.to_string());
        }
        if candidate.is_empty() {
            return None;
        }
        candidate = candidate.rsplit_once('/').map_or("", |(parent, _)| parent);
    }
}

pub fn build_folder_scope_projection(
    configs: &[SiteNodeConfig],
    entry_site_node_id: &str,
    supported_files: &[FileSiteNode],
    existing_directories: &HashSet<String>,
    default_outlinks_depth: i32,
    default_inlinks_depth: i32,
) -> anyhow::Result<FolderScopeProjection> {
    let (collection, selected_configs) =
        selected_folder_configs(configs, entry_site_node_id)?;
    let selected_roots: Vec<String> = selected_configs
        .iter()
        .map(|config| config.source_graph_subdirectory().unwrap_or("").to_string())
        .collect();
    let missing_selected_roots: Vec<String> = selected_roots
        .iter()
        .filter(|root| !existing_directories.contains(root.as_str()))
        .cloned()
        .collect();

    let mut materialized_folders: HashSet<String> = HashSet::new();
    for root in &selected_roots {
        materialized_folders.insert(root.clone());
    }

    for config in configs.iter().filter(|config| matches!(config, SiteNodeConfig::Folder { .. })) {
        let locator = config.source_graph_subdirectory().unwrap_or("");
        for root_index in selected_root_indexes_for_locator(locator, &selected_roots) {
            if existing_directories.contains(locator) {
                materialize_chain(&mut materialized_folders, &selected_roots[root_index], locator);
            }
        }
    }

    let mut contained_files: Vec<FileSiteNode> = supported_files
        .iter()
        .filter(|file| {
            !selected_root_indexes_for_locator(
                &file.source_graph_subdirectory,
                &selected_roots,
            )
            .is_empty()
        })
        .cloned()
        .collect();
    contained_files.sort_by_key(|file| file.site_node_key());
    contained_files.dedup_by_key(|file| file.site_node_key());
    for file in &contained_files {
        for root_index in selected_root_indexes_for_locator(
            &file.source_graph_subdirectory,
            &selected_roots,
        ) {
            materialize_chain(
                &mut materialized_folders,
                &selected_roots[root_index],
                &file.source_graph_subdirectory,
            );
        }
    }

    let mut containment_edges = Vec::new();
    let mut folder_locators: Vec<String> = materialized_folders.iter().cloned().collect();
    folder_locators.sort();
    for locator in &folder_locators {
        if let Some(parent) = parent_folder(locator, &materialized_folders) {
            containment_edges.push(StructuralEdge {
                source: format!("folder:{parent}"),
                target: format!("folder:{locator}"),
                site_edge_kind: "directoryContainment",
            });
        }
    }
    for file in &contained_files {
        containment_edges.push(StructuralEdge {
            source: format!("folder:{}", file.source_graph_subdirectory),
            target: file.site_node_key(),
            site_edge_kind: "directoryContainment",
        });
    }
    containment_edges.sort_by(|a, b| {
        a.source
            .cmp(&b.source)
            .then_with(|| a.target.cmp(&b.target))
    });
    containment_edges.dedup();
    let mut structural_edges = Vec::new();
    if let Some(collection) = collection {
        for selected in &selected_configs {
            structural_edges.push(StructuralEdge {
                source: collection.site_node_key(),
                target: selected.site_node_key(),
                site_edge_kind: "collectionMembership",
            });
        }
    }
    structural_edges.extend(containment_edges);

    let entry_key = collection
        .map(SiteNodeConfig::site_node_key)
        .unwrap_or_else(|| selected_configs[0].site_node_key());
    let mut paths: HashMap<String, Vec<String>> = HashMap::from([(entry_key.clone(), vec![entry_key])]);
    let mut queue: VecDeque<String> = paths.keys().cloned().collect();
    while let Some(source) = queue.pop_front() {
        let source_path = paths.get(&source).cloned().unwrap_or_default();
        for edge in structural_edges.iter().filter(|edge| edge.source == source) {
            let mut candidate = source_path.clone();
            candidate.push(edge.target.clone());
            let should_replace = paths.get(&edge.target).is_none_or(|existing| {
                candidate.len() < existing.len()
                    || (candidate.len() == existing.len() && candidate < *existing)
            });
            if should_replace {
                paths.insert(edge.target.clone(), candidate);
                queue.push_back(edge.target.clone());
            }
        }
    }

    let mut structural_nodes = Vec::new();
    if let Some(collection) = collection {
        structural_nodes.push(FolderScopeNode {
            site_node_key: collection.site_node_key(),
            site_node_id: Some(collection.site_node_id().to_string()),
            site_node_kind: "collection",
            site_node_name: collection.site_node_name().to_string(),
            source_graph_subdirectory: None,
            member_site_node_ids: collection.member_site_node_ids().map(<[String]>::to_vec),
            effective_blacklisting_site_node_id: None,
            effective_folder_policy_site_node_id: None,
            path: paths.get(&collection.site_node_key()).cloned().unwrap_or_default(),
        });
    }
    for locator in &folder_locators {
        let config = folder_config_at(configs, locator);
        let blacklist = nearest_blacklisted_folder(configs, locator);
        let policy = most_specific_folder_config(configs, locator);
        structural_nodes.push(FolderScopeNode {
            site_node_key: format!("folder:{locator}"),
            site_node_id: config.map(|config| config.site_node_id().to_string()),
            site_node_kind: "folder",
            site_node_name: config
                .map(|config| config.site_node_name().to_string())
                .unwrap_or_else(|| locator.rsplit('/').next().unwrap_or(locator).to_string()),
            source_graph_subdirectory: Some(locator.clone()),
            member_site_node_ids: None,
            effective_blacklisting_site_node_id: blacklist
                .map(|config| config.site_node_id().to_string()),
            effective_folder_policy_site_node_id: policy
                .map(|config| config.site_node_id().to_string()),
            path: paths
                .get(&format!("folder:{locator}"))
                .cloned()
                .unwrap_or_default(),
        });
    }
    structural_nodes.sort_by(|a, b| a.site_node_key.cmp(&b.site_node_key));

    let mut seeds = Vec::new();
    let mut blocked_file_keys = HashSet::new();
    let mut contained_file_keys = HashSet::new();
    let mut effective_policy_site_node_ids = HashMap::new();
    for file in contained_files {
        let key = file.site_node_key();
        contained_file_keys.insert(key.clone());
        if nearest_blacklisted_folder(configs, &file.source_graph_subdirectory).is_some() {
            blocked_file_keys.insert(key.clone());
        }
        let policy = most_specific_folder_config(configs, &file.source_graph_subdirectory);
        if let Some(policy) = policy {
            effective_policy_site_node_ids.insert(key.clone(), policy.site_node_id().to_string());
        }
        seeds.push(MultiSeed {
            structural_path: paths.get(&key).cloned().unwrap_or_else(|| vec![key.clone()]),
            file,
            outlinks_depth: policy
                .and_then(SiteNodeConfig::outlinks_depth)
                .unwrap_or(default_outlinks_depth),
            inlinks_depth: policy
                .and_then(SiteNodeConfig::inlinks_depth)
                .unwrap_or(default_inlinks_depth),
        });
    }

    Ok(FolderScopeProjection {
        selected_roots,
        structural_nodes,
        structural_edges,
        seeds,
        contained_file_keys,
        blocked_file_keys,
        missing_selected_roots,
        effective_policy_site_node_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(directory: &str, name: &str) -> FileSiteNode {
        FileSiteNode {
            source_graph_subdirectory: directory.to_string(),
            site_node_name: name.to_string(),
            file_type: "md".to_string(),
            site_node_id: None,
            is_sensitive: false,
            conf_outlinks_depth: None,
            conf_inlinks_depth: None,
            conf_is_blacklisted: None,
        }
    }

    fn folder(name: &str, locator: &str, id: &str, list_type: &str) -> SiteNodeConfig {
        SiteNodeConfig::Folder {
            site_node_name: name.to_string(),
            source_graph_subdirectory: locator.to_string(),
            site_node_id: id.to_string(),
            list_type: list_type.to_string(),
            outlinks_depth: None,
            inlinks_depth: None,
        }
    }

    #[test]
    fn recursively_materializes_required_folders_and_deduplicates_overlapping_roots() {
        let configs = vec![
            folder("Projects", "Projects", "p1b2c3d4e5f6", "whitelist"),
            folder("Sub", "Projects/Sub", "s1b2c3d4e5f6", "whitelist"),
            SiteNodeConfig::Collection {
                site_node_name: "Research".to_string(),
                site_node_id: "c1b2c3d4e5f6".to_string(),
                list_type: "whitelist".to_string(),
                member_site_node_ids: vec![
                    "p1b2c3d4e5f6".to_string(),
                    "s1b2c3d4e5f6".to_string(),
                ],
            },
        ];
        let directories = HashSet::from([
            "Projects".to_string(),
            "Projects/Sub".to_string(),
            "Projects/Sub/Deep".to_string(),
        ]);
        let projection = build_folder_scope_projection(
            &configs,
            "c1b2c3d4e5f6",
            &[file("Projects/Sub/Deep", "Note")],
            &directories,
            1,
            0,
        )
        .unwrap();
        assert_eq!(projection.seeds.len(), 1);
        assert_eq!(projection.contained_file_keys.len(), 1);
        assert!(projection
            .structural_nodes
            .iter()
            .any(|node| node.site_node_key == "folder:Projects/Sub/Deep" && node.site_node_id.is_none()));
        assert!(projection.structural_edges.iter().any(|edge| {
            edge.source == "collection:c1b2c3d4e5f6"
                && edge.target == "folder:Projects/Sub"
                && edge.site_edge_kind == "collectionMembership"
        }));
    }

    #[test]
    fn hidden_descendants_are_skipped_but_an_explicit_hidden_root_is_admitted() {
        let hidden_file = file(".private/notes", "Secret");
        let all_directories = HashSet::from([
            "".to_string(),
            ".private".to_string(),
            ".private/notes".to_string(),
        ]);
        let root_projection = build_folder_scope_projection(
            &[folder("vault", "", "r1b2c3d4e5f6", "whitelist")],
            "r1b2c3d4e5f6",
            std::slice::from_ref(&hidden_file),
            &all_directories,
            1,
            0,
        )
        .unwrap();
        assert!(root_projection.seeds.is_empty());

        let hidden_projection = build_folder_scope_projection(
            &[folder(".private", ".private", "h1b2c3d4e5f6", "whitelist")],
            "h1b2c3d4e5f6",
            &[hidden_file],
            &all_directories,
            1,
            0,
        )
        .unwrap();
        assert_eq!(hidden_projection.seeds.len(), 1);
    }

    #[test]
    fn deepest_folder_policy_wins_and_blacklist_is_a_hard_seed_boundary() {
        let mut selected = folder("Projects", "Projects", "p1b2c3d4e5f6", "whitelist");
        if let SiteNodeConfig::Folder { outlinks_depth, .. } = &mut selected {
            *outlinks_depth = Some(2);
        }
        let mut nested = folder("Blocked", "Projects/Blocked", "b1b2c3d4e5f6", "blacklist");
        if let SiteNodeConfig::Folder { outlinks_depth, inlinks_depth, .. } = &mut nested {
            *outlinks_depth = Some(9);
            *inlinks_depth = Some(3);
        }
        let directories = HashSet::from([
            "Projects".to_string(),
            "Projects/Blocked".to_string(),
        ]);
        let projection = build_folder_scope_projection(
            &[selected, nested],
            "p1b2c3d4e5f6",
            &[file("Projects/Blocked", "Note")],
            &directories,
            1,
            0,
        )
        .unwrap();
        assert_eq!(projection.seeds[0].outlinks_depth, 9);
        assert_eq!(projection.seeds[0].inlinks_depth, 3);
        assert!(projection
            .blocked_file_keys
            .contains(&projection.seeds[0].file.site_node_key()));
    }
}
