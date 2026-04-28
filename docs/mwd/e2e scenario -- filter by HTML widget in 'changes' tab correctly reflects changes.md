[[e2e scenario]] -- [[filter - HTML section changes]] in [[app component - modal -- site preview -- tab changes]] correctly reflects changes

---
### ScenarioDocs

"HTML generation", "customization", "changes"
### Steps

big site
go to preview
(on step 1)
"changes" tab indicator has a positive number
"Save Changes"
(takes you to step 2)
go back to step 1
"changes" tab indicator has no number
go to customize tab
disable breadcrumbs at site level
"changes" tab indicator has a positive number
go to changes tab
only has modified files (no new or deleted)
open the HTML section changes filter
only the header section has changes

