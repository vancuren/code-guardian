Can you implement the Chat window so that: 

It's a chat UX/UI.

Wired to the provider and allows the user to 

1. Ask questions about their security issues 
2. Or attempt to resolve the issue. 

It should have access to some tooling to be able to read, and write files to implement the suggested fix.

The idea work flow would be a chant input is displayed if a user starts a chat session it will be classified as a q/a.

If the user selects the fixWithAi then it would initiate an chat session that would copy the issue and suggested fix and attempt to fix it in an agentic manner like codex, claude, or cursor. Asking for users approval when writing to the file.

It should save chat sessions