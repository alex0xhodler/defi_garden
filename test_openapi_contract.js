'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const apiCore = require(path.join(ROOT, 'edge', 'api-core.js'));
const openapi = JSON.parse(fs.readFileSync(path.join(ROOT, 'openapi.json'), 'utf8'));
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

const serverPath = new URL(openapi.servers[0].url).pathname.replace(/\/$/, '');
function publicPath(routeId) {
  assert.ok(routeId === serverPath || routeId.startsWith(serverPath + '/'),
    `runtime route ${routeId} is outside OpenAPI server prefix ${serverPath}`);
  return (routeId.slice(serverPath.length) || '/').replace(/:([^/]+)/g, '{$1}');
}
function operationKey(method, routePath) { return `${method.toUpperCase()} ${routePath}`; }

const runtimeOperations = new Set(apiCore.ROUTES.map((route) => operationKey(route.method, publicPath(route.id))));
const openapiOperations = new Set(Object.entries(openapi.paths).flatMap(([routePath, pathItem]) =>
  Object.keys(pathItem).filter((key) => HTTP_METHODS.has(key.toLowerCase()))
    .map((method) => operationKey(method, routePath))));
const runtimeOnly = [...runtimeOperations].filter((key) => !openapiOperations.has(key)).sort();
const openapiOnly = [...openapiOperations].filter((key) => !runtimeOperations.has(key)).sort();
assert.deepStrictEqual({ runtimeOnly, openapiOnly }, { runtimeOnly: [], openapiOnly: [] },
  `OpenAPI/runtime operation drift\nruntime-only: ${JSON.stringify(runtimeOnly)}\nOpenAPI-only: ${JSON.stringify(openapiOnly)}`);

function dereference(schema) {
  let current = schema;
  while (current && current.$ref) {
    assert.ok(current.$ref.startsWith('#/'), `only local schema refs are supported: ${current.$ref}`);
    current = current.$ref.slice(2).split('/').reduce((node, part) =>
      node[part.replace(/~1/g, '/').replace(/~0/g, '~')], openapi);
  }
  return current;
}
function accepts(value, schema) {
  try { validate(value, schema, '$'); return true; } catch (_error) { return false; }
}
function validate(value, rawSchema, at) {
  const schema = dereference(rawSchema);
  assert.notStrictEqual(schema, false, `${at} is rejected by its schema`);
  if (schema === true) return;
  assert.ok(schema && typeof schema === 'object', `${at} has no response schema`);
  if (schema.nullable && value === null) return;
  if (schema.allOf) schema.allOf.forEach((part) => validate(value, part, at));
  if (schema.anyOf) assert.ok(schema.anyOf.some((part) => accepts(value, part)), `${at} matches no anyOf branch`);
  if (schema.oneOf) assert.strictEqual(schema.oneOf.filter((part) => accepts(value, part)).length, 1,
    `${at} must match exactly one oneOf branch`);
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) assert.deepStrictEqual(value, schema.const, `${at} violates const`);
  if (schema.enum) assert.ok(schema.enum.some((candidate) => Object.is(candidate, value)), `${at} is outside enum`);

  const checks = {
    null: (v) => v === null,
    boolean: (v) => typeof v === 'boolean',
    string: (v) => typeof v === 'string',
    number: (v) => typeof v === 'number' && Number.isFinite(v),
    integer: (v) => Number.isInteger(v),
    array: Array.isArray,
    object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  };
  const types = schema.type === undefined ? [] : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types.length) assert.ok(types.some((type) => checks[type] && checks[type](value)),
    `${at} expected ${types.join('|')}, got ${value === null ? 'null' : typeof value}`);

  if (typeof value === 'number') {
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${at} is below minimum`);
    if (schema.maximum !== undefined) assert.ok(value <= schema.maximum, `${at} is above maximum`);
  }
  if (typeof value === 'string' && schema.pattern) assert.match(value, new RegExp(schema.pattern), `${at} violates pattern`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${at} has too few items`);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems, `${at} has too many items`);
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, `${at}[${index}]`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    (schema.required || []).forEach((name) => assert.ok(Object.prototype.hasOwnProperty.call(value, name),
      `${at} is missing required property ${name}`));
    const properties = schema.properties || {};
    Object.keys(properties).filter((name) => Object.prototype.hasOwnProperty.call(value, name))
      .forEach((name) => validate(value[name], properties[name], `${at}.${name}`));
    const extras = Object.keys(value).filter((name) => !Object.prototype.hasOwnProperty.call(properties, name));
    if (schema.additionalProperties === false) assert.deepStrictEqual(extras, [], `${at} has undeclared properties`);
    else if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
      extras.forEach((name) => validate(value[name], schema.additionalProperties, `${at}.${name}`));
  }
}

function responseSchema(route, status) {
  const operation = openapi.paths[publicPath(route.id)][route.method.toLowerCase()];
  const response = operation.responses[String(status)];
  assert.ok(response, `${route.method} ${publicPath(route.id)} does not declare response ${status}`);
  const media = response.content && response.content['application/json'];
  assert.ok(media && media.schema, `${route.method} ${publicPath(route.id)} response ${status} has no JSON schema`);
  return media.schema;
}
function sample(pathname, query) {
  const routeId = apiCore.matchRouteId(pathname);
  const route = apiCore.ROUTES.find((candidate) => candidate.id === routeId);
  assert.ok(route, `sample path ${pathname} must resolve through the runtime route table`);
  const result = apiCore.handleApiRequest({
    pathname,
    searchParams: new URLSearchParams(query || ''),
    pools: [POOL],
    pricing: { enabled: false, mode: 'test' },
  });
  return { route, result };
}

const POOL = { pool: 'schema-pool', chain: 'Ethereum', project: 'schema-project', symbol: 'USDC', tvlUsd: 1000000, apyBase: 5 };
const samples = [
  sample('/api'),
  sample('/api/health'),
  sample('/api/pools', 'token=USDC&limit=1'),
  sample('/api/pools/schema-pool'),
  sample('/api/pools/missing'),
  sample('/api/forever-number', 'monthly=20&apy=5'),
  sample('/api/forever-number', 'monthly=20&apy=0'),
  sample('/api/forever-number'),
  sample('/api/pricing'),
];
assert.strictEqual(samples[2].result.body.pools[0].apyReward, null, 'fixture must exercise nullable pool fields');
assert.strictEqual(samples[3].result.body.reason, null, 'fixture must exercise nullable path-response fields');
assert.strictEqual(samples[6].result.body.foreverNumber, null, 'fixture must exercise nullable forever-number fields');
assert.strictEqual(samples[8].result.body.availability.enabled, false, 'pricing sample must remain dark');
for (const { route, result } of samples) {
  validate(JSON.parse(JSON.stringify(result.body)), responseSchema(route, result.status), `${route.method} ${publicPath(route.id)} ${result.status}`);
}

console.log(`test_openapi_contract.js: ${samples.length} real handler payloads conform to the drift-free OpenAPI contract`);
