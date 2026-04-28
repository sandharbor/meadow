[[app config]] manage [[git operation]]s automatically

defaults to true

If disabled, whenever there _would_ be a [[git operation]], log a message about what _would_ have happened, and that it was disabled.

Why do we want [[publisher]]s to be able to disable it?  Because some users might want to manage the git themselves, so we should let them.

The purpose of that logging is to help with [[design motivation -- understandability]], and curious users like [[meadow persona - ICP -- Adam the advanced user]] (the advanced user) may learn something from reviewing the logs in the [[in-app log viewing]] tooling.

