/**
 * get_xbrl — 재무제표 XBRL 원본
 *
 * 설계 원칙: 파싱하지 않고 ZIP 을 해제해 파일시스템에 저장, 경로만 반환.
 * Claude Desktop 이 해당 경로를 파일 첨부로 올려 임의 집계 가능 —
 * 기존 Python 래퍼(dart-fss) 가 놓친 LLM 시너지 포인트.
 *
 * 참고: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019019
 */

import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import yauzl from "yauzl";
import { defineTool } from "./_helpers.js";

const REPORT_CODE = {
  q1: "11013",
  half: "11012",
  q3: "11014",
  annual: "11011",
} as const;

const Input = z.object({
  rcept_no: z.string().regex(/^\d{14}$/).describe("접수번호 14자리"),
  report: z
    .enum(["q1", "half", "q3", "annual"])
    .default("annual")
    .describe("보고서 종류"),
  out_dir: z
    .string()
    .optional()
    .describe("저장 디렉터리 (미지정 시 ~/.korean-dart-mcp/xbrl/{rcept_no}_{report}/)"),
});

export const getXbrlTool = defineTool({
  name: "get_xbrl",
  description:
    "재무제표 XBRL 원본 ZIP 을 내려받아 파일시스템에 해제합니다. " +
    "파싱하지 않고 원본 그대로 저장 — Claude 가 해당 파일을 직접 업로드해 임의 집계할 수 있게. " +
    "반환: 저장 디렉터리 경로와 파일 목록.",
  input: Input,
  handler: async (ctx, args) => {
    const reprt_code = REPORT_CODE[args.report];
    const outDir =
      args.out_dir ??
      join(
        homedir(),
        ".korean-dart-mcp",
        "xbrl",
        `${args.rcept_no}_${reprt_code}`,
      );
    mkdirSync(outDir, { recursive: true });

    const buf = await ctx.client.getZip("fnlttXbrl.xml", {
      rcept_no: args.rcept_no,
      reprt_code,
    });
    const files = await extractAndWrite(buf, outDir);
    return {
      rcept_no: args.rcept_no,
      report: args.report,
      dir: outDir,
      files,
    };
  },
});

function extractAndWrite(
  buf: Buffer,
  outDir: string,
): Promise<Array<{ name: string; size: number; path: string }>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip open failed"));
      const out: Array<{ name: string; size: number; path: string }> = [];
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
            const data = Buffer.concat(chunks);
            const path = join(outDir, entry.fileName);
            writeFileSync(path, data);
            out.push({ name: entry.fileName, size: data.length, path });
            zip.readEntry();
          });
          stream.on("error", reject);
        });
      });
      zip.on("end", () => resolve(out));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}
