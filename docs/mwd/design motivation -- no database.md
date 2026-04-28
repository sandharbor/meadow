[[design motivation]]

We prefer [[text files]] (or markdown) with human-readable formats like yaml.

This also makes things easier to do [[version control]] and [[sonst/diff]]ing on, which supports another design motivation [[design motivation -- great change management]].  See also [[git operation]]s.

The downside is that managing the migrations of [[local code]] and [[local configuration]] can be challenging, so we'll want to plan the initial publicly-released interfaces carefully.