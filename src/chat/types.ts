import { ChatRole } from '../ai/aiService';

export type ChatSessionType = 'qa' | 'fix';

export type ChatMessageRole = ChatRole | 'agent';

export interface StoredChatMessage {
    id: string;
    role: ChatMessageRole;
    content: string;
    createdAt: number;
    pending?: boolean;
    metadata?: Record<string, unknown>;
}

export type ChatSessionStatus = 'idle' | 'running' | 'completed' | 'error';

export interface ChatSessionMetadata {
    filePath?: string;
    diagnosticCode?: string;
    vulnerabilityMessage?: string;
    fixProposal?: string;
    [key: string]: unknown;
}

export interface ChatSession {
    id: string;
    type: ChatSessionType;
    title: string;
    createdAt: number;
    updatedAt: number;
    allowUserInput: boolean;
    status: ChatSessionStatus;
    messages: StoredChatMessage[];
    metadata?: ChatSessionMetadata;
}

export interface ResolvedChatState {
    sessions: ChatSession[];
    activeSessionId?: string;
}
