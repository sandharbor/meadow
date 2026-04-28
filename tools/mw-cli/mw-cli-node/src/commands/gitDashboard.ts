/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { existsSync, writeFileSync, mkdtempSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { runInteractive } from "../lib/exec.js";
import { MEADOW_HOME_DIR, MEADOW_LOGS_DIR } from "../lib/paths.js";

export function gitDashboard(): void {
  try {
    execSync("command -v tmux", { stdio: "ignore" });
  } catch {
    console.error("Error: tmux is not installed. Install with: brew install tmux");
    process.exit(1);
  }

  if (!existsSync(join(MEADOW_HOME_DIR, ".git"))) {
    console.error("Error: MeadowHome is not a git repository");
    process.exit(1);
  }

  const sessionName = "meadow_git_status";
  const tmpDir = mkdtempSync(join(tmpdir(), "mw-git-"));
  const pauseFile = `/tmp/mw_pause_${process.pid}`;

  // Kill existing session
  try { execSync(`tmux kill-session -t ${sessionName}`, { stdio: "ignore" }); } catch { /* ok */ }

  // Left pane: git log with age in minutes
  const leftScript = `#!/usr/bin/env bash
pause_file="${pauseFile}"
while true; do
    if [[ -f "$pause_file" ]]; then sleep 1; continue; fi
    cd "$1"
    clear
    echo "=== Git Log (newest first) ==="
    echo ""
    now=$(date +%s)
    git log --format="%h %ct %s" -30 | while read hash timestamp subject; do
        age_seconds=$((now - timestamp))
        age_minutes=$((age_seconds / 60))
        if [[ $age_minutes -lt 1 ]]; then age_str="< 1 m"; else age_str="$\{age_minutes} m"; fi
        printf "%-7s %-8s %s\\n" "$hash" "$age_str" "$subject"
    done
    sleep 3
done`;

  // Middle pane: files in most recent commit
  const middleScript = `#!/usr/bin/env bash
pause_file="${pauseFile}"
while true; do
    if [[ -f "$pause_file" ]]; then sleep 1; continue; fi
    cd "$1"
    clear
    echo "=== Files in Latest Commit ==="
    echo ""
    git show --stat --name-only HEAD 2>/dev/null | tail -n +7
    sleep 3
done`;

  // Right pane: working directory changes
  const rightScript = `#!/usr/bin/env bash
pause_file="${pauseFile}"
while true; do
    if [[ -f "$pause_file" ]]; then sleep 1; continue; fi
    cd "$1"
    clear
    echo "=== Working Directory Changes ==="
    echo ""
    all_files=()
    while read line; do
        [[ -z "$line" ]] && continue
        status="\${line:0:2}"
        filepath="\${line:3}"
        case "$status" in
            "A "|"A"*) prefix="A" ;;
            "M "|" M"|"MM") prefix="M" ;;
            "D "|" D") prefix="D" ;;
            "??") prefix="A" ;;
            "R "*) prefix="M" ;;
            *) prefix="\${status:0:1}" ;;
        esac
        if [[ "$filepath" == */ ]]; then
            while IFS= read -r subfile; do
                [[ -n "$subfile" ]] && all_files+=("$prefix $subfile")
            done < <(find "$filepath" -type f 2>/dev/null | head -20)
        else
            all_files+=("$prefix $filepath")
        fi
    done < <(git status --short)
    total=\${#all_files[@]}
    for ((i=0; i<5 && i<total; i++)); do echo "\${all_files[$i]}"; done
    if [[ $total -gt 5 ]]; then echo ""; echo "MORE ($((total - 5)) additional)"; fi
    sleep 3
done`;

  // Bottom pane: meadow.log tail
  const bottomScript = `#!/usr/bin/env bash
pause_file="${pauseFile}"
while true; do
    if [[ -f "$pause_file" ]]; then sleep 1; continue; fi
    clear
    echo "=== Meadow Log (last 50 lines) ==="
    echo ""
    tail -50 "$1" 2>/dev/null || echo "(log file not found)"
    sleep 3
done`;

  const scripts = [
    { name: "left.sh", content: leftScript },
    { name: "middle.sh", content: middleScript },
    { name: "right.sh", content: rightScript },
    { name: "bottom.sh", content: bottomScript },
  ];

  for (const s of scripts) {
    const path = join(tmpDir, s.name);
    writeFileSync(path, s.content);
    chmodSync(path, 0o755);
  }

  const logFile = join(MEADOW_LOGS_DIR, "meadow.log");
  const hd = MEADOW_HOME_DIR;

  execSync(`tmux new-session -d -s ${sessionName} "bash ${join(tmpDir, "left.sh")} '${hd}'"`, { stdio: "ignore" });
  execSync(`tmux split-window -v -t ${sessionName} -l 15 "bash ${join(tmpDir, "bottom.sh")} '${logFile}'"`, { stdio: "ignore" });
  execSync(`tmux select-pane -t ${sessionName}:0.0`, { stdio: "ignore" });
  execSync(`tmux split-window -h -t ${sessionName} "bash ${join(tmpDir, "middle.sh")} '${hd}'"`, { stdio: "ignore" });
  execSync(`tmux split-window -h -t ${sessionName} "bash ${join(tmpDir, "right.sh")} '${hd}'"`, { stdio: "ignore" });
  execSync(`tmux bind-key -T root q run-shell "rm -f ${pauseFile}; tmux kill-session -t ${sessionName}"`, { stdio: "ignore" });
  execSync(`tmux bind-key -T root p run-shell "if [ -f ${pauseFile} ]; then rm ${pauseFile}; else touch ${pauseFile}; fi"`, { stdio: "ignore" });

  runInteractive("tmux", ["attach-session", "-t", sessionName]);
}
