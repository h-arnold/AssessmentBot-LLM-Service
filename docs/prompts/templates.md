# Template Management

This guide covers prompt template management. Templates use **Markdown** with **Mustache templating** and are stored as files loaded on-demand during prompt creation.

## Template Types

### System Prompts

**Purpose**: Define LLM behaviour, assessment criteria, and response format
**Location**: `src/prompt/templates/*.system.prompt.md`

System prompts establish assessment methodology, output format (JSON schema), scoring guidelines, and the evaluation process.

### User Prompts

**Purpose**: Structure presentation of task data to the LLM
**Location**: `src/prompt/templates/*.user.prompt.md`

User prompts are rendered with Mustache variables and sent as the user message.

## Template Directory Structure

```
src/prompt/templates/
├── text.system.prompt.md      # Text task assessment criteria
├── text.user.prompt.md        # Text task data presentation
├── table.system.prompt.md     # Table task assessment criteria
├── table.user.prompt.md       # Table task data presentation
└── image.system.prompt.md     # Image task assessment criteria
                               # (No user template - images sent directly)
```

## Available Template Variables

- `{{{referenceTask}}}` - The model/reference solution (unescaped HTML)
- `{{{studentTask}}}` - The student's submission (unescaped HTML)
- `{{{emptyTask}}}` - The original task template (unescaped HTML)

Triple braces `{{{variable}}}` prevent HTML escaping, which is essential for preserving formatting in educational content.

## Template Loading Process

Templates are loaded through the `readMarkdown()` utility:

1. **Security Validation**: Checks filename for path traversal attempts
2. **Path Resolution**: Resolves relative path within templates directory
3. **File Reading**: Loads markdown content from filesystem
4. **Error Handling**: Provides meaningful errors for missing files

### Security Features

- **Path Traversal Protection**: Blocks `..` sequences in filenames
- **File Extension Validation**: Only `.md` files are permitted
- **Directory Restriction**: Files must be within the templates directory
- **Path Canonicalisation**: Prevents symbolic link attacks

## Creating New Templates

1. Create the template file in `src/prompt/templates/` with the appropriate naming convention (`{type}.system.prompt.md` or `{type}.user.prompt.md`)
2. Use Mustache variables for dynamic content insertion
3. Create a corresponding prompt class in `src/prompt/` that loads and renders the template
4. Register the new prompt type in the prompt factory
5. Write tests for template loading and rendering

## Modifying Existing Templates

1. Ensure git is clean before changes
2. Test changes locally using unit tests to verify template behaviour
3. Validate that the LLM still produces valid JSON responses
4. Test related templates if making systematic changes across task types
5. Update this documentation if template semantics change
