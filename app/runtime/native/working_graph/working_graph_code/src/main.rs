use anyhow::Context;
use clap::Parser;
use linkrange::links::AnchorType as LibAnchorType;
use linkrange::{Depths, FileInfo, FrontmatterField, Inclusion, IndexOptions, Query, Rule, Start};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;
use working_graph::bundle_node_config::{
    find_config_by_id, parse_bundle_node_config_yaml, BundleNodeConfig,
};
use working_graph::folder_scope::{
    build_folder_scope_projection, classify_directory_for_selected_roots, ScopePathClassification,
};
use working_graph::source_registry::SourceRegistry;
use working_graph::types::{FileBundleNode, LinkType, TraversalDetails, TraversalStateSummary};

#[derive(Serialize, Clone)]
struct SourceFile {
    path: String,
    digest: String,
    size: u64,
}
#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Args {
    #[arg(long)]
    graph_root: PathBuf,
    /// Bundle source registry JSON, including stable IDs and authored names/aliases.
    #[arg(long)]
    sources: Option<String>,

    /// Parent directory for disposable source indexes (normally Meadow Home/cache/source-index).
    #[arg(long)]
    source_index_root: Option<PathBuf>,

    /// Reread every source file and atomically replace the persistent index.
    #[arg(long)]
    rebuild_index: bool,

    #[arg(long)]
    bundle_node_config: PathBuf,

    #[arg(long)]
    entry_bundle_node_id: String,

    #[arg(long)]
    default_traversal_bundle_node_id: String,

    #[arg(long)]
    default_outlinks_depth: Option<i32>,

    #[arg(long)]
    default_inlinks_depth: Option<i32>,

    #[arg(long, default_value_t = 0)]
    frontier_depth: i32,

    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    allow_images_to_extend_to_frontier: bool,

    #[arg(long, default_value_t = false)]
    allow_lower_depths: bool,
}

#[allow(non_snake_case)]
#[derive(Serialize)]
struct OutputNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    sourceId: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sourceFile: Option<SourceFile>,
    bundleNodeKey: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    bundleNodeId: Option<String>,
    bundleNodeKind: &'static str,
    bundleNodeName: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sourceGraphSubdirectory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fileType: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    memberBundleNodeIds: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    effectiveBlacklistingBundleNodeId: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    effectiveFolderPolicyBundleNodeId: Option<String>,
    depth: i32,
    remaining_depth: i32,
    remaining_inlinks_depth: i32,
    path: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    traversal_details: Option<TraversalDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    traversal_path_steps: Option<Vec<OutputTraversalStep>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    traversal_alternative_routes: Vec<Vec<OutputTraversalStep>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isFrontierNode: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isFrontierImageExtension: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    traversal_states: Option<Vec<TraversalStateSummary>>,
    is_sensitive: bool,
}

#[derive(Serialize)]
struct OutputTraversalStep {
    #[serde(rename = "bundleNodeKey")]
    bundle_node_key: String,
    depth: i32,
    remaining_depth: i32,
    remaining_inlinks_depth: i32,
    #[serde(
        rename = "retainedForTraversal",
        skip_serializing_if = "Option::is_none"
    )]
    retained_for_traversal: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    traversal_details: Option<TraversalDetails>,
    #[serde(rename = "isFrontierImageExtension")]
    is_frontier_image_extension: bool,
}

fn route_step(
    step: &linkrange::RouteStep,
    query: &Query,
    logical_path: &impl Fn(&str) -> String,
) -> OutputTraversalStep {
    let initial = step.inherited.is_none();
    let depths = query
        .starts
        .iter()
        .find(|start| start.path == step.path)
        .and_then(|start| start.depths.as_ref())
        .unwrap_or(&query.depths);
    OutputTraversalStep {
        bundle_node_key: logical_path(&step.path),
        depth: step.depth as i32,
        remaining_depth: step.remaining_outlinks as i32,
        remaining_inlinks_depth: step.remaining_inlinks as i32,
        retained_for_traversal: step.retained_for_traversal,
        traversal_details: Some(TraversalDetails {
            outlinks_depth_set_first_time: initial.then_some(depths.outlinks as i32),
            outlinks_depth_inherited: step
                .inherited
                .as_ref()
                .map(|state| state.remaining_outlinks as i32),
            outlinks_depth_overridden: step.overridden_outlinks.map(|n| n as i32),
            inlinks_depth_set_first_time: initial.then_some(depths.inlinks as i32),
            inlinks_depth_inherited: step
                .inherited
                .as_ref()
                .map(|state| state.remaining_inlinks as i32),
            inlinks_depth_overridden: step.overridden_inlinks.map(|n| n as i32),
            link_type: Some(match step.via.as_str() {
                "start" => LinkType::Start,
                "inlink" => LinkType::Inlink,
                _ => LinkType::Outlink,
            }),
        }),
        is_frontier_image_extension: step.inclusion == Inclusion::EmbeddedAsset,
    }
}

#[allow(non_snake_case)]
#[derive(Serialize, Clone)]
struct OutputEdge {
    source: String,
    target: String,
    bundleEdgeKind: &'static str,
    isBidirectional: bool,
    link_source_page_path: String,
    link_original_text: String,
    link_parsed_directory: String,
    link_parsed_title: String,
    link_parsed_file_type: String,
    link_parsed_anchor: Option<String>,
    link_parsed_anchor_type: Option<LibAnchorType>,
    link_parsed_alias: Option<String>,
    link_parsed_media_size: Option<u32>,
    link_resolved_target_directory: String,
    link_resolved_target_path: String,
}

#[allow(non_snake_case)]
#[derive(Serialize)]
struct OutputGraph {
    nodes: Vec<OutputNode>,
    edges: Vec<OutputEdge>,
    allLinkResolutionMaps: HashMap<String, HashMap<String, LinkResolvedInfo>>,
    allInlinkSources: HashMap<String, Vec<String>>,
    allOutlinkTargets: HashMap<String, Vec<String>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    sourceDiagnostics: Vec<linkrange::Diagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    folderScope: Option<FolderScopeReport>,
}

#[allow(non_snake_case)]
#[derive(Debug, Clone, Serialize)]
struct FolderScopeReport {
    normalizedSelectedFolders: Vec<String>,
    supportedSeedFileCount: usize,
    requiredRawFolderNodeCount: usize,
    skippedCounts: HashMap<String, usize>,
    skippedPaths: Vec<SkippedPath>,
    skippedPathCount: usize,
    predictedRawNodeCount: usize,
    predictedTypedEdgeCount: usize,
}

#[derive(Debug, Clone, Serialize)]
struct SkippedPath {
    path: String,
    reason: &'static str,
}

#[derive(Serialize, Clone)]
struct LinkResolvedInfo {
    link_resolved_target_directory: String,
    link_resolved_target_path: Option<String>,
}

fn is_nodespec_sidecar(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().ends_with(".nodespec.yaml"))
}
fn is_supported_source_extension(extension: &str) -> bool {
    matches!(
        extension,
        "md" | "html"
            | "css"
            | "js"
            | "pdf"
            | "jpg"
            | "jpeg"
            | "png"
            | "gif"
            | "svg"
            | "webp"
            | "excalidraw"
    )
}
fn logical(file: &FileInfo) -> String {
    format!("{}/{}.{}", file.directory, file.title, file.format)
}
fn sensitive(file: &FileInfo) -> bool {
    file.metadata
        .get("meadow-sensitive")
        .and_then(serde_json::Value::as_bool)
        == Some(true)
}
fn configured_file(file: &FileInfo) -> FileBundleNode {
    FileBundleNode {
        source_graph_subdirectory: file.directory.clone(),
        bundle_node_name: file.title.clone(),
        file_type: file.format.clone(),
        bundle_node_id: None,
        is_sensitive: sensitive(file),
        conf_outlinks_depth: None,
        conf_inlinks_depth: None,
        conf_is_blacklisted: None,
    }
}
fn build_folder_scope_report(
    graph_root: &Path,
    selected_roots: Vec<String>,
    supported_seed_file_count: usize,
    required_raw_folder_node_count: usize,
) -> FolderScopeReport {
    let mut skipped: Vec<SkippedPath> = WalkDir::new(graph_root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.path() != graph_root && !entry.file_type().is_dir())
        .filter_map(|entry| {
            let relative = entry.path().strip_prefix(graph_root).ok()?;
            let relative_path = relative.to_string_lossy().replace('\\', "/");
            let directory = relative
                .parent()
                .map(|parent| parent.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            let classification = classify_directory_for_selected_roots(&directory, &selected_roots);
            if classification == ScopePathClassification::OutsideScope {
                return None;
            }
            let reason = if entry.path_is_symlink() {
                "symlink"
            } else {
                match classification {
                    ScopePathClassification::HiddenDescendant => "hiddenDescendant",
                    ScopePathClassification::HardExcluded => "hardExcluded",
                    ScopePathClassification::OutsideScope => return None,
                    ScopePathClassification::Included => {
                        if is_nodespec_sidecar(entry.path()) {
                            "nodespecSidecar"
                        } else {
                            let extension = entry
                                .path()
                                .extension()
                                .and_then(|value| value.to_str())
                                .unwrap_or("")
                                .to_ascii_lowercase();
                            if is_supported_source_extension(&extension) {
                                return None;
                            }
                            "unsupportedFile"
                        }
                    }
                }
            };
            Some(SkippedPath {
                path: relative_path,
                reason,
            })
        })
        .collect();
    skipped.sort_by(|a, b| a.path.cmp(&b.path).then_with(|| a.reason.cmp(b.reason)));
    let mut skipped_counts = HashMap::new();
    for path in &skipped {
        *skipped_counts.entry(path.reason.to_string()).or_insert(0) += 1;
    }
    let skipped_path_count = skipped.len();
    skipped.truncate(100);
    FolderScopeReport {
        normalizedSelectedFolders: selected_roots,
        supportedSeedFileCount: supported_seed_file_count,
        requiredRawFolderNodeCount: required_raw_folder_node_count,
        skippedCounts: skipped_counts,
        skippedPaths: skipped,
        skippedPathCount: skipped_path_count,
        predictedRawNodeCount: 0,
        predictedTypedEdgeCount: 0,
    }
}

fn build_source_folder_scope_report(
    registry: &SourceRegistry,
    graph_root: &Path,
    selected_roots: Vec<String>,
    supported_seed_file_count: usize,
    required_raw_folder_node_count: usize,
) -> FolderScopeReport {
    let Some(sources) = &registry.sources else {
        return build_folder_scope_report(
            graph_root,
            selected_roots,
            supported_seed_file_count,
            required_raw_folder_node_count,
        );
    };
    let mut report = FolderScopeReport {
        normalizedSelectedFolders: selected_roots.clone(),
        supportedSeedFileCount: supported_seed_file_count,
        requiredRawFolderNodeCount: required_raw_folder_node_count,
        skippedCounts: HashMap::new(),
        skippedPaths: Vec::new(),
        skippedPathCount: 0,
        predictedRawNodeCount: 0,
        predictedTypedEdgeCount: 0,
    };
    for source in sources {
        let roots = selected_roots
            .iter()
            .filter_map(|root| registry.parts(root))
            .filter(|(selected, _)| selected.id == source.id)
            .map(|(_, relative)| relative.to_string())
            .collect::<Vec<_>>();
        if roots.is_empty() {
            continue;
        }
        let local = build_folder_scope_report(&source.directory, roots, 0, 0);
        report.skippedPathCount += local.skippedPathCount;
        for (reason, count) in local.skippedCounts {
            *report.skippedCounts.entry(reason).or_default() += count;
        }
        report
            .skippedPaths
            .extend(local.skippedPaths.into_iter().map(|item| SkippedPath {
                path: working_graph::source_registry::source_graph_path(&source.id, &item.path),
                reason: item.reason,
            }));
    }
    report.skippedPaths.sort_by(|a, b| a.path.cmp(&b.path));
    report.skippedPaths.truncate(100);
    report
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    anyhow::ensure!(
        args.frontier_depth >= 0
            && args.default_outlinks_depth.is_none_or(|n| n >= 0)
            && args.default_inlinks_depth.is_none_or(|n| n >= 0),
        "Depths must be nonnegative"
    );
    let graph_root = args.graph_root.canonicalize()?;
    let registry = SourceRegistry::parse(args.sources.as_deref())?;
    let mut configs =
        parse_bundle_node_config_yaml(&fs::read_to_string(&args.bundle_node_config)?)?;
    registry.project_configs(&mut configs)?;
    let entry = find_config_by_id(&configs, &args.entry_bundle_node_id)
        .ok_or_else(|| anyhow::anyhow!("entryBundleNodeId does not resolve"))?;
    let traversal = find_config_by_id(&configs, &args.default_traversal_bundle_node_id)
        .ok_or_else(|| anyhow::anyhow!("defaultTraversalBundleNodeId does not resolve"))?;
    anyhow::ensure!(
        entry.list_type() == "whitelist" && traversal.list_type() == "whitelist",
        "Entry and traversal nodes must be whitelisted"
    );
    let graph = registry.open(
        &graph_root,
        &IndexOptions {
            cache_directory: Some(
                args.source_index_root
                    .clone()
                    .unwrap_or_else(|| std::env::temp_dir().join("meadow-working-graph-index")),
            ),
            rebuild: args.rebuild_index,
            frontmatter: vec![FrontmatterField {
                key: "meadow-sensitive".into(),
                substring: None,
            }],
            ..Default::default()
        },
    )?;
    // Keep a small integration diagnostic independent of Linkrange's private
    // cache representation. Source review can verify a requested full recheck.
    let diagnostic_root = args
        .source_index_root
        .clone()
        .unwrap_or_else(|| std::env::temp_dir().join("meadow-working-graph-index"));
    let key = format!(
        "{:x}",
        Sha256::digest(graph_root.to_string_lossy().as_bytes())
    );
    let diagnostic_dir = diagnostic_root.join(key);
    fs::create_dir_all(&diagnostic_dir)?;
    let staged = diagnostic_dir.join(format!("last-run.{}.tmp", std::process::id()));
    fs::write(
        &staged,
        serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 1, "sourceRoot": graph_root,
            "completedAtNanos": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos(),
            "metrics": graph.metrics(),
        }))?,
    )?;
    fs::rename(staged, diagnostic_dir.join("last-run.json"))?;
    let projected_files = graph
        .files()
        .map(|file| registry.project_file(file))
        .collect::<anyhow::Result<Vec<_>>>()?;
    let files: HashMap<String, &FileInfo> = projected_files
        .iter()
        .map(|file| (logical(file), file))
        .collect();
    let by_physical: HashMap<String, &FileInfo> = projected_files
        .iter()
        .map(|file| (file.path.clone(), file))
        .collect();
    let physical = |config: &BundleNodeConfig| {
        files
            .get(&config.bundle_node_key())
            .map(|file| file.path.clone())
            .unwrap_or_else(|| {
                registry
                    .linkrange_path(&config.bundle_node_key())
                    .unwrap_or_default()
            })
    };
    let logical_path = |path: &str| {
        by_physical
            .get(path)
            .map(|file| logical(file))
            .unwrap_or_else(|| {
                if registry.sources.is_some() {
                    return registry.graph_path(path).unwrap_or_else(|_| path.into());
                }
                if path.contains('/') {
                    path.into()
                } else {
                    format!("/{path}")
                }
            })
    };
    let mut query = Query {
        depths: Depths {
            outlinks: args.default_outlinks_depth.unwrap_or(i32::MAX) as u32,
            inlinks: args.default_inlinks_depth.unwrap_or(0) as u32,
        },
        frontier_depth: args.frontier_depth as u32,
        adjacency: true,
        boundary_embed_types: {
            // Stylesheets and scripts are dependencies of an included HTML page,
            // even at the depth boundary. Ordinary links get no exception.
            let mut formats = vec!["css".into(), "js".into()];
            if args.allow_images_to_extend_to_frontier {
                formats.extend(["png", "jpg", "jpeg", "gif"].map(String::from));
            }
            formats
        },
        // All direct HTML embeds use the same terminal boundary exception as images.
        boundary_embed_source_types: vec!["html".into()],
        ..Default::default()
    };
    for config in &configs {
        // Kept orphan configuration from a removed source has no active query selector.
        if registry.sources.is_some()
            && !matches!(config, BundleNodeConfig::Collection { .. })
            && registry
                .linkrange_path(config.source_graph_subdirectory().unwrap_or(""))
                .is_none()
        {
            continue;
        }
        match config {
            BundleNodeConfig::File { .. } => query.rules.push(Rule {
                path: physical(config),
                outlinks: config.outlinks_depth().map(|n| n as u32),
                inlinks: config.inlinks_depth().map(|n| n as u32),
                stop: config.list_type() == "blacklist",
                ..Default::default()
            }),
            BundleNodeConfig::Folder { .. } if config.list_type() == "blacklist" => {
                query.rules.push(Rule {
                    path: registry
                        .linkrange_path(config.source_graph_subdirectory().unwrap_or(""))
                        .context("Folder source is missing")?,
                    subtree: true,
                    exclude: true,
                    ..Default::default()
                })
            }
            _ => {}
        }
    }
    let mut structural_nodes = Vec::new();
    let mut structural_edges = Vec::new();
    let mut seed_paths = HashMap::new();
    let mut policy_ids = HashMap::new();
    let mut folder_scope = None;
    if matches!(entry, BundleNodeConfig::File { .. }) {
        anyhow::ensure!(
            matches!(traversal, BundleNodeConfig::File { .. }),
            "File-entry bundles require a file default traversal node"
        );
        for config in [entry, traversal] {
            anyhow::ensure!(files.contains_key(&config.bundle_node_key()),"Required starting page is missing: {}. Locate its replacement in bundle settings; the accepted snapshot has been kept.",config.bundle_node_key());
        }
        query.starts.push(Start {
            path: physical(entry),
            depths: None,
        });
    } else {
        let supported: Vec<_> = projected_files.iter().map(configured_file).collect();
        let directories = graph
            .directories()
            .iter()
            .map(|path| registry.graph_path(path))
            .collect::<anyhow::Result<_>>()?;
        let projection = build_folder_scope_projection(
            &configs,
            &args.entry_bundle_node_id,
            &supported,
            &directories,
            args.default_outlinks_depth.unwrap_or(1),
            args.default_inlinks_depth.unwrap_or(0),
        )?;
        anyhow::ensure!(
            projection.missing_selected_roots.is_empty(),
            "repair required: selected folder(s) missing: {}",
            projection.missing_selected_roots.join(", ")
        );
        folder_scope = Some(build_source_folder_scope_report(
            &registry,
            &graph_root,
            projection.selected_roots.clone(),
            projection
                .seeds
                .iter()
                .map(|seed| seed.file.bundle_node_key())
                .collect::<HashSet<_>>()
                .len(),
            projection
                .structural_nodes
                .iter()
                .filter(|node| node.bundle_node_kind == "folder")
                .count(),
        ));
        for seed in &projection.seeds {
            let key = seed.file.bundle_node_key();
            if let Some(file) = files.get(&key) {
                query.starts.push(Start {
                    path: file.path.clone(),
                    depths: Some(Depths {
                        outlinks: seed.outlinks_depth as u32,
                        inlinks: seed.inlinks_depth as u32,
                    }),
                });
                seed_paths.insert(file.path.clone(), seed.structural_path.clone());
            }
        }
        for key in &projection.blocked_file_keys {
            if let Some(file) = files.get(key) {
                query.rules.push(Rule {
                    path: file.path.clone(),
                    exclude: true,
                    ..Default::default()
                });
            }
        }
        policy_ids = projection.effective_policy_bundle_node_ids;
        for node in projection.structural_nodes.iter().filter(|node| {
            node.effective_blacklisting_bundle_node_id
                .as_ref()
                .is_none_or(|blacklist| node.bundle_node_id.as_ref() == Some(blacklist))
        }) {
            structural_nodes.push(OutputNode {
                sourceId: node
                    .source_graph_subdirectory
                    .as_deref()
                    .and_then(|directory| registry.parts(directory))
                    .map(|(source, _)| source.id.clone()),
                sourceFile: None,
                bundleNodeKey: node.bundle_node_key.clone(),
                bundleNodeId: node.bundle_node_id.clone(),
                bundleNodeKind: node.bundle_node_kind,
                bundleNodeName: node.bundle_node_name.clone(),
                sourceGraphSubdirectory: node.source_graph_subdirectory.as_ref().map(|directory| {
                    registry
                        .parts(directory)
                        .map_or_else(|| directory.clone(), |(_, relative)| relative.into())
                }),
                fileType: None,
                memberBundleNodeIds: node.member_bundle_node_ids.clone(),
                effectiveBlacklistingBundleNodeId: node
                    .effective_blacklisting_bundle_node_id
                    .clone(),
                effectiveFolderPolicyBundleNodeId: node
                    .effective_folder_policy_bundle_node_id
                    .clone(),
                depth: node.path.len().saturating_sub(1) as i32,
                remaining_depth: 0,
                remaining_inlinks_depth: 0,
                path: node.path.clone(),
                traversal_details: None,
                traversal_path_steps: None,
                traversal_alternative_routes: Vec::new(),
                isFrontierNode: None,
                isFrontierImageExtension: None,
                traversal_states: None,
                is_sensitive: false,
            });
        }
        for edge in projection.structural_edges {
            structural_edges.push(OutputEdge {
                source: edge.source,
                target: edge.target,
                bundleEdgeKind: edge.bundle_edge_kind,
                isBidirectional: false,
                link_source_page_path: String::new(),
                link_original_text: String::new(),
                link_parsed_directory: String::new(),
                link_parsed_title: String::new(),
                link_parsed_file_type: String::new(),
                link_parsed_anchor: None,
                link_parsed_anchor_type: None,
                link_parsed_alias: None,
                link_parsed_media_size: None,
                link_resolved_target_directory: String::new(),
                link_resolved_target_path: String::new(),
            });
        }
        // An empty selected folder is valid and still has Meadow structure.
        if query.starts.is_empty() {
            query.starts = projection
                .selected_roots
                .iter()
                .map(|path| Start {
                    path: registry
                        .linkrange_path(path)
                        .expect("Validated starting source"),
                    depths: Some(Depths {
                        outlinks: 0,
                        inlinks: 0,
                    }),
                })
                .collect();
        }
    }
    let mut response = graph.query(&query)?;
    anyhow::ensure!(
        response.complete,
        "Source index is incomplete; the accepted snapshot has been kept"
    );
    if let Some(diagnostic) = response
        .diagnostics
        .iter()
        .find(|diagnostic| diagnostic.code == "malformedFrontmatter")
    {
        anyhow::bail!(
            "Requested source metadata is malformed in {}: {}; the accepted snapshot has been kept",
            diagnostic.path,
            diagnostic.message
        );
    }
    // Meadow's focus projection stays separate from source discovery.
    if entry.bundle_node_id() != traversal.bundle_node_id()
        && matches!(entry, BundleNodeConfig::File { .. })
    {
        let focus = physical(traversal);
        let minimum = response
            .nodes
            .iter()
            .find(|node| node.file.path == focus)
            .map(|node| node.depth)
            .unwrap_or(u32::MAX);
        let nodes: HashMap<_, _> = response
            .nodes
            .iter()
            .map(|node| (node.file.path.clone(), node))
            .collect();
        let mut pending = vec![focus];
        let mut selected = HashSet::new();
        while let Some(path) = pending.pop() {
            let Some(node) = nodes.get(&path) else {
                continue;
            };
            if (!args.allow_lower_depths && node.depth < minimum) || !selected.insert(path.clone())
            {
                continue;
            }
            let config = configs
                .iter()
                .find(|config| config.bundle_node_key() == logical(&node.file));
            if node.inclusion == Inclusion::EmbeddedAsset
                || config.is_some_and(|config| config.list_type() == "blacklist")
            {
                continue;
            }
            for edge in &response.edges {
                if edge.source == path {
                    pending.push(edge.target.clone());
                } else if edge.target == path
                    && (args.allow_lower_depths
                        || node.states.iter().any(|state| state.remaining_inlinks > 0))
                {
                    pending.push(edge.source.clone());
                }
            }
        }
        response
            .nodes
            .retain(|node| selected.contains(&node.file.path));
        response
            .edges
            .retain(|edge| selected.contains(&edge.source) && selected.contains(&edge.target));
        response
            .links_by_source
            .retain(|path, _| selected.contains(path));
        response.adjacency.retain(|path, _| selected.contains(path));
    }
    let mut nodes = Vec::new();
    for node in &response.nodes {
        let file = &by_physical[&node.file.path];
        let key = logical(file);
        let source_parts = registry.parts(&file.directory);
        let config = configs.iter().find(|config| {
            matches!(config, BundleNodeConfig::File { .. }) && config.bundle_node_key() == key
        });
        let adapt_route =
            |route: &[linkrange::RouteStep]| -> anyhow::Result<Vec<OutputTraversalStep>> {
                let mut steps = Vec::new();
                if let Some(prefix) = route.first().and_then(|step| seed_paths.get(&step.path)) {
                    for key in prefix.iter().take(prefix.len().saturating_sub(1)) {
                        let structural = structural_nodes
                            .iter()
                            .find(|node| &node.bundleNodeKey == key)
                            .context("Traversal route is missing its structural node")?;
                        steps.push(OutputTraversalStep {
                            bundle_node_key: key.clone(),
                            depth: structural.depth,
                            remaining_depth: structural.remaining_depth,
                            remaining_inlinks_depth: structural.remaining_inlinks_depth,
                            retained_for_traversal: None,
                            traversal_details: None,
                            is_frontier_image_extension: false,
                        });
                    }
                }
                steps.extend(
                    route
                        .iter()
                        .map(|step| route_step(step, &query, &logical_path)),
                );
                Ok(steps)
            };
        let steps = adapt_route(&node.route_steps)?;
        let route = steps
            .iter()
            .map(|step| step.bundle_node_key.clone())
            .collect();
        let alternatives = node
            .alternative_routes
            .iter()
            .map(|route| adapt_route(route))
            .collect::<anyhow::Result<Vec<_>>>()?;
        let traversal_details = steps.last().and_then(|step| step.traversal_details.clone());
        let initial = node.inherited.is_none();
        nodes.push(OutputNode {
            sourceId: source_parts.map(|(source, _)| source.id.clone()),
            sourceFile: Some(SourceFile {
                path: registry.graph_path(&node.file.path)?,
                digest: node.file.digest.clone(),
                size: node.file.size,
            }),
            bundleNodeKey: key.clone(),
            bundleNodeId: config.map(|c| c.bundle_node_id().into()),
            bundleNodeKind: "file",
            bundleNodeName: node.file.title.clone(),
            sourceGraphSubdirectory: Some(
                source_parts
                    .map_or_else(|| file.directory.clone(), |(_, relative)| relative.into()),
            ),
            fileType: Some(node.file.format.clone()),
            memberBundleNodeIds: None,
            effectiveBlacklistingBundleNodeId: None,
            effectiveFolderPolicyBundleNodeId: policy_ids.get(&key).cloned(),
            depth: node.depth as i32,
            remaining_depth: node.remaining_outlinks as i32,
            remaining_inlinks_depth: node.remaining_inlinks as i32,
            path: route,
            traversal_details,
            traversal_path_steps: Some(steps),
            traversal_alternative_routes: alternatives,
            isFrontierNode: (!initial || !matches!(entry, BundleNodeConfig::File { .. }))
                .then_some(node.inclusion == Inclusion::Frontier),
            isFrontierImageExtension: (!initial || !matches!(entry, BundleNodeConfig::File { .. }))
                .then_some(node.inclusion == Inclusion::EmbeddedAsset),
            traversal_states: Some(
                node.states
                    .iter()
                    .map(|state| TraversalStateSummary {
                        remaining_outlinks_depth: state.remaining_outlinks as i32,
                        remaining_inlinks_depth: state.remaining_inlinks as i32,
                    })
                    .collect(),
            ),
            is_sensitive: sensitive(&node.file),
        });
    }
    nodes.extend(structural_nodes);
    let node_keys: HashSet<_> = nodes
        .iter()
        .map(|node| node.bundleNodeKey.clone())
        .collect();
    let mut edges: Vec<_> = response
        .edges
        .iter()
        .map(|edge| {
            let link = &edge.link;
            let target = logical_path(&edge.target)
                .trim_start_matches('/')
                .to_string();
            OutputEdge {
                source: logical_path(&edge.source),
                target: logical_path(&edge.target),
                bundleEdgeKind: "semanticLink",
                isBidirectional: edge.bidirectional,
                link_source_page_path: logical_path(&edge.source).trim_start_matches('/').into(),
                link_original_text: link.link_original_text.clone(),
                link_parsed_directory: link.link_parsed_directory.clone(),
                link_parsed_title: link.link_parsed_title.clone(),
                link_parsed_file_type: link.link_parsed_file_type.clone(),
                link_parsed_anchor: link.link_parsed_anchor.clone(),
                link_parsed_anchor_type: link.link_parsed_anchor_type,
                link_parsed_alias: link.link_parsed_alias.clone(),
                link_parsed_media_size: link.link_parsed_media_size,
                link_resolved_target_directory: target
                    .rsplit_once('/')
                    .map_or("", |(dir, _)| dir)
                    .into(),
                link_resolved_target_path: target,
            }
        })
        .collect();
    edges.extend(
        structural_edges
            .into_iter()
            .filter(|edge| node_keys.contains(&edge.source) && node_keys.contains(&edge.target)),
    );
    let all_link_resolution_maps = response
        .links_by_source
        .iter()
        .map(|(source, links)| {
            let map = links
                .iter()
                .map(|link| {
                    let target = link
                        .target
                        .as_ref()
                        .map(|target| logical_path(target).trim_start_matches('/').to_string())
                        .unwrap_or_else(|| link.link_resolved_target_path.clone());
                    (
                        link.link_original_text.clone(),
                        LinkResolvedInfo {
                            link_resolved_target_directory: target
                                .rsplit_once('/')
                                .map_or("", |(dir, _)| dir)
                                .into(),
                            link_resolved_target_path: if link.link_source_error.is_some()
                                || (registry.sources.is_some() && link.target.is_none())
                            {
                                None
                            } else {
                                Some(target)
                            },
                        },
                    )
                })
                .collect();
            (logical_path(source), map)
        })
        .collect();
    let all_inlink_sources = response
        .adjacency
        .iter()
        .map(|(source, adj)| {
            (
                logical_path(source),
                adj.inlinks.iter().map(|path| logical_path(path)).collect(),
            )
        })
        .collect();
    let all_outlink_targets = response
        .adjacency
        .iter()
        .map(|(source, adj)| {
            (
                logical_path(source),
                adj.outlinks.iter().map(|path| logical_path(path)).collect(),
            )
        })
        .collect();
    if let Some(report) = &mut folder_scope {
        report.predictedRawNodeCount = nodes.len();
        report.predictedTypedEdgeCount = edges.len();
    }
    let source_diagnostics = response
        .diagnostics
        .iter()
        .filter(|diagnostic| {
            diagnostic.requested_source.is_some()
                && response.links_by_source.contains_key(&diagnostic.path)
        })
        .map(|diagnostic| linkrange::Diagnostic {
            path: logical_path(&diagnostic.path),
            ..diagnostic.clone()
        })
        .collect();
    serde_json::to_writer(
        std::io::stdout().lock(),
        &OutputGraph {
            sourceDiagnostics: source_diagnostics,
            nodes,
            edges,
            allLinkResolutionMaps: all_link_resolution_maps,
            allInlinkSources: all_inlink_sources,
            allOutlinkTargets: all_outlink_targets,
            folderScope: folder_scope,
        },
    )?;
    Ok(())
}
