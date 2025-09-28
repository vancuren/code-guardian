"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSessionManager = void 0;
const vscode = require("vscode");
const STORAGE_KEY = 'codeGuardian.chat.sessions';
const randomId = () => Math.random().toString(36).slice(2, 10);
class ChatSessionManager {
    constructor(memento) {
        var _a;
        this.memento = memento;
        this.sessions = [];
        this._onDidChangeState = new vscode.EventEmitter();
        this.onDidChangeState = this._onDidChangeState.event;
        this.sessions = this.loadSessions();
        this.activeSessionId = (_a = this.sessions[0]) === null || _a === void 0 ? void 0 : _a.id;
    }
    getState() {
        return {
            sessions: this.sessions,
            activeSessionId: this.activeSessionId
        };
    }
    getActiveSession() {
        return this.sessions.find(session => session.id === this.activeSessionId);
    }
    getSession(sessionId) {
        return this.sessions.find(session => session.id === sessionId);
    }
    setActiveSession(sessionId) {
        if (sessionId && !this.sessions.some(session => session.id === sessionId)) {
            return;
        }
        this.activeSessionId = sessionId;
        this.persist();
        this.emitState();
    }
    createSession(type, title, metadata) {
        const timestamp = Date.now();
        const newSession = {
            id: randomId(),
            type,
            title: title !== null && title !== void 0 ? title : this.defaultTitleForType(type, timestamp),
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
    deleteSession(sessionId) {
        var _a;
        const index = this.sessions.findIndex(session => session.id === sessionId);
        if (index === -1) {
            return;
        }
        this.sessions.splice(index, 1);
        if (this.activeSessionId === sessionId) {
            this.activeSessionId = (_a = this.sessions[0]) === null || _a === void 0 ? void 0 : _a.id;
        }
        this.persist();
        this.emitState();
    }
    addMessage(sessionId, message) {
        var _a, _b;
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return undefined;
        }
        const stored = {
            id: (_a = message.id) !== null && _a !== void 0 ? _a : randomId(),
            createdAt: (_b = message.createdAt) !== null && _b !== void 0 ? _b : Date.now(),
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
    updateMessage(sessionId, messageId, updates) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return undefined;
        }
        const index = session.messages.findIndex(message => message.id === messageId);
        if (index === -1) {
            return undefined;
        }
        const existing = session.messages[index];
        const updated = {
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
    appendToMessage(sessionId, messageId, fragment) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return undefined;
        }
        const index = session.messages.findIndex(message => message.id === messageId);
        if (index === -1) {
            return undefined;
        }
        const existing = session.messages[index];
        const updated = {
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
    updateSessionStatus(sessionId, status) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return;
        }
        session.status = status;
        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
    }
    updateSessionMetadata(sessionId, metadata) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) {
            return;
        }
        session.metadata = { ...session.metadata, ...metadata };
        session.updatedAt = Date.now();
        this.persist();
        this.emitState();
    }
    renameSession(sessionId, title) {
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
    loadSessions() {
        const stored = this.memento.get(STORAGE_KEY, []);
        if (!stored || stored.length === 0) {
            return [];
        }
        return stored.map(session => {
            var _a, _b, _c;
            return ({
                ...session,
                allowUserInput: (_a = session.allowUserInput) !== null && _a !== void 0 ? _a : (session.type === 'qa'),
                status: (_b = session.status) !== null && _b !== void 0 ? _b : 'idle',
                messages: (_c = session.messages) !== null && _c !== void 0 ? _c : []
            });
        });
    }
    persist() {
        void this.memento.update(STORAGE_KEY, this.sessions);
    }
    emitState() {
        this._onDidChangeState.fire(this.getState());
    }
    defaultTitleForType(type, timestamp) {
        const date = new Date(timestamp);
        const label = date.toLocaleString();
        return type === 'qa' ? `Security Q&A (${label})` : `AI Fix (${label})`;
    }
}
exports.ChatSessionManager = ChatSessionManager;
