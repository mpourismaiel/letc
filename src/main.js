import "./style.css";
import { words } from "./wordlist.js";

const WORDS = Array.isArray(words) ? words : [];
const webCrypto = globalThis.crypto;
const subtleCrypto = webCrypto?.subtle;

if (!webCrypto || !subtleCrypto) {
  throw new Error("Web Crypto API is required for LetC");
}

const ALPHABET = "ybndrfg8ejkmcpqxot1uwisza345h769";
const MIN = 0x31; // 1
const MAX = 0x7a; // z
const REVERSE = new Int8Array(1 + MAX - MIN);

REVERSE.fill(-1);

for (let i = 0; i < ALPHABET.length; i++) {
  const v = ALPHABET.charCodeAt(i) - MIN;
  REVERSE[v] = i;
}

const utf8 = (() => {
  function byteLength(string) {
    let length = 0;

    for (let i = 0, n = string.length; i < n; i++) {
      const code = string.charCodeAt(i);

      if (code >= 0xd800 && code <= 0xdbff && i + 1 < n) {
        const code = string.charCodeAt(i + 1);

        if (code >= 0xdc00 && code <= 0xdfff) {
          length += 4;
          i++;
          continue;
        }
      }

      if (code <= 0x7f) length += 1;
      else if (code <= 0x7ff) length += 2;
      else length += 3;
    }

    return length;
  }

  let decodeToString;

  if (typeof TextDecoder !== "undefined") {
    const decoder = new TextDecoder();

    decodeToString = function decodeToString(buffer) {
      return decoder.decode(buffer);
    };
  } else {
    decodeToString = function decodeToString(buffer) {
      const len = buffer.byteLength;

      let output = "";
      let i = 0;

      while (i < len) {
        let byte = buffer[i];

        if (byte <= 0x7f) {
          output += String.fromCharCode(byte);
          i++;
          continue;
        }

        let bytesNeeded = 0;
        let codePoint = 0;

        if (byte <= 0xdf) {
          bytesNeeded = 1;
          codePoint = byte & 0x1f;
        } else if (byte <= 0xef) {
          bytesNeeded = 2;
          codePoint = byte & 0x0f;
        } else if (byte <= 0xf4) {
          bytesNeeded = 3;
          codePoint = byte & 0x07;
        }

        if (len - i - bytesNeeded > 0) {
          let k = 0;

          while (k < bytesNeeded) {
            byte = buffer[i + k + 1];
            codePoint = (codePoint << 6) | (byte & 0x3f);
            k += 1;
          }
        } else {
          codePoint = 0xfffd;
          bytesNeeded = len - i;
        }

        output += String.fromCodePoint(codePoint);
        i += bytesNeeded + 1;
      }

      return output;
    };
  }

  let write;

  if (typeof TextEncoder !== "undefined") {
    const encoder = new TextEncoder();

    write = function write(buffer, string) {
      return encoder.encodeInto(string, buffer).written;
    };
  } else {
    write = function write(buffer, string) {
      const len = buffer.byteLength;

      let i = 0;
      let j = 0;

      while (i < string.length) {
        const code = string.codePointAt(i);

        if (code <= 0x7f) {
          buffer[j++] = code;
          i++;
          continue;
        }

        let count = 0;
        let bits = 0;

        if (code <= 0x7ff) {
          count = 6;
          bits = 0xc0;
        } else if (code <= 0xffff) {
          count = 12;
          bits = 0xe0;
        } else if (code <= 0x1fffff) {
          count = 18;
          bits = 0xf0;
        }

        buffer[j++] = bits | (code >> count);
        count -= 6;

        while (count >= 0) {
          buffer[j++] = 0x80 | ((code >> count) & 0x3f);
          count -= 6;
        }

        i += code >= 0x10000 ? 2 : 1;
      }

      return len;
    };
  }

  return {
    byteLength,
    toString: decodeToString,
    write,
  };
})();

function fromString(string, _encoding) {
  const buffer = new Uint8Array(utf8.byteLength(string));
  utf8.write(buffer, string);
  return buffer;
}

function fromArray(array) {
  const buffer = new Uint8Array(array.length);
  buffer.set(array);
  return buffer;
}

function fromBuffer(buffer) {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}

function fromArrayBuffer(arrayBuffer, byteOffset, length) {
  return new Uint8Array(arrayBuffer, byteOffset, length);
}

function from(value, encodingOrOffset, length) {
  // from(string, encoding)
  if (typeof value === "string") return fromString(value, encodingOrOffset);

  // from(array)
  if (Array.isArray(value)) return fromArray(value);

  // from(buffer)
  if (ArrayBuffer.isView(value)) return fromBuffer(value);

  // from(arrayBuffer[, byteOffset[, length]])
  return fromArrayBuffer(value, encodingOrOffset, length);
}

function decode(s, out) {
  let pb = 0;
  let ps = 0;

  const r = s.length & 7;
  const q = (s.length - r) / 8;

  if (!out) out = new Uint8Array(Math.ceil((s.length * 5) / 8));

  // 0 5 2 7 4 1 6 3 (+5 mod 8)
  for (let i = 0; i < q; i++) {
    const a = quintet(s, ps++);
    const b = quintet(s, ps++);
    const c = quintet(s, ps++);
    const d = quintet(s, ps++);
    const e = quintet(s, ps++);
    const f = quintet(s, ps++);
    const g = quintet(s, ps++);
    const h = quintet(s, ps++);

    out[pb++] = (a << 3) | (b >>> 2);
    out[pb++] = ((b & 0b11) << 6) | (c << 1) | (d >>> 4);
    out[pb++] = ((d & 0b1111) << 4) | (e >>> 1);
    out[pb++] = ((e & 0b1) << 7) | (f << 2) | (g >>> 3);
    out[pb++] = ((g & 0b111) << 5) | h;
  }

  if (r === 0) return out.subarray(0, pb);

  const a = quintet(s, ps++);
  const b = quintet(s, ps++);

  out[pb++] = (a << 3) | (b >>> 2);

  if (r <= 2) return out.subarray(0, pb);

  const c = quintet(s, ps++);
  const d = quintet(s, ps++);

  out[pb++] = ((b & 0b11) << 6) | (c << 1) | (d >>> 4);

  if (r <= 4) return out.subarray(0, pb);

  const e = quintet(s, ps++);

  out[pb++] = ((d & 0b1111) << 4) | (e >>> 1);

  if (r <= 5) return out.subarray(0, pb);

  const f = quintet(s, ps++);
  const g = quintet(s, ps++);

  out[pb++] = ((e & 0b1) << 7) | (f << 2) | (g >>> 3);

  if (r <= 7) return out.subarray(0, pb);

  const h = quintet(s, ps++);

  out[pb++] = ((g & 0b111) << 5) | h;

  return out.subarray(0, pb);
}

function encode(buf) {
  if (typeof buf === "string") buf = from(buf);

  const max = buf.byteLength * 8;

  let s = "";

  for (let p = 0; p < max; p += 5) {
    const i = p >>> 3;
    const j = p & 7;

    if (j <= 3) {
      s += ALPHABET[(buf[i] >>> (3 - j)) & 0b11111];
      continue;
    }

    const of = j - 3;
    const h = (buf[i] << of) & 0b11111;
    const l = (i >= buf.byteLength ? 0 : buf[i + 1]) >>> (8 - of);

    s += ALPHABET[h | l];
  }

  return s;
}

function quintet(s, i) {
  if (i > s.length) {
    return 0;
  }

  const v = s.charCodeAt(i);

  if (v < MIN || v > MAX) {
    throw Error(
      `Invalid character in base32 input: "${s[i]}" at position ${i}`,
    );
  }

  const bits = REVERSE[v - MIN];

  if (bits === -1) {
    throw Error(
      `Invalid character in base32 input: "${s[i]}" at position ${i}`,
    );
  }

  return bits;
}

function u32be(n) {
  return new Uint8Array([
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ]);
}

function readU32be(b, off = 0) {
  return (
    ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0
  );
}

function encodeWithLen(bytes) {
  const len = bytes.byteLength >>> 0;
  return encode(concatBytes(u32be(len), bytes));
}

function decodeWithLen(s) {
  const all = decode(s);
  if (all.byteLength < 4) throw new Error("Invalid input");
  const len = readU32be(all, 0);
  const payload = all.subarray(4);
  if (payload.byteLength < len) throw new Error("Truncated input");
  return payload.subarray(0, len);
}

const te = new TextEncoder();
const td = new TextDecoder();

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function randBytes(n) {
  const b = new Uint8Array(n);
  webCrypto.getRandomValues(b);
  return b;
}

async function deriveAesKey(password, salt, iterations = 250_000) {
  const baseKey = await subtleCrypto.importKey(
    "raw",
    te.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return subtleCrypto.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function gzipCompressUtf8(str) {
  if (typeof CompressionStream === "undefined") return null; // not supported
  const input = new Blob([te.encode(str)]);
  const cs = new CompressionStream("gzip");
  const stream = input.stream().pipeThrough(cs);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function gzipDecompressToUtf8(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream not supported");
  }
  const input = new Blob([bytes]);
  const ds = new DecompressionStream("gzip");
  const stream = input.stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return td.decode(new Uint8Array(ab));
}

async function encryptBytes(plaintext, password) {
  const version = new Uint8Array([2]);

  let flags = 0;
  let ptBytes = te.encode(plaintext);
  const gz = await gzipCompressUtf8(plaintext);
  if (gz && gz.byteLength + 1 < ptBytes.byteLength) {
    flags |= 1;
    ptBytes = gz;
  }

  const salt = randBytes(16);
  const iv = randBytes(12);
  const key = await deriveAesKey(password, salt);

  const ct = new Uint8Array(
    await subtleCrypto.encrypt({ name: "AES-GCM", iv }, key, ptBytes),
  );

  return concatBytes(version, new Uint8Array([flags]), salt, iv, ct);
}

async function decryptBytes(packed, password) {
  const version = packed[0];
  if (version !== 1 && version !== 2) throw new Error("Unsupported version");

  let flags = 0;
  let off = 1;

  if (version === 2) {
    flags = packed[off++];
  }

  const salt = packed.slice(off, off + 16);
  off += 16;

  const iv = packed.slice(off, off + 12);
  off += 12;

  const ct = packed.slice(off);

  const key = await deriveAesKey(password, salt);
  const ptBuf = await subtleCrypto.decrypt({ name: "AES-GCM", iv }, key, ct);
  const ptBytes = new Uint8Array(ptBuf);

  if (version === 2 && flags & 1) {
    return await gzipDecompressToUtf8(ptBytes);
  }

  return td.decode(ptBytes);
}

const WORD_RADIX = 8192; // 13 bits per word

function getWordTables() {
  if (!Array.isArray(WORDS)) {
    throw new Error("wordlist missing");
  }
  if (WORDS.length < WORD_RADIX) {
    throw new Error(`wordlist must have at least ${WORD_RADIX} words`);
  }

  const list = WORDS.slice(0, WORD_RADIX).map((w) => ("" + w).toLowerCase());

  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (seen.has(w))
      throw new Error(`duplicate word in first ${WORD_RADIX}: "${w}"`);
    seen.add(w);
  }

  const map = Object.create(null);
  for (let i = 0; i < list.length; i++) map[list[i]] = i;

  return { list, map };
}

function normalizeWordInput(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[-,;:.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function encodeWordsFromBytes(bytes) {
  const { list } = getWordTables();

  const payload = concatBytes(u32be(bytes.byteLength >>> 0), bytes);

  let acc = 0;
  let accBits = 0;
  const out = [];

  for (let i = 0; i < payload.length; i++) {
    acc = (acc << 8) | payload[i];
    accBits += 8;

    while (accBits >= 13) {
      accBits -= 13;
      const idx = (acc >>> accBits) & 0x1fff;
      out.push(list[idx]);
    }
  }

  if (accBits > 0) {
    const idx = (acc << (13 - accBits)) & 0x1fff;
    out.push(list[idx]);
  }

  return out.join(" ");
}

function decodeWordsToBytes(wordsStr) {
  const { map } = getWordTables();

  const s = normalizeWordInput(wordsStr);
  if (!s) throw new Error("empty input");

  const words = s.split(" ");
  let acc = 0;
  let accBits = 0;

  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const idx = map[w];
    if (idx === undefined) {
      throw new Error(`unknown word "${w}" at position ${i + 1}`);
    }

    acc = (acc << 13) | idx;
    accBits += 13;

    while (accBits >= 8) {
      accBits -= 8;
      out.push((acc >>> accBits) & 255);
    }
  }

  const all = new Uint8Array(out);
  if (all.byteLength < 4) throw new Error("invalid/truncated payload");

  const len = readU32be(all, 0);
  const payload = all.subarray(4);

  if (payload.byteLength < len) throw new Error("truncated payload");
  return payload.subarray(0, len);
}

const PERSIAN_DIGITS = {
  0: "۰",
  1: "۱",
  2: "۲",
  3: "۳",
  4: "۴",
  5: "۵",
  6: "۶",
  7: "۷",
  8: "۸",
  9: "۹",
};

const LETTER_TO_PERSIAN = {
  a: "ا",
  b: "ب",
  c: "چ",
  d: "د",
  e: "ه",
  f: "ف",
  g: "گ",
  h: "ح",
  i: "ص",
  j: "ج",
  k: "ک",
  l: "ل",
  m: "م",
  n: "ن",
  o: "ث",
  p: "پ",
  q: "ق",
  r: "ر",
  s: "س",
  t: "ت",
  u: "ع",
  v: "ض",
  w: "و",
  x: "خ",
  y: "ی",
  z: "ز",
};

const PERSIAN_ALPHABET = ALPHABET.split("")
  .map((ch) => LETTER_TO_PERSIAN[ch] || PERSIAN_DIGITS[ch] || ch)
  .join("");

const replaceWithPersianChars = async (s) =>
  s
    .split("")
    .map((ch) => {
      const i = ALPHABET.indexOf(ch);
      return i >= 0 ? PERSIAN_ALPHABET[i] : ch;
    })
    .join("");

const replacePersianChars = async (s) =>
  s
    .split("")
    .map((ch) => {
      const i = PERSIAN_ALPHABET.indexOf(ch);
      return i >= 0 ? ALPHABET[i] : ch;
    })
    .join("");

const pipelines = {
  zb32: {
    encrypt: [encodeWithLen],
    decrypt: [decodeWithLen],
  },
  wordlist: {
    encrypt: [encodeWordsFromBytes],
    decrypt: [decodeWordsToBytes],
  },
  persian: {
    encrypt: [encodeWithLen, replaceWithPersianChars],
    decrypt: [replacePersianChars, decodeWithLen],
  },
  simplepersian: {
    encrypt: [encodeWithLen, replaceWithPersianChars],
    decrypt: [replacePersianChars, decodeWithLen],
  },
};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const contentEl = document.getElementById("content");
    const passwordEl = document.getElementById("pwd");
    const encryptBtn = document.getElementById("encrypt");
    const decryptBtn = document.getElementById("decrypt");
    const resultEl = document.getElementById("result");
    const copyBtn = document.getElementById("copy-result");
    const pasteBtn = document.getElementById("paste-content");
    const resultSub = document.getElementById("result-subheader");
    const lengthSpan = document.getElementById("length");
    const hasEncryption = document.getElementById("has-encryption");
    const pwdWrap = document.querySelector(".pwd-wrap");

    if (resultSub) {
      resultSub.style.display = "none";
    }
    if (pwdWrap && hasEncryption) {
      pwdWrap.style.display = hasEncryption.checked ? "" : "none";
      hasEncryption.addEventListener("change", () => {
        pwdWrap.style.display = hasEncryption.checked ? "" : "none";
      });
    }

    const setMono = () => {
      resultEl.classList.remove("prose");
      resultEl.classList.add("mono");
    };

    const setProse = () => {
      resultEl.classList.remove("mono");
      resultEl.classList.add("prose");
    };

    encryptBtn.addEventListener("click", async () => {
      try {
        const plaintext = contentEl.value;
        const password = passwordEl.value;

        const mode =
          document.querySelector('input[name="mode"]:checked')?.value || "zb32";
        const pipeline = pipelines[mode] || pipelines.zb32;
        let encoded = hasEncryption.checked
          ? await encryptBytes(plaintext, password)
          : plaintext;

        if (!hasEncryption.checked && typeof encoded === "string") {
          encoded = from(encoded);
        }
        for (const fn of pipeline.encrypt) {
          encoded = await fn(encoded);
        }
        resultEl.innerText = encoded;

        if (mode === "zb32") {
          setMono();
        } else {
          setProse();
        }

        try {
          if (resultSub && lengthSpan) {
            lengthSpan.innerText = String(encoded.length || 0);
            resultSub.style.display = "none";
          }
        } catch (err) {
          console.error("length display failed", err);
        }
      } catch (e) {
        console.error(e);
        setProse();
        resultEl.innerText = "encrypt error\n" + e.message;
      }
    });

    decryptBtn.addEventListener("click", async () => {
      try {
        const password = passwordEl.value;
        const mode =
          document.querySelector('input[name="mode"]:checked')?.value || "zb32";
        const pipeline = pipelines[mode] || pipelines.zb32;
        const encoded = contentEl.value.trim();
        if (resultSub) resultSub.style.display = "";

        let packed = encoded;
        for (const fn of pipeline.decrypt) {
          packed = await fn(packed);
        }

        let final;
        if (hasEncryption.checked) {
          final = await decryptBytes(packed, password);
        } else {
          // If pipeline produced bytes, convert to UTF-8 string for display.
          if (ArrayBuffer.isView(packed)) {
            final = utf8.toString(packed);
          } else if (packed instanceof ArrayBuffer) {
            final = utf8.toString(new Uint8Array(packed));
          } else {
            final = packed;
          }
        }

        resultEl.innerText = final;
        setProse();
      } catch (e) {
        console.error(e);
        setProse();
        resultEl.innerText = "invalid input for decrypt\n" + e.message;
      }
    });

    copyBtn.addEventListener("click", async () => {
      const text = resultEl.innerText || "";
      if (!text) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        const prev = copyBtn.textContent;
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = prev;
        }, 1400);
      } catch (err) {
        console.error("copy failed", err);
        copyBtn.textContent = "Copy failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1400);
      }
    });

    pasteBtn.addEventListener("click", async () => {
      try {
        let text = "";
        if (navigator.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
        contentEl.value = text;
        const prev = pasteBtn.textContent;
        pasteBtn.textContent = text ? "Pasted" : "Empty";
        setTimeout(() => {
          pasteBtn.textContent = prev;
        }, 1200);
      } catch (err) {
        console.error("paste failed", err);
        const prev = pasteBtn.textContent;
        pasteBtn.textContent = "Paste failed";
        setTimeout(() => {
          pasteBtn.textContent = prev;
        }, 1400);
      }
    });
  });
}
