import {test, expect, vi, beforeEach} from 'vitest';
import {GetDockerInfo} from '../src/docker';
import {SemVer} from '../src/version';
import type {context} from '@actions/github';
import type * as GitHub from '@actions/github';

type Context = typeof context;

// The real Octokit is used, only its fetch is replaced, so the GitHub API is never called.
const api = vi.hoisted(() => {
  const state = {releases: [] as object[], calls: 0};
  const fetch = async (url: string | URL) => {
    state.calls++;
    const u = new URL(String(url));
    const perPage = Number(u.searchParams.get('per_page') ?? 30);
    const page = Number(u.searchParams.get('page') ?? 1);
    const body = state.releases.slice((page - 1) * perPage, page * perPage);
    const headers: Record<string, string> = {'content-type': 'application/json'};
    if (page * perPage < state.releases.length) {
      u.searchParams.set('page', String(page + 1));
      headers.link = `<${u.toString()}>; rel="next"`;
    }
    return new Response(JSON.stringify(body), {status: 200, headers});
  };
  return {state, fetch};
});

vi.mock('@actions/github', async importOriginal => {
  const actual = await importOriginal<typeof GitHub>();
  return {
    ...actual,
    getOctokit: (token: string, options: object = {}) =>
      actual.getOctokit(token, {...options, request: {fetch: api.fetch}}),
  };
});

function release(tag: string, id: number, prerelease = false) {
  return {id, tag_name: tag, name: tag, draft: false, prerelease};
}

function pushContext(ref: string): Context {
  return {
    action: 'x',
    eventName: 'push',
    sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    ref,
    workflow: 'w',
    actor: 'a',
    job: 'j',
    runNumber: 7,
    runId: 1,
    runAttempt: 1,
    apiUrl: 'https://api.github.com',
    serverUrl: 'https://github.com',
    graphqlUrl: 'https://api.github.com/graphql',
    repo: {owner: 'mapped', repo: 'demo'},
    issue: {owner: 'mapped', repo: 'demo', number: 1},
    payload: {repository: {name: 'demo', owner: {login: 'mapped'}}},
  };
}

async function dockerTags(tag: string) {
  const ctx = pushContext(`refs/tags/${tag}`);
  const ver = await SemVer('v0.0.1', false, new Map(), 'prerelease', ctx);
  const info = await GetDockerInfo('org/img', ver, '', ctx, 'fake-token');
  return info.tags.split(',');
}

// A main-branch build that isn't a pre-release gets its version from the base version
async function mainBranchDockerTags(baseVer: string) {
  const ctx = pushContext('refs/heads/main');
  const ver = await SemVer(baseVer, false, new Map(), 'prerelease', ctx);
  const info = await GetDockerInfo('org/img', ver, '', ctx, 'fake-token');
  return info.tags.split(',');
}

beforeEach(() => {
  api.state.releases = [];
  api.state.calls = 0;
});

test('a hotfix on an older line does not take the latest tag', async () => {
  api.state.releases = [release('v2.1.7', 3), release('v2.1.6', 2), release('v1.2.3', 1)];
  const tags = await dockerTags('v1.2.4');
  expect(api.state.calls).toBeGreaterThan(0);
  expect(tags).toContain('org/img:1.2.4');
  expect(tags).not.toContain('org/img:latest');
});

test('the newest release still gets the latest tag', async () => {
  api.state.releases = [release('v2.1.7', 3), release('v2.1.6', 2), release('v1.2.3', 1)];
  expect(await dockerTags('v2.1.8')).toContain('org/img:latest');
});

test('pre-releases and releases without a SEMVER tag are ignored', async () => {
  api.state.releases = [
    release('v3.0.0-rc.1', 3, true),
    release('nightly', 2),
    release('v2.1.7', 1),
  ];
  expect(await dockerTags('v2.1.8')).toContain('org/img:latest');
});

test('releases past the first page are checked too', async () => {
  // 150 releases, the newer v9.0.0 only shows up on the second page of 100
  api.state.releases = [
    ...Array.from({length: 120}, (_, i) => release(`v1.0.${120 - i}`, 200 - i)),
    release('v9.0.0', 1),
    ...Array.from({length: 29}, (_, i) => release(`v0.9.${29 - i}`, 50 - i)),
  ];
  expect(await dockerTags('v2.0.0')).not.toContain('org/img:latest');
});

test('a draft release with a higher tag does not block latest', async () => {
  api.state.releases = [{...release('v1.0.0', 2), draft: true}, release('v0.0.835', 1)];
  expect(await dockerTags('v0.0.836')).toContain('org/img:latest');
});

test('a main-branch build of the newest version gets latest', async () => {
  api.state.releases = [release('v1.3.0', 2), release('v1.2.9', 1)];
  expect(await mainBranchDockerTags('v1.3.0')).toContain('org/img:latest');
});

test('re-running an older main-branch build does not take latest', async () => {
  api.state.releases = [release('v1.4.0', 3), release('v1.3.0', 2), release('v1.2.9', 1)];
  const tags = await mainBranchDockerTags('v1.3.0');
  expect(tags).toContain('org/img:1.3.0');
  expect(tags).not.toContain('org/img:latest');
});
