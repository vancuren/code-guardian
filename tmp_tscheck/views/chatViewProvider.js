"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
const vscode = require("vscode");
class ChatViewProvider {
    constructor(extensionUri, sessionManager) {
        this.extensionUri = extensionUri;
        this.sessionManager = sessionManager;
        this._onDidRequestSendMessage = new vscode.EventEmitter();
        this.disposables = [];
        this.onDidRequestSendMessage = this._onDidRequestSendMessage.event;
        this.disposables.push(this.sessionManager.onDidChangeState(state => this.postState(state)));
    }
    dispose() {
        vscode.Disposable.from(...this.disposables).dispose();
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        const { webview } = webviewView;
        webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        webview.html = this.getHtmlForWebview(webview);
        webview.onDidReceiveMessage((message) => {
            this.handleWebviewMessage(message);
        });
    }
    reveal() {
        var _a, _b;
        if (!this.view) {
            void vscode.commands.executeCommand('workbench.view.extension.code-guardian');
        }
        else {
            (_b = (_a = this.view).show) === null || _b === void 0 ? void 0 : _b.call(_a, true);
        }
    }
    postState(state) {
        if (!this.view) {
            return;
        }
        const effectiveState = state !== null && state !== void 0 ? state : this.sessionManager.getState();
        this.view.webview.postMessage({
            type: 'state',
            payload: effectiveState
        });
    }
    handleWebviewMessage(message) {
        var _a, _b;
        switch (message === null || message === void 0 ? void 0 : message.type) {
            case 'ready':
                this.postState();
                break;
            case 'newSession': {
                this.sessionManager.createSession('qa');
                (_b = (_a = this.view) === null || _a === void 0 ? void 0 : _a.show) === null || _b === void 0 ? void 0 : _b.call(_a, true);
                this.postState();
                break;
            }
            case 'selectSession':
                this.sessionManager.setActiveSession(message.sessionId);
                break;
            case 'deleteSession':
                this.sessionManager.deleteSession(message.sessionId);
                break;
            case 'renameSession':
                this.sessionManager.renameSession(message.sessionId, message.title);
                break;
            case 'sendMessage':
                if (!message.sessionId || typeof message.content !== 'string') {
                    return;
                }
                this._onDidRequestSendMessage.fire({
                    sessionId: message.sessionId,
                    content: message.content
                });
                break;
            case 'requestState':
                this.postState();
                break;
        }
    }
    getHtmlForWebview(webview) {
        const nonce = getNonce();
        const csp = `default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            color-scheme: light dark;
        }

        body {
            margin: 0;
            font-family: var(--vscode-font-family);
            background: var(--vscode-sideBar-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        .sidebar {
            width: 220px;
            background: var(--vscode-sideBar-background);
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
        }

        .sidebar-header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 8px;
            align-items: center;
        }

        button {
            border: none;
            border-radius: 4px;
            padding: 6px 10px;
            cursor: pointer;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .session-list {
            flex: 1 1 auto;
            overflow-y: auto;
        }

        .session-item {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
        }

        .session-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .session-item small {
            display: block;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            margin-top: 2px;
        }

        .chat-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--vscode-editor-background);
        }

        .message-list {
            flex: 1 1 auto;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .message {
            padding: 10px 12px;
            border-radius: 6px;
            max-width: 80%;
            line-height: 1.4;
            white-space: pre-wrap;
        }

        .message.user {
            margin-left: auto;
            background: var(--vscode-editor-selectionBackground);
        }

        .message.assistant,
        .message.agent,
        .message.system {
            background: var(--vscode-editorHoverWidget-background);
        }

        .message-header {
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 4px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }

        .input-area {
            border-top: 1px solid var(--vscode-panel-border);
            padding: 12px;
            display: flex;
            gap: 8px;
        }

        textarea {
            flex: 1;
            resize: none;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            padding: 8px;
            min-height: 48px;
        }

        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .notice {
            padding: 8px 12px;
            margin: 12px;
            border-radius: 4px;
            background: var(--vscode-editorInlayHint-background);
            color: var(--vscode-descriptionForeground);
        }

        .empty-state {
            margin: auto;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }

        .actions {
            display: flex;
            gap: 4px;
            margin-top: 6px;
        }

        .actions button {
            padding: 4px 6px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <div class="sidebar-header">
            <button id="newSession">New Q&A</button>
        </div>
        <div id="sessionList" class="session-list"></div>
    </aside>
    <main class="chat-area">
        <div id="messageList" class="message-list"></div>
        <div id="notice" class="notice" style="display: none;"></div>
        <form id="chatForm" class="input-area">
            <textarea id="chatInput" placeholder="Ask Code Guardian about a vulnerability..."></textarea>
            <button type="submit">Send</button>
        </form>
        <div id="emptyState" class="empty-state" style="display: none;">
            <h3>Start a security conversation</h3>
            <p>Use "New Q&A" to ask about detected issues or start exploring fixes.</p>
        </div>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let state = { sessions: [], activeSessionId: undefined };

        const sessionList = document.getElementById('sessionList');
        const messageList = document.getElementById('messageList');
        const chatForm = document.getElementById('chatForm');
        const chatInput = document.getElementById('chatInput');
        const notice = document.getElementById('notice');
        const emptyState = document.getElementById('emptyState');

        document.getElementById('newSession').addEventListener('click', () => {
            vscode.postMessage({ type: 'newSession' });
        });

        chatForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const session = getActiveSession();
            if (!session || !session.allowUserInput) {
                return;
            }
            const content = chatInput.value.trim();
            if (!content) {
                return;
            }
            vscode.postMessage({
                type: 'sendMessage',
                sessionId: session.id,
                content
            });
            chatInput.value = '';
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'state') {
                state = message.payload;
                vscode.setState(state);
                render();
            }
        });

        function getActiveSession() {
            return state.sessions?.find(session => session.id === state.activeSessionId);
        }

        function renderSessions() {
            sessionList.innerHTML = '';
            if (!state.sessions || state.sessions.length === 0) {
                const placeholder = document.createElement('div');
                placeholder.className = 'empty-state';
                placeholder.innerHTML = '<p>No chats yet. Start one!</p>';
                sessionList.appendChild(placeholder);
                return;
            }

            state.sessions.forEach(session => {
                const item = document.createElement('div');
                item.className = 'session-item';
                if (session.id === state.activeSessionId) {
                    item.classList.add('active');
                }
                item.innerHTML =
                    '<strong>' + escapeHtml(session.title) + '</strong>' +
                    '<small>' + formatTimestamp(session.updatedAt) + '</small>' +
                    '<div class="actions">' +
                        '<button data-action="rename">Rename</button>' +
                        '<button data-action="delete">Delete</button>' +
                    '</div>';

                item.addEventListener('click', event => {
                    if (event.target instanceof HTMLElement) {
                        const action = event.target.dataset.action;
                        if (action === 'rename') {
                            event.stopPropagation();
                            const newTitle = prompt('Rename chat session', session.title);
                            if (newTitle !== null) {
                                vscode.postMessage({ type: 'renameSession', sessionId: session.id, title: newTitle });
                            }
                            return;
                        }
                        if (action === 'delete') {
                            event.stopPropagation();
                            vscode.postMessage({ type: 'deleteSession', sessionId: session.id });
                            return;
                        }
                    }

                    vscode.postMessage({ type: 'selectSession', sessionId: session.id });
                });

                sessionList.appendChild(item);
            });
        }

        function renderMessages() {
            messageList.innerHTML = '';
            const session = getActiveSession();

            if (!session) {
                emptyState.style.display = 'block';
                notice.style.display = 'none';
                chatForm.style.display = 'none';
                return;
            }

            emptyState.style.display = 'none';

            if (!session.allowUserInput) {
                notice.style.display = 'block';
                notice.innerText = 'AI Fix session in progress. Follow the updates below.';
                chatForm.style.display = 'none';
            } else {
                notice.style.display = 'none';
                chatForm.style.display = 'flex';
            }

            session.messages.forEach(message => {
                const item = document.createElement('div');
                item.className = 'message ' + message.role;
                item.innerHTML =
                    '<div class="message-header">' + formatRole(message.role) + '</div>' +
                    '<div class="message-content">' + renderMarkdown(message.content) + '</div>';
                messageList.appendChild(item);
            });

            messageList.scrollTop = messageList.scrollHeight;
        }

        function render() {
            renderSessions();
            renderMessages();
        }

        function formatTimestamp(timestamp) {
            if (!timestamp) {
                return '';
            }
            const date = new Date(timestamp);
            return date.toLocaleString();
        }

        function formatRole(role) {
            switch (role) {
                case 'user':
                    return 'You';
                case 'assistant':
                    return 'Code Guardian';
                case 'agent':
                    return 'Agent';
                case 'system':
                    return 'System';
                case 'tool':
                    return 'Tool';
                default:
                    return role;
            }
        }

        function escapeHtml(value) {
            return value.replace(/[&<>"]{1}/g, match => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;'
            })[match] || match);
        }

        function renderMarkdown(text) {
            const escaped = escapeHtml(text);
            return escaped
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>');
        }

        const savedState = vscode.getState();
        if (savedState) {
            state = savedState;
            render();
        }

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
