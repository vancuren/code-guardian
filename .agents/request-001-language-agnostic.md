Can you implement Baseline Enablement

1. Implement isSupported to default to true for text documents, with optional user-configurable allow/deny lists.

2. Expand activation events ("*" or onStartupFinished) and adjust scanWorkspace to enumerate all files respecting ignore globs.

2. Update configuration schema to let users cap analysis to specific languages or file patterns for performance.