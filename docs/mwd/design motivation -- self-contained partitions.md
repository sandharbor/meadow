[[design motivation]]

In [[published site partitioning]], we ensure that even the shared files are not shared across partitions.  This, along with [[design motivation -- static files]] means that [[once you publish a site, you can leave it alone]] and future updates to other [[published site type -- local html]]s will not negatively impact it.

If you ever want to publish a different version for different people, you can simply change the [[site yaml conf option -- publishPrefix]].