/**
 * safe-zip — yauzl 래퍼. ZIP bomb / path traversal / 엔트리 수 폭발 방어.
 *
 * DART 가 정상 응답만 보내리라는 가정은 MITM·프록시 감염 가정 시 깨진다.
 * 상한을 코드에서 강제해 프로세스 크래시·임의 파일 쓰기를 막는다.
 *
 * 기본 한도(공시 첨부·XBRL 기준 넉넉):
 *   - maxTotalBytes: 200MB  (해제 후 누적)
 *   - maxEntryBytes: 100MB  (단일 파일)
 *   - maxEntries:    5000
 *
 * 예외: corp_code 전량 덤프는 ~30MB xml 하나 → 기본 한도 안이지만 혹시 증가해도
 *       `options.maxTotalBytes` 로 호출자가 상향 가능.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import yauzl from "yauzl";

export interface SafeUnzipOptions {
  /** 해제 후 총 누적 크기 상한 (기본 200MB) */
  maxTotalBytes?: number;
  /** 단일 엔트리 크기 상한 (기본 100MB) */
  maxEntryBytes?: number;
  /** 엔트리 개수 상한 (기본 5000) */
  maxEntries?: number;
  /** true 면 해당 엔트리만 읽음. false/undefined 면 읽지 않고 skip. */
  filter?: (fileName: string) => boolean;
}

export interface ZipEntryResult {
  name: string;
  data: Buffer;
}

const DEFAULT_MAX_TOTAL = 200 * 1024 * 1024;
const DEFAULT_MAX_ENTRY = 100 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 5000;

/** ZIP 을 메모리로 해제. 상한 초과 시 throw. */
export function safeUnzipToMemory(
  buf: Buffer,
  options: SafeUnzipOptions = {},
): Promise<ZipEntryResult[]> {
  const maxTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL;
  const maxEntry = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const filter = options.filter;

  return new Promise((resolvePromise, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip open failed"));
      const out: ZipEntryResult[] = [];
      let totalBytes = 0;
      let entryCount = 0;
      let rejected = false;

      const abort = (msg: string) => {
        if (rejected) return;
        rejected = true;
        reject(new Error(`safe-unzip: ${msg}`));
        try { zip.close(); } catch { /* ignore */ }
      };

      zip.on("entry", (entry: yauzl.Entry) => {
        if (rejected) return;
        entryCount++;
        if (entryCount > maxEntries) return abort(`엔트리 수 상한 초과 (>${maxEntries})`);

        // 디렉터리 엔트리 skip
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }

        // 단일 엔트리 크기 선제 검사 (압축 해제 전 선언된 uncompressed size)
        const declared = entry.uncompressedSize ?? 0;
        if (declared > maxEntry) {
          return abort(`엔트리 크기 상한 초과: ${entry.fileName} (${declared} > ${maxEntry})`);
        }
        if (totalBytes + declared > maxTotal) {
          return abort(`총 크기 상한 초과 (>${maxTotal})`);
        }

        // 필터 통과 안 하면 skip
        if (filter && !filter(entry.fileName)) {
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return abort(`stream open failed: ${err2?.message ?? "unknown"}`);
          const chunks: Buffer[] = [];
          let entrySize = 0;
          stream.on("data", (c: Buffer) => {
            if (rejected) return;
            entrySize += c.length;
            // 실제 해제 시에도 재검사 (declared 가 거짓말일 수 있음)
            if (entrySize > maxEntry) {
              return abort(`엔트리 실제 크기 상한 초과: ${entry.fileName}`);
            }
            if (totalBytes + entrySize > maxTotal) {
              return abort(`총 크기 상한 초과 (>${maxTotal})`);
            }
            chunks.push(c);
          });
          stream.on("end", () => {
            if (rejected) return;
            totalBytes += entrySize;
            out.push({ name: entry.fileName, data: Buffer.concat(chunks) });
            zip.readEntry();
          });
          stream.on("error", (e) => abort(`stream error: ${e.message}`));
        });
      });
      zip.on("end", () => {
        if (!rejected) resolvePromise(out);
      });
      zip.on("error", (e) => abort(`zip error: ${e.message}`));
      zip.readEntry();
    });
  });
}

export interface SafeUnzipToDiskOptions extends SafeUnzipOptions {
  /** 디렉터리 생성 안 함 (기본: 자동 생성) */
  skipMkdir?: boolean;
}

export interface DiskEntryResult {
  name: string;
  size: number;
  path: string;
}

/**
 * ZIP 을 디스크로 해제. path traversal (zip slip) 방어 포함.
 * entry.fileName 이 절대경로·`..` 포함·`\0` 포함이면 거부.
 * 해제된 경로가 outDir 밖으로 나가면 거부.
 */
export function safeUnzipToDisk(
  buf: Buffer,
  outDir: string,
  options: SafeUnzipToDiskOptions = {},
): Promise<DiskEntryResult[]> {
  const maxTotal = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL;
  const maxEntry = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const filter = options.filter;

  const outRoot = resolve(outDir);
  if (!options.skipMkdir) mkdirSync(outRoot, { recursive: true });

  return new Promise((resolvePromise, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip open failed"));
      const out: DiskEntryResult[] = [];
      let totalBytes = 0;
      let entryCount = 0;
      let rejected = false;

      const abort = (msg: string) => {
        if (rejected) return;
        rejected = true;
        reject(new Error(`safe-unzip: ${msg}`));
        try { zip.close(); } catch { /* ignore */ }
      };

      zip.on("entry", (entry: yauzl.Entry) => {
        if (rejected) return;
        entryCount++;
        if (entryCount > maxEntries) return abort(`엔트리 수 상한 초과 (>${maxEntries})`);

        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }

        // zip slip 검증
        const name = entry.fileName;
        if (
          name.includes("\0") ||
          name.startsWith("/") ||
          name.startsWith("\\") ||
          /^[a-zA-Z]:[\\/]/.test(name) || // Windows drive (C:\, C:/)
          name.split(/[\\/]/).some((seg) => seg === "..")
        ) {
          return abort(`허용되지 않는 엔트리 경로: ${name}`);
        }

        // 해제 경로가 outRoot 하위인지 확인 (symlink·normalize 우회 방어)
        const target = resolve(outRoot, name);
        const rootWithSep = outRoot.endsWith(sep) ? outRoot : outRoot + sep;
        if (!target.startsWith(rootWithSep) && target !== outRoot) {
          return abort(`엔트리가 outDir 밖으로 탈출: ${name}`);
        }

        const declared = entry.uncompressedSize ?? 0;
        if (declared > maxEntry) return abort(`엔트리 크기 상한: ${name}`);
        if (totalBytes + declared > maxTotal) return abort(`총 크기 상한 초과`);

        if (filter && !filter(name)) {
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return abort(`stream open failed: ${err2?.message ?? "unknown"}`);
          const chunks: Buffer[] = [];
          let entrySize = 0;
          stream.on("data", (c: Buffer) => {
            if (rejected) return;
            entrySize += c.length;
            if (entrySize > maxEntry) return abort(`엔트리 실제 크기 상한: ${name}`);
            if (totalBytes + entrySize > maxTotal) return abort(`총 크기 상한 초과`);
            chunks.push(c);
          });
          stream.on("end", () => {
            if (rejected) return;
            totalBytes += entrySize;
            // 엔트리가 하위 디렉터리를 포함하면 생성
            const dirSep = target.lastIndexOf(sep);
            if (dirSep > outRoot.length) {
              mkdirSync(target.substring(0, dirSep), { recursive: true });
            }
            const data = Buffer.concat(chunks);
            writeFileSync(target, data);
            out.push({ name, size: data.length, path: target });
            zip.readEntry();
          });
          stream.on("error", (e) => abort(`stream error: ${e.message}`));
        });
      });
      zip.on("end", () => {
        if (!rejected) resolvePromise(out);
      });
      zip.on("error", (e) => abort(`zip error: ${e.message}`));
      zip.readEntry();
    });
  });
}

/** outDir 기본 규약용 공용 함수 (호출부 편의). */
export function defaultXbrlOutDir(homeDir: string, rceptNo: string, reprtCode: string): string {
  return join(homeDir, ".korean-dart-mcp", "xbrl", `${rceptNo}_${reprtCode}`);
}
