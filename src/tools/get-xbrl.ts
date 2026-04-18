/**
 * get_xbrl — 재무제표 XBRL 원본 또는 마크다운 변환
 *
 * format:
 *   - "raw" (기본): ZIP 을 해제해 파일시스템에 저장.
 *   - "markdown" (v0.8.0+): whitelist 기반 BS/IS/CF 3개 표.
 *   - "markdown_full" (v0.9.0+): presentation linkbase 기반 전체 계정 + 계산 검증.
 *     택소노미에서 직접 추출하므로 업종별(금융/보험 등) 고유 계정에도 자동 대응.
 *
 * 참고: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019019
 */

import { z } from "zod";
import { homedir } from "node:os";
import { defineTool } from "./_helpers.js";
import {
  parseXbrlZip,
  buildStatements,
  buildStatementsFull,
  renderMarkdown,
} from "../lib/xbrl-parser.js";
import { safeUnzipToDisk, defaultXbrlOutDir } from "../utils/safe-zip.js";

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
    .enum(["raw", "markdown", "markdown_full"])
    .default("raw")
    .describe(
      'raw: ZIP 파일시스템 저장. markdown: whitelist 50태그 마크다운. markdown_full(v0.9.0+): taxonomy 전체 계정 + 계산 검증.',
    ),
  fs_div: z
    .enum(["consolidated", "separate"])
    .default("consolidated")
    .describe('markdown/markdown_full 전용: 연결/별도 기준'),
  sections: z
    .array(z.enum(["BS", "IS", "CF"]))
    .default(["BS", "IS", "CF"])
    .describe('markdown/markdown_full 전용: 생성할 재무제표 종류'),
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
    "raw=원본 ZIP 파일시스템 해제, " +
    "markdown=whitelist 50태그 3년 3열 (~8KB), " +
    "markdown_full=taxonomy 전체 계정 + 계산 검증 (업종별 자동 대응, ~30-60KB).",
  input: Input,
  handler: async (ctx, args) => {
    const reprt_code = REPORT_CODE[args.report];
    const buf = await ctx.client.getZip("fnlttXbrl.xml", {
      rcept_no: args.rcept_no,
      reprt_code,
    });

    if (args.format === "markdown" || args.format === "markdown_full") {
      const full = args.format === "markdown_full";
      const data = await parseXbrlZip(buf, { loadTaxonomy: full });
      const st = full
        ? buildStatementsFull(data, { fs_div: args.fs_div, sections: args.sections })
        : buildStatements(data, { fs_div: args.fs_div, sections: args.sections });
      const md = renderMarkdown(st);
      return {
        rcept_no: args.rcept_no,
        report: args.report,
        format: args.format,
        fs_div: args.fs_div,
        entity_id: data.entityId,
        periods: st.periods,
        statements: st.statements,
        validations: st.validations,
        markdown: md,
        meta: {
          total_facts: data.facts.length,
          total_contexts: data.contexts.size,
          labels_loaded: data.labels.size,
          presentation_roles: data.taxonomy?.presentations.length,
          calculation_roles: data.taxonomy?.calculations.length,
        },
      };
    }

    // raw 모드 — 기존 동작 (zip slip · zip bomb 방어 포함)
    const outDir =
      args.out_dir ?? defaultXbrlOutDir(homedir(), args.rcept_no, reprt_code);
    const files = await safeUnzipToDisk(buf, outDir);
    return {
      rcept_no: args.rcept_no,
      report: args.report,
      format: "raw" as const,
      dir: outDir,
      files,
    };
  },
});
