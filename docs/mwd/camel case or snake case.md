In [[app component - modal -- copy selected pages]] the yaml output looked like this where `sourceGraphSubdirectory` was [[camel case]], and `file_type` was [[snake case]]...

```
- title: "main page"
    sourceGraphSubdirectory: ""
    file_type: "md"
    tracked: true
    depth: 0
```

... not good.

Part of the challenge here is that [[meadow is many programs wrapped up into an app]].  So, [[snake case]] makes sense for that code, but for [[TypeScript]], [[camel case]] makes more sense.

For the config ([[any level of config]]) we have decided on [[camel case]]