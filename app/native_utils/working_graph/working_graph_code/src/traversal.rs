use crate::site_page_config::{find_matching_config, SitePageConfig};
use crate::types::{is_image_file_type, BasicEdge, LinkType, TraversalDetails, TraversalFile, WorkingEdge, WorkingPage};
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
pub struct PageFileGraph {
    pub pages: HashMap<String, WorkingPage>,
    pub edges: Vec<WorkingEdge>,
    site_page_configs: Vec<SitePageConfig>,
    opts: BuildOpts,
}

impl PageFileGraph {
    pub fn new(raw_edges: &[BasicEdge], start: &TraversalFile, site_page_configs: Vec<SitePageConfig>, opts: BuildOpts) -> Self {
        let mut g = Self {
            pages: HashMap::new(),
            edges: Vec::new(),
            site_page_configs,
            opts,
        };
        g.build_graph(raw_edges, start);
        g
    }

    fn apply_config_to_file(configs: &[SitePageConfig], f: &mut TraversalFile) {
        if let Some(conf) = find_matching_config(configs, &f.title, &f.directory, &f.file_type) {
            f.conf_outlinks_depth = conf.config.outlinks_depth;
            f.conf_inlinks_depth = conf.config.inlinks_depth;
            f.conf_is_blacklisted = Some(conf.config.list_type == "blacklist");
        }
    }

    fn build_graph(&mut self, raw_edges: &[BasicEdge], start_file: &TraversalFile) {
        let frontier_depth = self.opts.frontier_depth.max(0);

        // Pre-build adjacency lists to avoid O(V*E) scanning.
        let mut out_map: HashMap<String, Vec<(String, bool)>> = HashMap::new();
        let mut in_map: HashMap<String, Vec<(String, bool)>> = HashMap::new();
        let mut file_map: HashMap<String, TraversalFile> = HashMap::new();

        for e in raw_edges {
            let sid = e.source.ident();
            let tid = e.target.ident();
            file_map.entry(sid.clone()).or_insert_with(|| e.source.clone());
            file_map.entry(tid.clone()).or_insert_with(|| e.target.clone());
            out_map.entry(sid.clone()).or_default().push((tid.clone(), e.is_bidirectional));
            in_map.entry(tid.clone()).or_default().push((sid.clone(), e.is_bidirectional));
        }

        // Ensure start exists in file_map.
        let start_id = start_file.ident();
        file_map.entry(start_id.clone()).or_insert_with(|| start_file.clone());

        // Apply configs to all files (mirrors TS where conf_* is assigned across all edge endpoints).
        for f in file_map.values_mut() {
            Self::apply_config_to_file(&self.site_page_configs, f);
        }

        let start_file_conf = file_map.get(&start_id).cloned().unwrap_or_else(|| start_file.clone());
        let mut start_file_with_conf = start_file_conf.clone();
        Self::apply_config_to_file(&self.site_page_configs, &mut start_file_with_conf);

        let initial_remaining_depth_for_start = start_file_with_conf.conf_outlinks_depth.unwrap_or(self.opts.max_depth);
        let initial_inherited_inlinks_depth_for_start = start_file_with_conf.conf_inlinks_depth.unwrap_or(self.opts.inlinks_depth);
        let start_path = vec![start_id.clone()];

        let start_page = WorkingPage {
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
            is_frontier_page: None,
            is_frontier_image_extension: None,
        };
        self.pages.insert(start_id.clone(), start_page);

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

            // Update the page's conf fields from configs (mirrors TS behavior).
            if let Some(n) = self.pages.get_mut(&current_key) {
                Self::apply_config_to_file(&self.site_page_configs, &mut n.file);
            }

            if let Some(prev) = visited_at_min_depth.get(&current_key) {
                if *prev < cur.depth {
                    continue;
                }
            }
            visited_at_min_depth.insert(current_key.clone(), cur.depth);

            let current_is_blacklisted = self
                .pages
                .get(&current_key)
                .and_then(|n| n.file.conf_is_blacklisted)
                .unwrap_or(false);
            if current_is_blacklisted {
                continue;
            }

            let current_page_snapshot = self.pages.get(&current_key).cloned().expect("page exists");
            let current_file = current_page_snapshot.file.clone();
            let current_remaining_inlinks_depth = current_page_snapshot.remaining_inlinks_depth;

            let mut process_connection = |target_key: &str, link_type: LinkType, raw_edge_is_bidirectional: bool| {
                let child_depth = cur.depth + 1;
                let mut child_path = cur.path.clone();
                child_path.push(target_key.to_string());

                let current_conf_outlinks_depth = current_file.conf_outlinks_depth;
                let current_conf_is_blacklisted = current_file.conf_is_blacklisted.unwrap_or(false);
                let max_allowed_child_outlinks_depth = if current_conf_outlinks_depth.is_some() && !current_conf_is_blacklisted {
                    cur.depth.saturating_add(current_conf_outlinks_depth.unwrap()).saturating_add(frontier_depth)
                } else {
                    cur.depth.saturating_add(cur.remaining_depth).saturating_add(frontier_depth)
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

                let target_conf_is_blacklisted = target_file.conf_is_blacklisted.unwrap_or(false);
                let target_prospective_remaining_depth = if target_file.conf_outlinks_depth.is_some() && !target_conf_is_blacklisted {
                    target_file.conf_outlinks_depth.unwrap()
                } else {
                    cur.remaining_depth - 1
                };

                let target_inherited_inlinks_depth =
                    target_file
                        .conf_inlinks_depth
                        .unwrap_or_else(|| (cur.inherited_inlinks_depth - 1).max(0));

                let needs_update_and_queue: bool;
                if !self.pages.contains_key(target_key) {
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
                        traversal_details.outlinks_depth_inherited = Some(cur.remaining_depth - 1);
                    }
                    if let Some(conf_id) = target_file.conf_inlinks_depth {
                        traversal_details.inlinks_depth_overridden = Some(conf_id);
                        traversal_details.inlinks_depth_inherited = Some((cur.inherited_inlinks_depth - 1).max(0));
                    }

                    let is_frontier_page = target_prospective_remaining_depth < 0 && !is_frontier_image_extension_case;

                    let target_page = WorkingPage {
                        file: target_file.clone(),
                        depth: child_depth,
                        remaining_depth: target_prospective_remaining_depth,
                        remaining_inlinks_depth: target_inherited_inlinks_depth,
                        path: child_path.clone(),
                        traversal_details: Some(traversal_details),
                        is_frontier_page: Some(is_frontier_page),
                        is_frontier_image_extension: Some(is_frontier_image_extension_case),
                    };
                    self.pages.insert(target_key.to_string(), target_page);
                    needs_update_and_queue = true;
                } else {
                    let mut should_queue = false;
                    if let Some(existing) = self.pages.get_mut(target_key) {
                        if existing.depth > child_depth {
                            existing.depth = child_depth;
                            existing.remaining_depth = target_prospective_remaining_depth;
                            existing.remaining_inlinks_depth = target_inherited_inlinks_depth;
                            existing.path = child_path.clone();
                            existing.is_frontier_page =
                                Some(target_prospective_remaining_depth < 0 && !is_frontier_image_extension_case);
                            existing.is_frontier_image_extension = Some(is_frontier_image_extension_case);
                            should_queue = true;
                        } else if existing.depth == child_depth {
                            if target_prospective_remaining_depth > existing.remaining_depth {
                                existing.remaining_depth = target_prospective_remaining_depth;
                                existing.remaining_inlinks_depth = target_inherited_inlinks_depth;
                                existing.path = child_path.clone();
                                existing.is_frontier_page =
                                    Some(target_prospective_remaining_depth < 0 && !is_frontier_image_extension_case);
                                existing.is_frontier_image_extension = Some(is_frontier_image_extension_case);
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
                    LinkType::Outlink | LinkType::Bidirectional => self.edges.push(WorkingEdge {
                        from: current_key.clone(),
                        to: target_key.to_string(),
                        is_bidirectional: raw_edge_is_bidirectional,
                        is_traversal_only: false,
                    }),
                    LinkType::Inlink => self.edges.push(WorkingEdge {
                        from: current_key.clone(),
                        to: target_key.to_string(),
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

    pub fn traverse(&self, from: &TraversalFile, opts: TraverseOpts) -> Vec<WorkingPage> {
        let start_key = from.ident();
        let start_page = match self.pages.get(&start_key) {
            Some(n) => n.clone(),
            None => return vec![],
        };

        let min_depth = start_page.depth;
        let mut result: Vec<WorkingPage> = Vec::new();
        let mut visited: HashMap<String, i32> = HashMap::new();

        fn dfs(
            g: &PageFileGraph,
            page: &WorkingPage,
            opts: &TraverseOpts,
            min_depth: i32,
            visited: &mut HashMap<String, i32>,
            result: &mut Vec<WorkingPage>,
        ) {
            let key = page.file.ident();
            if !opts.allow_lower_depths && page.depth < min_depth {
                return;
            }
            if let Some(prev_depth) = visited.get(&key) {
                if *prev_depth <= page.depth {
                    return;
                }
            }
            visited.insert(key.clone(), page.depth);
            result.push(page.clone());

            for e in &g.edges {
                if e.from == key {
                    if let Some(to_page) = g.pages.get(&e.to) {
                        dfs(g, to_page, opts, min_depth, visited, result);
                    }
                } else if e.to == key {
                    let conf_inlinks_depth = page.file.conf_inlinks_depth.unwrap_or(0);
                    let should_follow_incoming = opts.allow_lower_depths || conf_inlinks_depth > 0;
                    if should_follow_incoming {
                        if let Some(from_page) = g.pages.get(&e.from) {
                            dfs(g, from_page, opts, min_depth, visited, result);
                        }
                    }
                }
            }
        }

        dfs(self, &start_page, &opts, min_depth, &mut visited, &mut result);
        result
    }
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
    site_page_configs: &[SitePageConfig],
    initial_page: &TraversalFile,
    traversal_page: &TraversalFile,
    traversal_opts: TraverseOpts,
    frontier_depth: i32,
    allow_images_to_extend_to_frontier: bool,
) -> anyhow::Result<(Vec<WorkingPage>, Vec<WorkingEdge>)> {
    let initial_conf = find_matching_config(site_page_configs, &initial_page.title, &initial_page.directory, &initial_page.file_type)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "Initial page conf not found for {} (directory: {}, file_type: {})",
                initial_page.title,
                if initial_page.directory.is_empty() { "(root)" } else { &initial_page.directory },
                initial_page.file_type
            )
        })?;

    let max_depth = initial_conf.config.outlinks_depth.unwrap_or(i32::MAX);
    let inlinks_depth = initial_conf.config.inlinks_depth.unwrap_or(0);

    let graph = PageFileGraph::new(
        edges,
        initial_page,
        site_page_configs.to_vec(),
        BuildOpts {
            max_depth,
            inlinks_depth,
            frontier_depth,
            allow_images_to_extend_to_frontier,
        },
    );

    let traversed_pages = graph.traverse(traversal_page, traversal_opts);
    let traversed_keys: HashSet<String> = traversed_pages.iter().map(|p| p.file.ident()).collect();

    let filtered_edges: Vec<WorkingEdge> = graph
        .edges
        .iter()
        .filter(|e| traversed_keys.contains(&e.from) && traversed_keys.contains(&e.to))
        .cloned()
        .collect();

    let working_edges = deduplicate_edges(&filtered_edges);
    Ok((traversed_pages, working_edges))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::site_page_config::{SitePageConfig, SitePageConfigConfig};
    use crate::types::{BasicEdge, LinkType, TraversalFile, WorkingPage};

    fn file(title: &str, file_type: &str) -> TraversalFile {
        TraversalFile {
            directory: "".to_string(),
            title: title.to_string(),
            file_type: file_type.to_string(),
            is_sensitive: false,
            conf_outlinks_depth: None,
            conf_inlinks_depth: None,
            conf_is_blacklisted: None,
        }
    }

    fn sorted_pages(pages: &[WorkingPage]) -> Vec<WorkingPage> {
        let mut out = pages.to_vec();
        out.sort_by(|a, b| {
            if a.depth != b.depth {
                a.depth.cmp(&b.depth)
            } else {
                a.file.title.cmp(&b.file.title)
            }
        });
        out
    }

    fn name_and_depth(pages: &[WorkingPage]) -> Vec<String> {
        sorted_pages(pages)
            .into_iter()
            .map(|n| format!("{}:{}", n.file.title, n.depth))
            .collect()
    }

    fn name_and_remaining_depth(pages: &[WorkingPage]) -> Vec<String> {
        sorted_pages(pages)
            .into_iter()
            .map(|n| format!("{}:{}", n.file.title, n.remaining_depth))
            .collect()
    }

    fn name_and_remaining_inlinks_depth(pages: &[WorkingPage]) -> Vec<String> {
        sorted_pages(pages)
            .into_iter()
            .map(|n| format!("{}:{}", n.file.title, n.remaining_inlinks_depth))
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

    fn traversal_details_string(pages: &[WorkingPage]) -> Vec<String> {
        sorted_pages(pages)
            .into_iter()
            .map(|n| {
                let details = n.traversal_details.clone();
                if details.is_none() {
                    return format!("{}: no details", n.file.title);
                }
                let d = details.unwrap();
                let mut parts: Vec<String> = vec![format!("{}:", n.file.title)];
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

    fn default_confs() -> Vec<SitePageConfig> {
        vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(4),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }]
    }

    fn default_conf_with_overrides(outlinks_depth: Option<i32>, inlinks_depth: Option<i32>) -> SitePageConfig {
        let mut c = default_confs()[0].clone();
        if outlinks_depth.is_some() {
            c.config.outlinks_depth = outlinks_depth;
        }
        if inlinks_depth.is_some() {
            c.config.inlinks_depth = inlinks_depth;
        }
        c
    }

    fn my_get_working_graph(
        edges: &[BasicEdge],
        site_page_configs: &[SitePageConfig],
        initial_page: &TraversalFile,
        traversal_page: &TraversalFile,
        allow_lower_depths: bool,
        frontier_depth: i32,
        allow_images_to_extend_to_frontier: bool,
    ) -> (Vec<WorkingPage>, Vec<WorkingEdge>) {
        get_working_graph(
            edges,
            site_page_configs,
            initial_page,
            traversal_page,
            TraverseOpts { allow_lower_depths },
            frontier_depth,
            allow_images_to_extend_to_frontier,
        )
        .unwrap()
    }

    fn edge_descriptions(edges: &[WorkingEdge], pages: &[WorkingPage]) -> Vec<String> {
        let id_to_title: HashMap<String, String> = pages
            .iter()
            .map(|n| (n.file.ident(), n.file.title.clone()))
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
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs = default_confs();
        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "C:2", "E:2"]);
    }

    #[test]
    fn building_includes_bidirectional_inlinks_even_if_inlinks_depth_0() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs = default_confs();
        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "C:2", "E:2"]);
    }

    #[test]
    fn building_respects_outlinks_depth_for_default_outlinks_only() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
        ];

        let confs = vec![default_conf_with_overrides(Some(1), None)];
        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1"]);
    }

    #[test]
    fn building_follows_inlinks_if_inlinks_depth_gt_0() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs = vec![default_conf_with_overrides(None, Some(max_inlinks_depth))];
        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        let full_listing = vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3", "I:4", "J:4"];
        assert_eq!(name_and_depth(&pages), full_listing);
    }

    #[test]
    fn building_respects_outlinks_depth_with_inlinks() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs = vec![default_conf_with_overrides(Some(1), Some(max_inlinks_depth))];
        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1"]);
    }

    #[test]
    fn conf_outlinks_depth_override_allows_deeper_pages_1() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: None,
                    tracked: None,
                },
            },
        ];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2"]);
        assert_eq!(
            name_and_remaining_depth(&pages),
            vec!["A:1", "B:1", "D:0", "F:0", "C:0", "E:0", "G:0"]
        );
    }

    #[test]
    fn conf_outlinks_depth_override_allows_deeper_pages_2() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(2),
                    inlinks_depth: None,
                    tracked: None,
                },
            },
        ];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3"]);
        assert_eq!(
            name_and_remaining_depth(&pages),
            vec!["A:1", "B:2", "D:0", "F:0", "C:1", "E:1", "G:1", "H:0"]
        );
    }

    #[test]
    fn conf_inlinks_depth_override_can_disable_inlinks_for_deeper_pages() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(2),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: None,
                    inlinks_depth: Some(0),
                    tracked: None,
                },
            },
        ];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2"]);
    }

    #[test]
    fn conf_inlinks_depth_override_can_enable_inlinks_for_deeper_pages() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: Some(0),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(3),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
        ];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(
            name_and_depth(&pages),
            vec!["A:0", "B:1", "D:1", "C:2", "E:2", "G:2", "H:3", "I:4", "J:4"]
        );
    }

    #[test]
    fn inlinks_depth_decreases_by_one_each_level() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(4),
                inlinks_depth: Some(2),
                tracked: None,
            },
        }];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3", "I:4"]);
    }

    #[test]
    fn inlinks_depth_of_one_only_allows_inlinks_at_same_depth() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(4),
                inlinks_depth: Some(1),
                tracked: None,
            },
        }];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2"]);
        assert_eq!(name_and_remaining_inlinks_depth(&pages), vec!["A:1", "B:0", "D:0", "F:0", "C:0", "E:0"]);
    }

    #[test]
    fn remaining_depth_tracked_depth_two() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_remaining_depth(&pages), vec!["A:2", "B:1", "D:1", "C:0", "E:0"]);
    }

    #[test]
    fn remaining_depth_tracked_depth_one() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_d = file("D", "md");
        let page_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(1),
                inlinks_depth: Some(max_inlinks_depth),
                tracked: None,
            },
        }];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_remaining_depth(&pages), vec!["A:1", "B:0", "D:0", "F:0"]);
    }

    #[test]
    fn depth_limiting_respects_outlinks_depth_limit() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(max_inlinks_depth),
                tracked: None,
            },
        }];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_remaining_depth(&pages), vec!["A:2", "B:1", "D:1", "F:1", "C:0", "E:0", "G:0"]);
    }

    #[test]
    fn blacklisted_pages_included_but_cutoff() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(2),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "blacklist".to_string(),
                    outlinks_depth: None,
                    inlinks_depth: None,
                    tracked: None,
                },
            },
        ];

        let (pages, _edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1"]);
    }

    #[test]
    fn blacklisted_pages_do_not_extend_depth_via_conf_outlinks_depth() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "blacklist".to_string(),
                    outlinks_depth: Some(2),
                    inlinks_depth: None,
                    tracked: None,
                },
            },
        ];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        // B is blacklisted; its outlinks_depth override must not pull in C/E/G.
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1"]);
    }

    #[test]
    fn traverse_can_start_from_different_points() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs = default_confs();

        let (pages_from_a, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages_from_a), vec!["A:0", "B:1", "D:1", "C:2", "E:2"]);

        let (pages_from_b, _) = my_get_working_graph(&edges, &confs, &page_a, &page_b, false, 0, true);
        assert_eq!(name_and_depth(&pages_from_b), vec!["B:1", "C:2", "E:2"]);
    }

    #[test]
    fn traverse_should_only_traverse_to_same_or_greater_depth_by_default() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
        ];

        let confs = vec![default_conf_with_overrides(None, Some(max_inlinks_depth))];
        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_g, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["G:2", "H:3", "I:4", "J:4"]);
    }

    #[test]
    fn traverse_should_traverse_to_all_pages_if_allow_lower_depths_true() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_d.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs = vec![default_conf_with_overrides(None, Some(max_inlinks_depth))];
        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_g, true, 0, true);
        let full_listing = vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2", "G:2", "H:3", "I:4", "J:4"];
        assert_eq!(name_and_depth(&pages), full_listing);
    }

    #[test]
    fn edge_dedup_does_not_create_duplicate_pairs() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(1),
                tracked: None,
            },
        }];

        let (pages, result_edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &pages);

        let mut undirected_pairs: HashSet<String> = HashSet::new();
        for desc in descriptions {
            let parts: Vec<&str> = desc.split_whitespace().next().unwrap().split("->").collect();
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
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            // Raw bidirectional edge (purposefully backwards)
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, result_edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &pages);
        assert!(descriptions.iter().any(|d| d == "B->E (bi)" || d == "E->B (bi)"));
    }

    #[test]
    fn edge_keeps_unidirectional_edges_as_non_bidirectional() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_d = file("D", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, result_edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &pages);
        assert!(descriptions.contains(&"A->B".to_string()));
        assert!(descriptions.contains(&"A->D".to_string()));
        assert!(!descriptions.contains(&"A->B (bi)".to_string()));
        assert!(!descriptions.contains(&"A->D (bi)".to_string()));
    }

    #[test]
    fn edge_does_not_become_bidirectional_due_to_inlink_traversal_only_reverse() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_d = file("D", "md");
        let page_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false }, // inlink to A
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(1),
                tracked: None,
            },
        }];

        let (pages, result_edges) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        let descriptions = edge_descriptions(&result_edges, &pages);
        // There should be an edge between F and A, but it must not be bidirectional.
        assert!(descriptions.iter().any(|d| d == "F->A" || d == "A->F"));
        assert!(!descriptions.iter().any(|d| d == "F->A (bi)" || d == "A->F (bi)"));
    }

    #[test]
    fn traversal_details_are_tracked() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(2),
                    inlinks_depth: Some(1),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: Some(0),
                    tracked: None,
                },
            },
        ];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "F:1", "C:2", "E:2"]);
        assert_eq!(
            traversal_details_string(&pages),
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
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_f = file("F", "md");
        let page_g = file("G", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_f.clone(), target: page_a.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(4),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "C:2", "E:2"]);
        assert_eq!(name_and_remaining_inlinks_depth(&pages), vec!["A:0", "B:0", "D:0", "C:0", "E:0"]);
    }

    #[test]
    fn frontier_image_extension_includes_images_at_frontier_edge_when_enabled() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let img = file("IMG", "png");
        let md_link = file("MD_LINK", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: img.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: md_link.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "C:2", "IMG:3"]);

        let img_page = pages.iter().find(|p| p.file.title == "IMG").unwrap();
        assert_eq!(img_page.is_frontier_image_extension, Some(true));
        assert_eq!(img_page.is_frontier_page, Some(false));
    }

    #[test]
    fn frontier_image_extension_excludes_images_when_disabled() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let img = file("IMG", "png");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: img.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, false);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "C:2"]);
    }

    #[test]
    fn frontier_image_extension_does_not_extend_beyond_one_level_past_frontier() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let img = file("IMG", "png");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: img.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(1),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1"]);
    }

    #[test]
    fn frontier_image_extension_includes_multiple_images_at_frontier_edge() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let img1 = file("IMG", "png");
        let img2 = file("IMG2", "jpg");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: img1.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: img2.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(2),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "C:2", "IMG:3", "IMG2:3"]);

        let img1_page = pages.iter().find(|p| p.file.title == "IMG").unwrap();
        let img2_page = pages.iter().find(|p| p.file.title == "IMG2").unwrap();
        assert_eq!(img1_page.is_frontier_image_extension, Some(true));
        assert_eq!(img2_page.is_frontier_image_extension, Some(true));
    }

    #[test]
    fn frontier_image_extension_does_not_mark_normal_images_as_extension() {
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let img = file("IMG", "png");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_c.clone(), target: img.clone(), is_bidirectional: false },
        ];

        let confs: Vec<SitePageConfig> = vec![SitePageConfig {
            title: "A".to_string(),
            source_graph_subdirectory: None,
            file_type: None,
            config: SitePageConfigConfig {
                list_type: "whitelist".to_string(),
                outlinks_depth: Some(4),
                inlinks_depth: Some(0),
                tracked: None,
            },
        }];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        let img_page = pages.iter().find(|p| p.file.title == "IMG").unwrap();
        assert_ne!(img_page.is_frontier_image_extension, Some(true));
    }

    #[test]
    fn conf_inlinks_depth_can_override_twice() {
        let max_inlinks_depth = 100;
        let page_a = file("A", "md");
        let page_b = file("B", "md");
        let page_c = file("C", "md");
        let page_d = file("D", "md");
        let page_e = file("E", "md");
        let page_g = file("G", "md");
        let page_h = file("H", "md");
        let page_i = file("I", "md");
        let page_j = file("J", "md");

        let edges: Vec<BasicEdge> = vec![
            BasicEdge { source: page_a.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_a.clone(), target: page_d.clone(), is_bidirectional: false },
            BasicEdge { source: page_b.clone(), target: page_c.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_h.clone(), target: page_i.clone(), is_bidirectional: false },
            BasicEdge { source: page_g.clone(), target: page_b.clone(), is_bidirectional: false },
            BasicEdge { source: page_j.clone(), target: page_h.clone(), is_bidirectional: false },
            BasicEdge { source: page_e.clone(), target: page_b.clone(), is_bidirectional: true },
        ];

        let confs: Vec<SitePageConfig> = vec![
            SitePageConfig {
                title: "A".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(1),
                    inlinks_depth: Some(0),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "B".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: Some(3),
                    inlinks_depth: Some(max_inlinks_depth),
                    tracked: None,
                },
            },
            SitePageConfig {
                title: "G".to_string(),
                source_graph_subdirectory: None,
                file_type: None,
                config: SitePageConfigConfig {
                    list_type: "whitelist".to_string(),
                    outlinks_depth: None,
                    inlinks_depth: Some(0),
                    tracked: None,
                },
            },
        ];

        let (pages, _) = my_get_working_graph(&edges, &confs, &page_a, &page_a, false, 0, true);
        // J should not be included because G's conf_inlinks_depth is 0.
        assert_eq!(name_and_depth(&pages), vec!["A:0", "B:1", "D:1", "C:2", "E:2", "G:2", "H:3", "I:4"]);
    }
}


