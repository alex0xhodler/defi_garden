#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const x402 = require('./x402-core.js');
const mcp = require('./mcp-core.js');

const ROUTE_REGION_BEGIN = '<!-- BEGIN GENERATED PRICING ROUTES -->';
const ROUTE_REGION_END = '<!-- END GENERATED PRICING ROUTES -->';
const TOOL_REGION_BEGIN = '<!-- BEGIN GENERATED MCP PRICING -->';
const TOOL_REGION_END = '<!-- END GENERATED MCP PRICING -->';

function replaceGeneratedRegion(source, begin, end, body, file) {
  const beginCount = source.split(begin).length - 1;
  const endCount = source.split(end).length - 1;
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(`${file}: expected exactly one ${begin} and ${end} marker`);
  }
  const start = source.indexOf(begin) + begin.length;
  const finish = source.indexOf(end);
  if (finish < start) throw new Error(`${file}: generated-region end marker precedes begin marker`);
  return source.slice(0, start) + '\n' + body + '\n' + source.slice(finish);
}

function updateFile(file, begin, end, body) {
  const source = fs.readFileSync(file, 'utf8');
  const generated = replaceGeneratedRegion(source, begin, end, body, file);
  if (generated !== source) fs.writeFileSync(file, generated);
}

function generatePricingDocs(edgeDir) {
  const root = edgeDir || __dirname;
  const routeBody = x402.buildRouteBoundaryMarkdown();
  const toolBody = x402.buildToolBoundaryMarkdown(mcp.TOOLS);
  for (const file of ['X402.md', 'API.md']) {
    updateFile(path.join(root, file), ROUTE_REGION_BEGIN, ROUTE_REGION_END, routeBody);
  }
  updateFile(path.join(root, 'MCP.md'), TOOL_REGION_BEGIN, TOOL_REGION_END, toolBody);
}

if (require.main === module) {
  generatePricingDocs();
  console.log('Generated pricing boundary regions in edge/X402.md, edge/API.md, and edge/MCP.md');
}

module.exports = {
  ROUTE_REGION_BEGIN,
  ROUTE_REGION_END,
  TOOL_REGION_BEGIN,
  TOOL_REGION_END,
  replaceGeneratedRegion,
  generatePricingDocs,
};
