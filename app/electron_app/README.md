# Meadow Electron App

This directory contains the Electron wrapper for the Meadow application, which
packages the React frontend, Express backend, and Rust source_page_search_by_title component into
a native desktop application.

## Development

First, you need to run backend and frontend development servers
```bash
cd ../backend
npm start
```

```bash
cd ../frontend
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


## Debugging the distribution application

`open -a Meadow` will run the distribution application, but it will immediately return.

If you want to view the logs from the production application, you can run the application directly:

/Applications/Meadow.app/Contents/MacOS/Meadow


## Testing Obsidian Plugin Integration in Production


The Obsidian plugin will call the app with these arguments:

```bash
open -a Meadow --args --vault-path "/path/to/your/vault" --folder-path "folder/in/vault" --page-name "YourPageName"
```
