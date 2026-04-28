We cannot use system git because our target is "normal people" computers that
won't necessarily have git installed.  Hence we have been building our own git
utilities written in Rust.  See native_utils/fast_git_ops

Please run a check to ensure that no system git calls have been added to the
codebase.  They have a way of sneaking in.  The agent is desperate to add them,
and they are hard to notice on the development machine, since those calls work.