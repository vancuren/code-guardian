"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
class OpenAIProvider {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model;
    }
    ensureApiKey() {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not set. Use "Code Guardian: Set API Key" to store your key securely.');
        }
    }
    async analyzeCode(prompt) {
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
    async generateFix(prompt) {
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
    async chat(messages, options, callbacks) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        this.ensureApiKey();
        const normalizedMessages = (options === null || options === void 0 ? void 0 : options.systemPrompt)
            ? [{ role: 'system', content: options.systemPrompt }, ...messages]
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
            stream: typeof (callbacks === null || callbacks === void 0 ? void 0 : callbacks.onToken) === 'function'
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
        const shouldStream = Boolean(body.stream && response.body && (callbacks === null || callbacks === void 0 ? void 0 : callbacks.onToken));
        if (!shouldStream) {
            const data = await response.json();
            const text = (_d = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) !== null && _d !== void 0 ? _d : '';
            (_e = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onStart) === null || _e === void 0 ? void 0 : _e.call(callbacks);
            if (text && (callbacks === null || callbacks === void 0 ? void 0 : callbacks.onToken)) {
                for (const chunk of chunkText(text)) {
                    callbacks.onToken(chunk);
                }
            }
            (_f = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onComplete) === null || _f === void 0 ? void 0 : _f.call(callbacks, text);
            return text;
        }
        (_g = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onStart) === null || _g === void 0 ? void 0 : _g.call(callbacks);
        const stream = response.body;
        if (!stream) {
            const fallbackText = await response.text();
            (_h = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onComplete) === null || _h === void 0 ? void 0 : _h.call(callbacks, fallbackText);
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
            buffer = (_j = lines.pop()) !== null && _j !== void 0 ? _j : '';
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
                    const delta = (_m = (_l = (_k = json.choices) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.delta) === null || _m === void 0 ? void 0 : _m.content;
                    if (delta) {
                        fullText += delta;
                        (_o = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onToken) === null || _o === void 0 ? void 0 : _o.call(callbacks, delta);
                    }
                }
                catch (error) {
                    console.error('Failed to parse OpenAI stream payload', error);
                }
            }
        }
        (_p = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onComplete) === null || _p === void 0 ? void 0 : _p.call(callbacks, fullText);
        return fullText;
    }
}
class AnthropicProvider {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async analyzeCode(prompt) {
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
    async generateFix(prompt) {
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
    async chat(messages, options, callbacks) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (!this.apiKey) {
            throw new Error('Anthropic API key not set. Use "Code Guardian: Set API Key" to store your key securely.');
        }
        const payloadMessages = messages.map(message => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.content
        }));
        if (options === null || options === void 0 ? void 0 : options.systemPrompt) {
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
                max_tokens: (_a = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _a !== void 0 ? _a : 800,
                messages: payloadMessages,
                system: options === null || options === void 0 ? void 0 : options.systemPrompt,
                temperature: (_b = options === null || options === void 0 ? void 0 : options.temperature) !== null && _b !== void 0 ? _b : 0.2
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic chat failed: ${errorText}`);
        }
        const data = await response.json();
        const text = (_e = (_d = (_c = data.content) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text) !== null && _e !== void 0 ? _e : '';
        (_f = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onStart) === null || _f === void 0 ? void 0 : _f.call(callbacks);
        if (text && (callbacks === null || callbacks === void 0 ? void 0 : callbacks.onToken)) {
            for (const chunk of chunkText(text)) {
                callbacks.onToken(chunk);
            }
        }
        (_g = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onComplete) === null || _g === void 0 ? void 0 : _g.call(callbacks, text);
        return text;
    }
}
class LocalProvider {
    async analyzeCode(_prompt) {
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
    async generateFix(_prompt) {
        return '// Local mode - Connect to AI provider for fix suggestions';
    }
    async chat(messages, options, callbacks) {
        var _a, _b;
        const reply = `Local mode placeholder. Provider is offline. Messages received: ${messages.length}`;
        (_a = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onStart) === null || _a === void 0 ? void 0 : _a.call(callbacks);
        if (callbacks === null || callbacks === void 0 ? void 0 : callbacks.onToken) {
            for (const chunk of chunkText(reply)) {
                callbacks.onToken(chunk);
            }
        }
        (_b = callbacks === null || callbacks === void 0 ? void 0 : callbacks.onComplete) === null || _b === void 0 ? void 0 : _b.call(callbacks, reply);
        return reply;
    }
}
class AIService {
    constructor(providerName, apiKey, model) {
        this.providerName = providerName;
        this.apiKey = apiKey;
        this.model = model;
        this.provider = this.createProvider(providerName, apiKey, model);
    }
    createProvider(providerName, apiKey, model) {
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
    async analyzeCode(prompt) {
        try {
            return await this.provider.analyzeCode(prompt);
        }
        catch (error) {
            console.error('AI analysis failed:', error);
            throw error;
        }
    }
    async generateFix(prompt) {
        try {
            return await this.provider.generateFix(prompt);
        }
        catch (error) {
            console.error('Fix generation failed:', error);
            throw error;
        }
    }
    async chat(messages, options, callbacks) {
        try {
            return await this.provider.chat(messages, options, callbacks);
        }
        catch (error) {
            console.error('Chat interaction failed:', error);
            throw error;
        }
    }
    updateConfig(providerName, model, apiKey) {
        this.providerName = providerName;
        this.model = model;
        this.apiKey = apiKey;
        this.provider = this.createProvider(providerName, apiKey, model);
    }
    updateApiKey(apiKey) {
        this.apiKey = apiKey;
        this.provider = this.createProvider(this.providerName, apiKey, this.model);
    }
}
exports.AIService = AIService;
function chunkText(text, chunkSize = 20) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}
