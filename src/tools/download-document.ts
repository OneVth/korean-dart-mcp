/**
 * download_document — 공시 원문 XML (document.xml)
 *
 * ZIP 으로 반환되는 DART 원문을 해제하여 UTF-8 텍스트로 반환.
 * 파일이 클 수 있어 `truncate_at` 으로 상한 설정 가능 (기본 100k chars).
 *
 * 참고: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019003
 */

import { z } from "zod";
import yauzl from "yauzl";
import iconv from "iconv-lite";
import { defineTool } from "./_helpers.js";

const Input = z.object({
  rcept_no: z
    .string()
    .regex(/^\d{14}$/)
    .describe("접수번호 14자리 (search_disclosures 의 rcept_no)"),
  truncate_at: z
    .number()
    .int()
    .min(1000)
    .default(100_000)
    .describe("텍스트 최대 길이 (초과분은 잘림)"),
});

export const downloadDocumentTool = defineTool({
  name: "download_document",
  description:
    "공시서류의 원문 XML (DART 전용 마크업) 을 해제해서 텍스트로 반환합니다. " +
    "대형 사업보고서는 수백 KB 에 이르므로 기본 10만 자에서 절단. " +
    "사업보고서 원본·반기보고서·주요사항보고 등 모든 공시 원문에 사용.",
  input: Input,
  handler: async (_ctx, args) => {
    const buf = await _ctx.client.getZip("document.xml", {
      rcept_no: args.rcept_no,
    });
    const files = await extractZipEntries(buf);
    const xmlFile = files.find((f) => /\.xml$/i.test(f.name));
    if (!xmlFile) {
      throw new Error(
        `원문 XML 을 찾지 못했습니다. 반환된 파일: ${files.map((f) => f.name).join(", ")}`,
      );
    }
    // DART 원문은 EUC-KR 로 인코딩된 경우가 많음 → XML 선언에서 인코딩 감지
    const text = decodeXml(xmlFile.data);
    const truncated = text.length > args.truncate_at;
    return {
      rcept_no: args.rcept_no,
      file: xmlFile.name,
      size_bytes: xmlFile.data.length,
      char_count: text.length,
      truncated,
      content: truncated ? text.slice(0, args.truncate_at) : text,
    };
  },
});

interface ZipFile {
  name: string;
  data: Buffer;
}

function extractZipEntries(buf: Buffer): Promise<ZipFile[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip open failed"));
      const files: ZipFile[] = [];
      zip.on("entry", (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return reject(err2 ?? new Error("stream open failed"));
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            files.push({ name: entry.fileName, data: Buffer.concat(chunks) });
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(files));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

function decodeXml(buf: Buffer): string {
  // XML 선언의 encoding 속성 확인 (첫 200바이트만)
  const head = buf.subarray(0, Math.min(200, buf.length)).toString("ascii");
  const m = /encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  const enc = (m?.[1] ?? "utf-8").toLowerCase();
  if (enc === "utf-8" || enc === "utf8") return buf.toString("utf8");
  return iconv.decode(buf, enc);
}
