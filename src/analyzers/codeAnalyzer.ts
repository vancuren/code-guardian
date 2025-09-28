import { AIService } from '../ai/aiService';
import { JavaScriptAnalyzer } from './javascriptAnalyzer';
import { Vulnerability } from '../types';

export class CodeAnalyzer {
    private jsAnalyzer: JavaScriptAnalyzer;

    constructor(private aiService: AIService) {
        this.jsAnalyzer = new JavaScriptAnalyzer();
    }

    async analyze(code: string, language: string, filePath: string): Promise<Vulnerability[]> {
        const vulnerabilities: Vulnerability[] = [];

        const staticAnalysis = await this.performStaticAnalysis(code, language);
        vulnerabilities.push(...staticAnalysis);

        const aiAnalysis = await this.performAIAnalysis(code, language, filePath);
        vulnerabilities.push(...aiAnalysis);

        const runtimeAnalysis = await this.performSandboxedExecution(code, language);
        vulnerabilities.push(...runtimeAnalysis);

        return this.deduplicateAndPrioritize(vulnerabilities);
    }

    private async performStaticAnalysis(code: string, language: string): Promise<Vulnerability[]> {
        switch (language) {
            case 'javascript':
            case 'typescript':
                return this.jsAnalyzer.analyze(code);
            default:
                return [];
        }
    }

    private async performAIAnalysis(code: string, language: string, filePath: string): Promise<Vulnerability[]> {
        try {
            const prompt = this.buildSecurityPrompt(code, language, filePath);
            const response = await this.aiService.analyzeCode(prompt);
            return this.parseAIResponse(response);
        } catch (error) {
            console.error('AI analysis failed:', error);
            return [];
        }
    }

    private buildSecurityPrompt(code: string, language: string, filePath: string): string {
        return `Analyze the following ${language} code for security vulnerabilities, performance issues, and best practice violations.

File: ${filePath}

Code:
\`\`\`${language}
${code}
\`\`\`

Please identify:
1. Security vulnerabilities (injection, XSS, authentication issues, etc.)
2. Performance problems (memory leaks, inefficient algorithms, etc.)
3. Code quality issues (anti-patterns, maintainability concerns)
4. Dependency vulnerabilities

For each issue found, provide:
- Issue type
- Severity (critical/high/medium/low)
- Line number
- Description
- Suggested fix with code example

Format as JSON array with structure:
{
  "type": "vulnerability_type",
  "severity": "high",
  "line": 10,
  "description": "detailed description",
  "fix": "suggested fix code",
  "cwe": "CWE-XX"
}`;
    }

    private parseAIResponse(response: string): Vulnerability[] {
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                return [];
            }

            const issues = JSON.parse(jsonMatch[0]);
            return issues.map((issue: any) => ({
                type: issue.type || 'unknown',
                severity: issue.severity || 'medium',
                line: issue.line || 0,
                column: issue.column || 0,
                message: issue.description || 'Unknown vulnerability',
                suggestion: issue.fix || '',
                cwe: issue.cwe || '',
                confidence: 0.8
            }));
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            return [];
        }
    }

    private async performSandboxedExecution(code: string, language: string): Promise<Vulnerability[]> {
        const vulnerabilities: Vulnerability[] = [];

        try {
            if (language === 'javascript' || language === 'typescript') {
                const issues = await this.runJavaScriptInSandbox(code);
                vulnerabilities.push(...issues);
            }
        } catch (error) {
            console.error('Sandboxed execution failed:', error);
        }

        return vulnerabilities;
    }

    private async runJavaScriptInSandbox(code: string): Promise<Vulnerability[]> {
        const vulnerabilities: Vulnerability[] = [];

        const dangerousPatterns = [
            { pattern: /eval\s*\(/, message: 'Use of eval() detected - potential code injection', cwe: 'CWE-95' },
            { pattern: /Function\s*\(/, message: 'Use of Function constructor - potential code injection', cwe: 'CWE-95' },
            { pattern: /innerHTML\s*=/, message: 'Direct innerHTML assignment - potential XSS', cwe: 'CWE-79' },
            { pattern: /document\.write/, message: 'Use of document.write - potential XSS', cwe: 'CWE-79' },
            { pattern: /exec\s*\(/, message: 'Use of exec() - potential command injection', cwe: 'CWE-78' },
            { pattern: /child_process/, message: 'Use of child_process - potential command injection', cwe: 'CWE-78' }
        ];

        dangerousPatterns.forEach(({ pattern, message, cwe }) => {
            const matches = [...code.matchAll(new RegExp(pattern, 'g'))];
            matches.forEach(match => {
                const lines = code.substring(0, match.index!).split('\n');
                vulnerabilities.push({
                    type: 'security',
                    severity: 'high',
                    line: lines.length,
                    column: lines[lines.length - 1].length,
                    message,
                    cwe,
                    confidence: 0.9,
                    suggestion: this.getSuggestionForPattern(pattern.toString())
                });
            });
        });

        return vulnerabilities;
    }


    private getSuggestionForPattern(pattern: string): string {
        const suggestions: { [key: string]: string } = {
            'eval': 'Use JSON.parse() for JSON data or safer alternatives for code execution',
            'innerHTML': 'Use textContent or createElement with proper sanitization',
            'exec': 'Use parameterized commands or validate/sanitize input thoroughly',
            'pickle': 'Use JSON or other safe serialization formats',
            'sql': 'Use parameterized queries or ORM with proper escaping'
        };

        for (const [key, suggestion] of Object.entries(suggestions)) {
            if (pattern.toLowerCase().includes(key)) {
                return suggestion;
            }
        }

        return 'Review and sanitize user input before using in sensitive operations';
    }

    private deduplicateAndPrioritize(vulnerabilities: Vulnerability[]): Vulnerability[] {
        const unique = new Map<string, Vulnerability>();

        vulnerabilities.forEach(vuln => {
            const key = `${vuln.line}-${vuln.column}-${vuln.type}`;
            const existing = unique.get(key);

            if (!existing || vuln.confidence > existing.confidence) {
                unique.set(key, vuln);
            }
        });

        return Array.from(unique.values()).sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 4;
            const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 4;

            if (aSev !== bSev) return aSev - bSev;
            return b.confidence - a.confidence;
        });
    }

    async suggestFix(vulnerability: Vulnerability, code: string, language: string): Promise<string> {
        const prompt = `Given this ${language} code with a ${vulnerability.type} vulnerability:

${code}

The vulnerability is: ${vulnerability.message}
Location: Line ${vulnerability.line}

Provide a fixed version of the code that addresses this security issue while maintaining functionality.
Return only the fixed code without explanation.`;

        try {
            return await this.aiService.generateFix(prompt);
        } catch (error) {
            console.error('Failed to generate fix:', error);
            return vulnerability.suggestion || '';
        }
    }
}