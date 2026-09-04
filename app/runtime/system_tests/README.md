# HTML rendering benchmark

After preparing the application, run from this directory:

```sh
npm run benchmark:html -- --fixture=big --output=/tmp/render-before.json
npm run benchmark:html -- --fixture=example --output=/tmp/example-before.json
npm run benchmark:html -- --fixture=hooks --output=/tmp/hooks-before.json
```

The benchmark uses the preview system tests' isolated fixtures and real backend
generation code. It copies and synchronizes source content once before timing,
then regenerates the complete output on every repetition. It defaults to two
warmups and seven measured repetitions; use `--warmup` and `--runs` to change
these counts. Run comparisons sequentially on the same machine without other
CPU-heavy tests running.

The JSON report contains individual timings, median total generation time,
median stage times, and an aggregate SHA-256 of sorted HTML paths and contents.
Output must remain identical across repetitions. Compare the output hashes
between revisions too, then run the preview system tests for their checked-in
expected-output comparisons. The timings exclude fixture setup, HTTP handling,
version installation, and verification. Process CPU time excludes native child
processes; wall time includes them.

For a V8 CPU profile of the measured repetitions:

```sh
npm run benchmark:html -- --profile=/tmp/render.cpuprofile
```

Profiling adds overhead, so use separate runs for timing comparisons. This
benchmark reports timings instead of enforcing a machine-dependent speed limit
in the regression suite.
