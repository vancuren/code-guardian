import * as vscode from 'vscode';
import { minimatch } from 'minimatch';
import { CodeAnalyzer } from './analyzers/codeAnalyzer';
import { AIService } from './ai/aiService';
import { VulnerabilityPanel } from './webviews/vulnerabilityPanel';
import { DiagnosticProvider } from './utils/diagnosticProvider';
import { FixProvider } from './utils/fixProvider';
import { VulnerabilityTreeProvider, SuggestionsTreeProvider } from './views/vulnerabilityTreeProvider';
import { ChatSessionManager } from './chat/sessionManager';
import { ChatViewProvider } from './views/chatViewProvider';
import { ChatController } from './chat/chatController';
import { FixAgent } from './chat/fixAgent';

let analyzer: CodeAnalyzer;
let aiService: AIService;
let vulnerabilityPanel: VulnerabilityPanel | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let vulnerabilityTreeProvider: VulnerabilityTreeProvider;
let suggestionsTreeProvider: SuggestionsTreeProvider;
let chatSessionManager: ChatSessionManager;
let chatViewProvider: ChatViewProvider;
let chatController: ChatController;
let fixAgent: FixAgent;
const SECRET_STORAGE_KEY = 'codeGuardian.apiKey';
let missingKeyWarningShown = false;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Code Guardian is now active!');

    const config = vscode.workspace.getConfiguration('codeGuardian');
    const providerName = (config.get('aiProvider') as string) || 'openai';
    const modelName = (config.get('model') as string) || 'gpt-5-nano';

    const legacyApiKey = config.get<string>('apiKey');
    let apiKey = (await context.secrets.get(SECRET_STORAGE_KEY)) || '';

    if (legacyApiKey) {
        if (!apiKey) {
            await context.secrets.store(SECRET_STORAGE_KEY, legacyApiKey);
            apiKey = legacyApiKey;
            vscode.window.showInformationMessage('Code Guardian API key migrated to secure storage.');
        }

        await clearLegacyApiKey(config);
    }

    diagnosticCollection = vscode.languages.createDiagnosticCollection('codeGuardian');
    context.subscriptions.push(diagnosticCollection);

    aiService = new AIService(
        providerName,
        apiKey,
        modelName
    );

    analyzer = new CodeAnalyzer(aiService);

    chatSessionManager = new ChatSessionManager(context.globalState);
    chatController = new ChatController(aiService, chatSessionManager);
    chatViewProvider = new ChatViewProvider(context.extensionUri, chatSessionManager);
    fixAgent = new FixAgent(aiService, chatSessionManager, chatViewProvider);

    context.subscriptions.push(chatViewProvider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codeGuardian.chat', chatViewProvider)
    );

    context.subscriptions.push(
        chatViewProvider.onDidRequestSendMessage(async ({ sessionId, content }) => {
            await chatController.handleUserMessage(sessionId, content);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.generateAIFix', async (document: vscode.TextDocument, diagnostic: vscode.Diagnostic) => {
            await fixAgent.run(document, diagnostic);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codeGuardian.setApiKey', async () => {
            const result = await vscode.window.showInputBox({
                prompt: 'Enter the API key for your configured AI provider',
                placeHolder: 'sk-... or api_key',
                password: true,
                ignoreFocusOut: true
            });

            if (result === undefined) {
                return;
            }

            const trimmed = result.trim();
            const currentProvider = (vscode.workspace.getConfiguration('codeGuardian').get('aiProvider') as string) || 'openai';

            if (!trimmed) {
                await context.secrets.delete(SECRET_STORAGE_KEY);
                aiService.updateApiKey('');
                vscode.window.showInformationMessage('Code Guardian API key cleared.');
                warnIfMissingApiKey(currentProvider, '');
                return;
            }

            await context.secrets.store(SECRET_STORAGE_KEY, trimmed);
            aiService.updateApiKey(trimmed);
            vscode.window.showInformationMessage('Code Guardian API key securely stored.');
            warnIfMissingApiKey(currentProvider, trimmed);
        })
    );

    warnIfMissingApiKey(providerName, apiKey);

    const diagnosticProvider = new DiagnosticProvider(diagnosticCollection);
    const fixProvider = new FixProvider();

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
            const config = vscode.workspace.getConfiguration('codeGuardian');
            const includeGlobs = getStringArray(config.get('fileIncludeGlobs')).map(pattern => normalizeForGlob(pattern)).filter(Boolean);
            const excludeGlobs = getStringArray(config.get('fileExcludeGlobs')).map(pattern => normalizeForGlob(pattern)).filter(Boolean);

            const includePatterns = includeGlobs.length ? includeGlobs : ['**/*'];
            const combinedExclude = combineGlobPatterns(excludeGlobs);

            const uniqueFiles = new Map<string, vscode.Uri>();

            for (const pattern of includePatterns) {
                const files = await vscode.workspace.findFiles(pattern, combinedExclude);
                for (const file of files) {
                    const key = file.toString();
                    if (!uniqueFiles.has(key)) {
                        uniqueFiles.set(key, file);
                    }
                }
            }

            const targets = Array.from(uniqueFiles.values()).sort((a, b) => a.fsPath.localeCompare(b.fsPath));

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Scanning workspace for vulnerabilities',
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < targets.length; i++) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    const file = targets[i];
                    const relativePath = normalizeForGlob(vscode.workspace.asRelativePath(file, false)) || normalizeForGlob(file.fsPath);
                    progress.report({
                        increment: targets.length > 0 ? (100 / targets.length) : undefined,
                        message: `Scanning ${relativePath}`
                    });

                    try {
                        const document = await vscode.workspace.openTextDocument(file);
                        if (isSupported(document)) {
                            await scanDocument(document, diagnosticProvider);
                        }
                    } catch (error) {
                        console.error(`Failed to scan ${file.fsPath}:`, error);
                    }
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
        const lastScanTimestamps = new Map<string, number>();
        const SCAN_DEBOUNCE_MS = 500;

        const scanIfEligible = async (document: vscode.TextDocument) => {
            const key = document.uri.toString();
            const now = Date.now();
            const lastScan = lastScanTimestamps.get(key) ?? 0;

            if (now - lastScan < SCAN_DEBOUNCE_MS) {
                return;
            }

            lastScanTimestamps.set(key, now);

            if (isSupported(document)) {
                await scanDocument(document, diagnosticProvider);
            }
        };

        const maybeScanDocument = async (document: vscode.TextDocument) => {
            await scanIfEligible(document);
        };

        const openAndScanUri = async (uri: vscode.Uri) => {
            try {
                const document = await vscode.workspace.openTextDocument(uri);
                await scanIfEligible(document);
            } catch (error) {
                console.error(`Failed to open document for scanning: ${uri.fsPath}`, error);
            }
        };

        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                await maybeScanDocument(document);
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(async (document) => {
                await maybeScanDocument(document);
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidCreateFiles(async (event) => {
                for (const uri of event.files) {
                    await openAndScanUri(uri);
                }
            })
        );

        const includeGlobs = getStringArray(config.get('fileIncludeGlobs')).map(pattern => normalizeForGlob(pattern)).filter(Boolean);
        const watcherPatterns = includeGlobs.length > 0 ? includeGlobs : ['**/*'];

        for (const pattern of watcherPatterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, true);
            context.subscriptions.push(
                watcher,
                watcher.onDidCreate(async (uri) => {
                    await openAndScanUri(uri);
                }),
                watcher.onDidChange(async (uri) => {
                    await openAndScanUri(uri);
                })
            );
        }

        if (vscode.window.activeTextEditor) {
            await maybeScanDocument(vscode.window.activeTextEditor.document);
        }
    }

    const applyConfiguration = async () => {
        const updatedConfig = vscode.workspace.getConfiguration('codeGuardian');
        const updatedProvider = (updatedConfig.get('aiProvider') as string) || 'openai';
        const updatedModel = (updatedConfig.get('model') as string) || 'gpt-5-nano';
        const updatedApiKey = (await context.secrets.get(SECRET_STORAGE_KEY)) || '';
        aiService.updateConfig(updatedProvider, updatedModel, updatedApiKey);
        warnIfMissingApiKey(updatedProvider, updatedApiKey);
    };

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('codeGuardian.aiProvider') || e.affectsConfiguration('codeGuardian.model')) {
                void applyConfiguration();
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
    console.log('document.languageId', document.languageId);
    console.log('document.uri.scheme', document.uri.scheme);

    if (document.languageId === 'binary') {
        return false;
    }

    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
        return false;
    }

    const config = vscode.workspace.getConfiguration('codeGuardian');
    const allowLanguages = getStringArray(config.get('allowedLanguages')).map(l => l.toLowerCase());
    const blockLanguages = getStringArray(config.get('blockedLanguages')).map(l => l.toLowerCase());
    const includePatterns = getStringArray(config.get('fileIncludeGlobs')).map(pattern => normalizeForGlob(pattern)).filter(Boolean);
    const excludePatterns = getStringArray(config.get('fileExcludeGlobs')).map(pattern => normalizeForGlob(pattern)).filter(Boolean);

    const languageId = document.languageId.toLowerCase();

    if (blockLanguages.includes(languageId)) {
        return false;
    }

    if (allowLanguages.length > 0 && !allowLanguages.includes(languageId)) {
        return false;
    }

    const path = document.uri.scheme === 'untitled' ? document.fileName : document.uri.fsPath;
    const relativePath = vscode.workspace.asRelativePath(path, false) || path;
    const normalizedPath = normalizeForGlob(relativePath) || normalizeForGlob(path);

    if (excludePatterns.some(pattern => minimatch(normalizedPath, pattern, { nocase: true, dot: true }))) {
        return false;
    }

    if (includePatterns.length > 0 && !includePatterns.some(pattern => minimatch(normalizedPath, pattern, { nocase: true, dot: true }))) {
        return false;
    }

    return true;
}

function getStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean);
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        return [value.trim()];
    }

    return [];
}

function combineGlobPatterns(patterns: string[]): string | undefined {
    const sanitized = patterns.filter(Boolean);
    if (sanitized.length === 0) {
        return undefined;
    }

    if (sanitized.length === 1) {
        return sanitized[0];
    }

    return `{${sanitized.join(',')}}`;
}

function normalizeForGlob(value: string | undefined): string {
    if (!value) {
        return '';
    }

    return value.replace(/\\+/g, '/');
}

export function deactivate() {
    if (vulnerabilityPanel) {
        vulnerabilityPanel.dispose();
    }
}

function warnIfMissingApiKey(provider: string, apiKey: string) {
    if (provider === 'local' || apiKey) {
        missingKeyWarningShown = false;
        return;
    }

    if (missingKeyWarningShown) {
        return;
    }

    missingKeyWarningShown = true;
    vscode.window.showWarningMessage('Code Guardian API key is not set. Run "Code Guardian: Set API Key" to configure one or switch the provider to Local.');
}

async function clearLegacyApiKey(config: vscode.WorkspaceConfiguration) {
    try {
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
        console.error('Failed to clear legacy API key setting:', error);
    }
}
