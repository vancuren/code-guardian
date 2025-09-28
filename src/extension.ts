import * as vscode from 'vscode';
import { CodeAnalyzer } from './analyzers/codeAnalyzer';
import { AIService } from './ai/aiService';
import { VulnerabilityPanel } from './webviews/vulnerabilityPanel';
import { DiagnosticProvider } from './utils/diagnosticProvider';
import { FixProvider } from './utils/fixProvider';
import { VulnerabilityTreeProvider, SuggestionsTreeProvider } from './views/vulnerabilityTreeProvider';

let analyzer: CodeAnalyzer;
let aiService: AIService;
let vulnerabilityPanel: VulnerabilityPanel | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let vulnerabilityTreeProvider: VulnerabilityTreeProvider;
let suggestionsTreeProvider: SuggestionsTreeProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Code Guardian is now active!');

    const config = vscode.workspace.getConfiguration('codeGuardian');

    diagnosticCollection = vscode.languages.createDiagnosticCollection('codeGuardian');
    context.subscriptions.push(diagnosticCollection);

    aiService = new AIService(
        config.get('aiProvider') as string,
        config.get('apiKey') as string
    );

    analyzer = new CodeAnalyzer(aiService);

    const diagnosticProvider = new DiagnosticProvider(diagnosticCollection);
    const fixProvider = new FixProvider(analyzer, aiService);

    // Initialize tree view providers
    vulnerabilityTreeProvider = new VulnerabilityTreeProvider();
    suggestionsTreeProvider = new SuggestionsTreeProvider();

    // Register tree views
    context.subscriptions.push(
        vscode.window.createTreeView('codeGuardian.vulnerabilities', {
            treeDataProvider: vulnerabilityTreeProvider,
            showCollapseAll: true
        })
    );

    context.subscriptions.push(
        vscode.window.createTreeView('codeGuardian.suggestions', {
            treeDataProvider: suggestionsTreeProvider
        })
    );

    // Register command to open file at specific line
    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.openAtLine', async (filePath: string, line: number) => {
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.scanFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            await scanDocument(editor.document, diagnosticProvider);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.scanWorkspace', async () => {
            const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx}', '**/node_modules/**');

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Scanning workspace for vulnerabilities",
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < files.length; i++) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    const file = files[i];
                    progress.report({
                        increment: (100 / files.length),
                        message: `Scanning ${file.fsPath.split('/').pop()}`
                    });

                    const document = await vscode.workspace.openTextDocument(file);
                    await scanDocument(document, diagnosticProvider);
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.applyFix', async (document: vscode.TextDocument, range: vscode.Range, fix: string) => {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, range, fix);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage('Fix applied successfully');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.showPanel', () => {
            if (!vulnerabilityPanel) {
                vulnerabilityPanel = new VulnerabilityPanel(context.extensionUri);
            }
            vulnerabilityPanel.show();
        })
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            ['javascript', 'typescript'],
            fixProvider,
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            }
        )
    );

    if (config.get('autoScan')) {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                if (isSupported(document)) {
                    await scanDocument(document, diagnosticProvider);
                }
            })
        );

        if (vscode.window.activeTextEditor) {
            await scanDocument(vscode.window.activeTextEditor.document, diagnosticProvider);
        }
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('codeGuardian')) {
                const newConfig = vscode.workspace.getConfiguration('codeGuardian');
                aiService.updateConfig(
                    newConfig.get('aiProvider') as string,
                    newConfig.get('apiKey') as string
                );
            }
        })
    );
}

async function scanDocument(document: vscode.TextDocument, diagnosticProvider: DiagnosticProvider) {
    if (!isSupported(document)) {
        return;
    }

    try {
        vscode.window.setStatusBarMessage('$(sync~spin) Scanning for vulnerabilities...', 5000);

        const vulnerabilities = await analyzer.analyze(
            document.getText(),
            document.languageId,
            document.fileName
        );

        diagnosticProvider.updateDiagnostics(document, vulnerabilities);

        // Update tree view
        vulnerabilityTreeProvider.updateVulnerabilities(document.fileName, vulnerabilities);

        // Update suggestions
        const suggestions = vulnerabilities
            .filter(v => v.suggestion)
            .map(v => v.suggestion!)
            .filter((value, index, self) => self.indexOf(value) === index);
        suggestionsTreeProvider.updateSuggestions(suggestions);

        if (vulnerabilities.length > 0) {
            vscode.window.showWarningMessage(
                `Found ${vulnerabilities.length} potential vulnerabilities`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details') {
                    vscode.commands.executeCommand('codeGuardian.showPanel');
                }
            });
        } else {
            vscode.window.showInformationMessage('No vulnerabilities detected');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Scan failed: ${error}`);
    }
}

function isSupported(document: vscode.TextDocument): boolean {
    return true;
    // const supportedLanguages = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'];
    // return supportedLanguages.includes(document.languageId);
}

export function deactivate() {
    if (vulnerabilityPanel) {
        vulnerabilityPanel.dispose();
    }
}