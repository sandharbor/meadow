[[path example]] `config/sites/the-site/html/preview`

We call this a [[site]] and not a [[graph]] because it contains all the files of the final [[site]] (including things like the css file, etc).  Also, by this point the [[tracked working graph]] has been turned into html files that make up the site.

When you hit the publish button, these files are copied to the [[published site type -- local html]], then uploaded to the [[published site type -- remote html]]

We keep this folder separately from the [[published site type -- local html]] because of [[multi-stage processing]] and [[meadow change management]].

