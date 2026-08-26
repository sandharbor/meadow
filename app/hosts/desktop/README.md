# Meadow Desktop Host

This directory contains the Electron Desktop Host. A production application
embeds the complete Web Client, Command Client, and manifest-verified Runtime
Payload; the host attaches to the Runtime rather than owning backend child
processes itself.

## Development

First, you need to run backend and frontend development servers
```bash
cd ../../runtime/service
npm start
```

```bash
cd ../../clients/web
npm start
```

Then you can run the electron app in development mode

```bash
npm run electron-dev
```

## Testing Obsidian Plugin Integration in Development

The Obsidian plugin will call the app with these arguments:

```bash
npm run electron-dev-args -- --vault-path "/path/to/your/vault" --folder-path "folder/in/vault" --page-name "YourPageName"
```

## Distribution

```bash
./build-and-test.sh
```

This creates a `.dmg` installer in the `build/` directory and runs it to make sure it works.

For unsigned, status-neutral local QA builds of the Desktop and Command
artifacts together, use the Runtime Payload assembler:

```bash
./download-node.sh
cd ../../runtime/payload
npm run build:qa-distributions -- \
  --perspective standalone \
  --node-executable vendor/node
```

The assembler marks both artifacts for local QA and emits a payload parity
report proving that the `.app` and relocatable Command archive contain the same
Runtime Payload identity.


## Debugging the distribution application

`open -a Meadow` will run the distribution application, but it will immediately return.

If you want to view the logs from the production application, you can run the application directly:

/Applications/Meadow.app/Contents/MacOS/Meadow


## Testing Obsidian Plugin Integration in Production


The Obsidian plugin will call the app with these arguments:

```bash
open -a Meadow --args --vault-path "/path/to/your/vault" --folder-path "folder/in/vault" --page-name "YourPageName"
```
