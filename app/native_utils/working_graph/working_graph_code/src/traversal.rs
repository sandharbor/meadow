use crate::bundle_node_config::{find_matching_config, BundleNodeConfig};
use crate::types::{
    is_image_file_type, BasicEdge, FileBundleNode, LinkType, BundleEdgeKind, TraversalDetails,
    TraversalStateSummary, WorkingEdge, WorkingNode,
};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone)]
pub struct BuildOpts {
    pub max_depth: i32,
    pub inlinks_depth: i32,
    pub frontier_depth: i32,
    pub allow_images_to_extend_to_frontier: bool,
}

#[derive(Debug, Clone)]
pub struct TraverseOpts {
    pub allow_lower_depths: bool,
}

#[derive(Debug)]
pub struct BundleNodeGraph {
    pub nodes: HashMap<String, WorkingNode>,
    pub edges: Vec<WorkingEdge>,
    bundle_node_configs: Vec<BundleNodeConfig>,
    opts: BuildOpts,
}

impl BundleNodeGraph {
    pub fn new(
        raw_edges: &[BasicEdge],
        start: &FileBundleNode,
        bundle_node_configs: Vec<BundleNodeConfig>,
        opts: BuildOpts,
    ) -> Self {
        let mut g = Self {
            nodes: HashMap::new(),
            edges: Vec::new(),
            bundle_node_configs,
            opts,
        };
        g.build_graph(raw_edges, start);
        g
    }

    fn apply_config_to_file(configs: &[BundleNodeConfig], f: &mut FileBundleNode) {
        if let Some(conf) = find_matching_config(
            configs,
            &f.bundle_node_name,
            &f.source_graph_subdirectory,
            &f.file_type,
        ) {
            f.bundle_node_id = Some(conf.bundle_node_id().to_string());
            f.conf_outlinks_depth = conf.outlinks_depth();
            f.conf_inlinks_depth = conf.inlinks_depth();
            f.conf_is_blacklisted = Some(conf.list_type() == "blacklist");
        }
    }

    fn build_graph(&mut self, raw_edges: &[BasicEdge], start_file: &FileBundleNode) {
        let frontier_depth = self.opts.frontier_depth.max(0);

        // Pre-build adjacency lists to avoid O(V*E) scanning.
        let mut out_map: HashMap<String, Vec<(String, bool)>> = HashMap::new();
        let mut in_map: HashMap<String, Vec<(String, bool)>> = HashMap::new();
        let mut file_map: HashMap<String, FileBundleNode> = HashMap::new();

        for e in raw_edges {
            let sid = e.source.bundle_node_key();
            let tid = e.target.bundle_node_key();
            file_map
                .entry(sid.clone())
                .or_insert_with(|| e.source.clone());
            file_map
                .entry(tid.clone())
                .or_insert_with(|| e.target.clone());
            out_map
                .entry(sid.clone())
                .or_default()
                .push((tid.clone(), e.is_bidirectional));
            in_map
                .entry(tid.clone())
                .or_default()
                .push((sid.clone(), e.is_bidirectional));
        }

        // Ensure start exists in file_map.
        let start_id = start_file.bundle_node_key();
        file_map
            .entry(start_id.clone())
            .or_insert_with(|| start_file.clone());

        // Apply configs to all files (mirrors TS where conf_* is assigned across all edge endpoints).
        for f in file_map.values_mut() {
            Self::apply_config_to_file(&self.bundle_node_configs, f);
        }

        let start_file_conf = file_map
            .get(&start_id)
            .cloned()
            .unwrap_or_else(|| start_file.clone());
        let mut start_file_with_conf = start_file_conf.clone();
        Self::apply_config_to_file(&self.bundle_node_configs, &mut start_file_with_conf);

        let initial_remaining_depth_for_start = start_file_with_conf
            .conf_outlinks_depth
            .unwrap_or(self.opts.max_depth);
        let initial_inherited_inlinks_depth_for_start = start_file_with_conf
            .conf_inlinks_depth
            .unwrap_or(self.opts.inlinks_depth);
        let start_path = vec![start_id.clone()];

        let start_node = WorkingNode {
            file: start_file_with_conf.clone(),
            depth: 0,
            remaining_depth: initial_remaining_depth_for_start,
            remaining_inlinks_depth: initial_inherited_inlinks_depth_for_start,
            path: start_path.clone(),
            traversal_details: Some(TraversalDetails {
                outlinks_depth_set_first_time: Some(self.opts.max_depth),
                outlinks_depth_inherited: None,
                outlinks_depth_overridden: None,
                inlinks_depth_set_first_time: Some(self.opts.inlinks_depth),
                inlinks_depth_inherited: None,
                inlinks_depth_overridden: None,
                link_type: Some(LinkType::Start),
            }),
            is_frontier_node: None,
            is_frontier_image_extension: None,
            traversal_states: None,
        };
        self.nodes.insert(start_id.clone(), start_node);

        #[derive(Clone)]
        struct QItem {
            id: String,
            depth: i32,
            inherited_inlinks_depth: i32,
            remaining_depth: i32,
            path: Vec<String>,
        }

        let mut queue: VecDeque<QItem> = VecDeque::new();
        queue.push_back(QItem {
            id: start_id.clone(),
            depth: 0,
            inherited_inlinks_depth: initial_inherited_inlinks_depth_for_start,
            remaining_depth: initial_remaining_depth_for_start,
            path: start_path,
        });

        let mut visited_at_min_depth: HashMap<String, i32> = HashMap::new();

        while let Some(cur) = queue.pop_front() {
            let current_key = cur.id.clone();

            // Update the node's conf fields from configs (mirrors TS behavior).
            if let Some(n) = self.nodes.get_mut(&current_key) {
                Self::apply_config_to_file(&self.bundle_node_configs, &mut n.file);
            }

            if let Some(prev) = visited_at_min_depth.get(&current_key) {
                if *prev < cur.depth {
                    continue;
                }
            }
            visited_at_min_depth.insert(current_key.clone(), cur.depth);

            let current_is_blacklisted = self
                .nodes
                .get(&current_key)
                .and_then(|n| n.file.conf_is_blacklisted)
                .unwrap_or(false);
            if current_is_blacklisted {
                continue;
            }

            let current_node_snapshot = self.nodes.get(&current_key).cloned().expect("node exists");
            let current_file = current_node_snapshot.file.clone();
            let current_remaining_inlinks_depth = current_node_snapshot.remaining_inlinks_depth;

            let mut process_connection =
                |target_key: &str, link_type: LinkType, raw_edge_is_bidirectional: bool| {
                    let child_depth = cur.depth + 1;
                    let mut child_path = cur.path.clone();
                    child_path.push(target_key.to_string());

                    let current_conf_outlinks_depth = current_file.conf_outlinks_depth;
                    let current_conf_is_blacklisted =
                        current_file.conf_is_blacklisted.unwrap_or(false);
                    let max_allowed_child_outlinks_depth =
                        if current_conf_outlinks_depth.is_some() && !current_conf_is_blacklisted {
                            cur.depth
                                .saturating_add(current_conf_outlinks_depth.unwrap())
                                .saturating_add(frontier_depth)
                        } else {
                            cur.depth
                                .saturating_add(cur.remaining_depth)
                                .saturating_add(frontier_depth)
                        };

                    let target_file = match file_map.get(target_key) {
                        Some(f) => f.clone(),
                        None => return,
                    };

                    let is_excluded_by_depth = child_depth > max_allowed_child_outlinks_depth;
                    let is_frontier_image_extension_case = is_excluded_by_depth
                        && self.opts.allow_images_to_extend_to_frontier
                        && link_type == LinkType::Outlink
                        && is_image_file_type(&target_file.file_type)
                        && cur.remaining_depth == 0;

                    if is_excluded_by_depth && !is_frontier_image_extension_case {
                        return;
                    }

                    let target_conf_is_blacklisted =
                        target_file.conf_is_blacklisted.unwrap_or(false);
                    let target_prospective_remaining_depth =
                        if target_file.conf_outlinks_depth.is_some() && !target_conf_is_blacklisted
                        {
                            target_file.conf_outlinks_depth.unwrap()
                        } else {
                            cur.remaining_depth - 1
                        };

                    let target_inherited_inlinks_depth = target_file
                        .conf_inlinks_depth
                        .unwrap_or_else(|| (cur.inherited_inlinks_depth - 1).max(0));

                    let needs_update_and_queue: bool;
                    if !self.nodes.contains_key(target_key) {
                        let mut traversal_details = TraversalDetails {
                            outlinks_depth_set_first_time: None,
                            outlinks_depth_inherited: Some(cur.remaining_depth - 1),
                            outlinks_depth_overridden: None,
                            inlinks_depth_set_first_time: None,
                            inlinks_depth_inherited: Some((cur.inherited_inlinks_depth - 1).max(0)),
                            inlinks_depth_overridden: None,
                            link_type: Some(link_type),
                        };

                        if let Some(conf_md) = target_file.conf_outlinks_depth {
                            traversal_details.outlinks_depth_overridden = Some(conf_md);
                            traversal_details.outlinks_depth_inherited =
                                Some(cur.remaining_depth - 1);
                        }
                        if let Some(conf_id) = target_file.conf_inlinks_depth {
                            traversal_details.inlinks_depth_overridden = Some(conf_id);
                            traversal_details.inlinks_depth_inherited =
                                Some((cur.inherited_inlinks_depth - 1).max(0));
                        }

                        let is_frontier_node = target_prospective_remaining_depth < 0
                            && !is_frontier_image_extension_case;

                        let target_page = WorkingNode {
                            file: target_file.clone(),
                            depth: child_depth,
                            remaining_depth: target_prospective_remaining_depth,
                            remaining_inlinks_depth: target_inherited_inlinks_depth,
                            path: child_path.clone(),
                            traversal_details: Some(traversal_details),
                            is_frontier_node: Some(is_frontier_node),
                            is_frontier_image_extension: Some(is_frontier_image_extension_case),
                            traversal_states: None,
                        };
                        self.nodes.insert(target_key.to_string(), target_page);
                        needs_update_and_queue = true;
                    } else {
                        let mut should_queue = false;
                        if let Some(existing) = self.nodes.get_mut(target_key) {
                            if existing.depth > child_depth {
                                existing.depth = child_depth;
                                existing.remaining_depth = target_prospective_remaining_depth;
                                existing.remaining_inlinks_depth = target_inherited_inlinks_depth;
                                existing.path = child_path.clone();
                                existing.is_frontier_node = Some(
                                    target_prospective_remaining_depth < 0
                                        && !is_frontier_image_extension_case,
                                );
                                existing.is_frontier_image_extension =
                                    Some(is_frontier_image_extension_case);
                                should_queue = true;
                            } else if existing.depth == child_depth {
                                if target_prospective_remaining_depth > existing.remaining_depth {
                                    existing.remaining_depth = target_prospective_remaining_depth;
                                    existing.remaining_inlinks_depth =
                                        target_inherited_inlinks_depth;
                                    existing.path = child_path.clone();
                                    existing.is_frontier_node = Some(
                                        target_prospective_remaining_depth < 0
                                            && !is_frontier_image_extension_case,
                                    );
                                    existing.is_frontier_image_extension =
                                        Some(is_frontier_image_extension_case);
                                    should_queue = true;
                                }
                            }
                        }
                        needs_update_and_queue = should_queue;
                    }

                    if needs_update_and_queue {
                        queue.push_back(QItem {
                            id: target_key.to_string(),
                            depth: child_depth,
                            inherited_inlinks_depth: target_inherited_inlinks_depth,
                            remaining_depth: target_prospective_remaining_depth,
                            path: child_path,
                        });
                    }

                    match link_type {
                        LinkType::Outlink | LinkType::Bidirectional => {
                            self.edges.push(WorkingEdge {
                                from: current_key.clone(),
                                to: target_key.to_string(),
                                bundle_edge_kind: BundleEdgeKind::SemanticLink,
                                is_bidirectional: raw_edge_is_bidirectional,
                                is_traversal_only: false,
                            })
                        }
                        LinkType::Inlink => self.edges.push(WorkingEdge {
                            from: current_key.clone(),
                            to: target_key.to_string(),
                            bundle_edge_kind: BundleEdgeKind::SemanticLink,
                            is_bidirectional: false,
                            is_traversal_only: true,
                        }),
                        LinkType::Start => {}
                    }
                };

            // Outgoing edges
            if let Some(outs) = out_map.get(&current_key) {
                for (to_key, raw_bi) in outs {
                    process_connection(to_key, LinkType::Outlink, *raw_bi);
                }
            }

            // Incoming edges (in-links) and bidirectional edges seen as incoming.
            if let Some(ins) = in_map.get(&current_key) {
                for (from_key, raw_bi) in ins {
                    if *raw_bi {
                        process_connection(from_key, LinkType::Bidirectional, *raw_bi);
                    } else {
                        // Only traverse inlinks if remaining_inlinks_depth > 0
                        if current_remaining_inlinks_depth > 0 {
                            process_connection(from_key, LinkType::Inlink, *raw_bi);
                        }
                    }
                }
            }
        }
    }

    pub fn traverse(&self, from: &FileBundleNode, opts: TraverseOpts) -> Vec<WorkingNode> {
        let start_key = from.bundle_node_key();
        let start_node = match self.nodes.get(&start_key) {
            Some(n) => n.clone(),
            None => return vec![],
        };

        let min_depth = start_node.depth;
        let mut result: Vec<WorkingNode> = Vec::new();
        let mut visited: HashMap<String, i32> = HashMap::new();

        fn dfs(
            g: &BundleNodeGraph,
            node: &WorkingNode,
            opts: &TraverseOpts,
            min_depth: i32,
            visited: &mut HashMap<String, i32>,
            result: &mut Vec<WorkingNode>,
        ) {
            let key = node.file.bundle_node_key();
            if !opts.allow_lower_depths && node.depth < min_depth {
                return;
            }
            if let Some(prev_depth) = visited.get(&key) {
                if *prev_depth <= node.depth {
                    return;
                }
            }
            visited.insert(key.clone(), node.depth);
            result.push(node.clone());

            for e in &g.edges {
                if e.from == key {
                    if let Some(to_page) = g.nodes.get(&e.to) {
                        dfs(g, to_page, opts, min_depth, visited, result);
                    }
                } else if e.to == key {
                    let conf_inlinks_depth = node.file.conf_inlinks_depth.unwrap_or(0);
                    let should_follow_incoming = opts.allow_lower_depths || conf_inlinks_depth > 0;
                    if should_follow_incoming {
                        if let Some(from_page) = g.nodes.get(&e.from) {
                            dfs(g, from_page, opts, min_depth, visited, result);
                        }
                    }
                }
            }
        }

        dfs(
            self,
            &start_node,
            &opts,
            min_depth,
            &mut visited,
            &mut result,
        );
        result
    }
}

#[derive(Debug, Clone)]
pub struct MultiSeed {
    pub file: FileBundleNode,
    pub outlinks_depth: i32,
    pub inlinks_depth: i32,
    pub structural_path: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MultiTraversalState {
    key: String,
    remaining_outlinks_depth: i32,
    remaining_inlinks_depth: i32,
    semantic_depth: i32,
    path: Vec<String>,
    link_type: LinkType,
    is_frontier_image_extension: bool,
}

fn state_path_is_better(candidate: &MultiTraversalState, existing: &MultiTraversalState) -> bool {
    candidate.path.len() < existing.path.len()
        || (candidate.path.len() == existing.path.len() && candidate.path < existing.path)
}

fn display_state_cmp(a: &MultiTraversalState, b: &MultiTraversalState) -> std::cmp::Ordering {
    b.remaining_outlinks_depth
        .cmp(&a.remaining_outlinks_depth)
        .then_with(|| b.remaining_inlinks_depth.cmp(&a.remaining_inlinks_depth))
        .then_with(|| a.path.len().cmp(&b.path.len()))
        .then_with(|| a.path.cmp(&b.path))
        .then_with(|| a.key.cmp(&b.key))
}

/// Traverse semantic links independently from every contained file seed. Per-node Pareto
/// frontiers retain independently useful outlink/inlink budgets while emitted nodes stay unique.
pub fn get_multi_seed_working_nodes(
    edges: &[BasicEdge],
    bundle_node_configs: &[BundleNodeConfig],
    seeds: &[MultiSeed],
    blocked_file_keys: &HashSet<String>,
    frontier_depth: i32,
    allow_images_to_extend_to_frontier: bool,
) -> Vec<WorkingNode> {
    let mut file_map: HashMap<String, FileBundleNode> = HashMap::new();
    let mut outgoing: HashMap<String, Vec<(String, bool)>> = HashMap::new();
    let mut incoming: HashMap<String, Vec<(String, bool)>> = HashMap::new();
    for edge in edges {
        let source = edge.source.bundle_node_key();
        let target = edge.target.bundle_node_key();
        file_map.entry(source.clone()).or_insert_with(|| edge.source.clone());
        file_map.entry(target.clone()).or_insert_with(|| edge.target.clone());
        outgoing
            .entry(source.clone())
            .or_default()
            .push((target.clone(), edge.is_bidirectional));
        incoming
            .entry(target)
            .or_default()
            .push((source, edge.is_bidirectional));
    }
    for seed in seeds {
        file_map
            .entry(seed.file.bundle_node_key())
            .or_insert_with(|| seed.file.clone());
    }
    for adjacent in outgoing.values_mut() {
        adjacent.sort();
        adjacent.dedup();
    }
    for adjacent in incoming.values_mut() {
        adjacent.sort();
        adjacent.dedup();
    }

    let apply_file_config = |file: &mut FileBundleNode| {
        if let Some(config) = find_matching_config(
            bundle_node_configs,
            &file.bundle_node_name,
            &file.source_graph_subdirectory,
            &file.file_type,
        ) {
            file.bundle_node_id = Some(config.bundle_node_id().to_string());
            file.conf_outlinks_depth = config.outlinks_depth();
            file.conf_inlinks_depth = config.inlinks_depth();
            file.conf_is_blacklisted = Some(config.list_type() == "blacklist");
        }
    };
    for file in file_map.values_mut() {
        apply_file_config(file);
    }

    let mut frontiers: HashMap<String, Vec<MultiTraversalState>> = HashMap::new();
    let mut queue: VecDeque<MultiTraversalState> = VecDeque::new();

    let enqueue = |candidate: MultiTraversalState,
                   frontiers: &mut HashMap<String, Vec<MultiTraversalState>>,
                   queue: &mut VecDeque<MultiTraversalState>| {
        let states = frontiers.entry(candidate.key.clone()).or_default();
        if let Some(equal_index) = states.iter().position(|state| {
            state.remaining_outlinks_depth == candidate.remaining_outlinks_depth
                && state.remaining_inlinks_depth == candidate.remaining_inlinks_depth
        }) {
            if !state_path_is_better(&candidate, &states[equal_index]) {
                return;
            }
            states.remove(equal_index);
        }
        if states.iter().any(|state| {
            state.remaining_outlinks_depth >= candidate.remaining_outlinks_depth
                && state.remaining_inlinks_depth >= candidate.remaining_inlinks_depth
        }) {
            return;
        }
        states.retain(|state| {
            !(candidate.remaining_outlinks_depth >= state.remaining_outlinks_depth
                && candidate.remaining_inlinks_depth >= state.remaining_inlinks_depth)
        });
        states.push(candidate.clone());
        queue.push_back(candidate);
    };

    let mut sorted_seeds = seeds.to_vec();
    sorted_seeds.sort_by(|a, b| {
        a.file
            .bundle_node_key()
            .cmp(&b.file.bundle_node_key())
            .then_with(|| a.structural_path.cmp(&b.structural_path))
    });
    for seed in sorted_seeds {
        let key = seed.file.bundle_node_key();
        let file = file_map.get(&key).expect("seed file exists");
        let mut path = seed.structural_path;
        if path.last() != Some(&key) {
            path.push(key.clone());
        }
        enqueue(
            MultiTraversalState {
                key,
                remaining_outlinks_depth: file
                    .conf_outlinks_depth
                    .unwrap_or(seed.outlinks_depth),
                remaining_inlinks_depth: file
                    .conf_inlinks_depth
                    .unwrap_or(seed.inlinks_depth),
                semantic_depth: 0,
                path,
                link_type: LinkType::Start,
                is_frontier_image_extension: false,
            },
            &mut frontiers,
            &mut queue,
        );
    }

    while let Some(current) = queue.pop_front() {
        let still_current = frontiers.get(&current.key).is_some_and(|states| {
            states.iter().any(|state| state == &current)
        });
        if !still_current {
            continue;
        }
        let current_file = file_map.get(&current.key).expect("queued file exists");
        if blocked_file_keys.contains(&current.key)
            || current_file.conf_is_blacklisted.unwrap_or(false)
        {
            continue;
        }

        let mut visit = |target_key: &str, link_type: LinkType, is_bidirectional: bool| {
            let target_file = match file_map.get(target_key) {
                Some(file) => file,
                None => return,
            };
            let traversing_inlink = link_type == LinkType::Inlink && !is_bidirectional;
            let next_outlinks = if traversing_inlink {
                current.remaining_outlinks_depth
            } else {
                current.remaining_outlinks_depth - 1
            };
            let next_inlinks = if traversing_inlink {
                current.remaining_inlinks_depth - 1
            } else {
                current.remaining_inlinks_depth
            };
            let is_image_extension = !traversing_inlink
                && next_outlinks < -frontier_depth
                && allow_images_to_extend_to_frontier
                && matches!(link_type, LinkType::Outlink | LinkType::Bidirectional)
                && is_image_file_type(&target_file.file_type)
                && current.remaining_outlinks_depth == 0;
            if !traversing_inlink
                && next_outlinks < -frontier_depth
                && !is_image_extension
            {
                return;
            }
            let mut path = current.path.clone();
            path.push(target_key.to_string());
            enqueue(
                MultiTraversalState {
                    key: target_key.to_string(),
                    remaining_outlinks_depth: target_file
                        .conf_outlinks_depth
                        .unwrap_or(next_outlinks),
                    remaining_inlinks_depth: target_file.conf_inlinks_depth.unwrap_or(
                        next_inlinks.max(0),
                    ),
                    semantic_depth: current.semantic_depth + 1,
                    path,
                    link_type: if is_bidirectional {
                        LinkType::Bidirectional
                    } else {
                        link_type
                    },
                    is_frontier_image_extension: is_image_extension,
                },
                &mut frontiers,
                &mut queue,
            );
        };

        if let Some(targets) = outgoing.get(&current.key) {
            for (target, is_bidirectional) in targets {
                visit(target, LinkType::Outlink, *is_bidirectional);
            }
        }
        if current.remaining_inlinks_depth > 0 {
            if let Some(sources) = incoming.get(&current.key) {
                for (source, is_bidirectional) in sources {
                    visit(source, LinkType::Inlink, *is_bidirectional);
                }
            }
        }
    }

    let mut keys: Vec<String> = frontiers.keys().cloned().collect();
    keys.sort();
    keys.into_iter()
        .filter_map(|key| {
            let mut states = frontiers.remove(&key)?;
            states.sort_by(display_state_cmp);
            let display = states.first()?.clone();
            let file = file_map.get(&key)?.clone();
            let mut summaries: Vec<TraversalStateSummary> = states
                .iter()
                .map(|state| TraversalStateSummary {
                    remaining_outlinks_depth: state.remaining_outlinks_depth,
                    remaining_inlinks_depth: state.remaining_inlinks_depth,
                })
                .collect();
            summaries.sort_by(|a, b| {
                b.remaining_outlinks_depth
                    .cmp(&a.remaining_outlinks_depth)
                    .then_with(|| {
                        b.remaining_inlinks_depth
                            .cmp(&a.remaining_inlinks_depth)
                    })
            });
            Some(WorkingNode {
                file,
                depth: display.semantic_depth,
                remaining_depth: display.remaining_outlinks_depth,
                remaining_inlinks_depth: display.remaining_inlinks_depth,
                path: display.path,
                traversal_details: Some(TraversalDetails {
                    outlinks_depth_set_first_time: (display.link_type == LinkType::Start)
                        .then_some(display.remaining_outlinks_depth),
                    outlinks_depth_inherited: (display.link_type != LinkType::Start)
                        .then_some(display.remaining_outlinks_depth),
                    outlinks_depth_overridden: None,
                    inlinks_depth_set_first_time: (display.link_type == LinkType::Start)
                        .then_some(display.remaining_inlinks_depth),
                    inlinks_depth_inherited: (display.link_type != LinkType::Start)
                        .then_some(display.remaining_inlinks_depth),
                    inlinks_depth_overridden: None,
                    link_type: Some(display.link_type),
                }),
                is_frontier_node: Some(display.remaining_outlinks_depth < 0),
                is_frontier_image_extension: Some(display.is_frontier_image_extension),
                traversal_states: Some(summaries),
            })
        })
        .collect()
}

pub fn deduplicate_edges(edges: &[WorkingEdge]) -> Vec<WorkingEdge> {
    let mut edge_map: HashMap<String, WorkingEdge> = HashMap::new();

    for e in edges {
        let forward_key = format!("{}->{}", e.from, e.to);
        let reverse_key = format!("{}->{}", e.to, e.from);

        if edge_map.contains_key(&reverse_key) {
            let mut existing = edge_map.get(&reverse_key).cloned().unwrap();

            if !e.is_traversal_only && !existing.is_traversal_only {
                existing.is_bidirectional = true;
                edge_map.insert(reverse_key, existing);
            } else if !e.is_traversal_only && existing.is_traversal_only {
                edge_map.remove(&reverse_key);
                edge_map.insert(
                    forward_key,
                    WorkingEdge {
                        from: e.from.clone(),
                        to: e.to.clone(),
                        bundle_edge_kind: e.bundle_edge_kind,
                        is_bidirectional: e.is_bidirectional,
                        is_traversal_only: e.is_traversal_only,
                    },
                );
            }
        } else if edge_map.contains_key(&forward_key) {
            let mut existing = edge_map.get(&forward_key).cloned().unwrap();
            if e.is_bidirectional {
                existing.is_bidirectional = true;
                edge_map.insert(forward_key, existing);
            } else if !e.is_traversal_only && existing.is_traversal_only {
                edge_map.insert(
                    forward_key,
                    WorkingEdge {
                        from: e.from.clone(),
                        to: e.to.clone(),
                        bundle_edge_kind: e.bundle_edge_kind,
                        is_bidirectional: e.is_bidirectional,
                        is_traversal_only: e.is_traversal_only,
                    },
                );
            }
        } else {
            edge_map.insert(
                forward_key,
                WorkingEdge {
                    from: e.from.clone(),
                    to: e.to.clone(),
                    bundle_edge_kind: e.bundle_edge_kind,
                    is_bidirectional: e.is_bidirectional,
                    is_traversal_only: e.is_traversal_only,
                },
            );
        }
    }

    edge_map.into_values().collect()
}

pub fn get_working_graph(
    edges: &[BasicEdge],
    bundle_node_configs: &[BundleNodeConfig],
    entry_node: &FileBundleNode,
    default_traversal_node: &FileBundleNode,
    default_outlinks_depth: Option<i32>,
    default_inlinks_depth: Option<i32>,
    traversal_opts: TraverseOpts,
    frontier_depth: i32,
    allow_images_to_extend_to_frontier: bool,
) -> anyhow::Result<(Vec<WorkingNode>, Vec<WorkingEdge>)> {
    find_matching_config(
        bundle_node_configs,
        &entry_node.bundle_node_name,
        &entry_node.source_graph_subdirectory,
        &entry_node.file_type,
    )
    .ok_or_else(|| {
        anyhow::anyhow!(
            "Entry node config not found for {} (directory: {}, file_type: {})",
            entry_node.bundle_node_name,
            if entry_node.source_graph_subdirectory.is_empty() {
                "(root)"
            } else {
                &entry_node.source_graph_subdirectory
            },
            entry_node.file_type
        )
    })?;

    let max_depth = default_outlinks_depth.unwrap_or(i32::MAX);
    let inlinks_depth = default_inlinks_depth.unwrap_or(0);

    let graph = BundleNodeGraph::new(
        edges,
        entry_node,
        bundle_node_configs.to_vec(),
        BuildOpts {
            max_depth,
            inlinks_depth,
            frontier_depth,
            allow_images_to_extend_to_frontier,
        },
    );

    let traversed_nodes = graph.traverse(default_traversal_node, traversal_opts);
    let traversed_keys: HashSet<String> = traversed_nodes
        .iter()
        .map(|node| node.file.bundle_node_key())
        .collect();

    let filtered_edges: Vec<WorkingEdge> = graph
        .edges
        .iter()
        .filter(|e| traversed_keys.contains(&e.from) && traversed_keys.contains(&e.to))
        .cloned()
        .collect();

    let working_edges = deduplicate_edges(&filtered_edges);
    Ok((traversed_nodes, working_edges))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bundle_node_config::BundleNodeConfig;
    use crate::types::{BasicEdge, FileBundleNode, LinkType, WorkingNode};

    fn file(title: &str, file_type: &str) -> FileBundleNode {
        FileBundleNode {
            source_graph_subdirectory: "".to_string(),
            bundle_node_name: title.to_string(),
            file_type: file_type.to_string(),
            bundle_node_id: None,
            is_sensitive: false,
            conf_outlinks_depth: None,
            conf_inlinks_depth: None,
            conf_is_blacklisted: None,
        }
    }

    fn sorted_nodes(nodes: &[WorkingNode]) -> Vec<WorkingNode> {
        let mut out = nodes.to_vec();
        out.sort_by(|a, b| {
            if a.depth != b.depth {
                a.depth.cmp(&b.depth)
            } else {
                a.file.bundle_node_name.cmp(&b.file.bundle_node_name)
            }
        });
        out
    }

    fn name_and_depth(nodes: &[WorkingNode]) -> Vec<String> {
        sorted_nodes(nodes)
            .into_iter()
            .map(|n| format!("{}:{}", n.file.bundle_node_name, n.depth))
            .collect()
    }

    fn name_and_remaining_depth(nodes: &[WorkingNode]) -> Vec<String> {
        sorted_nodes(nodes)
            .into_iter()
            .map(|n| format!("{}:{}", n.file.bundle_node_name, n.remaining_depth))
            .collect()
    }

    fn name_and_remaining_inlinks_depth(nodes: &[WorkingNode]) -> Vec<String> {
        sorted_nodes(nodes)
            .into_iter()
            .map(|n| format!("{}:{}", n.file.bundle_node_name, n.remaining_inlinks_depth))
            .collect()
    }

    fn link_type_str(lt: LinkType) -> &'static str {
        match lt {
            LinkType::Start => "start",
            LinkType::Outlink => "outlink",
            LinkType::Inlink => "inlink",
            LinkType::Bidirectional => "bidirectional",
        }
    }

    fn traversal_details_string(nodes: &[WorkingNode]) -> Vec<String> {
        sorted_nodes(nodes)
            .into_iter()
            .map(|n| {
                let details = n.traversal_details.clone();
                if details.is_none() {
                    return format!("{}: no details", n.file.bundle_node_name);
                }
                let d = details.unwrap();
                let mut parts: Vec<String> = vec![format!("{}:", n.file.bundle_node_name)];
                if let Some(v) = d.outlinks_depth_set_first_time {
                    parts.push(format!("gd_first={}", v));
                }
                if let Some(v) = d.outlinks_depth_inherited {
                    parts.push(format!("gd_inherited={}", v));
                }
                if let Some(v) = d.outlinks_depth_overridden {
                    parts.push(format!("gd_override={}", v));
                }
                if let Some(v) = d.inlinks_depth_set_first_time {
                    parts.push(format!("id_first={}", v));
                }
                if let Some(v) = d.inlinks_depth_inherited {
                    parts.push(format!("id_inherited={}", v));
                }
                if let Some(v) = d.inlinks_depth_overridden {
                    parts.push(format!("id_override={}", v));
                }
                if let Some(lt) = d.link_type {
                    parts.push(format!("link={}", link_type_str(lt)));
                }
                parts.join(" ")
            })
            .collect()
    }

    fn conf(
        bundle_node_name: &str,
        list_type: &str,
        outlinks_depth: Option<i32>,
        inlinks_depth: Option<i32>,
    ) -> BundleNodeConfig {
        BundleNodeConfig::file(
            bundle_node_name.to_string(),
            None,
            "md".to_string(),
            format!("{:0<12}", bundle_node_name.to_ascii_lowercase()),
            list_type.to_string(),
            outlinks_depth,
            inlinks_depth,
        )
    }

    fn default_confs() -> Vec<BundleNodeConfig> {
        vec![conf("A", "whitelist", None, None)]
    }

    #[test]
    fn multi_seed_traversal_retains_non_dominated_budget_states() {
        let a = file("A", "md");
        let b = file("B", "md");
        let d = file("D", "md");
        let e = file("E", "md");
        let edges = vec![
            BasicEdge { source: a.clone(), target: b.clone(), is_bidirectional: false },
            BasicEdge { source: b.clone(), target: d, is_bidirectional: false },
            BasicEdge { source: e, target: b.clone(), is_bidirectional: false },
        ];
        let nodes = get_multi_seed_working_nodes(
            &edges,
            &[],
            &[
                MultiSeed {
                    file: a,
                    outlinks_depth: 2,
                    inlinks_depth: 0,
                    structural_path: vec!["folder:".to_string()],
                },
                MultiSeed {
                    file: b,
                    outlinks_depth: 0,
                    inlinks_depth: 2,
                    structural_path: vec!["folder:".to_string()],
                },
            ],
            &HashSet::new(),
            0,
            false,
        );
        let names: HashSet<&str> = nodes.iter().map(|node| node.file.bundle_node_name.as_str()).collect();
        assert!(names.contains("D"), "outlink-useful state must be explored");
        assert!(names.contains("E"), "inlink-useful state must be explored");
        let b_node = nodes.iter().find(|node| node.file.bundle_node_name == "B").unwrap();
        assert_eq!(
            b_node.traversal_states.as_ref().unwrap(),
            &vec![
                TraversalStateSummary { remaining_outlinks_depth: 1, remaining_inlinks_depth: 0 },
                TraversalStateSummary { remaining_outlinks_depth: 0, remaining_inlinks_depth: 2 },
            ]
        );
    }

    #[test]
    fn multi_seed_traversal_discards_dominated_states_and_suppresses_cycles() {
        let a = file("A", "md");
        let b = file("B", "md");
        let edges = vec![
            BasicEdge { source: a.clone(), target: b.clone(), is_bidirectional: false },
            BasicEdge { source: b.clone(), target: a, is_bidirectional: false },
        ];
        let nodes = get_multi_seed_working_nodes(
            &edges,
            &[],
            &[
                MultiSeed {
                    file: b.clone(),
                    outlinks_depth: 2,
                    inlinks_depth: 0,
                    structural_path: vec![],
                },
                MultiSeed {
                    file: b.clone(),
                    outlinks_depth: 0,
                    inlinks_depth: 2,
                    structural_path: vec![],
                },
                MultiSeed {
                    file: b,
                    outlinks_depth: 2,
                    inlinks_depth: 2,
                    structural_path: vec![],
                },
            ],
            &HashSet::new(),
            0,
            false,
        );
        assert_eq!(nodes.len(), 2);
        let b_node = nodes.iter().find(|node| node.file.bundle_node_name == "B").unwrap();
        assert_eq!(
            b_node.traversal_states.as_ref().unwrap(),
            &vec![TraversalStateSummary { remaining_outlinks_depth: 2, remaining_inlinks_depth: 2 }]
        );
    }

    fn default_conf_with_overrides(
        outlinks_depth: Option<i32>,
        inlinks_depth: Option<i32>,
    ) -> BundleNodeConfig {
        let mut c = default_confs()[0].clone();
        if let BundleNodeConfig::File {
            outlinks_depth: configured_outlinks_depth,
            inlinks_depth: configured_inlinks_depth,
            ..
        } = &mut c
        {
            if outlinks_depth.is_some() {
                *configured_outlinks_depth = outlinks_depth;
            }
            if inlinks_depth.is_some() {
                *configured_inlinks_depth = inlinks_depth;
            }
        }
        c
    }

    fn my_get_working_graph(
        edges: &[BasicEdge],
        bundle_node_configs: &[BundleNodeConfig],
        entry_node: &FileBundleNode,
        default_traversal_node: &FileBundleNode,
        allow_lower_depths: bool,
        frontier_depth: i32,
        allow_images_to_extend_to_frontier: bool,
    ) -> (Vec<WorkingNode>, Vec<WorkingEdge>) {
        get_working_graph(
            edges,
            bundle_node_configs,
            entry_node,
            default_traversal_node,
            Some(4),
            Some(0),
            TraverseOpts { allow_lower_depths },
            frontier_depth,
            allow_images_to_extend_to_frontier,
        )
        .unwrap()
    }

    fn edge_descriptions(edges: &[WorkingEdge], nodes: &[WorkingNode]) -> Vec<String> {
        let id_to_title: HashMap<String, String> = nodes
            .iter()
            .map(|n| (n.file.bundle_node_key(), n.file.bundle_node_name.clone()))
            .collect();
        let mut out: Vec<String> = edges
            .iter()
            .map(|e| {
                let from = id_to_title.get(&e.from).cloned().unwrap_or(e.from.clone());
                let to = id_to_title.get(&e.to).cloned().unwrap_or(e.to.clone());
                if e.is_bidirectional {
                    format!("{}->{} (bi)", from, to)
                } else {
                    format!("{}->{}", from, to)
                }
            })
            .collect();
        out.sort();
        out
    }

    #[test]
    fn building_by_default_does_not_include_inlinks() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs = default_confs();
        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2"]
        );
    }

    #[test]
    fn building_includes_bidirectional_inlinks_even_if_inlinks_depth_0() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs = default_confs();
        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2"]
        );
    }

    #[test]
    fn building_respects_outlinks_depth_for_default_outlinks_only() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
        ];

        let confs = vec![default_conf_with_overrides(Some(1), None)];
        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1", "D:1"]);
    }

    #[test]
    fn building_follows_inlinks_if_inlinks_depth_gt_0() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs = vec![default_conf_with_overrides(None, Some(max_inlinks_depth))];
        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        let full_listing = vec![
            "A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3", "I:4", "J:4",
        ];
        assert_eq!(name_and_depth(&nodes), full_listing);
    }

    #[test]
    fn building_respects_outlinks_depth_with_inlinks() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs = vec![default_conf_with_overrides(
            Some(1),
            Some(max_inlinks_depth),
        )];
        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1", "D:1", "F:1"]);
    }

    #[test]
    fn conf_outlinks_depth_override_allows_deeper_pages_1() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(1), Some(max_inlinks_depth)),
            conf("B", "whitelist", Some(1), None),
        ];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2"]
        );
        assert_eq!(
            name_and_remaining_depth(&nodes),
            vec!["A:1", "B:1", "D:0", "F:0", "C:0", "E:0", "G:0"]
        );
    }

    #[test]
    fn conf_outlinks_depth_override_allows_deeper_pages_2() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(1), Some(max_inlinks_depth)),
            conf("B", "whitelist", Some(2), None),
        ];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3"]
        );
        assert_eq!(
            name_and_remaining_depth(&nodes),
            vec!["A:1", "B:2", "D:0", "F:0", "C:1", "E:1", "G:1", "H:0"]
        );
    }

    #[test]
    fn conf_inlinks_depth_override_can_disable_inlinks_for_deeper_pages() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(2), Some(max_inlinks_depth)),
            conf("B", "whitelist", None, Some(0)),
        ];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2"]
        );
    }

    #[test]
    fn conf_inlinks_depth_override_can_enable_inlinks_for_deeper_pages() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(1), Some(0)),
            conf("B", "whitelist", Some(3), Some(max_inlinks_depth)),
        ];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2", "G:2", "H:3", "I:4", "J:4"]
        );
    }

    #[test]
    fn inlinks_depth_decreases_by_one_each_level() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(4), Some(2))];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3", "I:4"]
        );
    }

    #[test]
    fn inlinks_depth_of_one_only_allows_inlinks_at_same_depth() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(4), Some(1))];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2"]
        );
        assert_eq!(
            name_and_remaining_inlinks_depth(&nodes),
            vec!["A:1", "B:0", "D:0", "F:0", "C:0", "E:0"]
        );
    }

    #[test]
    fn remaining_depth_tracked_depth_two() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(0))];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_remaining_depth(&nodes),
            vec!["A:2", "B:1", "D:1", "C:0", "E:0"]
        );
    }

    #[test]
    fn remaining_depth_tracked_depth_one() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_d = file("D", "md");
        let node_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> =
            vec![conf("A", "whitelist", Some(1), Some(max_inlinks_depth))];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_remaining_depth(&nodes),
            vec!["A:1", "B:0", "D:0", "F:0"]
        );
    }

    #[test]
    fn depth_limiting_respects_outlinks_depth_limit() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> =
            vec![conf("A", "whitelist", Some(2), Some(max_inlinks_depth))];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_remaining_depth(&nodes),
            vec!["A:2", "B:1", "D:1", "F:1", "C:0", "E:0", "G:0"]
        );
    }

    #[test]
    fn blacklisted_pages_included_but_cutoff() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(2), Some(max_inlinks_depth)),
            conf("B", "blacklist", None, None),
        ];

        let (nodes, _edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1", "D:1", "F:1"]);
    }

    #[test]
    fn blacklisted_pages_do_not_extend_depth_via_conf_outlinks_depth() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(1), Some(max_inlinks_depth)),
            conf("B", "blacklist", Some(2), None),
        ];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        // B is blacklisted; its outlinks_depth override must not pull in C/E/G.
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1", "D:1", "F:1"]);
    }

    #[test]
    fn traverse_can_start_from_different_points() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs = default_confs();

        let (pages_from_a, _) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&pages_from_a),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2"]
        );

        let (pages_from_b, _) =
            my_get_working_graph(&edges, &confs, &node_a, &node_b, false, 0, true);
        assert_eq!(name_and_depth(&pages_from_b), vec!["B:1", "C:2", "E:2"]);
    }

    #[test]
    fn traverse_should_only_traverse_to_same_or_greater_depth_by_default() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
        ];

        let confs = vec![default_conf_with_overrides(None, Some(max_inlinks_depth))];
        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_g, false, 0, true);
        assert_eq!(name_and_depth(&nodes), vec!["G:2", "H:3", "I:4", "J:4"]);
    }

    #[test]
    fn traverse_should_traverse_to_all_pages_if_allow_lower_depths_true() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_d.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs = vec![default_conf_with_overrides(None, Some(max_inlinks_depth))];
        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_g, true, 0, true);
        let full_listing = vec![
            "A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3", "I:4", "J:4",
        ];
        assert_eq!(name_and_depth(&nodes), full_listing);
    }

    #[test]
    fn edge_dedup_does_not_create_duplicate_pairs() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(1))];

        let (nodes, result_edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &nodes);

        let mut undirected_pairs: HashSet<String> = HashSet::new();
        for desc in descriptions {
            let parts: Vec<&str> = desc
                .split_whitespace()
                .next()
                .unwrap()
                .split("->")
                .collect();
            if parts.len() == 2 {
                let mut a = parts[0].to_string();
                let mut b = parts[1].to_string();
                if a > b {
                    std::mem::swap(&mut a, &mut b);
                }
                let key = format!("{}-{}", a, b);
                assert!(!undirected_pairs.contains(&key));
                undirected_pairs.insert(key);
            }
        }
    }

    #[test]
    fn edge_marked_bidirectional_when_raw_edge_is_bidirectional() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            // Raw bidirectional edge (purposefully backwards)
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(0))];

        let (nodes, result_edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &nodes);
        assert!(descriptions
            .iter()
            .any(|d| d == "B->E (bi)" || d == "E->B (bi)"));
    }

    #[test]
    fn edge_keeps_unidirectional_edges_as_non_bidirectional() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_d = file("D", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(0))];

        let (nodes, result_edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &nodes);
        assert!(descriptions.contains(&"A->B".to_string()));
        assert!(descriptions.contains(&"A->D".to_string()));
        assert!(!descriptions.contains(&"A->B (bi)".to_string()));
        assert!(!descriptions.contains(&"A->D (bi)".to_string()));
    }

    #[test]
    fn edge_does_not_become_bidirectional_due_to_inlink_traversal_only_reverse() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_d = file("D", "md");
        let node_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            }, // inlink to A
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(1))];

        let (nodes, result_edges) =
            my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &nodes);
        // There should be an edge between F and A, but it must not be bidirectional.
        assert!(descriptions.iter().any(|d| d == "F->A" || d == "A->F"));
        assert!(!descriptions
            .iter()
            .any(|d| d == "F->A (bi)" || d == "A->F (bi)"));
    }

    #[test]
    fn traversal_details_are_tracked() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", None, None),
            conf("B", "whitelist", Some(1), Some(0)),
        ];

        let (nodes, _) = get_working_graph(
            &edges,
            &confs,
            &node_a,
            &node_a,
            Some(2),
            Some(1),
            TraverseOpts {
                allow_lower_depths: false,
            },
            0,
            true,
        )
        .unwrap();
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2"]
        );
        assert_eq!(
            traversal_details_string(&nodes),
            vec![
                "A: gd_first=2 id_first=1 link=start",
                "B: gd_inherited=1 gd_override=1 id_inherited=0 id_override=0 link=outlink",
                "D: gd_inherited=1 id_inherited=0 link=outlink",
                "F: gd_inherited=1 id_inherited=0 link=inlink",
                "C: gd_inherited=0 id_inherited=0 link=outlink",
                "E: gd_inherited=0 id_inherited=0 link=bidirectional"
            ]
        );
    }

    #[test]
    fn does_not_process_inlinks_when_remaining_inlinks_depth_is_zero() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_f = file("F", "md");
        let node_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_f.clone(),
                target: node_a.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(4), Some(0))];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2"]
        );
        assert_eq!(
            name_and_remaining_inlinks_depth(&nodes),
            vec!["A:0", "B:0", "D:0", "C:0", "E:0"]
        );
    }

    #[test]
    fn frontier_image_extension_includes_images_at_frontier_edge_when_enabled() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let img = file("IMG", "png");
        let md_link = file("MD_LINK", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: img.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: md_link.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(0))];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1", "C:2", "IMG:3"]);

        let img_page = nodes
            .iter()
            .find(|p| p.file.bundle_node_name == "IMG")
            .unwrap();
        assert_eq!(img_page.is_frontier_image_extension, Some(true));
        assert_eq!(img_page.is_frontier_node, Some(false));
    }

    #[test]
    fn frontier_image_extension_excludes_images_when_disabled() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let img = file("IMG", "png");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: img.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(0))];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, false);
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1", "C:2"]);
    }

    #[test]
    fn frontier_image_extension_does_not_extend_beyond_one_level_past_frontier() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let img = file("IMG", "png");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: img.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(1), Some(0))];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(name_and_depth(&nodes), vec!["A:0", "B:1"]);
    }

    #[test]
    fn frontier_image_extension_includes_multiple_images_at_frontier_edge() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let img1 = file("IMG", "png");
        let img2 = file("IMG2", "jpg");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: img1.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: img2.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(2), Some(0))];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "C:2", "IMG:3", "IMG2:3"]
        );

        let img1_page = nodes
            .iter()
            .find(|p| p.file.bundle_node_name == "IMG")
            .unwrap();
        let img2_page = nodes
            .iter()
            .find(|p| p.file.bundle_node_name == "IMG2")
            .unwrap();
        assert_eq!(img1_page.is_frontier_image_extension, Some(true));
        assert_eq!(img2_page.is_frontier_image_extension, Some(true));
    }

    #[test]
    fn frontier_image_extension_does_not_mark_normal_images_as_extension() {
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let img = file("IMG", "png");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_c.clone(),
                target: img.clone(),
                is_bidirectional: false,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![conf("A", "whitelist", Some(4), Some(0))];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        let img_page = nodes
            .iter()
            .find(|p| p.file.bundle_node_name == "IMG")
            .unwrap();
        assert_ne!(img_page.is_frontier_image_extension, Some(true));
    }

    #[test]
    fn conf_inlinks_depth_can_override_twice() {
        let max_inlinks_depth = 100;
        let node_a = file("A", "md");
        let node_b = file("B", "md");
        let node_c = file("C", "md");
        let node_d = file("D", "md");
        let node_e = file("E", "md");
        let node_g = file("G", "md");
        let node_h = file("H", "md");
        let node_i = file("I", "md");
        let node_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge {
                source: node_a.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_a.clone(),
                target: node_d.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_b.clone(),
                target: node_c.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_h.clone(),
                target: node_i.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_g.clone(),
                target: node_b.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_j.clone(),
                target: node_h.clone(),
                is_bidirectional: false,
            },
            BasicEdge {
                source: node_e.clone(),
                target: node_b.clone(),
                is_bidirectional: true,
            },
        ];

        let confs: Vec<BundleNodeConfig> = vec![
            conf("A", "whitelist", Some(1), Some(0)),
            conf("B", "whitelist", Some(3), Some(max_inlinks_depth)),
            conf("G", "whitelist", None, Some(0)),
        ];

        let (nodes, _) = my_get_working_graph(&edges, &confs, &node_a, &node_a, false, 0, true);
        // J should not be included because G's conf_inlinks_depth is 0.
        assert_eq!(
            name_and_depth(&nodes),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2", "G:2", "H:3", "I:4"]
        );
    }
}
