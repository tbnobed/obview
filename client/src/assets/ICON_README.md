# Obviu.io App Icons

This directory contains the icon assets used for the Obviu.io web application, including favicons and mobile app icons.

## Icon Details

All icons are in SVG format for best quality across all device resolutions:

- `favicon.svg`: The primary favicon used in browser tabs (32x32 pixels)
- `apple-touch-icon.svg`: Used for iOS home screen icons (180x180 pixels)
- `android-chrome-192x192.svg`: Android home screen icon (192x192 pixels)
- `android-chrome-512x512.svg`: Android splash screen icon (512x512 pixels)

## Technical Notes

- The SVG format was chosen for maximum clarity and minimal file size
- The background color is `#07242C` (dark blue/teal) which matches the app's theme
- The checkmark color is `#0ea5e9` (sky blue) which provides good contrast
- The icons use rounded corners to match modern mobile app styles

## Usage in the App

These icons are referenced in:

1. `client/index.html` - For browser favicons and Apple device icons
2. `client/src/assets/site.webmanifest` - For Progressive Web App functionality

## How to Update Icons

If you need to update the icons:

1. Modify the SVG files directly, keeping the same dimensions and file names
2. Make sure the viewBox is correctly sized for each icon's intended dimensions
3. After updating, test on multiple browsers and devices to ensure proper display

## Original Design

The icons were designed to represent the Obviu.io brand, featuring a simple checkmark on a dark background,
symbolizing the app's core functionality of reviewing and approving media assets.