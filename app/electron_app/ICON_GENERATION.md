# Icon Generation for Meadow Electron App

This document explains how to generate icons for the Meadow Electron application.

## Overview

The Electron app requires icons in multiple formats:
- **macOS**: `.icns` format (icon.icns)
- **Windows**: `.ico` format (icon.ico) 
- **Linux**: `.png` format (icon.png)

## Usage

### Quick Start
```bash
# From the electron_app directory
npm run generate-icons
```

### Manual Execution
```bash
# From the electron_app directory
./generate-icons.sh
```

## Source Image

Place your source image as `assets/meadow-big.png`. The script will automatically:
1. Detect the source image
2. Generate all required formats
3. Create multiple sizes for each platform

## Requirements

The script automatically checks for and installs required tools:
- **ImageMagick**: For image processing and format conversion
- **iconutil** (macOS only): For creating `.icns` files

### Manual Installation

If you need to install ImageMagick manually:

**macOS (with Homebrew):**
```bash
brew install imagemagick
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install imagemagick
```

## Generated Files

The script generates these files in the `assets/` directory:

| File | Format | Use Case | Size |
|------|--------|----------|------|
| `icon.png` | PNG | Linux AppImage | 512x512 |
| `icon.ico` | ICO | Windows executable | Multi-size (16-256px) |
| `icon.icns` | ICNS | macOS application bundle | Multi-size (16-1024px) |

## Updating Icons

When you need to update the app icon:

1. Replace `assets/meadow-big.png` with your new image
2. Run the generation script:
   ```bash
   npm run generate-icons
   ```
3. The script will automatically overwrite the existing icon files

## Tips

- **Source Image Quality**: Use a high-resolution PNG (ideally 1024x1024 or larger) for best results
- **Square Images**: The source image should be square for optimal icon generation
- **Transparency**: PNG transparency is preserved in the generated icons
- **File Sizes**: Generated icons are optimized for their respective platforms

## Troubleshooting

### "Command not found" errors
- Ensure ImageMagick is installed (`brew install imagemagick` on macOS)
- Check that the script is executable (`chmod +x generate-icons.sh`)

### Poor icon quality
- Use a higher resolution source image
- Ensure the source image is square
- Consider simplifying complex designs for smaller icon sizes

## Integration with Electron Builder

The generated icons are automatically used by Electron Builder during the build process. The `package.json` configuration specifies:

- macOS builds use `assets/icon.icns`
- Windows builds use `assets/icon.ico`  
- Linux builds use `assets/icon.png`

No additional configuration is needed once the icons are generated. 