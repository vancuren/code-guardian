import * as vscode from 'vscode';
import { ChatSession, ChatSessionMetadata, ChatSessionStatus, ChatSessionType, ResolvedChatState, StoredChatMessage } from './types';

const STORAGE_KEY = 'pentari.chat.sessions';

const randomId = () => Math.random().toString(36).slice(2, 10);

export class ChatSessionManager {
    private sessions: ChatSession[] = [];
    private activeSessionId: string | undefined;
    private readonly _onDidChangeState = new vscode.EventEmitter<ResolvedChatState>();

    readonly onDidChangeState: vscode.Event<ResolvedChatState> = this._onDidChangeState.event;

    constructor(private readonly memento: vscode.Memento) {
        this.sessions = this.loadSessions();
        this.activeSessionId = this.sessions[0]?.id;
    }

    getState(): ResolvedChatState {
        return {
            sessions: this.sessions,
            activeSessionId: this.activeSessionId
        };
    }

    getActiveSession(): ChatSession | undefined {
        return this.sessions.find(session => session.id === this.activeSessionId);
    }

    getSession(sessionId: string): ChatSession | undefined {
        return this.sessions.find(session => session.id === sessionId);
    }

    setActiveSession(sessionId: string | undefined) {
        if (sessionId && !this.sessions.some(session => session.id === sessionId)) {
            return;
        }
        this.activeSessionId = sessionId;
        this.persist();
        this.emitState();
    }

    createSession(type: ChatSessionType, title?: string, metadata?: ChatSessionMetadata): ChatSession {
        const timestamp = Date.now();
        const newSession: ChatSession = {
            id: randomId(),
            type,
            title: title ?? this.defaultTitleForType(type, timestamp),
            createdAt: timestamp,
            updatedAt: timestamp,
            allowUserInput: type === 'qa',
            status: 'idle',
            messages: [],
            metadata
        };

        this.sessions = [newSession, ...this.sessions];
        this.activeSessionId = newSession.id;
        this.persist();
        this.emitState();
        return newSession;
    }

    deleteSession(sessionId: string) {
        const index = this.sessions.findIndex(session => session.id === sessionId);
        if (index === -1) {
            return;
        }

        this.sessions.splice(index, 1);
        if (this.activeSessionId === sessionId) {
            this.activeSessionId = this.sessions[0]?.id;
        }
        this.persist();
        this.emitState();
    }

    addMessage(sessionId: string, message: Omit<StoredChatMessage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): StoredChatMessage | undefined {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return undefined;
        }

        const stored: StoredChatMessage = {
            id: message.id ?? randomId(),
            createdAt: message.createdAt ?? Date.now(),
            role: message.role,
            content: message.content,
            pending: message.pending,
            metadata: message.metadata
        };

        session.messages = [...session.messages, stored];
        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
        return stored;
    }

    updateMessage(sessionId: string, messageId: string, updates: Partial<Pick<StoredChatMessage, 'content' | 'pending' | 'metadata'>>): StoredChatMessage | undefined {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return undefined;
        }

        const index = session.messages.findIndex(message => message.id === messageId);
        if (index === -1) {
            return undefined;
        }

        const existing = session.messages[index];
        const updated: StoredChatMessage = {
            ...existing,
            ...updates
        };

        session.messages = [
            ...session.messages.slice(0, index),
            updated,
            ...session.messages.slice(index + 1)
        ];

        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
        return updated;
    }

    appendToMessage(sessionId: string, messageId: string, fragment: string): StoredChatMessage | undefined {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return undefined;
        }

        const index = session.messages.findIndex(message => message.id === messageId);
        if (index === -1) {
            return undefined;
        }

        const existing = session.messages[index];
        const updated: StoredChatMessage = {
            ...existing,
            content: existing.content + fragment
        };

        session.messages = [
            ...session.messages.slice(0, index),
            updated,
            ...session.messages.slice(index + 1)
        ];

        session.updatedAt = Date.now();
        this.emitState();
        return updated;
    }

    updateSessionStatus(sessionId: string, status: ChatSessionStatus) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return;
        }

        session.status = status;
        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
    }

    updateSessionMetadata(sessionId: string, metadata: ChatSessionMetadata) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return;
        }

        session.metadata = { ...session.metadata, ...metadata };
        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
    }

    renameSession(sessionId: string, title: string) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return;
        }

        session.title = title.trim() || session.title;
        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
    }

    clearAll() {
        this.sessions = [];
        this.activeSessionId = undefined;
        this.persist();
        this.emitState();
    }

    private loadSessions(): ChatSession[] {
        const stored = this.memento.get<ChatSession[]>(STORAGE_KEY, []);
        if (!stored || stored.length === 0) {
            return [];
        }

        return stored.map(session => ({
            ...session,
            allowUserInput: session.allowUserInput ?? (session.type === 'qa'),
            status: session.status ?? 'idle',
            messages: session.messages ?? []
        }));
    }

    private persist() {
        void this.memento.update(STORAGE_KEY, this.sessions);
    }

    private emitState() {
        this._onDidChangeState.fire(this.getState());
    }

    private defaultTitleForType(type: ChatSessionType, timestamp: number): string {
        const date = new Date(timestamp);
        const label = date.toLocaleString();
        return type === 'qa' ? `Security Q&A (${label})` : `AI Fix (${label})`;
    }
}
