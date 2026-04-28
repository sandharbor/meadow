^ [[meadow workflow]] -- [[site page]] [[filter]]

---

### Pre-tracked

You're in the [[app component -- site page views]].

The underlying code is [[design motivation -- functional code]].  It gets several inputs:
* [[raw working graph]] in the form of the [[graph intermediate representation - site page data structure]].
* The [[site page config]]
	* Since we're talking about filtering in this doc, we'll focus on a couple options
		* [[site page config -- filters]]
		* [[to delete - site page config -- filter_ignores]]
* [[filter]]s at [[filter page selector scope -- global]]

What happens?

The [[site page]]s get match various filters and are annotated.  The result becomes a [[tracked working graph]].  For example the [[filter page selector scope -- global]] _link not tracked_ might cause the following for a graph page:
* [[filter action -- highlight]]
* [[filter action -- block expansion]]
* [[block casual bulk site page whitelisting for sensitive site pages]]
which means that in the [[app component -- site page views]] would now show that page highlighted, but there would be no expansion beyond it.  It would also block registration, as we will mention in the next part of this document.

### Tracking

You want to make [[site page tracking state -- tracked]]

In the [[app component -- site page views]] you can quickly track all the [[site page]]s within the [[working graph controlled zone]] where no [[block casual bulk site page whitelisting for sensitive site pages]] applies.

However, if [[block casual bulk site page whitelisting for sensitive site pages]] applies to a graph page, it will not be registered.  To allow for it to be registered, you need to use the _link not tracked_ to ignore the offending [[filter]]s.

If you take no action and you have [[site page]]s in your [[app component -- site page views]] that are in an un-accounted for state, then we consider that [[publish mode -- dirty]].  It works, but it will warn with an abbreviated report every time you try to publish. 

To get to [[publish mode -- clean]], you can explicitly add the [[site page]] to [[site page config -- blacklist]] if you don't want to publish it.

### Post-registration

An important part of the tooling relates to [[meadow change management]], because things can change after you initially create your [[tracked working graph]]:
* New [[filter]]s can be added at [[filter page selector scope -- global]]
* [[orphaned tracked site page]]
* new [[site page]]s can be added, exposing entire new branches for consideration

As part of [[design motivation -- speed]], we need a person to be able to revisit something they published earlier and be able to quickly publish again, despite any changes.  To do so, they need to be able to very quickly understand those changes.  So [[design motivation -- understandability]] and [[design motivation -- reviewability]] are paramount.

In the [[app component -- site page views]] there is a [[site editor view part -- site page details]]
