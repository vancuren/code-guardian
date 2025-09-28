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

interface ApprovalResult {
    decision: 'approve' | 'reject';
    notes: string;
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

            const revisionFeedback: string[] = [];
            const maxAttempts = 1;
            let attempt = 0;
            let proposal: { raw: string; replacement: string } | undefined;
            let approval: ApprovalResult | undefined;

            while (attempt < maxAttempts) {
                attempt += 1;

                if (attempt > 1) {
                    this.sessionManager.addMessage(session.id, {
                        role: 'agent',
                        content: `🔁 Revision attempt ${attempt} requested based on approval feedback.`
                    });
                }

                proposal = await this.requestFix(session.id, document, diagnostic, context, attempt, revisionFeedback);

                approval = await this.reviewFix(session.id, document, diagnostic, context, proposal, attempt, revisionFeedback);

                if (approval.decision === 'approve') {
                    break;
                }

                revisionFeedback.push(approval.notes || 'Approval agent requires improvements but did not provide specific notes.');

                if (attempt >= maxAttempts) {
                    break;
                }

                this.sessionManager.addMessage(session.id, {
                    role: 'agent',
                    content: '🔄 Approval agent requested changes. Updating instructions for the fix provider.'
                });
            }

            if (!proposal) {
                throw new Error('No fix proposal was generated.');
            }

            if (!approval || approval.decision !== 'approve') {
                this.sessionManager.addMessage(session.id, {
                    role: 'agent',
                    content: '🚫 Approval agent could not sign off on a safe fix after 3 attempts. Please review the issue manually.'
                });
                this.sessionManager.updateSessionStatus(session.id, 'completed');
                return;
            }

            this.sessionManager.updateSessionStatus(session.id, 'idle');
            this.sessionManager.updateSessionMetadata(session.id, {
                fixProposal: proposal.raw,
                approvalNotes: approval.notes
            });

            const userChoice = await vscode.window.showInformationMessage(
                'Code Guardian generated an approved fix. Do you want to apply it?',
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
        context: FixContext,
        attempt: number,
        revisionFeedback: string[]
    ): Promise<{ raw: string; replacement: string }> {
        const attemptLabel = attempt > 1 ? ` (attempt ${attempt})` : '';
        this.sessionManager.addMessage(sessionId, {
            role: 'agent',
            content: `🤖 Requesting secure fix from provider${attemptLabel}...`
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
                content: this.buildFixPrompt(document, diagnostic, context, attempt, revisionFeedback)
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

    private buildFixPrompt(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        context: FixContext,
        attempt: number,
        revisionFeedback: string[]
    ): string {
        const feedbackSection = revisionFeedback.length
            ? `\n\n\u3010approval_feedback\u3011\n${revisionFeedback.map((feedback, index) => `Feedback ${index + 1}: ${feedback}`).join('\n\n')}\n\nIncorporate every item above while keeping the fix correct and secure.`
            : '';

        return `File: ${document.fileName}
Language: ${document.languageId}
Issue: ${diagnostic.message}
Attempt: ${attempt}
Lines ${context.startLine + 1}-${context.endLine + 1}:
\n\n\u3010original_snippet\u3011
${context.snippet}${feedbackSection}
\n\nProvide only the secure updated snippet that resolves the issue.`;
    }

    private async reviewFix(
        sessionId: string,
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        context: FixContext,
        proposal: { raw: string; replacement: string },
        attempt: number,
        revisionFeedback: string[]
    ): Promise<ApprovalResult> {
        this.sessionManager.addMessage(sessionId, {
            role: 'agent',
            content: '🧪 Approval agent reviewing proposed fix...'
        });

        const reviewPrompt = this.buildApprovalPrompt(document, diagnostic, context, proposal, attempt, revisionFeedback);

        const response = await this.aiService.chat([
            {
                role: 'user',
                content: reviewPrompt
            }
        ], {
            systemPrompt: 'You are the approval agent for a secure coding assistant. Evaluate the proposed fix conservatively but fairly. Respond ONLY with a compact JSON object: {"decision":"approve"|"reject","notes":"short actionable feedback"}. Approve when the fix resolves the issue without introducing problems. Reject only for correctness, security, or serious quality concerns.'
        });

        const approval = parseApprovalResponse(response);

        const displayMessage = approval.decision === 'approve'
            ? `✅ Approval agent: ${approval.notes || 'The fix looks good. Ready to apply.'}`
            : `⚠️ Approval agent requested changes: ${approval.notes || 'Please adjust the fix before applying.'}`;

        this.sessionManager.addMessage(sessionId, {
            role: 'assistant',
            content: displayMessage
        });

        return approval;
    }

    private buildApprovalPrompt(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        context: FixContext,
        proposal: { replacement: string },
        attempt: number,
        revisionFeedback: string[]
    ): string {
        const priorFeedback = revisionFeedback.length
            ? `\n\nPrevious approval feedback:\n${revisionFeedback.map((feedback, index) => `${index + 1}. ${feedback}`).join('\n')}`
            : '';

        return `You will review a proposed fix for a security issue.
File: ${document.fileName}
Language: ${document.languageId}
Issue: ${diagnostic.message}
Attempt: ${attempt}${priorFeedback}
\n\nOriginal snippet:\n${context.snippet}
\n\nProposed replacement:\n${proposal.replacement}
\n\nDecide whether to approve the fix. Approve when the change resolves the issue without introducing new risks or regressions. Reject only when important fixes are still missing, the change is unsafe, or quality issues are severe. Provide concise notes explaining your decision.`;
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

function parseApprovalResponse(response: string): ApprovalResult {
    const trimmed = response.trim();
    const jsonCandidate = extractJsonCandidate(trimmed);

    if (jsonCandidate) {
        try {
            const parsed = JSON.parse(jsonCandidate);
            const decision = String(parsed.decision || '').toLowerCase() === 'approve' ? 'approve' : 'reject';
            const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';
            return {
                decision,
                notes
            };
        } catch (error) {
            console.warn('Failed to parse approval agent JSON response', error);
        }
    }

    const normalized = trimmed.toLowerCase();
    if (normalized.includes('approve') && !normalized.includes('reject')) {
        return { decision: 'approve', notes: trimmed };
    }

    return {
        decision: 'reject',
        notes: trimmed || 'Approval agent returned an empty response.'
    };
}

function extractJsonCandidate(response: string): string | undefined {
    const codeBlock = extractCodeBlock(response);
    if (codeBlock && codeBlock.trim().startsWith('{')) {
        return codeBlock.trim();
    }

    const firstBrace = response.indexOf('{');
    const lastBrace = response.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return response.slice(firstBrace, lastBrace + 1).trim();
    }

    return undefined;
}
