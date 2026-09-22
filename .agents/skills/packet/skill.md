---
name: packet
description: Start Dev Tools and the E2E report viewer, then open the review packet
---

# Open Review Packet

Run the paired launcher and report its result:

```bash
./tools/dev-and-packet --open packet
```

This starts Dev Tools, starts or reuses the report viewer, verifies both, and
opens the packet in a browser. Use `./tools/packet` only when intentionally
restarting the report viewer on its own.
