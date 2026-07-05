# Template Management

This guide covers the management of prompt templates in the Assessment Bot LLM Service system. Templates are crucial for maintaining consistent and effective LLM interactions whilst allowing for customisation across different task types.

## Template Overview

The prompt system uses **Markdown templates** with **Mustache templating** to create dynamic, type-specific prompts. Templates are stored as files in the filesystem and loaded on-demand during prompt creation.

## Template Types

### System Prompts

**Purpose**: Define LLM behaviour, assessment criteria, and response format
**Location**: `src/prompt/templates/*.system.prompt.md`
**Usage**: Loaded once per prompt and passed to LLM as system context

System prompts establish:

- Assessment methodology and criteria
- Expected output format (JSON schema)
- Scoring guidelines and examples
- Step-by-step evaluation process

### User Prompts

**Purpose**: Structure the presentation of task data to the LLM
**Location**: `src/prompt/templates/*.user.prompt.md`
**Usage**: Rendered with Mustache variables and sent as user message

User prompts contain:

- Template structure for data presentation
- Mustache variables for dynamic content insertion
- Context labels and formatting

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

User prompt templates can use these Mustache variables:

### Core Variables

- `{{{referenceTask}}}` - The model/reference solution (unescaped HTML)
- `{{{studentTask}}}` - The student's submission (unescaped HTML)
- `{{{emptyTask}}}` - The original task template (unescaped HTML)

**Note**: Triple braces `{{{variable}}}` prevent HTML escaping, which is essential for preserving formatting in educational content.

## Template Loading Process

Templates are loaded through the `readMarkdown()` utility function:

1. **Security Validation**: Checks filename for path traversal attempts
2. **Path Resolution**: Resolves relative path within templates directory
3. **File Reading**: Loads markdown content from filesystem
4. **Error Handling**: Provides meaningful errors for missing files

```typescript
// In prompt.factory.ts
const systemPrompt = await readMarkdown(systemPromptFile);
```

### Security Features

- **Path Traversal Protection**: Blocks `..` sequences in filenames
- **File Extension Validation**: Only `.md` files are permitted
- **Directory Restriction**: Files must be within the templates directory
- **Path Canonicalisation**: Prevents symbolic link attacks

## Creating New Templates

### System Prompt Template Structure

Follow this structure for new system prompts:

````markdown
# Task

Brief description of the assessment approach.

## Step 1: Understanding the Task

Instructions for identifying what the student was asked to do.

## Step 2: Content Analysis

Instructions for analysing the student's work.

## Step 3: Scoring Criteria

Detailed scoring guidelines for each assessment dimension:

### 1. **Criterion Name** (0-5):

- Score 0 conditions
- Score 5 conditions
- Additional guidance

## Step 4: Reasoning

Instructions for providing brief reasoning.

## Step 5: Output Format

Specify exact JSON structure expected:

```json
{
    "criterion1": {
        "score": {score},
        "reasoning": "{reasoning}"
    },
    "criterion2": {
        "score": {score},
        "reasoning": "{reasoning}"
    }
}
```
````

## Examples

Provide concrete examples of different score levels.

## Important Notes

- Key constraints and requirements
- Special handling instructions

### User Prompt Template Structure

Follow this structure for new user prompts:

```markdown
## Reference Task

### This task would score 5 across all criteria

{{{referenceTask}}}

## Template Task

### This task would score 0 across all criteria

{{{emptyTask}}}

## Student Task

### This is the task you are assessing

{{{studentTask}}}
```

## Template Maintenance

### Version Control

- **Git Tracking**: All templates are version controlled
- **Change Documentation**: Document template changes in commit messages
- **Rollback Capability**: Previous versions available through git history

### Validation

- **Syntax Checking**: Ensure valid Markdown syntax
- **Variable Verification**: Confirm all Mustache variables are correctly formatted
- **Testing**: Test templates with sample data before deployment

### Performance Considerations

- **File Size**: Keep templates concise whilst comprehensive
- **Loading Frequency**: Templates loaded on each prompt creation (consider caching for high-volume usage)
- **Encoding**: All templates use UTF-8 encoding

## Modifying Existing Templates

### Safe Modification Process

1. **Backup Current Version**: Ensure git is clean before changes
2. **Test Changes Locally**: Use unit tests to verify template behaviour
3. **Validate JSON Output**: Ensure LLM still produces valid JSON responses
4. **Check All Task Types**: Test related templates if making systematic changes
5. **Document Changes**: Update documentation if template semantics change

### Common Modifications

#### Adding New Assessment Criteria

```markdown
### 3. **New Criterion** (0-5):

- Score 0 if condition not met
- Score 5 if condition fully met
- Intermediate scoring guidance
```

Then update the JSON output structure:

```json
{
  "existingCriterion": {...},
  "newCriterion": {
    "score": {score},
    "reasoning": "{reasoning}"
  }
}
```

#### Modifying Scoring Guidelines

- **Clarity**: Ensure scoring levels are clearly distinguished
- **Consistency**: Maintain scoring philosophy across criteria
- **Examples**: Update examples to reflect new guidelines

## Template Testing

### Unit Testing

Each prompt class tests template loading and rendering:

```typescript
describe('Template Loading', () => {
  it('should load system prompt template', async () => {
    const prompt = new TextPrompt(validInput, logger);
    const message = await prompt.buildMessage();

    expect(message.system).toBeDefined();
    expect(message.system.length).toBeGreaterThan(0);
  });
});
```

### Integration Testing

End-to-end tests validate complete template functionality:

```typescript
it('should render user template with variables', async () => {
  const prompt = new TextPrompt(validInput, logger);
  const message = await prompt.buildMessage();

  expect(message.user).toContain(validInput.referenceTask);
  expect(message.user).toContain(validInput.studentTask);
  expect(message.user).toContain(validInput.emptyTask);
});
```

### Manual Validation

For major template changes:

1. **Sample Assessment**: Run assessments with known good/bad examples
2. **JSON Validation**: Verify LLM produces parseable JSON responses
3. **Score Consistency**: Check that similar inputs produce similar scores
4. **Edge Case Testing**: Test with empty, minimal, and maximal content

## Error Handling

### Common Template Errors

#### Missing Template Files

```
Error: Invalid markdown filename
```

**Solution**: Ensure template file exists in `src/prompt/templates/`

#### Path Traversal Attempts

```
Error: Invalid markdown filename
```

**Solution**: Remove `..` sequences from filename

#### Unauthorised File Access

```
Error: Unauthorised file path
```

**Solution**: Ensure file is within the templates directory

#### Mustache Rendering Errors

- **Missing Variables**: Undefined template variables render as empty strings
- **Malformed Syntax**: Invalid Mustache syntax causes rendering failures

### Template Recovery

If templates become corrupted or missing:

1. **Git Recovery**: Restore from version control

   ```bash
   git checkout HEAD -- src/prompt/templates/filename.md
   ```

2. **Backup Templates**: Maintain known-good template versions
3. **Default Fallbacks**: Consider implementing fallback templates for critical paths

## Best Practices

### Template Design

- **Clarity**: Use clear, unambiguous language for assessment criteria
- **Consistency**: Maintain consistent terminology across templates
- **Completeness**: Include all necessary context for fair assessment
- **Brevity**: Be comprehensive but avoid unnecessary verbosity

### Maintenance

- **Regular Review**: Periodically review templates for effectiveness
- **User Feedback**: Incorporate feedback from assessment results
- **Documentation**: Keep template documentation current
- **Testing**: Maintain comprehensive test coverage

### Security

- **Input Validation**: Never bypass template security measures
- **File Permissions**: Ensure appropriate filesystem permissions
- **Content Sanitisation**: Be cautious with user-provided template content

This comprehensive approach to template management ensures reliable, secure, and maintainable prompt generation across all assessment task types.
