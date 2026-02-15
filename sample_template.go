package main

import "strings"

func sampleTemplateMarkdown() (string, error) {
	comments := []Comment{
		{
			File:      "src/api/handler.ts",
			StartLine: intPtr(41),
			EndLine:   intPtr(43),
			Side:      "right",
			Body:      "Please handle non-2xx responses explicitly and include useful error context.",
		},
		{
			File:      "src/api/handler.ts",
			StartLine: intPtr(40),
			EndLine:   intPtr(40),
			Side:      "left",
			Body:      "Was removing the previous behavior here intentional?",
		},
		{
			File:      "src/utils/parse.ts",
			StartLine: intPtr(11),
			EndLine:   intPtr(12),
			Side:      "right",
			Body:      "Good cleanup. Can we add a unit test that covers whitespace-only tokens?",
		},
		{
			File: "src/utils/parse.ts",
			Body: "There is similar parsing logic in src/core/parser.ts; consider consolidating to avoid drift.",
		},
	}

	globalComment := "Solid progress overall. Please address the inline comments and call out anything deferred."

	return formatMarkdown(globalComment, comments, sampleTemplateDiff())
}

func sampleTemplateDiff() string {
	return strings.TrimSpace(`diff --git a/src/api/handler.ts b/src/api/handler.ts
index 1111111..2222222 100644
--- a/src/api/handler.ts
+++ b/src/api/handler.ts
@@ -40,3 +40,5 @@ export async function handle(url: string) {
-  const result = await fetch(url);
+  const result = await fetch(url);
+  if (!result.ok) {
+    throw new Error("request failed");
+  }
   return result;
 }

diff --git a/src/utils/parse.ts b/src/utils/parse.ts
index abcdef0..1234567 100644
--- a/src/utils/parse.ts
+++ b/src/utils/parse.ts
@@ -10,2 +10,4 @@ export function parse(input: string) {
   const tokens = input.split(",");
+  const trimmed = tokens.map((t) => t.trim());
+  return trimmed;
-  return tokens;
 }
`) + "\n"
}

func intPtr(v int) *int {
	return &v
}
