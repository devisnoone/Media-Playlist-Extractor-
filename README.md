# Media Playlist Extractor

A Manifest V3 Chrome extension that scans the active webpage — open directory
listings, FTP-style index pages, media galleries, etc. — for links to media
files and exports them as a ready-to-play playlist for **PotPlayer**, **VLC**,
**Windows Media Player**, and other players.

## Features

- **Format filters** — checkboxes for common formats (FLAC, MP3, MP4, MKV,
  AVI, WAV, M4A, WEBM, MOV, OGG)
- **Custom extensions** — type any extension not in the list (`iso, srt, rar, ts`)
  and it's matched right alongside the built-in checkboxes
- **Multiple playlist formats** — export as `.m3u`, `.m3u8`, `.pls`, `.xspf`,
  `.wpl`, `.asx`, or plain `.txt`
- **Copy Links** — scan and copy the matched URLs straight to your clipboard
  without downloading anything, for pasting into another tool
- **Smart file naming** — the downloaded playlist is named after the folder
  you're browsing (e.g. `/Music/MyAlbum/` → `MyAlbum.m3u`), not a generic
  `playlist.m3u`
- **One click** — scans the page, builds the playlist, and downloads it
  automatically
- **No broad permissions** — only requests access to the tab you're currently
  viewing, not your whole browsing history

## Installation

This extension isn't on the Chrome Web Store — load it manually:

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the folder containing `manifest.json`

The extension icon will appear in your toolbar.

## Usage

1. Navigate to a page with media links (an open directory listing, a file
   index, etc.)
2. Click the extension icon
3. Select the file formats you want (or type custom extensions)
4. Either:
   - Choose a playlist format from the dropdown and click **Download Playlist**, or
   - Click **Copy Links** to copy the matched URLs to your clipboard without
     downloading anything

The generated file downloads to your default Downloads folder, named after
the current page's folder (e.g. `MyAlbum.m3u`). Open it with PotPlayer, VLC,
or your player of choice.

## Supported playlist formats

| Format | Extension | Notes |
|--------|-----------|-------|
| M3U    | `.m3u`    | Includes `#EXTINF` metadata lines |
| M3U8   | `.m3u8`   | Same structure as M3U |
| PLS    | `.pls`    | Winamp-style playlist |
| XSPF   | `.xspf`   | XML Shareable Playlist Format |
| WPL    | `.wpl`    | Windows Media Player playlist |
| ASX    | `.asx`    | Advanced Stream Redirector |
| TXT    | `.txt`    | Plain list, one URL per line — no metadata |

## How it works

- `popup.js` reads the selected checkboxes and custom extension input, then
  uses `chrome.scripting.executeScript` to inject a small function into the
  active tab
- The injected function scans all `<a>` tags on the page, resolves their
  `href` to absolute URLs, and filters by the selected extensions
  (case-insensitive)
- Matched links are deduplicated and passed back to the popup, which either:
  - formats them according to the chosen playlist type and triggers a
    download via `chrome.downloads`, naming the file after the last folder
    segment of the page's URL, or
  - joins them with newlines and writes them to the clipboard via the
    Clipboard API (with an `execCommand` fallback)

Only `http://` and `https://` pages can be scanned — `chrome://` pages,
extension pages, and the Chrome Web Store block script injection by design.

## Permissions

| Permission  | Why it's needed |
|-------------|------------------|
| `activeTab` | Read the current tab's URL and inject the scanning script |
| `scripting` | Run the link-scanning function on the page |
| `downloads` | Save the generated playlist file |

No `host_permissions` are requested — the extension only ever touches the
tab you're actively viewing when you click the button.

## Project structure

```
.
├── manifest.json   # Extension configuration (Manifest V3)
├── popup.html      # Popup UI
├── popup.js        # Scanning logic, playlist generation, download handling
└── README.md
```

## Limitations

- Only scans `<a href>` links present in the page's DOM at the time you click
  the button — content loaded dynamically after that (e.g. via infinite
  scroll) won't be included unless you scroll first
- Custom extensions are matched literally against the URL path, so a typo
  (`mp4` vs `mp`) will simply return no matches rather than an error
- The folder-name detection can occasionally misfire on folder names that
  happen to end in a dot-plus-short-suffix pattern (e.g. `v1.2`), since that
  looks like a filename extension

## Contributing

Issues and pull requests are welcome. If you add a new playlist format, add
its generator to the `FORMAT_GENERATORS` map in `popup.js` and a matching
`<option>` in `popup.html`.

## License

MIT
