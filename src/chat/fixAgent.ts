import * as vscode from 'vscode';
import * as path from 'path';
import { AIService, ChatMessage } from '../ai/aiService';
import { ChatSessionManager } from './sessionManager';
import { ChatViewProvider } from '../views/chatViewProvider';

interface FixContext {
    snippet: string;
    snippetRange: vscode.Range;
    languageId: string;
    startLine: number;
    endLine: number;
}

const APPLY_ACTION = 'Apply Fix';

export class FixAgent {
    constructor(
        private readonly aiService: AIService,
        private readonly sessionManager: ChatSessionManager,
        private readonly chatView: ChatViewProvider
    ) {}

    async run(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): Promise<void> {
        const session = this.sessionManager.createSession('fix', this.buildSessionTitle(document, diagnostic), {
            filePath: document.uri.fsPath,
            diagnosticCode: diagnostic.code?.toString(),
            vulnerabilityMessage: diagnostic.message
        });

        this.chatView.reveal();
        this.sessionManager.updateSessionStatus(session.id, 'running');

        this.sessionManager.addMessage(session.id, {
            role: 'agent',
            content: `🚀 Starting AI-assisted fix for **${path.basename(document.fileName)}** at line ${diagnostic.range.start.line + 1}.`
        });

        this.sessionManager.addMessage(session.id, {
            role: 'agent',
            content: `⚠️ Issue detected: ${diagnostic.message}`
        });

        try {
            const context = this.buildContext(document, diagnostic);

            this.sessionManager.addMessage(session.id, {
                role: 'agent',
                content: '🔍 Gathering code context with `read_file` tool...'
            });

            this.sessionManager.addMessage(session.id, {
                role: 'tool',
                content: this.renderToolMessage('read_file', document.uri.fsPath, context.snippet)
            });

            const proposal = await this.requestFix(session.id, document, diagnostic, context);

            this.sessionManager.updateSessionStatus(session.id, 'idle');
            this.sessionManager.updateSessionMetadata(session.id, {
                fixProposal: proposal.raw
            });

            const userChoice = await vscode.window.showInformationMessage(
                'Code Guardian generated a fix. Do you want to apply it?',
                APPLY_ACTION,
                'Cancel'
            );

            if (userChoice !== APPLY_ACTION) {
                this.sessionManager.addMessage(session.id, {
                    role: 'agent',
                    content: '⏸️ Fix application cancelled by user.'
                });
                this.sessionManager.updateSessionStatus(session.id, 'completed');
                return;
            }

            this.sessionManager.addMessage(session.id, {
                role: 'agent',
                content: '✍️ Applying changes with `write_file` tool...'
            });

            await this.applyFix(document, context.snippetRange, proposal.replacement);

            this.sessionManager.addMessage(session.id, {
                role: 'tool',
                content: this.renderToolMessage('write_file', document.uri.fsPath, proposal.replacement)
            });

            this.sessionManager.addMessage(session.id, {
                role: 'agent',
                content: '✅ Fix applied. Please review and run your tests.'
            });
            this.sessionManager.updateSessionStatus(session.id, 'completed');
        } catch (error) {
            console.error('FixAgent failed', error);
            this.sessionManager.addMessage(session.id, {
                role: 'agent',
                content: `❌ Failed to complete the fix: ${error instanceof Error ? error.message : error}`
            });
            this.sessionManager.updateSessionStatus(session.id, 'error');
        }
    }

    private buildSessionTitle(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): string {
        const fileName = path.basename(document.fileName);
        return `Fix ${fileName}:${diagnostic.range.start.line + 1}`;
    }

    private buildContext(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): FixContext {
        const startLine = Math.max(0, diagnostic.range.start.line - 5);
        const endLine = Math.min(document.lineCount - 1, diagnostic.range.end.line + 5);
        const snippetRange = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, Number.MAX_VALUE)
        );

        const snippet = document.getText(snippetRange);

        return {
            snippet,
            snippetRange,
            languageId: document.languageId,
            startLine,
            endLine
        };
    }

    private renderToolMessage(tool: 'read_file' | 'write_file', target: string, payload: string): string {
        const truncated = payload.length > 3000 ? `${payload.slice(0, 3000)}\n... (truncated)` : payload;
        return `\`${tool}\` → ${target}\n\n\u3010content\u3011\n${truncated}`;
    }

    private async requestFix(
        sessionId: string,
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        context: FixContext
    ): Promise<{ raw: string; replacement: string }> {
        this.sessionManager.addMessage(sessionId, {
            role: 'agent',
            content: '🤖 Requesting secure fix from provider...'
        });

        const assistantMessage = this.sessionManager.addMessage(sessionId, {
            role: 'assistant',
            content: '',
            pending: true
        });

        if (!assistantMessage) {
            throw new Error('Failed to append provider response message.');
        }

        const requestMessages: ChatMessage[] = [
            {
                role: 'user',
                content: this.buildFixPrompt(document, diagnostic, context)
            }
        ];

        let fullText = '';

        await this.aiService.chat(requestMessages, {
            systemPrompt: 'You are a senior security engineer. Return only the corrected code snippet that should replace the provided block. Maintain formatting and indentation. If no changes are necessary, echo the original snippet.'
        }, {
            onToken: (token) => {
                fullText += token;
                this.sessionManager.appendToMessage(sessionId, assistantMessage.id, token);
            },
            onComplete: () => {
                this.sessionManager.updateMessage(sessionId, assistantMessage.id, { pending: false });
            }
        });

        const replacement = extractCodeBlock(fullText) ?? fullText.trim();
        if (!replacement) {
            throw new Error('Provider returned an empty fix.');
        }

        return { raw: fullText, replacement };
    }

    private buildFixPrompt(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, context: FixContext): string {
        return `File: ${document.fileName}
Language: ${document.languageId}
Issue: ${diagnostic.message}
Lines ${context.startLine + 1}-${context.endLine + 1}:
\n\n\u3010original_snippet\u3011
${context.snippet}
\n\nProvide the secure updated snippet that resolves the issue.`;
    }

    private async applyFix(document: vscode.TextDocument, range: vscode.Range, replacement: string) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, replacement);
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
            throw new Error('VS Code rejected the workspace edit.');
        }
        await document.save();
    }
}

function extractCodeBlock(response: string): string | undefined {
    const fenceMatch = response.match(/```[\w-]*\n([\s\S]*?)```/);
    if (fenceMatch) {
        return fenceMatch[1].trim();
    }
    return undefined;
}
