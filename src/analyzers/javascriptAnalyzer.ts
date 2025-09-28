import { Vulnerability } from '../types';

export class JavaScriptAnalyzer {
    analyze(code: string): Vulnerability[] {
        const vulnerabilities: Vulnerability[] = [];

        this.checkInsecureRandomness(code, vulnerabilities);
        this.checkHardcodedSecrets(code, vulnerabilities);
        this.checkInsecureRequests(code, vulnerabilities);
        this.checkPrototypePollution(code, vulnerabilities);
        this.checkPathTraversal(code, vulnerabilities);
        this.checkInsecureCrypto(code, vulnerabilities);
        this.checkXSS(code, vulnerabilities);
        this.checkSQLInjection(code, vulnerabilities);

        return vulnerabilities;
    }

    private checkInsecureRandomness(code: string, vulnerabilities: Vulnerability[]) {
        const pattern = /Math\.random\(\)/g;
        const matches = [...code.matchAll(pattern)];

        matches.forEach(match => {
            if (this.isSecurityContext(code, match.index!)) {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'crypto',
                    severity: 'medium',
                    line,
                    column: 0,
                    message: 'Math.random() is not cryptographically secure',
                    suggestion: 'Use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive operations',
                    cwe: 'CWE-330',
                    confidence: 0.8
                });
            }
        });
    }

    private checkHardcodedSecrets(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            { regex: /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, type: 'API key' },
            { regex: /password\s*[:=]\s*["'][^"']+["']/gi, type: 'Password' },
            { regex: /secret\s*[:=]\s*["'][^"']+["']/gi, type: 'Secret' },
            { regex: /token\s*[:=]\s*["'][^"']+["']/gi, type: 'Token' },
            { regex: /private[_-]?key\s*[:=]\s*["'][^"']+["']/gi, type: 'Private key' }
        ];

        patterns.forEach(({ regex, type }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'secret',
                    severity: 'critical',
                    line,
                    column: 0,
                    message: `Hardcoded ${type} detected`,
                    suggestion: 'Use environment variables or secure secret management',
                    cwe: 'CWE-798',
                    confidence: 0.9
                });
            });
        });
    }

    private checkInsecureRequests(code: string, vulnerabilities: Vulnerability[]) {
        const httpPattern = /https?:\/\/|fetch\s*\(\s*["']http:/gi;
        const matches = [...code.matchAll(httpPattern)];

        matches.forEach(match => {
            if (match[0].includes('http:')) {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'network',
                    severity: 'medium',
                    line,
                    column: 0,
                    message: 'Insecure HTTP request detected',
                    suggestion: 'Use HTTPS for all external communications',
                    cwe: 'CWE-319',
                    confidence: 0.85
                });
            }
        });
    }

    private checkPrototypePollution(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            /Object\.assign\s*\(\s*\{\}\s*,.*req\.(body|query|params)/g,
            /\[.*req\.(body|query|params).*\]\s*=/g,
            /__proto__/g
        ];

        patterns.forEach(pattern => {
            const matches = [...code.matchAll(pattern)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'injection',
                    severity: 'high',
                    line,
                    column: 0,
                    message: 'Potential prototype pollution vulnerability',
                    suggestion: 'Validate and sanitize object keys, avoid direct property assignment from user input',
                    cwe: 'CWE-1321',
                    confidence: 0.75
                });
            });
        });
    }

    private checkPathTraversal(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            /fs\.(readFile|readFileSync|writeFile|writeFileSync)\s*\([^)]*req\.(body|query|params)/g,
            /path\.join\s*\([^)]*req\.(body|query|params)/g
        ];

        patterns.forEach(pattern => {
            const matches = [...code.matchAll(pattern)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'path-traversal',
                    severity: 'high',
                    line,
                    column: 0,
                    message: 'Potential path traversal vulnerability',
                    suggestion: 'Validate and sanitize file paths, use path.resolve() and check against allowed directories',
                    cwe: 'CWE-22',
                    confidence: 0.85
                });
            });
        });
    }

    private checkInsecureCrypto(code: string, vulnerabilities: Vulnerability[]) {
        const weakAlgorithms = ['md5', 'sha1', 'des', 'rc4'];

        weakAlgorithms.forEach(algo => {
            const pattern = new RegExp(`createHash\\s*\\(\\s*["']${algo}["']`, 'gi');
            const matches = [...code.matchAll(pattern)];

            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'crypto',
                    severity: 'high',
                    line,
                    column: 0,
                    message: `Weak cryptographic algorithm: ${algo.toUpperCase()}`,
                    suggestion: 'Use SHA-256, SHA-384, or SHA-512 for hashing',
                    cwe: 'CWE-327',
                    confidence: 0.95
                });
            });
        });
    }

    private checkXSS(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            { regex: /res\.send\s*\([^)]*req\.(body|query|params)/g, type: 'reflected' },
            { regex: /res\.write\s*\([^)]*req\.(body|query|params)/g, type: 'reflected' },
            { regex: /\$\(['"].*['"]\)\.html\s*\(/g, type: 'DOM-based' }
        ];

        patterns.forEach(({ regex, type }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'xss',
                    severity: 'high',
                    line,
                    column: 0,
                    message: `Potential ${type} XSS vulnerability`,
                    suggestion: 'Sanitize user input before rendering, use template engines with auto-escaping',
                    cwe: 'CWE-79',
                    confidence: 0.8
                });
            });
        });
    }

    private checkSQLInjection(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            /query\s*\(\s*['"`].*\$\{/g,
            /query\s*\(\s*['"`].*\+/g,
            /execute\s*\(\s*['"`].*\$\{/g
        ];

        patterns.forEach(pattern => {
            const matches = [...code.matchAll(pattern)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'sql-injection',
                    severity: 'critical',
                    line,
                    column: 0,
                    message: 'Potential SQL injection vulnerability',
                    suggestion: 'Use parameterized queries or prepared statements',
                    cwe: 'CWE-89',
                    confidence: 0.9
                });
            });
        });
    }

    private isSecurityContext(code: string, index: number): boolean {
        const context = code.substring(Math.max(0, index - 100), Math.min(code.length, index + 100));
        const securityKeywords = ['token', 'password', 'secret', 'key', 'auth', 'crypt', 'hash', 'salt'];
        return securityKeywords.some(keyword => context.toLowerCase().includes(keyword));
    }

    private getLineNumber(code: string, index: number): number {
        return code.substring(0, index).split('\n').length;
    }
}