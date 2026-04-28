https://m.youtube.com/watch?v=LAqyTyNUYSY

Replicated state machine

At 7:00 talks about multi-region database

At 9:05 the authors of the _link not tracked_ talking about how PAXOS is usually not implemented correctly.

At 9:20 They designed raft with [[understandability-as-a-design-goal]].

At 9:45 using is innocent to explain as a design criteria. TODO, get actual quote

At 12:30 leader election, log replication, and safety

At 14:00 leader election visualization

At 37:00 new leader defers committing entries from prior term. He says something about reading _link not tracked_ to learn more about that.


At 44:00 hydrabase, which is a Facebook use of raft for multi region database says
 ^hydrabase-multi-region-database


At 47:20 he talks about log compaction and snapshot it, mentions that he goes into much more detail in _link not tracked_
 ^log-compaction-and-snapshotting

At 49:00 he talks about the term number, and how a logical lock is necessary for any of these systems.


At 51:50 he talks more about how pushing for understandability alters choices made. For example raft has four message types where a competitive algorithm has 10. Additionally every part of the algorithm must be motivated by something. There is less extraneous stuff.
 ^pushing-for-understandability-alters-your-choices

noai

---

#consumption-notes

#recorded-talk

#visualizations

#talk-good

#distributed-computing

#project-raft

#pub-to-codedtested

#pub-to-continuousdeploys

#well-explained

#pub-to-datanotes

#step-by-step 

