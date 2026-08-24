---
title: t002 - dup pages and images
type: Knowledge Page
---
Note that all the dups are called `t002 ---- dup`.  They are either `.md` files or `.png` files.

The folders these tests are in doesn't really matter, but I thought
it would be a good idea to have them in different folders.

[t002 ---- points to root dup](/t002/t002%20----%20points%20to%20root%20dup.md)

[t002 ---- points to nested dup](/t002/t002%20----%20points%20to%20nested%20dup.md)

[t002 ---- points to extra nested dup](/t002/t002%20----%20points%20to%20extra%20nested%20dup.md)

### test of first image dup

The title of this image is the same as the duplicate pages... `t002 ---- dup`.  It is also in the same directories as those duplicate pages.  The `file_type` is png, though.

[t002 ---- points to root png dup](/t002/t002%20----%20points%20to%20root%20png%20dup.md)

[t002 ---- points to nested png dup](/t002/t002%20----%20points%20to%20nested%20png%20dup.md)

### test of second image dup

This image is called `t002 ---- dup 2`.  It is not named the same as any pages.

The purpose of this test is to ensure that duplicate image paths are correctly resolved even when there is no image directly at the root.  So that `t002 ---- dup 2` image is only in the `t002` directory and the `t002/extra nested` directory, not at the root.  But we target them from a lot of different places to test what happens.

[t002 ---- points to png dup 2 with no path from root](/t002%20----%20points%20to%20png%20dup%202%20with%20no%20path%20from%20root.md)

[t002 ---- points to png dup 2 with no path from t002](/t002/t002%20----%20points%20to%20png%20dup%202%20with%20no%20path%20from%20t002.md)

[t002 ---- points to png dup 2 with no path from extra nested](/t002/extra%20nested/t002%20----%20points%20to%20png%20dup%202%20with%20no%20path%20from%20extra%20nested.md)

[t002 ---- points to png dup 2 with no path from second directory](/t002%20-%20second%20directory/t002%20----%20points%20to%20png%20dup%202%20with%20no%20path%20from%20second%20directory.md)

