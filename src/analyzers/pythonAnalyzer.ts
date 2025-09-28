import { Vulnerability } from '../types';

export class PythonAnalyzer {
    analyze(code: string): Vulnerability[] {
        const vulnerabilities: Vulnerability[] = [];

        this.checkInsecureDeserialization(code, vulnerabilities);
        this.checkCommandInjection(code, vulnerabilities);
        this.checkSQLInjection(code, vulnerabilities);
        this.checkHardcodedSecrets(code, vulnerabilities);
        this.checkInsecureRandom(code, vulnerabilities);
        this.checkPathTraversal(code, vulnerabilities);
        this.checkXMLVulnerabilities(code, vulnerabilities);
        this.checkWeakCrypto(code, vulnerabilities);
        this.checkSSRF(code, vulnerabilities);

        return vulnerabilities;
    }

    private checkInsecureDeserialization(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            { regex: /pickle\.loads?\s*\(/g, module: 'pickle' },
            { regex: /marshal\.loads?\s*\(/g, module: 'marshal' },
            { regex: /yaml\.load\s*\([^,)]*\)/g, module: 'yaml (without Loader=yaml.SafeLoader)' }
        ];

        patterns.forEach(({ regex, module }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'deserialization',
                    severity: 'critical',
                    line,
                    column: 0,
                    message: `Insecure deserialization using ${module}`,
                    suggestion: 'Use JSON or safe alternatives. For YAML, use yaml.safe_load()',
                    cwe: 'CWE-502',
                    confidence: 0.95
                });
            });
        });
    }

    private checkCommandInjection(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            { regex: /os\.system\s*\([^)]*[\+f{]/g, func: 'os.system' },
            { regex: /subprocess\.(call|run|Popen)\s*\([^)]*shell\s*=\s*True/g, func: 'subprocess with shell=True' },
            { regex: /eval\s*\([^)]*input/g, func: 'eval with user input' },
            { regex: /exec\s*\([^)]*input/g, func: 'exec with user input' }
        ];

        patterns.forEach(({ regex, func }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'command-injection',
                    severity: 'critical',
                    line,
                    column: 0,
                    message: `Potential command injection via ${func}`,
                    suggestion: 'Use subprocess with shell=False and pass arguments as list',
                    cwe: 'CWE-78',
                    confidence: 0.9
                });
            });
        });
    }

    private checkSQLInjection(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            /execute\s*\([^)]*%s|%d/g,
            /execute\s*\([^)]*\+/g,
            /execute\s*\([^)]*\.format\s*\(/g,
            /execute\s*\([^)]*f["']/g,
            /cursor\.execute\s*\([^)]*\+/g
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
                    message: 'Potential SQL injection - string concatenation in query',
                    suggestion: 'Use parameterized queries with placeholders (?, :name)',
                    cwe: 'CWE-89',
                    confidence: 0.85
                });
            });
        });
    }

    private checkHardcodedSecrets(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            { regex: /api[_-]?key\s*=\s*["'][^"']+["']/gi, type: 'API key' },
            { regex: /password\s*=\s*["'][^"']+["']/gi, type: 'Password' },
            { regex: /secret[_-]?key\s*=\s*["'][^"']+["']/gi, type: 'Secret key' },
            { regex: /token\s*=\s*["'][^"']+["']/gi, type: 'Token' },
            { regex: /aws[_-]?access[_-]?key/gi, type: 'AWS credentials' }
        ];

        patterns.forEach(({ regex, type }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                if (!this.isTestFile(code) && !this.isEnvironmentVariable(match[0])) {
                    vulnerabilities.push({
                        type: 'secret',
                        severity: 'critical',
                        line,
                        column: 0,
                        message: `Hardcoded ${type} detected`,
                        suggestion: 'Use environment variables: os.environ.get("KEY_NAME")',
                        cwe: 'CWE-798',
                        confidence: 0.9
                    });
                }
            });
        });
    }

    private checkInsecureRandom(code: string, vulnerabilities: Vulnerability[]) {
        const pattern = /random\.(random|randint|choice)/g;
        const matches = [...code.matchAll(pattern)];

        matches.forEach(match => {
            if (this.isSecurityContext(code, match.index!)) {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'crypto',
                    severity: 'medium',
                    line,
                    column: 0,
                    message: 'Use of non-cryptographic random for security purposes',
                    suggestion: 'Use secrets module for cryptographic randomness',
                    cwe: 'CWE-330',
                    confidence: 0.75
                });
            }
        });
    }

    private checkPathTraversal(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            /open\s*\([^)]*request\.(GET|POST|args)/g,
            /os\.path\.join\s*\([^)]*request\./g,
            /pathlib\.Path\s*\([^)]*request\./g
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
                    suggestion: 'Validate paths with os.path.abspath and check against allowed directories',
                    cwe: 'CWE-22',
                    confidence: 0.85
                });
            });
        });
    }

    private checkXMLVulnerabilities(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            { regex: /xml\.etree\.ElementTree\.parse/g, issue: 'XXE' },
            { regex: /xml\.dom\.minidom\.parse/g, issue: 'XXE' },
            { regex: /lxml\.etree\.parse\s*\([^)]*\)/g, issue: 'XXE' }
        ];

        patterns.forEach(({ regex, issue }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'xxe',
                    severity: 'high',
                    line,
                    column: 0,
                    message: `Potential ${issue} vulnerability in XML parsing`,
                    suggestion: 'Use defusedxml library or disable external entity processing',
                    cwe: 'CWE-611',
                    confidence: 0.8
                });
            });
        });
    }

    private checkWeakCrypto(code: string, vulnerabilities: Vulnerability[]) {
        const weakAlgorithms = [
            { regex: /hashlib\.md5/g, algo: 'MD5' },
            { regex: /hashlib\.sha1/g, algo: 'SHA1' },
            { regex: /DES/g, algo: 'DES' },
            { regex: /RC4/g, algo: 'RC4' }
        ];

        weakAlgorithms.forEach(({ regex, algo }) => {
            const matches = [...code.matchAll(regex)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'crypto',
                    severity: 'high',
                    line,
                    column: 0,
                    message: `Weak cryptographic algorithm: ${algo}`,
                    suggestion: 'Use SHA-256, SHA-384, SHA-512, or bcrypt for password hashing',
                    cwe: 'CWE-327',
                    confidence: 0.95
                });
            });
        });
    }

    private checkSSRF(code: string, vulnerabilities: Vulnerability[]) {
        const patterns = [
            /requests\.(get|post|put|delete)\s*\([^)]*request\./g,
            /urllib\.request\.urlopen\s*\([^)]*request\./g,
            /httpx\.(get|post|put|delete)\s*\([^)]*request\./g
        ];

        patterns.forEach(pattern => {
            const matches = [...code.matchAll(pattern)];
            matches.forEach(match => {
                const line = this.getLineNumber(code, match.index!);
                vulnerabilities.push({
                    type: 'ssrf',
                    severity: 'high',
                    line,
                    column: 0,
                    message: 'Potential Server-Side Request Forgery (SSRF)',
                    suggestion: 'Validate and whitelist URLs, use URL parsing to check domains',
                    cwe: 'CWE-918',
                    confidence: 0.8
                });
            });
        });
    }

    private isTestFile(code: string): boolean {
        return code.includes('import pytest') ||
               code.includes('import unittest') ||
               code.includes('def test_');
    }

    private isEnvironmentVariable(match: string): boolean {
        return match.includes('os.environ') ||
               match.includes('getenv') ||
               match.includes('ENV[');
    }

    private isSecurityContext(code: string, index: number): boolean {
        const context = code.substring(Math.max(0, index - 150), Math.min(code.length, index + 150));
        const securityKeywords = ['token', 'password', 'secret', 'key', 'auth', 'crypt', 'hash', 'salt', 'session', 'nonce'];
        return securityKeywords.some(keyword => context.toLowerCase().includes(keyword));
    }

    private getLineNumber(code: string, index: number): number {
        return code.substring(0, index).split('\n').length;
    }
}