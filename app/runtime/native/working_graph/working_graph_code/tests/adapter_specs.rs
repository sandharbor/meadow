// Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0.
use serde_json::{json, Value};
use std::{path::Path, process::Command};

fn run(id: &str, source: &Path, config: &Path, out: &str, incoming: &str) -> Value {
    let cache = tempfile::tempdir().unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_working_graph_bin"))
        .args(["--graph-root"])
        .arg(source)
        .arg("--bundle-node-config")
        .arg(config)
        .arg("--source-index-root")
        .arg(cache.path())
        .args([
            "--entry-bundle-node-id",
            id,
            "--default-traversal-bundle-node-id",
            id,
            "--default-outlinks-depth",
            out,
            "--default-inlinks-depth",
            incoming,
            "--frontier-depth",
            "0",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
fn curated(id: &str) -> Value {
    let app = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../..");
    run(id, &app.join("shared_data/source_graphs/meadow-test-bundles-data"),
        &app.join("shared_data/home_fixtures/home_fixture_big_and_small/bundles/meadow-test-bundle-big/config/bundle_node_config.yaml"), "4", "100")
}
fn folder(multiple: bool) -> Value {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/folder-scope");
    run(
        if multiple {
            "c1b2c3d4e5f6"
        } else {
            "p1b2c3d4e5f6"
        },
        &fixtures.join("source"),
        &fixtures.join(if multiple {
            "multiple-folders.yaml"
        } else {
            "single-folder.yaml"
        }),
        "1",
        "0",
    )
}
fn has_node(result: &Value, key: &str) -> bool {
    result["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|node| node["bundleNodeKey"] == key)
}
#[test]
fn zero_override_keeps_only_the_entry_page() {
    let result = curated("8d86983d7f98");
    assert_eq!(result["nodes"].as_array().unwrap().len(), 1);
    assert!(result["nodes"][0].get("isFrontierNode").is_none());
    assert!(result["nodes"][0].get("isFrontierImageExtension").is_none());
    assert_eq!(
        result["nodes"][0]["bundleNodeName"],
        "t009 - page conf graph depth"
    );
}
#[test]
fn stop_nodes_remain_visible_without_their_descendants() {
    let result = curated("ef63f962db68");
    assert!(has_node(&result, "/t007 ---- blacklisted page.md"));
    assert!(!has_node(
        &result,
        "/t007 ---- child of blacklisted page.md"
    ));
}
#[test]
fn meadow_edges_retain_link_text_and_resolved_directory() {
    let result = curated("ef63f962db68");
    assert!(result["edges"]
        .as_array()
        .unwrap()
        .iter()
        .any(|edge| edge["link_original_text"]
            .as_str()
            .is_some_and(|text| !text.is_empty())
            && edge["link_resolved_target_directory"].is_string()));
}
#[test]
fn outside_inlinks_are_returned_even_when_the_nodes_incoming_budget_is_zero() {
    let result = curated("ef63f962db68");
    assert!(
        result["allInlinkSources"]["/t008 - page conf do not include inlinks.md"]
            .as_array()
            .unwrap()
            .contains(&json!("/t008 ---- has in link to page conf test.md"))
    );
}
#[test]
fn native_html_nodes_keep_their_type_and_page_and_asset_adjacency() {
    let result = curated("ef63f962db68");
    let key = "t026/t026 ---- first HTML page.html";
    let node = result["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| node["bundleNodeKey"] == key)
        .unwrap();
    assert_eq!(node["fileType"], "html");
    for target in [
        "/t026 - HTML node.md",
        "t026/t026 ---- second HTML page.html",
        "t026/t026 ---- shared style.css",
        "t026/t026 ---- shared behavior.js",
        "t026/t026 ---- shared image.svg",
    ] {
        assert!(
            result["allOutlinkTargets"][key]
                .as_array()
                .unwrap()
                .contains(&json!(target)),
            "missing {target}"
        );
    }
    assert!(
        result["allOutlinkTargets"]["t026/t026 ---- second HTML page.html"]
            .as_array()
            .unwrap()
            .contains(&json!("t026/nested/t026 ---- nested markdown.md"))
    );
}
#[test]
fn folder_scope_seeds_descendants_and_retains_meadows_structural_edges() {
    let result = folder(false);
    for key in [
        "folder:Projects",
        "folder:Projects/Sub",
        "Projects/A.md",
        "Projects/Sub/B.md",
        "Elsewhere/Outside.md",
    ] {
        assert!(has_node(&result, key), "missing {key}");
    }
    assert!(!result["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|node| node["bundleNodeName"] == "Hidden"));
    assert!(result["edges"]
        .as_array()
        .unwrap()
        .iter()
        .any(|edge| edge["bundleEdgeKind"] == "directoryContainment"
            && edge["source"] == "folder:Projects/Sub"
            && edge["target"] == "Projects/Sub/B.md"));
}
#[test]
fn collection_members_keep_their_authored_order_including_empty_folders() {
    let result = folder(true);
    let collection = result["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| node["bundleNodeKey"] == "collection:c1b2c3d4e5f6")
        .unwrap();
    assert_eq!(
        collection["memberBundleNodeIds"],
        json!(["p1b2c3d4e5f6", "e1b2c3d4e5f6"])
    );
    assert!(has_node(&result, "folder:Empty"));
    let memberships: Vec<_> = result["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|edge| edge["bundleEdgeKind"] == "collectionMembership")
        .map(|edge| edge["target"].clone())
        .collect();
    assert_eq!(
        memberships,
        vec![json!("folder:Projects"), json!("folder:Empty")]
    );
}

#[test]
fn route_arrivals_keep_the_budget_that_enabled_an_incoming_hop() {
    // Given a shortcut to Hub and a longer route with a replenished incoming budget.
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    for (name, content) in [
        ("Start", "[[Taxonomy]] [[Hub]]"),
        ("Taxonomy", "[[Hub]]"),
        ("Hub", ""),
        ("Incoming", "[[Hub]] [[Target]]"),
        ("Target", ""),
    ] {
        std::fs::write(source.join(format!("{name}.md")), content).unwrap();
    }
    let config = temp.path().join("nodes.yaml");
    std::fs::write(&config, serde_json::to_string(&json!({"nodes": [
        {"bundleNodeKind":"file", "bundleNodeId":"a1b2c3d4e5f6", "bundleNodeName":"Start", "fileType":"md", "listType":"whitelist"},
        {"bundleNodeKind":"file", "bundleNodeId":"b1b2c3d4e5f6", "bundleNodeName":"Taxonomy", "fileType":"md", "listType":"whitelist", "outlinksDepth":3, "inlinksDepth":2}
    ]})).unwrap()).unwrap();
    // When the native adapter serializes the public library's response.
    let result = run("a1b2c3d4e5f6", &source, &config, "3", "1");
    let find = |key: &str| {
        result["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["bundleNodeKey"] == key)
            .unwrap()
    };
    // Then node display metadata stays shortest, while the target's route is coherent.
    assert_eq!(find("/Hub.md")["depth"], 1);
    assert_eq!(find("/Hub.md")["remaining_inlinks_depth"], 0);
    let target = find("/Target.md");
    let steps = target["traversal_path_steps"].as_array().unwrap();
    assert_eq!(
        steps
            .iter()
            .map(|step| step["bundleNodeKey"].clone())
            .collect::<Vec<_>>(),
        *target["path"].as_array().unwrap()
    );
    assert_eq!(steps[2]["depth"], 2);
    assert_eq!(steps[2]["remaining_inlinks_depth"], 1);
    assert_eq!(steps[1]["traversal_details"]["inlinks_depth_inherited"], 0);
    assert_eq!(steps[1]["traversal_details"]["inlinks_depth_overridden"], 2);
    assert_eq!(steps[3]["traversal_details"]["link_type"], "inlink");
}

#[test]
fn folder_and_collection_prefixes_align_with_semantic_route_steps() {
    // Given either a folder start or a collection of folders.
    for multiple in [false, true] {
        let result = folder(multiple);
        // Then structural prefixes precede semantic arrivals, whose depth starts at zero.
        for node in result["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|n| n["bundleNodeKind"] == "file")
        {
            let steps = node["traversal_path_steps"].as_array().unwrap();
            assert_eq!(
                steps
                    .iter()
                    .map(|step| step["bundleNodeKey"].clone())
                    .collect::<Vec<_>>(),
                *node["path"].as_array().unwrap()
            );
            let seed = steps
                .iter()
                .find(|step| step["traversal_details"]["link_type"] == "start")
                .unwrap();
            assert_eq!(seed["depth"], 0);
            assert_eq!(seed["remaining_inlinks_depth"], 0);
        }
    }
}
