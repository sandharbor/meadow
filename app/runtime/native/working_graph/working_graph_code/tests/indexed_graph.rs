// Copyright 2026 Sand Harbor Software, LLC. Licensed under the Apache License, Version 2.0.
use serde_json::Value;
use std::{fs, path::Path, process::Command};

fn run(directory: &Path, rebuild: bool, inlinks: u32) -> std::process::Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_working_graph_bin"));
    command
        .args(["--graph-root"])
        .arg(directory.join("vault"))
        .arg("--source-index-root")
        .arg(directory.join("cache"))
        .arg("--bundle-node-config")
        .arg(directory.join("nodes.yaml"))
        .args([
            "--entry-bundle-node-id",
            "000000000001",
            "--default-traversal-bundle-node-id",
            "000000000001",
            "--default-outlinks-depth",
            "2",
            "--default-inlinks-depth",
            &inlinks.to_string(),
        ]);
    if rebuild {
        command.arg("--rebuild-index");
    }
    command.output().unwrap()
}
fn graph(directory: &Path, rebuild: bool, inlinks: u32) -> Value {
    let output = run(directory, rebuild, inlinks);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
#[test]
fn graph_and_source_metadata_match_full_rebuild_after_content_and_topology_changes() {
    let temp = tempfile::tempdir().unwrap();
    let directory = temp.path();
    let vault = directory.join("vault");
    fs::create_dir_all(vault.join("nested")).unwrap();
    fs::write(directory.join("nodes.yaml"), "nodes:\n  - bundleNodeId: '000000000001'\n    bundleNodeKind: file\n    bundleNodeName: main\n    sourceGraphSubdirectory: ''\n    fileType: md\n    listType: whitelist\n").unwrap();
    fs::write(vault.join("main.md"), "[[Idea]] [[Missing]]").unwrap();
    fs::write(vault.join("nested/Idea.md"), "unchanged body").unwrap();
    let first = graph(directory, false, 1);
    assert_eq!(first, graph(directory, true, 1));
    fs::write(vault.join("Idea.md"), "new preferred target").unwrap();
    fs::write(vault.join("Missing.md"), "now resolves").unwrap();
    fs::write(vault.join("incoming.md"), "[[main]]").unwrap();
    let next = graph(directory, false, 1);
    assert_ne!(first, next);
    assert_eq!(next, graph(directory, true, 1));
    assert!(next["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|node| node["bundleNodeName"] == "incoming"));
    assert_eq!(graph(directory, false, 0), graph(directory, true, 0));
    fs::write(
        vault.join("main.md"),
        "[[Idea]]\nbody edited without changing the remaining link",
    )
    .unwrap();
    fs::remove_file(vault.join("Idea.md")).unwrap();
    fs::rename(vault.join("Missing.md"), vault.join("Moved.md")).unwrap();
    assert_eq!(graph(directory, false, 1), graph(directory, true, 1));
    fs::rename(vault.join("main.md"), vault.join("relocated.md")).unwrap();
    let output = run(directory, false, 1);
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("starting page is missing"));
}
