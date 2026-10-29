import {test, expect, vi, beforeEach} from 'vitest';
import {CreateReleaseTag} from '../src/releasetag/createreleasetag';
import type {CommitInfo, TagInfo} from '../src/releasetag/githubclient';
import type {context} from '@actions/github';

type Context = typeof context;

function generateContext(branch = 'main'): Context {
  const ctx: Context = {
    action: 'mapped/action-vtl',
    eventName: 'push',
    sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    ref: `refs/heads/${branch}`,
    workflow: 'build-test',
    actor: 'somedeveloper',
    job: 'somejob',
    runNumber: 17,
    runId: 262999999,
    runAttempt: 1,
    apiUrl: 'https://test.test.test',
    serverUrl: 'https://test.test.test',
    graphqlUrl: 'https://test.test.test',
    repo: {
      owner: 'mapped',
      repo: 'action-vtl',
    },
    issue: {
      repo: 'action-vtl',
      number: 310,
      owner: 'somesubmitter',
    },
    payload: {
      repository: {
        name: 'action-vtl',
        owner: {
          login: 'mapped',
        },
      },
    },
  };

  return ctx;
}

let tags = [{name: 'v1.2.3', sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf'}];

let commits = [
  {message: 'fix: Fix exception during startup', sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf'},
];

let pullRequestTitles: Record<string, string[]> = {};
let pullRequestTitlesError: Error | null = null;
let pullRequestTitlesCalls = 0;

const createTagMock = vi.fn();

vi.mock('../src/releasetag/githubclient', () => {
  return {
    GitHubClient: class {
      async getTags(): Promise<TagInfo[]> {
        return tags.map(x => {
          return {
            name: x.name,
            commit: {
              sha: x.sha,
            },
          };
        });
      }
      async getCommits(): Promise<CommitInfo[]> {
        return commits.map(x => {
          return {
            commit: {
              message: x.message,
            },
            sha: x.sha,
          };
        });
      }
      async getPullRequestTitles(commitSha: string): Promise<string[]> {
        pullRequestTitlesCalls++;
        if (pullRequestTitlesError) {
          throw pullRequestTitlesError;
        }
        return pullRequestTitles[commitSha] ?? [];
      }
      createTag = createTagMock;
    },
  };
});

beforeEach(() => {
  createTagMock.mockClear();
  pullRequestTitles = {};
  pullRequestTitlesError = null;
  pullRequestTitlesCalls = 0;
});

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), {status});
}

test('fall back to commit messages when pull requests are not accessible', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {message: 'feat: New API', sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf'},
    {message: 'fix: Small fix', sha: '1111111111111111111111111111111111111111'},
    {message: 'feat: Previous release commit', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'},
  ];
  pullRequestTitlesError = httpError(403, 'Resource not accessible by integration');

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.6.0');
  expect(createTagMock.mock.calls[0][0]).toBe('v3.6.0');
  expect(pullRequestTitlesCalls).toBe(1);
});

test('fail when pull request lookup fails for other reasons', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {message: 'fix: Small fix', sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf'},
    {message: 'feat: Previous release commit', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'},
  ];
  pullRequestTitlesError = httpError(500, 'Server error');

  await expect(
    CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false),
  ).rejects.toThrow('Server error');
  expect(createTagMock).not.toHaveBeenCalled();
});

test('create first release', async () => {
  const baseVer = '2.1.0';

  tags = [];

  commits = [
    {
      message: 'feat: Initial commit',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v2.1.0');
  expect(res.previousReleaseTag.toString()).toBe('v2.1.0');
  expect(res.getBaseVersionOverride()).toBe('v2.1.0');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v2.1.0');
});

test('create patch release', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];

  commits = [
    {
      message: 'fix: Color glitch',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'feat: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.10');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.5.10');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v3.5.10');
});

test('create minor release', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];

  commits = [
    {
      message: 'feat: Add new browsing panel',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'feat!: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.6.0');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.6.0');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v3.6.0');
});

test('create minor release for a feature PR title with only fix commits', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];

  commits = [
    {
      message: 'fix: Add API support',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];
  pullRequestTitles = {
    a8cb3d0eae1f1a064896493f4cf63dafc17bafcf: ['feat: Add support for creating API keys'],
  };

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.6.0');
  expect(createTagMock.mock.calls[0][0]).toBe('v3.6.0');
});

test('create major release for a breaking PR title', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {
      message: 'fix: Update API handling',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];
  pullRequestTitles = {
    a8cb3d0eae1f1a064896493f4cf63dafc17bafcf: ['feat!: Replace the public API'],
  };

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v4.0.0');
  expect(createTagMock.mock.calls[0][0]).toBe('v4.0.0');
});

test('create minor release for a squashed feature commit under a fix PR title', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {
      message:
        'fix: Improve API handling (#42)\n\n* fix: Handle empty responses\n\n* feat(api): Add pagination\n\n* fix: Typo\n\nCo-authored-by: Someone <someone@example.com>',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];
  pullRequestTitles = {
    a8cb3d0eae1f1a064896493f4cf63dafc17bafcf: ['fix: Improve API handling'],
  };

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.6.0');
});

test('create major release for a squashed breaking commit under a fix PR title', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {
      message:
        'fix: Improve API handling (#42)\n\n* fix: Handle empty responses\n\n* refactor(api)!: Drop v1 endpoints',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false);

  expect(res.createdReleaseTag?.toString()).toBe('v4.0.0');
});

test('ignore body lines that are not conventional commits', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {
      message: 'fix: Improve API handling\n\nThis is not a feat: just a description\n* Update docs',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.10');
});

test('treat lines before the first blank line as part of the subject', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {
      message: 'fix: Improve API handling\nfeat: continuation of the subject',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.10');
});

test('create minor release for a scoped feature title', async () => {
  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];
  commits = [
    {
      message: 'feat(storage): Add Redis lock monitor',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', '1.0.0', false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.6.0');
});

test('create major release', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];

  commits = [
    {
      message: 'feat(#taskid)!: Add new browsing panel',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Remove startup error',
      sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v4.0.0');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v4.0.0');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v4.0.0');
});

test('create major for breaking change', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3'}];

  commits = [
    {
      message: 'feat(#taskid): Add new browsing panel\nBREAKING CHANGE: Switch to APIv2.0',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Remove startup error',
      sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v4.0.0');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v4.0.0');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v4.0.0');
});

test('do not create major for breaking change in wrong format', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3'}];

  commits = [
    {
      message:
        'fix: Add new browsing panel.\nWe will do breaking change: switch to next API, but in the next release', // Wrong case
      sha: 'bbcb3d0aae1f1a064896493f4cf63dafc1799999',
    },
    {
      message: 'fix: Add new browsing panel\nBREAKING CHANGE is good but not here', // No colon
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Remove startup error',
      sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.10');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.5.10');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v3.5.10');
});

test('rerun for already created release', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf'}];

  commits = [
    {
      message: 'feat(#taskid)!: New but already processed release commit',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Remove startup error',
      sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.9');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.5.9');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(0);
});

test('rerun for already created release with forced patch creation', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf'}];

  commits = [
    {
      message: 'feat(#taskid)!: New but already processed release commit',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Remove startup error',
      sha: '626efe378fc93eabf78a99b8ff1d70bb7dcc68a3',
    },
  ];

  const forceIncrementPatchIfNoChanges = true;
  const res = await CreateReleaseTag(
    generateContext(),
    'token',
    'main',
    baseVer,
    forceIncrementPatchIfNoChanges,
  );

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.10');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.5.10');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v3.5.10');
});

test('commits in other branch', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];

  commits = [
    {
      message: 'feat(#taskid)!: Add new browsing panel',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'fix: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  const res = await CreateReleaseTag(
    generateContext('feature/add-tittle'),
    'token',
    'main',
    baseVer,
    false,
  );

  expect(res.createdReleaseTag).toBeNull();
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.5.9');
  expect(res.isPrerelease()).toBeTruthy();
  expect(createTagMock.mock.calls.length).toBe(0);
});

test('github api returns already exists error while creating tag', async () => {
  const baseVer = '1.0.0';

  tags = [{name: 'v3.5.9', sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010'}];

  commits = [
    {
      message: 'fix: Color glitch',
      sha: 'a8cb3d0eae1f1a064896493f4cf63dafc17bafcf',
    },
    {
      message: 'feat: Previous release commit',
      sha: '0869c0d9638268ffbd1e03974ab0cdd07070c010',
    },
  ];

  // Simulate github api returning already exists error.
  // We should ignore this error and continue.
  createTagMock.mockImplementationOnce(() => {
    throw new Error('Reference already exists');
  });

  const res = await CreateReleaseTag(generateContext(), 'token', 'main', baseVer, false);

  expect(res.createdReleaseTag?.toString()).toBe('v3.5.10');
  expect(res.previousReleaseTag.toString()).toBe('v3.5.9');
  expect(res.getBaseVersionOverride()).toBe('v3.5.10');
  expect(res.isPrerelease()).toBeFalsy();
  expect(createTagMock.mock.calls.length).toBe(1);
  expect(createTagMock.mock.calls[0][0]).toBe('v3.5.10');
});
