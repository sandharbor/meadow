https://www.oreilly.com/ideas/apache-kafka-and-the-four-challenges-of-production-machine-learning-systems

The nature of machine learning and its core difference from traditional analytics is that it allows the automation of decision-making. Traditional reporting and analytics is generally an input for a human who would ultimately make and carry out the resulting decision manually. Machine learning is aimed at automatically producing an optimal decision. ^automation-of-decision-making

"The good news is that by taking the human out of the loop, many more decisions can be made: instead of making one global decision (that is often all humans have time for), automated decision-making allows making decisions continuously and dynamically in a personalized way as part of every customer experience on things that are far too messy for traditional, manually specified business rules." X _link not tracked_

This group naturally learns to avoid a heavy up-front engineering process for these experiments, as most will fail and need to be removed.

How can the model builders be kept safe and agile when their very model is at the heart of a system that is an integral part of an always-on production software system?

The result is that a team building a machine learning application must lean very heavily on instrumentation of the running system to understand the behavior of their application in production, and they must have access to real data to build and test against, prior to production deployment of any model changes. What inputs did the application have? What prediction did it make? What did the ground truth turn out to be? Recording these facts and analyzing them both retrospectively and in real-time against the running system is the key to detecting production issues quickly and limiting their impact.

It is critical that the data set the model is built off of and the data set that the model is eventually applied to are as close as possible. Any attempt to build a model off of one data set, say pulled from a data warehouse, in a lab setting, and then apply that to a production setting where the underlying data may be subtly different is likely to run into intractable difficulties due to this difference.

This leads to a software system built on top of data pulled from every corner of the business. Worse, it is rarely the case that the raw data is the signal that works best to model. Most often, significant cleanup and processing is required to get the data into a form that is most effective as input for the model.

Importantly, Kafka's pub/sub model allows forking the data stream so the data seen in the production application is exactly the same stream given to the model building environment.

many of the machine learning applications in LinkedIn would record not only every decision they made, but also contextual information about the feature data that lead to that decision and the alternative decisions that had lower scores ^context-propagation-for-decisions

_link not tracked_

