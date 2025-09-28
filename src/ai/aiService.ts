interface AIProvider {
    analyzeCode(prompt: string): Promise<string>;
    generateFix(prompt: string): Promise<string>;
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
                temperature: 0.1,
                max_tokens: 1500
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
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
