Can you implement the Chat view that I've added so that it does the following.


Here is the bootstrap code for the view

```json
        {
          "id": "codeGuardian.chat",
          "name": "Chat"
        }
```

### Requirements

1. It's a chat UI/UX with chat input and output
2. It's wired to use the provider the user has configured.
3. It saves "chat sessions" 
4. It has two types of chats
   1. User initiated 
      1. Starts new chat session
      2. Is a QA for issues found
      3. Regular stream results
   2. createAIFixAction initiated
      1. Need to implement codeGuardian.generateAIFix
      2. This copys the issue and suggested fix into a new chat session
      3. No user chat input available.
      4. Implements a small agentic workflow that has access to the minimum tools necessary to implement the suggested fix.
         1. read_file()
         2. write_file()
         3. whatever you think is absolutely necessary to make this prototype work.
      5. Should stream progress in the chat window for that chat session. 
      6. needs to have a orchestration agent and whatever other agents you need to create a bare min prototype for this hackathon
         1. that works
         2. uses the provider


### Notes


It's a chat UX/UI.

Wired to the provider and allows the user to 

1. Ask questions about their security issues 
2. Or attempt to resolve the issue. 

It should have access to some tooling to be able to read, and write files to implement the suggested fix.

The idea work flow would be a chant input is displayed if a user starts a chat session it will be classified as a q/a.

If the user selects the fixWithAi then it would initiate an chat session that would copy the issue and suggested fix and attempt to fix it in an agentic manner like codex, claude, or cursor. Asking for users approval when writing to the file.

It should save chat sessions