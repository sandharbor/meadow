[[html generation]] [[hooks config]] is basically TypeScript hooks that execute as part of [[html generation]].  They allow you do to things like modify the markdown, change the name of the html file, etc.

These hooks should have two scopes...  [[html generation hook scope -- global]] and [[html generation hook scope -- site]].  If you have a site-scope, then any global version is overridden.  Also, any site can decide to ignore a global hook scope, just like how sites can disable [[filter page selector scope -- global]] (part of a broader pattern of [[disabling global configuration at a per-site scope]]

The hooks should show up under [[app component -- sidebar -- customize preview]]

If there are no hooks, the user should be able to add hooks that match any of the possible [[hook interface]]s.  We should have templates to help them get started.  After they edit, they should be able to validate the hook.  That will ensure that it compiles correctly (meaning it matches the expected interface).  If it does not compile correctly, it should return a helpful message to the user.  The validation process should also show examples of the pages it it matched to where it actually caused a change, and let the user see the difference, to allow them to very easily review their change.

Once the hook is validated, the user should be able to save the hooks.  This will cause a [[git operation -- commit the hooks changes]].

If there are pre-existing [[html generation hook scope -- global]] hooks, then at the site-level the user should be able to disable one of more of them (and re-enable them).  If they add the same hook at the site level, it should automatically disable the global hook for that site.

Separate from the validation step when creating or updating the hooks, pre-existing hooks could fail  to load for other reasons.  In that case, show a red indicator in the title for the [[app component -- sidebar -- customize preview]] so the user will know there was a problem when they look at [[app component - modal -- site preview]] .  If the user clicks in to that [[app component -- sidebar -- customize preview]] , then show a message in that actual tab explaining the problem (basically the same error message that they would have gotten if the validation failed)

The hook lifecycle should be logged and should be able to be seen in the [[in-app log viewing]].