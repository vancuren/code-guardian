import * as vscode from 'vscode';
import { AIService, ChatMessage } from '../ai/aiService';
import { ChatSessionManager } from './sessionManager';
import { ChatSession } from './types';

export class ChatController {
    constructor(
        private readonly aiService: AIService,
        private readonly sessionManager: ChatSessionManager
    ) {}

    async handleUserMessage(sessionId: string, content: string): Promise<void> {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            vscode.window.showErrorMessage('Chat session not found.');
            return;
        }

        if (!session.allowUserInput) {
            vscode.window.showWarningMessage('This session is read-only.');
            return;
        }

        const trimmed = content.trim();
        if (!trimmed) {
            return;
        }

        this.sessionManager.addMessage(sessionId, {
            role: 'user',
            content: trimmed
        });

        const assistantPlaceholder = this.sessionManager.addMessage(sessionId, {
            role: 'assistant',
            content: '',
            pending: true
        });

        if (!assistantPlaceholder) {
            return;
        }

        this.sessionManager.updateSessionStatus(sessionId, 'running');

        try {
            const chatHistory = this.buildChatHistory(this.sessionManager.getSession(sessionId));
            await this.aiService.chat(chatHistory, {
                systemPrompt: this.buildSystemPrompt(session)
            }, {
                onToken: (token) => {
                    this.sessionManager.appendToMessage(sessionId, assistantPlaceholder.id, token);
                },
                onComplete: () => {
                    this.sessionManager.updateMessage(sessionId, assistantPlaceholder.id, { pending: false });
                    this.sessionManager.updateSessionStatus(sessionId, 'idle');
                }
            });
        } catch (error) {
            console.error('Failed to handle user message', error);
            this.sessionManager.updateMessage(sessionId, assistantPlaceholder.id, {
                pending: false,
                content: 'I ran into an issue answering that question. Please check your provider configuration and try again.'
            });
            this.sessionManager.updateSessionStatus(sessionId, 'error');
            vscode.window.showErrorMessage('Code Guardian chat failed. See logs for details.');
        }
    }

    private buildChatHistory(session: ChatSession | undefined): ChatMessage[] {
        if (!session) {
            return [];
        }

        return session.messages
            .filter(message => message.role === 'user' || message.role === 'assistant')
            .map(message => ({
                role: message.role as ChatMessage['role'],
                content: message.content
            }));
    }

    private buildSystemPrompt(session: ChatSession): string {
        const base = 'You are Code Guardian, a security expert assistant embedded in VS Code. Provide concise, actionable answers about vulnerabilities and secure coding. Where appropriate, include code samples. Maintain a collaborative tone.';

        if (session.metadata?.vulnerabilityMessage) {
            return `${base}\nCurrent issue: ${session.metadata.vulnerabilityMessage}`;
        }

        return base;
    }
}
