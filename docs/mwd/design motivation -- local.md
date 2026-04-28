[[design motivation]]

If you buy into the [[file over app]] idea, then you need direct access to the files in the file system.  So, the code running your publishing process should be local, too.  It is possible to have some kind of local and remote hybrid system, however I think it's an interesting design constraint to try to do as much of it locally as possible.

So what happens locally? [[local code]], [[local configuration]] and [[coming soon - local AI]].

One driver for local is [[design motivation -- privacy]], which is why we have _such_ a strong emphasis on directly addressing the [[sensitivity to accidentally publishing]].

### Challenges with local apps

[[local app challenge -- easy upgrade]].  Can't just deploy code to production.  Need to get it out to customers.

[[local app challenge -- support older versions]].  If the user doesn't want to upgrade, we shouldn't force them.

[[local app challenge -- identifying and fixing bugs]].  Bugs are hard to know about and hard to fix.