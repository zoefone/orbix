/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the orbix__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';

/**
 * Title instruction for Codex to call the orbix MCP tool.
 * Note: Codex exposes MCP tools under the `functions.` namespace,
 * so the tool is called as `functions.orbix__change_title`.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    Use the title tool sparingly. For a new chat, call it once after the user's initial request is clear, and set a concise task title.
    Prefer calling functions.orbix__change_title.
    If that exact tool name is unavailable, call an equivalent alias such as orbix__change_title, mcp__orbix__change_title, or orbix_change_title.
    Do not rename the chat for routine progress, substeps, implementation details, or a slightly better wording.
    Rename only when the user's primary objective changes substantially and the existing title would be misleading.
    When you create or find a local image file that the user should see, call functions.orbix__display_image with the image path. If that exact tool name is unavailable, use an equivalent alias such as orbix__display_image, mcp__orbix__display_image, or orbix_display_image.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 */
export const codexSystemPrompt = TITLE_INSTRUCTION;
