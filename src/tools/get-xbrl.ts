/**
 * get_xbrl — 재무제표 XBRL 원본 또는 마크다운 변환
 *
 * format:
 *   - "raw" (기본): ZIP 을 해제해 파일시스템에 저장, 경로와 파일 목록 반환.
 *     Claude Desktop 이 파일을 직접 업로드해 임의 집계 가능 (dart-fss 가 놓친 플로우).
 *   - "markdown" (v0.8.0+): ZIP 을 메모리에서 파싱해 BS/IS/CF 3개 표를 마크다운으로 반환.
 *     whitelist 기반 (약 50 태그). 본격 taxonomy/계층 파싱은 v0.9.0 예정.
 *
 * 참고: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019019
 */

import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import yauzl from "yauzl";
import { defineTool } from "./_helpers.js";
import { parseXbrlZip, buildStatements, renderMarkdown } from "../lib/xbrl-parser.js";

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
  format: z
    .enum(["raw", "markdown"])
    .default("raw")
    .describe(
      'raw: ZIP 파일시스템 저장(기존). markdown: BS/IS/CF 3개 표 마크다운 변환(v0.8.0+).',
    ),
  fs_div: z
    .enum(["consolidated", "separate"])
    .default("consolidated")
    .describe('format="markdown" 전용: 연결(consolidated)/별도(separate) 기준'),
  sections: z
    .array(z.enum(["BS", "IS", "CF"]))
    .default(["BS", "IS", "CF"])
    .describe('format="markdown" 전용: 생성할 재무제표 종류'),
  out_dir: z
    .string()
    .optional()
    .describe(
      'format="raw" 전용: 저장 디렉터리 (미지정 시 ~/.korean-dart-mcp/xbrl/{rcept_no}_{report}/)',
    ),
});

export const getXbrlTool = defineTool({
  name: "get_xbrl",
  description:
    "재무제표 XBRL 조회 — format 선택: " +
    'raw=원본 ZIP 을 파일시스템에 해제(Claude 가 파일 첨부로 직접 처리), ' +
    'markdown=메모리 파싱해 BS/IS/CF 3개 표를 당기/전기/전전기 3열로 마크다운 변환. ' +
    "연결/별도 선택 가능. whitelist 기반 주요 50태그 (본격 파싱은 v0.9.0).",
  input: Input,
  handler: async (ctx, args) => {
    const reprt_code = REPORT_CODE[args.report];
    const buf = await ctx.client.getZip("fnlttXbrl.xml", {
      rcept_no: args.rcept_no,
      reprt_code,
    });

    if (args.format === "markdown") {
      const data = await parseXbrlZip(buf);
      const st = buildStatements(data, {
        fs_div: args.fs_div,
        sections: args.sections,
      });
      const md = renderMarkdown(st);
      return {
        rcept_no: args.rcept_no,
        report: args.report,
        format: "markdown" as const,
        fs_div: args.fs_div,
        entity_id: data.entityId,
        periods: st.periods,
        statements: st.statements,
        markdown: md,
        meta: {
          total_facts: data.facts.length,
          total_contexts: data.contexts.size,
          labels_loaded: data.labels.size,
        },
      };
    }

    // raw 모드 — 기존 동작
    const outDir =
      args.out_dir ??
      join(
        homedir(),
        ".korean-dart-mcp",
        "xbrl",
        `${args.rcept_no}_${reprt_code}`,
      );
    mkdirSync(outDir, { recursive: true });
    const files = await extractAndWrite(buf, outDir);
    return {
      rcept_no: args.rcept_no,
      report: args.report,
      format: "raw" as const,
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
