# Code Guardian Extension Overview

## High-Level Workflow
- Activation runs from `activate` in `code-guardian-extension/src/extension.ts`, wiring configuration, AI provider selection, diagnostics, and view providers.
- `CodeAnalyzer` orchestrates a three-stage scan — static heuristics, AI analysis, and limited runtime checks — then deduplicates and prioritizes findings before surfacing them.
- Results populate VS Code diagnostics, tree views, and a webview panel; remediation flows through quick fixes, AI-generated fixes, or suppression comments.

## Core Components
- **AI Service** (`src/ai/aiService.ts`): abstracts AI providers with a common interface, supporting OpenAI (GPT-based), Anthropic (Claude), and a local mock. Handles prompt construction elsewhere and retries/updates via `updateConfig`.
- **Code Analyzer** (`src/analyzers/codeAnalyzer.ts`): accepts `code`, `languageId`, `filePath` and runs
  1. Static patterns (`JavaScriptAnalyzer`) for JS/TS, returning `Vulnerability[]` with severity, CWE, and fix hints.
  2. AI analysis by building a security prompt embedding language/file metadata and expecting a JSON array response it parses resiliently.
  3. Runtime-esque scanning that currently evaluates regex heuristics for dangerous APIs (eval, innerHTML, exec, etc.) in JS/TS code.
  Outputs go through deduplication based on location/type and sort by severity/confidence.
- **JavaScript Analyzer** (`src/analyzers/javascriptAnalyzer.ts`): houses regex-driven checks for insecure randomness, hardcoded secrets, insecure HTTP, prototype pollution, path traversal, weak crypto, XSS, and SQL injection. Provides canned remediations and CWEs.
- **Diagnostics & Fixes** (`src/utils/diagnosticProvider.ts`, `src/utils/fixProvider.ts`): converts vulnerabilities into VS Code diagnostics, adds related info with suggestions, offers quick fixes based on pattern matches, kicks off AI fix generation, and injects suppression comments tailored to language (JS/Python today).
- **Views & Panel** (`src/views/vulnerabilityTreeProvider.ts`, `src/webviews/vulnerabilityPanel.ts`): maintain tree views for vulnerabilities and fix suggestions, plus a richer webview dashboard with severity summaries, file grouping, and apply/open/ignore commands.
- **Commands & Events** (`package.json`, `extension.ts`): commands for scanning files/workspace, opening the panel, applying fixes, and generating AI fixes. Auto-scan fires on save when enabled. Workspace scan currently targets `**/*.{js,ts,jsx,tsx}` and skips `node_modules`.

## Data Flow Summary
1. User triggers or auto-trigger calls `scanDocument` → ensures supported language (placeholder `isSupported`).
2. `CodeAnalyzer.analyze` composes vulnerabilities from static/AI/runtime sources.
3. Diagnostics updated; tree providers and webview reflect new results.
4. Remediation occurs through quick fixes, AI fix workflow (`codeGuardian.generateAIFix`), or manual edits.

## Current Limitations
- Static and runtime analyzers only exist for JavaScript/TypeScript; other languages return no findings outside AI responses.
- `isSupported` is effectively disabled, but activation events and workspace scanning restrict operation to JS/TS.
- Prompting expects the AI to respond with a JSON array; malformed responses silently drop.
- Runtime sandbox is a regex scan, not true execution, and lacks hooks for non-JS ecosystems.
- Configuration enum omits `anthropic` despite implemented provider; AI settings are global, not per-language.
- Quick-fix suppression comments cover only JS/TS/Python styles.

# Roadmap: Making Code Guardian Language Agnostic

## Goals
- Support vulnerability detection in any file type opened in the editor.
- Provide language-aware static checks when available, with graceful fallbacks to AI/general heuristics otherwise.
- Preserve existing UX (diagnostics, panel, quick fixes) while extending configuration and tests.

## Phased Plan
1. **Baseline Enablement**
   - Implement `isSupported` to default to true for text documents, with optional user-configurable allow/deny lists.
   - Expand activation events (`"*"` or `onStartupFinished`) and adjust `scanWorkspace` to enumerate all files respecting ignore globs.
   - Update configuration schema to let users cap analysis to specific languages or file patterns for performance.

2. **Analyzer Abstraction Layer**
   - Introduce a `LanguageAnalyzer` interface with `supports(languageId: string)` and `analyze(code, metadata)`.
   - Refactor `CodeAnalyzer` to maintain a registry of analyzers keyed by language family and a default heuristic analyzer for unknown languages.
   - Extract JavaScript logic into a `JavaScriptAnalyzer` implementation conforming to the new contract.

3. **Static Analysis Coverage Expansion**
   - Prioritize additional analyzers (e.g., Python, Ruby, PHP, Java, C#) using regex heuristics, AST parsers, or by integrating popular lint/SAST tools when available.
   - Provide shared detectors for language-agnostic issues (hardcoded secrets, insecure URLs, TODO/FIXME w/ secrets) operating on plain text fallback.
   - Allow community extensions by loading analyzer modules dynamically from configuration or workspace packages.

4. **AI Prompting & Parsing Generalization**
   - Create a templating system for prompts that injects language-aware guidance, coding conventions, or framework hints.
   - Enhance response parsing with schema validation and recovery for non-JSON replies; log structured errors for telemetry.
   - Add per-language prompt metadata (e.g., CWE taxonomies, framework context) optionally fetched from analyzer results.

5. **Runtime / Dynamic Checks Strategy**
   - Replace `runJavaScriptInSandbox` with a pluggable "runtime check" interface; supply implementations where lightweight execution is safe (JS via VM, Python via sandbox service, etc.).
   - For languages without safe execution, rely on extended static heuristics or optional external scanners.

6. **Fix Generation Improvements**
   - Expand quick-fix heuristics per language and update suppression comment logic to honor language-specific syntax (block vs line comments).
   - Ensure `FixProvider` selects the right comment style via analyzer metadata and supports AI fix application over arbitrary ranges, not line-only assumptions.

7. **Configuration & UX Updates**
   - Add settings for enabling/disabling languages, choosing analyzers, setting severity thresholds per language, and toggling AI usage.
   - Update tree views and webview to surface language information, analyzer sources, and confidence levels so users understand coverage.
   - Document performance considerations (e.g., batching AI calls, file size limits) for large heterogeneous workspaces.

8. **Quality & Tooling**
   - Introduce automated tests for the analyzer registry, language detection, and AI prompt builders; add fixture-based tests per language analyzer.
   - Provide smoke tests ensuring diagnostics and quick fixes work with multiple language IDs.
   - Refresh documentation (README, wiki) to describe the language-agnostic architecture and extension points.

9. **Progressive Rollout**
   - Ship initial generic support (AI + generic detectors) with opt-in beta flag.
   - Iterate by adding high-demand language analyzers, gathering telemetry/feedback, and hardening parsing and fix application paths across languages.
