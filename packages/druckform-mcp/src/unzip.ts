import fs from "node:fs";
import path from "node:path";
import yauzl from "yauzl";

const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_ENTRY_COUNT = 1_000;

export interface UnzipResult {
  ok: boolean;
  error?: string;
  files: string[]; // relative paths of extracted files
}

export function hardenedUnzip(zipPath: string, destDir: string): Promise<UnzipResult> {
  return new Promise((resolve) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) {
        return resolve({ ok: false, error: `Cannot open archive: ${err?.message}`, files: [] });
      }

      const files: string[] = [];
      let totalBytes = 0;
      let entryCount = 0;

      zipfile.readEntry();

      zipfile.on("entry", (entry: yauzl.Entry) => {
        entryCount++;

        if (entryCount > MAX_ENTRY_COUNT) {
          zipfile.close();
          return resolve({ ok: false, error: `Archive exceeds maximum entry count (${MAX_ENTRY_COUNT})`, files });
        }

        // Zip-slip check: resolve and verify strictly inside destDir
        const entryPath = entry.fileName;
        if (path.isAbsolute(entryPath) || entryPath.includes("..")) {
          zipfile.close();
          return resolve({ ok: false, error: `Zip-slip detected: ${entryPath}`, files });
        }

        const fullPath = path.resolve(destDir, entryPath);
        if (!fullPath.startsWith(path.resolve(destDir) + path.sep) && fullPath !== path.resolve(destDir)) {
          zipfile.close();
          return resolve({ ok: false, error: `Zip-slip detected: ${entryPath}`, files });
        }

        // Directory entry
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(fullPath, { recursive: true });
          zipfile.readEntry();
          return;
        }

        // File entry: stream with size check
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            zipfile.close();
            return resolve({ ok: false, error: `Stream error: ${streamErr?.message}`, files });
          }

          const writeStream = fs.createWriteStream(fullPath);
          let entryBytes = 0;

          readStream.on("data", (chunk: Buffer) => {
            entryBytes += chunk.length;
            totalBytes += chunk.length;
            if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
              readStream.destroy();
              writeStream.destroy();
              zipfile.close();
              resolve({ ok: false, error: `Archive exceeds maximum uncompressed size (${MAX_UNCOMPRESSED_BYTES} bytes)`, files });
            }
          });

          readStream.pipe(writeStream);

          writeStream.on("finish", () => {
            files.push(entryPath);
            zipfile.readEntry();
          });

          writeStream.on("error", (e) => {
            zipfile.close();
            resolve({ ok: false, error: `Write error: ${e.message}`, files });
          });
        });
      });

      zipfile.on("end", () => resolve({ ok: true, files }));
      zipfile.on("error", (e) => {
        const msg = e.message;
        const error = msg.includes("relative path") || msg.includes("absolute path")
          ? `Zip-slip detected: ${msg}`
          : msg;
        resolve({ ok: false, error, files });
      });
    });
  });
}
