// Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0.
use serde_json::{json, Value};
use std::{fs, path::PathBuf, process::Command};

fn sources(include_reference: bool) -> Value {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../shared_data/source_graphs/multi-source");
    let mut sources = vec![
        json!({"id":"source000001","name":"notes","directory":fixture.join("notes")}),
        json!({"id":"source000002","name":"research","aliases":["papers"],"directory":fixture.join("research")}),
    ];
    if include_reference {
        sources.push(
            json!({"id":"source000003","name":"reference","directory":fixture.join("reference")}),
        );
    }
    json!(sources)
}

fn page() -> Value {
    json!({"sourceId":"source000001","bundleNodeName":"Start","sourceGraphSubdirectory":"","bundleNodeKind":"file","fileType":"md","bundleNodeId":"start0000001","listType":"whitelist"})
}

fn run(
    sources: &Value,
    nodes: Value,
    entry: &str,
    out: u32,
    incoming: u32,
    frontier: u32,
) -> Value {
    let temp = tempfile::tempdir().unwrap();
    let config = temp.path().join("nodes.yaml");
    fs::write(
        &config,
        serde_yaml::to_string(&json!({"nodes": nodes})).unwrap(),
    )
    .unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_working_graph_bin"))
        .arg("--graph-root")
        .arg(temp.path())
        .arg("--sources")
        .arg(sources.to_string())
        .arg("--bundle-node-config")
        .arg(config)
        .arg("--source-index-root")
        .arg(temp.path().join("cache"))
        .args([
            "--entry-bundle-node-id",
            entry,
            "--default-traversal-bundle-node-id",
            entry,
        ])
        .arg("--default-outlinks-depth")
        .arg(out.to_string())
        .arg("--default-inlinks-depth")
        .arg(incoming.to_string())
        .arg("--frontier-depth")
        .arg(frontier.to_string())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn node<'a>(result: &'a Value, key: &str) -> &'a Value {
    result["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| node["bundleNodeKey"] == key)
        .unwrap_or_else(|| panic!("Missing node {key}"))
}

#[test]
fn multi_source_adapter_keeps_portable_paths_separate_and_ids_stable_after_rename() {
    let mut registry = sources(false);
    let configs = json!([page(), {"sourceId":"source000002","bundleNodeName":"Overview","bundleNodeKind":"file","fileType":"md","bundleNodeId":"overview0001","listType":"whitelist"}]);
    let before = run(&registry, configs.clone(), "start0000001", 2, 1, 0);
    assert_eq!(before["nodes"].as_array().unwrap().len(), 10);
    let overview = node(&before, "_mw_sources/source000002/Overview.md");
    assert_eq!(overview["sourceId"], "source000002");
    assert_eq!(overview["sourceGraphSubdirectory"], "");
    assert_eq!(overview["bundleNodeId"], "overview0001");
    assert_eq!(
        overview["sourceFile"]["path"],
        "_mw_sources/source000002/Overview.md"
    );
    assert_eq!(
        node(&before, "_mw_sources/source000001/Overview.md")["sourceId"],
        "source000001"
    );
    assert_eq!(
        before["allLinkResolutionMaps"]["_mw_sources/source000001/Start.md"]
            ["Overview::papers|research overview"]["link_resolved_target_path"],
        "_mw_sources/source000002/Overview.md"
    );
    assert_eq!(
        node(&before, "_mw_sources/source000002/Incoming.md")["traversal_details"]["link_type"],
        "inlink"
    );
    registry[1]["name"] = json!("library");
    registry[1]["aliases"] = json!(["papers", "research"]);
    let after = run(&registry, configs, "start0000001", 2, 1, 0);
    assert_eq!(
        before["nodes"].as_array().unwrap().len(),
        after["nodes"].as_array().unwrap().len()
    );
    for previous in before["nodes"].as_array().unwrap() {
        let key = previous["bundleNodeKey"].as_str().unwrap();
        assert_eq!(
            previous,
            node(&after, key),
            "Source rename changed node {key}"
        );
    }
    assert_eq!(
        before["allLinkResolutionMaps"],
        after["allLinkResolutionMaps"]
    );
}

#[test]
fn multi_source_frontier_diagnostics_become_normal_before_registration_and_keep_remaining_budgets()
{
    let frontier = run(&sources(false), json!([page()]), "start0000001", 0, 0, 1);
    let diagnostics = frontier["sourceDiagnostics"].as_array().unwrap();
    assert_eq!(diagnostics.len(), 3);
    for diagnostic in diagnostics {
        assert_eq!(diagnostic["requestedSource"], "reference");
        assert_eq!(
            node(&frontier, diagnostic["path"].as_str().unwrap())["isFrontierNode"],
            true
        );
    }
    let normal = run(&sources(false), json!([page()]), "start0000001", 1, 0, 1);
    for diagnostic in normal["sourceDiagnostics"].as_array().unwrap() {
        assert_ne!(
            node(&normal, diagnostic["path"].as_str().unwrap())["isFrontierNode"],
            true
        );
    }
    let registered = run(&sources(true), json!([page()]), "start0000001", 1, 0, 1);
    assert!(registered.get("sourceDiagnostics").is_none());
    let study = node(&registered, "_mw_sources/source000003/Study.md");
    assert_eq!(study["isFrontierNode"], true);
    assert_eq!(study["remaining_depth"], -1);
    assert_eq!(study["depth"], 2);
    assert_eq!(
        registered["allLinkResolutionMaps"]["_mw_sources/source000001/Frontier.md"]
            ["Study::reference"]["link_resolved_target_path"],
        "_mw_sources/source000003/Study.md"
    );
}

#[test]
fn multi_source_mixed_collection_preserves_the_page_start_and_zero_cost_membership() {
    let mut start = page();
    start["outlinksDepth"] = json!(2);
    let result = run(
        &sources(false),
        json!([
            start,
            {"sourceId":"source000002","bundleNodeName":"Same","sourceGraphSubdirectory":"Same","bundleNodeKind":"folder","bundleNodeId":"folder000001","listType":"whitelist","outlinksDepth":0},
            {"bundleNodeName":"Several starts","bundleNodeKind":"collection","bundleNodeId":"collect00001","listType":"whitelist","memberBundleNodeIds":["start0000001","folder000001"]}
        ]),
        "collect00001",
        1,
        0,
        0,
    );
    let start = node(&result, "_mw_sources/source000001/Start.md");
    assert_eq!(start["bundleNodeId"], "start0000001");
    assert_eq!(start["depth"], 0);
    assert_eq!(start["remaining_depth"], 2);
    assert_eq!(
        start["path"],
        json!([
            "collection:collect00001",
            "_mw_sources/source000001/Start.md"
        ])
    );
    let inside = node(&result, "_mw_sources/source000002/Same/Inside.md");
    assert_eq!(inside["depth"], 0);
    assert_eq!(inside["remaining_depth"], 0);
    assert_eq!(
        inside["path"],
        json!([
            "collection:collect00001",
            "folder:_mw_sources/source000002/Same",
            "_mw_sources/source000002/Same/Inside.md"
        ])
    );
    assert_eq!(
        node(&result, "collection:collect00001")["memberBundleNodeIds"],
        json!(["start0000001", "folder000001"])
    );
    assert!(result["edges"]
        .as_array()
        .unwrap()
        .iter()
        .any(|edge| edge["bundleEdgeKind"] == "collectionMembership"
            && edge["target"] == "_mw_sources/source000001/Start.md"));
}
