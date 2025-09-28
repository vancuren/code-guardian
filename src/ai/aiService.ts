export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
    role: ChatRole;
    content: string;
    name?: string;
}

export interface ChatRequestOptions {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

export interface ChatStreamCallbacks {
    onToken?: (token: string) => void;
    onStart?: () => void;
    onComplete?: (fullText: string) => void;
}

interface AIProvider {
    analyzeCode(prompt: string): Promise<string>;
    generateFix(prompt: string): Promise<string>;
    chat(messages: ChatMessage[], options?: ChatRequestOptions, callbacks?: ChatStreamCallbacks): Promise<string>;
}

class OpenAIProvider implements AIProvider {
    constructor(private apiKey: string, private model: string) {}

    private ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not set. Use "Code Guardian: Set API Key" to store your key securely.');
        }
    }

    async analyzeCode(prompt: string): Promise<string> {
        this.ensureApiKey();
        console.log('prompt', prompt);
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a security expert analyzing code for vulnerabilities. Respond only with JSON array.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                // temperature: 0.2,
                // max_tokens: 2000
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async generateFix(prompt: string): Promise<string> {
        this.ensureApiKey();
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a security expert. Provide only the fixed code without explanation.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                // temperature: 0.1,
                // max_tokens: 1500
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async chat(messages: ChatMessage[], options?: ChatRequestOptions, callbacks?: ChatStreamCallbacks): Promise<string> {
        this.ensureApiKey();

        const normalizedMessages = options?.systemPrompt
            ? [{ role: 'system', content: options.systemPrompt } as ChatMessage, ...messages]
            : messages;

        const body = {
            model: this.model,
            messages: normalizedMessages.map(message => ({
                role: message.role,
                content: message.content,
                name: message.name
            })),
            // temperature: options?.temperature ?? 0.2,
            // max_tokens: options?.maxTokens ?? 800,
            stream: typeof callbacks?.onToken === 'function'
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI chat failed: ${errorText}`);
        }

        const shouldStream = Boolean(body.stream && response.body && callbacks?.onToken);

        if (!shouldStream) {
            const data = await response.json();
            const text = data.choices?.[0]?.message?.content ?? '';
            callbacks?.onStart?.();
            if (text && callbacks?.onToken) {
                for (const chunk of chunkText(text)) {
                    callbacks.onToken(chunk);
                }
            }
            callbacks?.onComplete?.(text);
            return text;
        }

        callbacks?.onStart?.();
        const stream = response.body;
        if (!stream) {
            const fallbackText = await response.text();
            callbacks?.onComplete?.(fallbackText);
            return fallbackText;
        }

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) {
                    continue;
                }

                const payload = trimmed.slice(5).trim();
                if (!payload || payload === '[DONE]') {
                    continue;
                }

                try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullText += delta;
                        callbacks?.onToken?.(delta);
                    }
                } catch (error) {
                    console.error('Failed to parse OpenAI stream payload', error);
                }
            }
        }

        callbacks?.onComplete?.(fullText);
        return fullText;
    }
}

class AnthropicProvider implements AIProvider {
    constructor(private apiKey: string) {}

    async analyzeCode(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('Anthropic API key not set. Use "Code Guardian: Set API Key" to store your key securely.');
        }
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-opus-20240229',
                max_tokens: 2000,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                system: 'You are a security expert analyzing code for vulnerabilities. Respond only with JSON array.',
                temperature: 0.2
            })
        });

        const data = await response.json();
        return data.content[0].text;
    }

    async generateFix(prompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new Error('Anthropic API key not set. Use "Code Guardian: Set API Key" to store your key securely.');
        }
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-opus-20240229',
                max_tokens: 1500,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                system: 'You are a security expert. Provide only the fixed code without explanation.',
                temperature: 0.1
            })
        });

        const data = await response.json();
        return data.content[0].text;
    }

    async chat(messages: ChatMessage[], options?: ChatRequestOptions, callbacks?: ChatStreamCallbacks): Promise<string> {
        if (!this.apiKey) {
            throw new Error('Anthropic API key not set. Use "Code Guardian: Set API Key" to store your key securely.');
        }

        const payloadMessages = messages.map(message => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content
        }));

        if (options?.systemPrompt) {
            payloadMessages.unshift({
                role: 'user',
                content: options.systemPrompt
            });
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-3-opus-20240229',
                max_tokens: options?.maxTokens ?? 800,
                messages: payloadMessages,
                system: options?.systemPrompt,
                temperature: options?.temperature ?? 0.2
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic chat failed: ${errorText}`);
        }

        const data = await response.json();
        const text = data.content?.[0]?.text ?? '';

        callbacks?.onStart?.();
        if (text && callbacks?.onToken) {
            for (const chunk of chunkText(text)) {
                callbacks.onToken(chunk);
            }
        }
        callbacks?.onComplete?.(text);

        return text;
    }
}

class LocalProvider implements AIProvider {
    async analyzeCode(_prompt: string): Promise<string> {
        return JSON.stringify([
            {
                type: 'info',
                severity: 'low',
                line: 1,
                description: 'Local analysis mode - Connect to AI provider for full analysis',
                fix: '',
                cwe: ''
            }
        ]);
    }

    async generateFix(_prompt: string): Promise<string> {
        return '// Local mode - Connect to AI provider for fix suggestions';
    }

    async chat(messages: ChatMessage[], options?: ChatRequestOptions, callbacks?: ChatStreamCallbacks): Promise<string> {
        const reply = `Local mode placeholder. Provider is offline. Messages received: ${messages.length}`;
        callbacks?.onStart?.();
        if (callbacks?.onToken) {
            for (const chunk of chunkText(reply)) {
                callbacks.onToken(chunk);
            }
        }
        callbacks?.onComplete?.(reply);
        return reply;
    }
}

export class AIService {
    private provider: AIProvider;
    private providerName: string;
    private apiKey: string;
    private model: string;

    constructor(providerName: string, apiKey: string, model: string) {
        this.providerName = providerName;
        this.apiKey = apiKey;
        this.model = model;
        this.provider = this.createProvider(providerName, apiKey, model);
    }

    private createProvider(providerName: string, apiKey: string, model: string): AIProvider {
        switch (providerName) {
            case 'openai':
                return new OpenAIProvider(apiKey, model);
            case 'anthropic':
                return new AnthropicProvider(apiKey);
            case 'local':
            default:
                return new LocalProvider();
        }
    }

    async analyzeCode(prompt: string): Promise<string> {
        try {
            return await this.provider.analyzeCode(prompt);
        } catch (error) {
            console.error('AI analysis failed:', error);
            throw error;
        }
    }

    async generateFix(prompt: string): Promise<string> {
        try {
            return await this.provider.generateFix(prompt);
        } catch (error) {
            console.error('Fix generation failed:', error);
            throw error;
        }
    }

    async chat(messages: ChatMessage[], options?: ChatRequestOptions, callbacks?: ChatStreamCallbacks): Promise<string> {
        try {
            return await this.provider.chat(messages, options, callbacks);
        } catch (error) {
            console.error('Chat interaction failed:', error);
            throw error;
        }
    }

    updateConfig(providerName: string, model: string, apiKey: string) {
        this.providerName = providerName;
        this.model = model;
        this.apiKey = apiKey;
        this.provider = this.createProvider(providerName, apiKey, model);
    }

    updateApiKey(apiKey: string) {
        this.apiKey = apiKey;
        this.provider = this.createProvider(this.providerName, apiKey, this.model);
    }
}

function chunkText(text: string, chunkSize = 20): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}
