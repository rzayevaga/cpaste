/*
Created by: rzayeffdi
GitHub: https://github.com/rzayevaga
Website: https://rzayeffdi.tech
*/

// ========================================
// INITIALIZATION
// ========================================

const blob = new Blob(['importScripts("https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma_worker.min.js");']);
const lzma = new LZMA(window.URL.createObjectURL(blob));

let editor = null;
let select = null;
let clipboard = null;
let statsEl = null;

const init = () => {
    try {
        handleLegacyUrl();
        initCodeEditor();
        initLangSelector();
        initCode();
        initClipboard();
        initModals();
        console.log('CPaste initialized successfully by rzayeffdi');
    } catch (error) {
        console.error('Initialization error:', error);
    }
};

// ========================================
// CODE EDITOR SETUP
// ========================================

const initCodeEditor = () => {
    CodeMirror.modeURL = 'https://cdn.jsdelivr.net/npm/codemirror@5.65.5/mode/%N/%N.js';
    editor = new CodeMirror(byId('editor'), {
        lineNumbers: true,
        theme: 'dracula',
        readOnly: readOnly,
        lineWrapping: false,
        scrollbarStyle: 'simple',
        tabSize: 4,
        indentUnit: 4,
        lineWiseCopyCut: true,
        autoCloseBrackets: true,
        matchBrackets: true,
    });

    if (readOnly) {
        document.body.classList.add('readonly');
    }

    statsEl = byId('stats');
    editor.on('change', () => {
        const length = editor.getValue().length;
        const lines = editor['doc'].size;
        statsEl.innerHTML = `Uzunluq: ${length} | Sətirlər: ${lines}`;
        hideCopyBar();
    });

    // Focus editor on load
    if (!readOnly) {
        setTimeout(() => editor.focus(), 100);
    }
};

// ========================================
// LANGUAGE SELECTOR
// ========================================

const initLangSelector = () => {
    select = new SlimSelect({
        select: '#language',
        data: CodeMirror.modeInfo.map((e) => ({
            text: e.name,
            value: shorten(e.name),
            data: { mime: e.mime, mode: e.mode },
        })),
        showContent: 'down',
        onChange: (e) => {
            const language = e.data || { mime: null, mode: null };
            editor.setOption('mode', language.mime);
            CodeMirror.autoLoadMode(editor, language.mode);
            
            // Update page title
            const pageTitle = e.text && e.text !== 'Plain Text' 
                ? `CPaste - ${e.text} kod parçası` 
                : 'CPaste - Kod paylaşma platforması';
            document.title = pageTitle;
        },
    });

    // Set language from URL parameter
    const l = new URLSearchParams(window.location.search).get('l');
    select.set(l ? decodeURIComponent(l) : shorten('Plain Text'));
};

// ========================================
// CODE DECOMPRESSION
// ========================================

const initCode = () => {
    let base64 = location.hash.substr(1);
    if (base64.length === 0) {
        return;
    }
    
    decompress(base64, (code, err) => {
        if (err) {
            console.error('Decompression failed:', err);
            MicroModal.show('error-modal');
            return;
        }
        editor.setValue(code);
        
        // Auto-detect language if not specified
        if (!new URLSearchParams(window.location.search).get('l')) {
            autoDetectLanguage(code);
        }
    });
};

// ========================================
// AUTO LANGUAGE DETECTION
// ========================================

const autoDetectLanguage = (code) => {
    const trimmedCode = code.trim();
    
    // Simple language detection patterns
    if (trimmedCode.startsWith('<!DOCTYPE html>') || trimmedCode.startsWith('<html')) {
        select.set(shorten('HTML'));
    } else if (trimmedCode.includes('function') || trimmedCode.includes('const ') || trimmedCode.includes('let ')) {
        select.set(shorten('JavaScript'));
    } else if (trimmedCode.includes('def ') || trimmedCode.includes('import ')) {
        select.set(shorten('Python'));
    } else if (trimmedCode.startsWith('{') || trimmedCode.startsWith('[')) {
        select.set(shorten('JSON'));
    }
};

// ========================================
// LEGACY URL COMPATIBILITY
// ========================================

const handleLegacyUrl = () => {
    const lang = new URLSearchParams(window.location.search).get('lang');
    const base = `${location.protocol}//${location.host}`;
    
    if (location.hash.charAt(5) === '-') {
        const hashedLang = location.hash.substr(1, 4);
        const newLang = CodeMirror.modeInfo.find((e) => hash(e.name) === hashedLang);
        const queryParams = newLang ? '?l=' + shorten(newLang.name) : '';
        location.replace(`${base}/${queryParams}#${location.hash.substr(6)}`);
        throw new Error('Redirecting to new URL format');
    }
    
    if (lang) {
        location.replace(`${base}/${'?l=' + shorten(lang)}${location.hash}`);
        throw new Error('Redirecting to new URL format');
    }
};

// ========================================
// CLIPBOARD INTEGRATION
// ========================================

const initClipboard = () => {
    clipboard = new ClipboardJS('.clipboard');
    
    clipboard.on('success', () => {
        hideCopyBar(true);
    });
    
    clipboard.on('error', (e) => {
        console.error('Clipboard error:', e);
        alert('Kopyalama uğursuz oldu. Lütfən əl ilə kopyalayın.');
    });
};

// ========================================
// MODAL INITIALIZATION
// ========================================

const initModals = () => {
    MicroModal.init({
        onClose: () => {
            if (!readOnly) {
                editor.focus();
            }
        },
        awaitCloseAnimation: true,
        disableScroll: true,
    });
};

// ========================================
// LINK GENERATION
// ========================================

const generateLink = (mode) => {
    const data = editor.getValue();
    
    if (data.length === 0) {
        alert('Kod sahəsi boşdur. Zəhmət olmasa məzmun daxil edin.');
        return;
    }
    
    if (data.length > 50000) {
        if (!confirm('Məzmun çox böyükdür. Link çox uzun ola bilər. Davam edək?')) {
            return;
        }
    }
    
    compress(data, (base64, err) => {
        if (err) {
            alert('Sıxışdırma xətası: ' + err);
            console.error('Compression error:', err);
            return;
        }
        
        const url = buildUrl(base64, mode);
        const compressionRatio = Math.round((100 * url.length) / data.length);
        
        statsEl.innerHTML = `Məlumat: ${data.length} | Link: ${url.length} | Sıxışdırma: ${compressionRatio}%`;
        showCopyBar(url);
    });
};

// ========================================
// COPY BAR MANAGEMENT
// ========================================

const showCopyBar = (dataToCopy) => {
    const copyBar = byId('copy');
    const linkInput = byId('copy-link');
    
    copyBar.classList.remove('hidden');
    linkInput.value = dataToCopy;
    linkInput.focus();
    linkInput.setSelectionRange(0, dataToCopy.length);
};

const hideCopyBar = (success) => {
    const copyButton = byId('copy-btn');
    const copyBar = byId('copy');
    
    if (!success) {
        copyBar.classList.add('hidden');
        return;
    }
    
    copyButton.innerText = 'Kopyalandı!';
    copyButton.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    
    setTimeout(() => {
        copyBar.classList.add('hidden');
        copyButton.innerText = 'Kopyala';
        copyButton.style.background = '';
    }, 1200);
};

// ========================================
// LINE WRAPPING CONTROLS
// ========================================

const disableLineWrapping = () => {
    byId('disable-line-wrapping').classList.add('hidden');
    byId('enable-line-wrapping').classList.remove('hidden');
    editor.setOption('lineWrapping', false);
};

const enableLineWrapping = () => {
    byId('enable-line-wrapping').classList.add('hidden');
    byId('disable-line-wrapping').classList.remove('hidden');
    editor.setOption('lineWrapping', true);
};

// ========================================
// OPEN IN NEW TAB
// ========================================

const openInNewTab = () => {
    const newUrl = location.href.replace(/[?&]readonly/, '');
    window.open(newUrl, '_blank');
};

// ========================================
// URL BUILDER
// ========================================

const buildUrl = (rawData, mode) => {
    const base = `${location.protocol}//${location.host}${location.pathname}`;
    const currentLang = select.selected();
    const query = shorten('Plain Text') === currentLang ? '' : `?l=${encodeURIComponent(currentLang)}`;
    const url = base + query + '#' + rawData;
    
    if (mode === 'markdown') {
        return `[NoPaste kod parçası](${url})`;
    }
    
    if (mode === 'iframe') {
        const height = Math.min(editor['doc'].height + 45, 600);
        return `<iframe width="100%" height="${height}" frameborder="0" src="${url}" style="border: 1px solid #ddd; border-radius: 8px;"></iframe>`;
    }
    
    return url;
};

// ========================================
// COMPRESSION / DECOMPRESSION
// ========================================

const decompress = (base64, cb) => {
    const progressBar = byId('progress');
    
    const req = new XMLHttpRequest();
    req.open('GET', 'data:application/octet;base64,' + base64);
    req.responseType = 'arraybuffer';
    
    req.onload = (e) => {
        lzma.decompress(
            new Uint8Array(e.target.response),
            (result, err) => {
                progressBar.style.width = '0';
                cb(result, err);
            },
            (progress) => {
                progressBar.style.width = Math.min(100 * progress, 100) + '%';
            }
        );
    };
    
    req.onerror = () => {
        progressBar.style.width = '0';
        cb(null, 'Network error');
    };
    
    req.send();
};

const compress = (str, cb) => {
    if (str.length === 0) {
        cb('');
        return;
    }
    
    const progressBar = byId('progress');
    
    lzma.compress(
        str,
        1,
        (compressed, err) => {
            if (err) {
                progressBar.style.width = '0';
                cb(compressed, err);
                return;
            }
            
            const reader = new FileReader();
            reader.onload = () => {
                progressBar.style.width = '0';
                cb(reader.result.substr(reader.result.indexOf(',') + 1));
            };
            reader.onerror = () => {
                progressBar.style.width = '0';
                cb(null, 'FileReader error');
            };
            reader.readAsDataURL(new Blob([new Uint8Array(compressed)]));
        },
        (progress) => {
            progressBar.style.width = Math.min(100 * progress, 100) + '%';
        }
    );
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

const slugify = (str) =>
    str
        .trim()
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/\+/g, '-p')
        .replace(/#/g, '-sharp')
        .replace(/[^\w\-]+/g, '');

const shorten = (name) => {
    let n = slugify(name).replace('script', '-s').replace('python', 'py');
    const nov = (s) => s[0] + s.substr(1).replace(/[aeiouy-]/g, '');
    
    if (n.replace(/-/g, '').length <= 4) {
        return n.replace(/-/g, '');
    }
    
    if (n.split('-').length >= 2) {
        return n
            .split('-')
            .map((x) => nov(x.substr(0, 2)))
            .join('')
            .substr(0, 4);
    }
    
    n = nov(n);
    if (n.length <= 4) {
        return n;
    }
    
    return n.substr(0, 2) + n.substr(n.length - 2, 2);
};

const byId = (id) => document.getElementById(id);

// ========================================
// LEGACY HASH FUNCTION
// ========================================

const hash = function (str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const h = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    
    return h.toString(36).substr(0, 4).toUpperCase();
};

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S to generate link
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        generateLink('url');
    }
    
    // Ctrl/Cmd + K to copy link
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const copyLink = byId('copy-link');
        if (copyLink.value) {
            copyLink.select();
            document.execCommand('copy');
        }
    }
});

// ========================================
// SERVICE WORKER REGISTRATION
// ========================================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => {
        console.log('Service Worker registered successfully');
    }).catch((err) => {
        console.warn('Service Worker registration failed:', err);
    });
}

// ========================================
// START APPLICATION
// ========================================

init();
