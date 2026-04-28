The shared data in this directory is used in several places:

* the `backend` directory
    * to be able to refresh any [[meadow-test-site]]s from the [[app mode -- dev]]
* the `../dev_tools_app` directory
    * they are copied to the `~/Library/Application Support/Meadow/MeadowHome` directory as part of the "test" mode
* the `source_page_search_by_title` directory
    * to test searching markdown source pages (by filename title) on the meadow-test-sites-data
* the `system_tests` directory
    * to test end-to-end scenarios with different configurations