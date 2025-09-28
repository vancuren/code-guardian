export interface Vulnerability {
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    line: number;
    column: number;
    message: string;
    suggestion?: string;
    cwe?: string;
    confidence: number;
}

export interface AnalysisResult {
    file: string;
    language: string;
    vulnerabilities: Vulnerability[];
    timestamp: number;
}

export interface FixSuggestion {
    vulnerability: Vulnerability;
    originalCode: string;
    fixedCode: string;
    explanation: string;
}