import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  stderr: 'pipe',
});

const client = new Client(
  { name: 'tool-surface-test', version: '1.0.0' },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);

  assert.equal(tools.length, 9, `expected 9 registered tools, received ${tools.length}`);
  assert.equal(new Set(names).size, tools.length, 'tool names must be unique');

  for (const required of [
    'raycast_search',
    'raycast_open',
    'raycast_clipboard',
    'raycast_shortcut',
    'raycast_window',
    'raycast_system',
    'raycast_auth',
    'raycast_extensions',
    'raycast_workflows',
  ]) {
    assert.ok(names.includes(required), `missing required tool: ${required}`);
  }

  for (const tool of tools) {
    assert.ok(tool.description?.trim(), `${tool.name} must have a description`);
    assert.equal(tool.inputSchema?.type, 'object', `${tool.name} must expose an object input schema`);
  }

  console.log('Verified 9 unique Raycast tools and their schemas.');
} finally {
  await client.close();
}
