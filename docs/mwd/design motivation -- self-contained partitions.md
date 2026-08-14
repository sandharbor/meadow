[[design motivation]]

In [[published bundle partitioning]], we ensure that even the shared files are not shared across partitions.  This, along with [[design motivation -- static files]] means that [[once you publish a bundle, you can leave it alone]] and future updates to other [[published bundle type -- local html]]s will not negatively impact it.

If you ever want to publish a different version for different people, you can simply change the [[bundle yaml config option -- publishPrefix]].
