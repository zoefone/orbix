/**
 * Unified MCP bridge setup for Codex local and remote modes.
 *
 * This module provides a single source of truth for starting the orbix MCP
 * bridge server and generating the MCP server configuration that Codex needs.
 */

import { startHappyServer } from '@/claude/utils/startHappyServer';
import { getHappyCliCommand } from '@/utils/spawnHappyCLI';
import type { ApiSessionClient } from '@/api/apiSession';

/**
 * MCP server entry configuration.
 */
export type McpToolApprovalMode = 'auto' | 'prompt' | 'approve';

export interface McpServerToolConfig {
    approval_mode?: McpToolApprovalMode;
}

export interface McpServerEntry {
    command: string;
    args: string[];
    tools?: Record<string, McpServerToolConfig>;
}

/**
 * Map of MCP server names to their configurations.
 */
export type McpServersConfig = Record<string, McpServerEntry>;

/**
 * Result of starting the orbix MCP bridge.
 */
export interface OrbixMcpBridge {
    /** The running server instance */
    server: {
        url: string;
        stop: () => void;
    };
    /** MCP server config to pass to Codex (works for both CLI and SDK) */
    mcpServers: McpServersConfig;
}

export interface OrbixMcpBridgeOptions {
    emitTitleSummary?: boolean;
}

/**
 * Start the orbix MCP bridge server and return the configuration
 * needed to connect Codex to it.
 *
 * This is the single source of truth for MCP bridge setup,
 * used by both local and remote launchers.
 */
export async function buildOrbixMcpBridge(
    client: ApiSessionClient,
    options: OrbixMcpBridgeOptions = {}
): Promise<OrbixMcpBridge> {
    const happyServer = await startHappyServer(client, {
        emitTitleSummary: options.emitTitleSummary
    });
    const bridgeCommand = getHappyCliCommand(['mcp', '--url', happyServer.url]);

    return {
        server: {
            url: happyServer.url,
            stop: happyServer.stop
        },
        mcpServers: {
            orbix: {
                command: bridgeCommand.command,
                args: bridgeCommand.args,
                tools: {
                    change_title: {
                        approval_mode: 'approve'
                    }
                }
            }
        }
    };
}
