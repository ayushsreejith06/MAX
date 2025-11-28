# Tauri Icons

This directory should contain the following icon files for Tauri:

- `32x32.png` - 32x32 pixel PNG icon
- `128x128.png` - 128x128 pixel PNG icon
- `128x128@2x.png` - 256x256 pixel PNG icon (for Retina displays)
- `icon.icns` - macOS icon file
- `icon.ico` - Windows icon file
- `icon.png` - General purpose PNG icon (at least 512x512)

## Generating Icons

You can generate these icons from a source image (e.g., `frontend/public/icon.png`) using tools like:

1. **Online tools**: 
   - https://icoconvert.com/
   - https://www.icoconverter.com/

2. **Command line tools**:
   - ImageMagick: `convert icon.png -resize 32x32 32x32.png`
   - For .ico files on Windows, you can use online converters or specialized tools

3. **Tauri icon generator**:
   - The Tauri CLI can help generate icons: `tauri icon <path-to-source-image>`

## Placeholder

Until proper icons are created, Tauri will use default icons. Make sure to replace these with your actual app icons before building for production.

