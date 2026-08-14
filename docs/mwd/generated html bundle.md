[[path example]] `config/bundles/the-bundle/html/generated`

We call this a [[bundle]] and not a [[graph]] because it contains all the files of the final [[bundle]] (including things like the css file, etc).  Also, by this point the [[tracked working graph]] has been turned into html files that make up the bundle.

When you hit the publish button, these files are copied to the [[published bundle type -- local html]], then uploaded to the [[published bundle type -- remote html]].

We keep this current generated artifact separately from the immutable [[published bundle type -- local html]] versions because of [[multi-stage processing]] and [[meadow change management]].
