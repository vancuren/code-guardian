import * as vscode from 'vscode';

export class FixProvider implements vscode.CodeActionProvider {
    constructor() {}

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'Code Guardian') {
                continue;
            }

            const quickFix = this.createQuickFix(document, diagnostic);
            if (quickFix) {
                actions.push(quickFix);
            }

            const aiFixAction = this.createAIFixAction(document, diagnostic);
            actions.push(aiFixAction);

            const suppressAction = this.createSuppressAction(document, diagnostic);
            actions.push(suppressAction);
        }

        return actions;
    }

    private createQuickFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | undefined {
        const line = document.lineAt(diagnostic.range.start.line);
        const lineText = line.text;

        const fixes = this.getQuickFixes(lineText, diagnostic.message);
        if (fixes.length === 0) {
            return undefined;
        }

        const action = new vscode.CodeAction(
            `Quick Fix: ${fixes[0].title}`,
            vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(
            document.uri,
            line.range,
            fixes[0].replacement
        );

        action.diagnostics = [diagnostic];
        action.isPreferred = true;

        return action;
    }

    private createAIFixAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            '🤖 Generate AI Fix',
            vscode.CodeActionKind.QuickFix
        );

        action.command = {
            command: 'codeGuardian.generateAIFix',
            title: 'Generate AI Fix',
            arguments: [document, diagnostic]
        };

        action.diagnostics = [diagnostic];

        return action;
    }

    private createSuppressAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            'Suppress Code Guardian Warning',
            vscode.CodeActionKind.QuickFix
        );

        const line = diagnostic.range.start.line;
        const edit = new vscode.WorkspaceEdit();

        const suppressComment = this.getSuppressComment(document.languageId, diagnostic.code?.toString() || '');
        const position = new vscode.Position(line, 0);
        edit.insert(document.uri, position, suppressComment + '\n');

        action.edit = edit;
        action.diagnostics = [diagnostic];

        return action;
    }

    private getQuickFixes(lineText: string, message: string): Array<{ title: string; replacement: string }> {
        const fixes: Array<{ title: string; replacement: string }> = [];

        if (message.includes('Math.random()')) {
            const cryptoRandom = lineText.replace(
                /Math\.random\(\)/g,
                'crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF'
            );
            fixes.push({
                title: 'Use crypto.getRandomValues()',
                replacement: cryptoRandom
            });
        }

        if (message.includes('eval()')) {
            if (lineText.includes('JSON')) {
                const jsonParse = lineText.replace(/eval\s*\(/g, 'JSON.parse(');
                fixes.push({
                    title: 'Use JSON.parse() instead',
                    replacement: jsonParse
                });
            }
        }

        if (message.includes('innerHTML')) {
            const textContent = lineText.replace(/\.innerHTML\s*=/g, '.textContent =');
            fixes.push({
                title: 'Use textContent instead',
                replacement: textContent
            });
        }

        if (message.includes('HTTP request')) {
            const https = lineText.replace(/http:/g, 'https:');
            fixes.push({
                title: 'Use HTTPS',
                replacement: https
            });
        }

        if (message.includes('MD5') || message.includes('SHA1')) {
            const sha256 = lineText
                .replace(/md5/gi, 'sha256')
                .replace(/sha1/gi, 'sha256');
            fixes.push({
                title: 'Use SHA-256',
                replacement: sha256
            });
        }

        return fixes;
    }

    private getSuppressComment(language: string, code: string): string {
        switch (language) {
            case 'javascript':
            case 'typescript':
                return `// code-guardian-disable-next-line ${code}`;
            case 'python':
                return `# code-guardian-disable-next-line ${code}`;
            default:
                return `// code-guardian-disable-next-line ${code}`;
        }
    }
}
