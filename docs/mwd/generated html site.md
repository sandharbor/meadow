[[path example]] `config/sites/the-site/html/generated`

We call this a [[site]] and not a [[graph]] because it contains all the files of the final [[site]] (including things like the css file, etc).  Also, by this point the [[tracked working graph]] has been turned into html files that make up the site.

When you hit the publish button, these files are copied to the [[published site type -- local html]], then uploaded to the [[published site type -- remote html]].

We keep this current generated artifact separately from the immutable [[published site type -- local html]] versions because of [[multi-stage processing]] and [[meadow change management]].
