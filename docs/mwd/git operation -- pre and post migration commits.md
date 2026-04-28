^ [[git operation]] -- pre and post _link not tracked_ commits

---

To support [[design motivation -- great change management]], we use [[design motivation -- no database]].  That way we can use [[project - git]] on the [[design motivation -- local]] files (and [[version control]]).

But to take full advantage of that we need to carefully consider [[git operation]]s.  One place where we really need versioning is when we use _link not tracked_.

It is critical that we _link not tracked_ before running the _link not tracked_.

the commit message should be "migration: pre-migration - commit everything"

And then after the migration is completed we should make another commit: "migration: post-migration - all changes"

In both of those cases, you should force a commit, even if there are no changes.  We need to see those commits to know what the state was pre and post migration, even if no underlying files changed.

Remember that we do _not_ use the system git, but rather use either _link not tracked_ or _link not tracked_