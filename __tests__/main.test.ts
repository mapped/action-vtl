import { SemVer } from '../src/version'
import { Context } from '@actions/github/lib/context';
import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

// Some generic good values
const goodBaseVer = ["1.2.3", "0.1.0-alpha", "5.4.3-beta.7", "9.6.1-something.bla.bla+something.else-here"];
const goodMappings: Map<string, string> = new Map([["main", "edge"]]);
const goodPrefix = ["prerelease", "", "beta"];
const goodRunNo = [23, 17]
const goodSha = "a8cb3d0eae1f1a064896493f4cf63dafc17bafcf";
const goodRefAndEvent = [
  { event: "push", ref: "refs/heads/main" },
  { event: "pull_request", ref: "refs/pull/37/merge" },
  { event: "push", ref: "refs/heads/my-working-branch" },
  { event: "push", ref: "refs/heads/my/branch" },
  { event: "push", ref: "refs/heads/dev" },
  { event: "push tag", ref: "refs/tags/v1.3.5" },
  { event: "push tag", ref: "refs/tags/v2.4.6-beta.2" },
  { event: "schedule", ref: "" },
];

const goodSha8 = goodSha.substring(0, 8);

function generateContext(runNoIdx: number, refIdx: number): Context {
  let ctx: Context = {
    action: "mapped/action-vtl",
    eventName: goodRefAndEvent[refIdx].event,
    sha: goodSha,
    ref: goodRefAndEvent[refIdx].ref,
    workflow: "CI.yml",
    actor: "somedeveloper",
    job: "build-test-job",
    runNumber: goodRunNo[runNoIdx],
    runId: 99,
    repo: {
      owner: "mapped",
      repo: "action-vtl"
    },
    issue: {
      repo: "action-vtl",
      number: 310,
      owner: "somesubmitter"
    },
    payload: {}
  };

  // TODO: Add the payload repo

  // TODO: Add the event specific payload
  switch (ctx.eventName) {
    case "push":
      {
        break;
      }
    case "push tag":
      {
        break;
      }
    case "pull_request":
      {
        break;
      }
    case "schedule":
      {
        break;
      }
  }

  return ctx;
}

test('invalid semver', async () => {
  const inputs = ["1a.2.3", "1.2.3.4"]
  for (const input of inputs) {
    const expected = `base-version of "${input}" is not a valid SEMVER`;
    await expect(SemVer(input, goodMappings, goodPrefix[0], generateContext(0, 0))).rejects.toThrow(expected)
  }
})

test('bad tag semver', async () => {
  const inputs = ["refs/tags/1.3.5v", "refs/tags/a1.3.5", "refs/tags/V1.3.5.7", "refs/tags/v2.4a.6"];
  for (const input of inputs) {
    let ctx = generateContext(0, 5);
    ctx.ref = input;
    const expected = `Tag of "${input.split('/').pop()}" is not a valid SEMVER`;
    await expect(SemVer(goodBaseVer[0], goodMappings, goodPrefix[0], ctx)).rejects.toThrow(expected)
  }
})

test('push on mapped branch', async () => {
  await expect(SemVer(goodBaseVer[0], goodMappings, goodPrefix[0], generateContext(0, 0))).resolves.toMatchObject({
    major: 1,
    minor: 2,
    patch: 3,
    preRelease: goodPrefix[0] + "." + goodRunNo[0],
    build: expect.stringContaining(goodSha8),
    tag: "edge",
    semVer: expect.stringMatching(new RegExp(goodBaseVer[0] + "-" + goodPrefix[0] + "." + goodRunNo[0] + "\+.*\." + goodSha8))
  });
})

test('push on unmapped branch', async () => {
  await expect(SemVer(goodBaseVer[3], goodMappings, goodPrefix[1], generateContext(1, 2))).resolves.toMatchObject({
    major: 9,
    minor: 6,
    patch: 1,
    preRelease: "" + goodRunNo[1],
    build: expect.stringContaining(goodSha8),
    tag: goodRefAndEvent[2].ref.split('/').pop(),
    semVer: expect.stringMatching(new RegExp("9.6.1-" + goodRunNo[1] + "\+.*\." + goodSha8))
  });
})

test('tag 1', async () => {
  await expect(SemVer(goodBaseVer[0], goodMappings, goodPrefix[1], generateContext(0, 5))).resolves.toMatchObject({
    major: 1,
    minor: 3,
    patch: 5,
    preRelease: "",
    build: expect.stringContaining(goodSha8),
    tag: goodRefAndEvent[5].ref.split('/').pop(),
    semVer: expect.stringMatching(new RegExp("1.3.5\+.*\." + goodSha8))
  });
})

test('tag 2', async () => {
  await expect(SemVer(goodBaseVer[2], goodMappings, goodPrefix[0], generateContext(1, 6))).resolves.toMatchObject({
    major: 2,
    minor: 4,
    patch: 6,
    preRelease: "beta.2",
    build: expect.stringContaining(goodSha8),
    tag: goodRefAndEvent[6].ref.split('/').pop(),
    semVer: expect.stringMatching(new RegExp("2.4.6-beta.2\+.*\." + goodSha8))
  });
})

test('pr', async () => {
  await expect(SemVer(goodBaseVer[1], goodMappings, goodPrefix[2], generateContext(1, 1))).resolves.toMatchObject({
    major: 0,
    minor: 1,
    patch: 0,
    preRelease: goodPrefix[2] + "." + goodRunNo[1],
    build: expect.stringContaining(goodSha8),
    tag: "merge",
    semVer: expect.stringMatching(new RegExp("0.1.0-" + goodPrefix[2] + "." + goodRunNo[1] + "\+.*\." + goodSha8))
  });
})


// Try to call the action how GitHub would
/*
test('test runs', () => {
  process.env['INPUT_BASEVERSION'] = '1.2.3'
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecSyncOptions = {
    env: process.env
  }
  console.log(cp.execSync(`node ${ip}`, options).toString())
})
*/