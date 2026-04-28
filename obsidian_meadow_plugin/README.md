# Meadow Obsidian Plugin

This plugin allows you to open Meadow directly from Obsidian with information about the current file, making it easy to manage sites that track specific pages.

## Features

- **Open in Meadow**: Command to open Meadow with current file information
- **Site Filtering**: Meadow automatically filters sites to show only those that track the current page
- **Quick Site Creation**: Pre-fills the "Create New Site" form with the current page information
- **Easy Integration**: Works seamlessly with your existing Obsidian workflow

## Installation

1. Clone this repository or download the plugin files
2. Navigate to the plugin directory: `cd obsidian_meadow_plugin`
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Copy the entire plugin folder to your Obsidian vault's plugins directory
6. Enable the plugin in Obsidian settings (Settings > Community Plugins > Installed)

## Usage

### Method 1: Command Palette
1. Open the command palette (Cmd/Ctrl + P)
2. Type "Open in Meadow" or "Open current file in Meadow"
3. Select the command to launch Meadow

### Method 2: Editor Context Menu
1. Right-click on a markdown file in the editor
2. Select "Open in Meadow" from the context menu

## What Happens When You Use the Plugin

When you invoke the plugin command:

1. **File Information Extraction**: The plugin extracts:
   - The absolute path to your Obsidian vault
   - The relative path to the folder containing the current file
   - The name of the current page (without .md extension)

2. **Meadow Launch**: Meadow opens with this information passed via command line arguments

3. **Automatic Filtering**: In Meadow's Sites page:
   - A blue filter indicator shows the current page name
   - The sites list is filtered to show only sites that track this page
   - You can easily remove the filter by clicking the × button

4. **Quick Site Creation**: When creating a new site:
   - The "Initial Page Title" is pre-filled with the page name
   - Site slugs are automatically generated from the page name

## Requirements

- Obsidian app (desktop version)
- Meadow desktop app installed on your system
- The Meadow app must be in your Applications folder (macOS) or accessible via PATH

## Development

To modify or debug the plugin:

```bash
# Install dependencies
npm install

# Development build with file watching
npm run dev

# Production build
npm run build
```

The plugin source files are:
- `main.ts` - Main plugin logic
- `manifest.json` - Plugin metadata and configuration
- `package.json` - Node.js dependencies and build scripts

## File Structure

```
obsidian_meadow_plugin/
├── main.ts              # Main plugin code
├── manifest.json        # Plugin manifest
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Troubleshooting

### Meadow doesn't open
- Ensure Meadow is properly installed on your system
- On macOS, make sure Meadow is in your Applications folder
- Check that Meadow isn't already running (some apps don't open multiple instances)

### Plugin command doesn't appear
- Make sure the plugin is enabled in Obsidian settings
- Try restarting Obsidian after enabling the plugin
- Check the Obsidian developer console for any error messages

### Sites aren't filtering correctly
- Ensure the sites in Meadow actually track the current page
- The filtering checks if a site's configuration includes the current page in its tracked pages
- Try refreshing the sites list in Meadow

## Contributing

Feel free to submit issues and enhancement requests! If you want to contribute code:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
