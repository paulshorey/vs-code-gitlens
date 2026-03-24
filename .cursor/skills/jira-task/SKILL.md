---
name: jira-task
description: When user asks about a Jira task, pastes a URL to one such as https://firstam.atlassian.net/browse/AW-1091, or whenever you notice a task mentioned in a PR pull request such as AW-123 or fix(AW-123) - use this skill to read the full contents of that Jira ticket.
---

# Fetch Jira Task using Atlassian MCP server

## Extract the issue key

Parse the issue key from whatever the user provided:

- From a URL like `https://firstam.atlassian.net/browse/AW-982` → extract `AW-982`
- From a PR title or description, extract text like "AW-123" → use `AW-123`
- The key always matches the pattern `^[A-Z][A-Z0-9_]+-\d+$`

## Fetch the issue

Call the `jira_get_issue` tool on the `user-atlassian` MCP server:

```json
{
	"server": "user-atlassian",
	"toolName": "jira_get_issue",
	"arguments": {
		"issue_key": "<ISSUE_KEY>",
		"fields": "summary,description,status,assignee,reporter,priority,labels,created,updated,issuetype,comment",
		"comment_limit": 100,
		"update_history": false
	}
}
```

### Key parameters

- `fields`: `"summary,description,status,assignee,reporter,priority,labels,created,updated,issuetype,comment"` — returns all essential fields including description and comments. Use `"*all"` only if you need custom fields.
- `comment_limit`: `100` — default is 10 which may miss comments. Set to 100 to get the full conversation.
- `update_history`: `false` — avoids polluting the user's "recently viewed" list in Jira.

## Understand the response format

The response is a JSON object with these relevant fields:

- `key` — the issue key (e.g. `AW-982`)
- `summary` — the issue title
- `description` — the full description body in **Jira wiki/markdown markup** (not rendered HTML)
- `comments` — an array of comment objects, each containing:
  - `id` — comment ID
  - `body` — the comment body in Jira wiki/markdown markup
  - `author.display_name` — commenter's name
  - `author.email` — commenter's email
  - `created` — ISO timestamp
  - `updated` — ISO timestamp

### Markup quirks to be aware of

- Bold text appears as `\*\*text\*\*` (escaped asterisks)
- Horizontal rules are `----`
- User mentions appear as raw `User:712020:<uuid>` tokens, not resolved names
- Attachments/images use Jira wiki syntax: `!filename.mov|width=544,alt="..."!`
- Links use standard markdown: `[text](url)`

## Present the results if asked

### If the user asked for the Jira task:

Show the summary, description, and all comments with author/date metadata. Present the description and comment bodies verbatim in code blocks unless the user asks for a summary.

### Even if user did not ask - if you only noticed a Jira item mentioned in a pull request or some other supporting content:

Always fetch the Jira content in this way. Remember this returned description and comments markdown in your context when reviewing a PR or when working on a coding task.
