import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ADR-007: project-progress consumers must NOT read cross-module tables
// directly. All such reads go through lib/read-models/project-progress.ts.
// This rule flags `.from('<cross-module-table>')` literals in the files
// where the rule applies — see ADR-007 for the full review checklist.
const CROSS_MODULE_TABLES = [
  "sales_order",
  "sales_order_line",
  "dispatch",
  "dispatch_line",
  "invoice",
  "invoice_line",
  "stock_reservation",
];
const noCrossModuleReadsSelector = CROSS_MODULE_TABLES
  .map((t) => `CallExpression[callee.property.name='from'][arguments.0.value='${t}']`)
  .join(", ");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Scannable project-header surfaces — see ADR-007.
    files: [
      "components/projects/scannable-progress-header.tsx",
      "components/projects/*-progress-*.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: noCrossModuleReadsSelector,
          message:
            "Project-progress consumers must read via lib/read-models/project-progress.ts. " +
            "See docs/adr/007-project-progress-read-model.md.",
        },
      ],
    },
  },
]);

export default eslintConfig;
