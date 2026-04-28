[[source graph change]]

new [[filter]]s can be added

new [[site page]]s can be added

[[orphaned tracked site page]]

Maybe we should have the ability to mark specific pages as sensitive to change. For example, if you are linking to a page that is external to your core export, maybe you want it to unregistered and become marked as sensitive if it's content changes. Or perhaps only if it changes substantively or links to some new page. Deciding that a change, a substantive might be a good [[meadow AI opportunity]]
...
[[change indicator -- source page content has changed]] [[source page content changes]]

It could be very interesting to see, with the new things that are introduced in the new version, how they touch upon concepts from the previous version. So I could imagine specifically calling out things that are within say one or two hops of the newly traced pages.

It's also possible that we should have the concept of a [[change session]]. Though maybe that's something that's identified after the fact just by seeing when the value is changed. Also, maybe we want to treat the properties as an [[EAV]] For the purposes of tracking when attributes were created and changed.  Or actually, let's just have that be an [[audit log]].

That audit trail could consist of a series of JSON records. You append the record at the bottom of the file. The record contains all the old values, all the new values, And the difference is which are the old value for attributes to differ, and the new value for attributes that differ. It also contains the creation time of those records.  It also contains the path of identities to the record at the time, and the Shaws of all of those records. _link not tracked_

It would be great to [[time travel]] _everything_.  Like you could go into a read-only mode and see what the graph looks like at the time. Including stuff like untracked files... aka [[source graph change]], and maybe even their content.  This relates to [[git operation]], which we support now.