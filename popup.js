const downloadBtn   = document.getElementById('downloadBtn');
const btnText       = downloadBtn.querySelector('.btn-text');
const statusEl      = document.getElementById('status');
const formatList    = document.getElementById('formatList');
const selectAllBtn  = document.getElementById('selectAllBtn');
const selectNoneBtn = document.getElementById('selectNoneBtn');
const customExtInput = document.getElementById('customExt');
const playlistFormatSelect = document.getElementById('playlistFormat');

/* ---------------------------------------------------------
 * Playlist format generators
 * Each entry: { ext, mime, generate(links) -> string }
 * links is an array of absolute URLs (already deduped).
 * --------------------------------------------------------- */
function fileNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop() || url;
    return decodeURIComponent(last);
  } catch (e) {
    return url;
  }
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FORMAT_GENERATORS = {
  m3u: {
    ext: 'm3u',
    mime: 'audio/x-mpegurl',
    generate(links) {
      const body = links
        .map(l => `#EXTINF:-1,${fileNameFromUrl(l)}\n${l}`)
        .join('\n');
      return `#EXTM3U\n${body}\n`;
    }
  },
  m3u8: {
    ext: 'm3u8',
    mime: 'application/vnd.apple.mpegurl',
    generate(links) {
      const body = links
        .map(l => `#EXTINF:-1,${fileNameFromUrl(l)}\n${l}`)
        .join('\n');
      return `#EXTM3U\n${body}\n`;
    }
  },
  pls: {
    ext: 'pls',
    mime: 'audio/x-scpls',
    generate(links) {
      let out = '[playlist]\n';
      links.forEach((l, i) => {
        const n = i + 1;
        out += `File${n}=${l}\nTitle${n}=${fileNameFromUrl(l)}\nLength${n}=-1\n`;
      });
      out += `NumberOfEntries=${links.length}\nVersion=2\n`;
      return out;
    }
  },
  xspf: {
    ext: 'xspf',
    mime: 'application/xspf+xml',
    generate(links) {
      const tracks = links
        .map(l => `    <track>\n      <location>${escapeXml(l)}</location>\n      <title>${escapeXml(fileNameFromUrl(l))}</title>\n    </track>`)
        .join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<playlist version="1" xmlns="http://xspf.org/ns/0/">\n  <trackList>\n${tracks}\n  </trackList>\n</playlist>\n`;
    }
  },
  wpl: {
    ext: 'wpl',
    mime: 'application/vnd.ms-wpl',
    generate(links) {
      const media = links
        .map(l => `      <media src="${escapeXml(l)}"/>`)
        .join('\n');
      return `<?wpl version="1.0"?>\n<smil>\n  <head>\n    <meta name="Generator" content="Media Playlist Extractor"/>\n    <title>Playlist</title>\n  </head>\n  <body>\n    <seq>\n${media}\n    </seq>\n  </body>\n</smil>\n`;
    }
  },
  asx: {
    ext: 'asx',
    mime: 'video/x-ms-asf',
    generate(links) {
      const entries = links
        .map(l => `  <ENTRY>\n    <TITLE>${escapeXml(fileNameFromUrl(l))}</TITLE>\n    <REF HREF="${escapeXml(l)}"/>\n  </ENTRY>`)
        .join('\n');
      return `<ASX version="3.0">\n  <TITLE>Playlist</TITLE>\n${entries}\n</ASX>\n`;
    }
  }
};

/* ---------------------------------------------------------
 * UI helpers
 * --------------------------------------------------------- */
function setStatus(message, type) {
  statusEl.classList.remove('show', 'error', 'success', 'shake');
  // force reflow so the animation can replay even if the message repeats
  void statusEl.offsetWidth;
  statusEl.textContent = message;
  statusEl.classList.add('show');
  if (type) statusEl.classList.add(type);
  if (type === 'error') statusEl.classList.add('shake');
}

function setLoading(isLoading) {
  downloadBtn.disabled = isLoading;
  downloadBtn.classList.toggle('loading', isLoading);
  btnText.textContent = isLoading ? 'Scanning…' : 'Download Playlist';
}

function getCheckboxes() {
  return Array.from(formatList.querySelectorAll('input[type="checkbox"]'));
}

selectAllBtn.addEventListener('click', () => {
  getCheckboxes().forEach(cb => (cb.checked = true));
});

selectNoneBtn.addEventListener('click', () => {
  getCheckboxes().forEach(cb => (cb.checked = false));
});

function getCustomExtensions() {
  return (customExtInput.value || '')
    .split(/[,\s;]+/)
    .map(s => s.trim().replace(/^\.+/, '').toLowerCase())
    .filter(Boolean);
}

function getSelectedExtensions() {
  const checked = getCheckboxes()
    .filter(cb => cb.checked)
    .map(cb => cb.value);
  const custom = getCustomExtensions();
  return Array.from(new Set([...checked, ...custom]));
}

/**
 * This function is injected into the page itself (not the popup),
 * so it only has access to the page's DOM — not any popup.js variables.
 * It must be fully self-contained.
 */
function scanPageForMediaLinks(extensions) {
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const lowerExts = extensions.map(ext => ext.toLowerCase());

  const matches = anchors
    .map(a => a.href) // .href gives the resolved absolute URL
    .filter(href => {
      if (!href) return false;
      let pathPart;
      try {
        pathPart = new URL(href).pathname;
      } catch (e) {
        pathPart = href;
      }
      const lowerPath = pathPart.toLowerCase();
      return lowerExts.some(ext => lowerPath.endsWith('.' + ext));
    });

  return Array.from(new Set(matches));
}

/* ---------------------------------------------------------
 * Main action
 * --------------------------------------------------------- */
downloadBtn.addEventListener('click', async () => {
  const selectedExtensions = getSelectedExtensions();

  if (selectedExtensions.length === 0) {
    setStatus('Please select a format or enter a custom extension.', 'error');
    return;
  }

  const formatKey = playlistFormatSelect.value;
  const formatDef = FORMAT_GENERATORS[formatKey];

  setLoading(true);
  setStatus('Scanning page…');

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab || !activeTab.id) {
      setStatus('No active tab found.', 'error');
      return;
    }

    if (!/^https?:\/\//i.test(activeTab.url || '')) {
      setStatus("This page can't be scanned (only http/https pages are supported).", 'error');
      return;
    }

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: scanPageForMediaLinks,
      args: [selectedExtensions]
    });

    const links = injectionResults?.[0]?.result || [];

    if (links.length === 0) {
      setStatus('No links found for the selected formats.', 'error');
      return;
    }

    const content = formatDef.generate(links);
    const blob = new Blob([content], { type: formatDef.mime });
    const blobUrl = URL.createObjectURL(blob);
    const filename = `playlist.${formatDef.ext}`;

    chrome.downloads.download(
      { url: blobUrl, filename, saveAs: false },
      downloadId => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          setStatus(
            'Download failed: ' + (chrome.runtime.lastError?.message || 'unknown error'),
            'error'
          );
        } else {
          setStatus(
            `Extracted ${links.length} link${links.length === 1 ? '' : 's'}! ${filename} downloaded.`,
            'success'
          );
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }
    );
  } catch (err) {
    setStatus('Error: ' + (err?.message || String(err)), 'error');
  } finally {
    setLoading(false);
  }
});
