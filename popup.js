const downloadBtn   = document.getElementById('downloadBtn');
const downloadText  = downloadBtn.querySelector('.btn-text');
const copyBtn       = document.getElementById('copyBtn');
const copyText      = copyBtn.querySelector('.btn-text');
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
  },
  txt: {
    ext: 'txt',
    mime: 'text/plain',
    generate(links) {
      return links.join('\n') + '\n';
    }
  }
};

/* ---------------------------------------------------------
 * Filename derived from the current page's folder
 * --------------------------------------------------------- */
function sanitizeFileName(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'playlist';
}

function getPlaylistBaseName(tabUrl) {
  try {
    const u = new URL(tabUrl);
    const segments = u.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return sanitizeFileName(u.hostname || 'playlist');
    }

    let last = segments[segments.length - 1];

    // If the last path segment looks like a filename (has a short extension,
    // e.g. "index.html"), use its parent folder instead — that's usually
    // the actual album/directory name the user is browsing.
    const looksLikeFile = /\.[a-z0-9]{1,5}$/i.test(last);
    if (looksLikeFile) {
      if (segments.length > 1) {
        last = segments[segments.length - 2];
      } else {
        return sanitizeFileName(u.hostname || 'playlist');
      }
    }

    return sanitizeFileName(decodeURIComponent(last));
  } catch (e) {
    return 'playlist';
  }
}

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

function setBusy(button, isBusy) {
  button.disabled = isBusy;
  button.classList.toggle('loading', isBusy);
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

/**
 * Shared scan step used by both the download and copy actions.
 * Queries the active tab, validates it, injects the scanner, and
 * returns { links, tabUrl }. Throws an Error with a user-facing
 * message on any failure.
 */
async function getMatchedLinksFromActiveTab(selectedExtensions) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    throw new Error('No active tab found.');
  }

  if (!/^https?:\/\//i.test(activeTab.url || '')) {
    throw new Error("This page can't be scanned (only http/https pages are supported).");
  }

  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: scanPageForMediaLinks,
    args: [selectedExtensions]
  });

  const links = injectionResults?.[0]?.result || [];
  return { links, tabUrl: activeTab.url };
}

/**
 * Copies text to the clipboard, falling back to a hidden textarea +
 * execCommand if the async Clipboard API isn't available/permitted.
 */
async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fall through to the fallback below
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (e) {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}

/* ---------------------------------------------------------
 * Download Playlist
 * --------------------------------------------------------- */
downloadBtn.addEventListener('click', async () => {
  const selectedExtensions = getSelectedExtensions();

  if (selectedExtensions.length === 0) {
    setStatus('Please select a format or enter a custom extension.', 'error');
    return;
  }

  const formatKey = playlistFormatSelect.value;
  const formatDef = FORMAT_GENERATORS[formatKey];

  setBusy(downloadBtn, true);
  downloadText.textContent = 'Scanning…';
  setStatus('Scanning page…');

  try {
    const { links, tabUrl } = await getMatchedLinksFromActiveTab(selectedExtensions);

    if (links.length === 0) {
      setStatus('No links found for the selected formats.', 'error');
      return;
    }

    const content = formatDef.generate(links);
    const blob = new Blob([content], { type: formatDef.mime });
    const blobUrl = URL.createObjectURL(blob);
    const baseName = getPlaylistBaseName(tabUrl);
    const filename = `${baseName}.${formatDef.ext}`;

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
    setStatus(err?.message || String(err), 'error');
  } finally {
    setBusy(downloadBtn, false);
    downloadText.textContent = 'Download Playlist';
  }
});

/* ---------------------------------------------------------
 * Copy Links (no download)
 * --------------------------------------------------------- */
copyBtn.addEventListener('click', async () => {
  const selectedExtensions = getSelectedExtensions();

  if (selectedExtensions.length === 0) {
    setStatus('Please select a format or enter a custom extension.', 'error');
    return;
  }

  setBusy(copyBtn, true);
  copyText.textContent = 'Scanning…';
  setStatus('Scanning page…');

  let justCopied = false;

  try {
    const { links } = await getMatchedLinksFromActiveTab(selectedExtensions);

    if (links.length === 0) {
      setStatus('No links found for the selected formats.', 'error');
      return;
    }

    const copied = await copyTextToClipboard(links.join('\n'));

    if (copied) {
      justCopied = true;
      setStatus(
        `Copied ${links.length} link${links.length === 1 ? '' : 's'} to clipboard!`,
        'success'
      );
    } else {
      setStatus('Could not copy to clipboard — try again.', 'error');
    }
  } catch (err) {
    setStatus(err?.message || String(err), 'error');
  } finally {
    setBusy(copyBtn, false);
    if (justCopied) {
      copyBtn.classList.add('copied');
      copyText.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyText.textContent = 'Copy Links';
      }, 1500);
    } else {
      copyText.textContent = 'Copy Links';
    }
  }
});
