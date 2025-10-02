import * as vscode from 'vscode';
import { Vulnerability } from '../types';

export class DiagnosticProvider {
    constructor(private diagnosticCollection: vscode.DiagnosticCollection) {}

    updateDiagnostics(document: vscode.TextDocument, vulnerabilities: Vulnerability[]) {
        const diagnostics: vscode.Diagnostic[] = [];

        vulnerabilities.forEach(vuln => {
            const range = new vscode.Range(
                new vscode.Position(Math.max(0, vuln.line - 1), vuln.column),
                new vscode.Position(vuln.line - 1, Number.MAX_VALUE)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                vuln.message,
                this.getSeverity(vuln.severity)
            );

            diagnostic.code = vuln.cwe || vuln.type;
            diagnostic.source = 'Pentari';

            if (vuln.suggestion) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(document.uri, range),
                        `Suggestion: ${vuln.suggestion}`
                    )
                ];
            }

            diagnostics.push(diagnostic);
        });

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private getSeverity(severity: string): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'critical':
            case 'high':
                return vscode.DiagnosticSeverity.Error;
            case 'medium':
                return vscode.DiagnosticSeverity.Warning;
            case 'low':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }

    clear(document: vscode.TextDocument) {
        this.diagnosticCollection.delete(document.uri);
    }

    clearAll() {
        this.diagnosticCollection.clear();
    }
}