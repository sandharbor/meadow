^ [[app component]] [[app component - modal -- site preview]] tab - "local export"

---
### Motivations

[[design motivation - useful without needing an account]] 

[[make it easy to access the preview html so you can publish your own site easily if you want to]]

[[identifying and expanding a graph is separately valuable from publishing it]]

### Details

Should be the last tab in the [[app component - modal -- site preview]] tabs

It should show a table with two rows, each with three actions.  Open folder, save to disk, and save to .zip.  Consider using the same types of icons as used in [[app page -- sites list]]

* raw markdown
	* open folder opens: [[meadow config directory path - tracked markdown - HOME slash .config slash meadow slash sites slash the site slash raw slash tracked_page_content]] 
	* save to disk does a `cp -a` of those files to the chosen destination directory.  Get confirmation if the directory is not empty
	* save to .zip saves into a chosen destination directory.  No confirmation needed, since it's just generating a single zip file.  If it would override an existing zip file, append an incrementing number after a dash.
* preview html
	* open folder opens: [[meadow config directory path - site html preview - HOME slash .config slash meadow slash sites slash the site slash html slash preview]]
	* save to disk (same as above)
	* save to .zip  (same as above)

For choosing a folder, see how the [[app component - modal -- create or edit site]] does it.

