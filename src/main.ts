import * as core from '@actions/core';
import * as github from '@actions/github';
import {SemVer} from './version';
import fs from 'fs';

function logAndOutput(key: string, value: string): void {
  core.info(`${key}=${value}`);
  core.setOutput(key, value);
}

async function run(): Promise<void> {
  try {
    // Log the full context
    core.debug(JSON.stringify(github.context));

    // Get the base version
    const baseVer = core.getInput('baseVersion', {required: true});

    // Get the branch mappings
    const branchMappings = new Map<string, string>();
    const mappingsLines = core.getInput('branchMappings').split('\n');
    for (const mapping of mappingsLines) {
      const mappingParts = mapping.trim().split(':');
      branchMappings.set(mappingParts[0].toLowerCase(), mappingParts[1]);
    }

    // Get the pre-release prefix
    const preReleasePrefix = core.getInput('prereleasePrefix') ?? '';

    // Action Env variables
    const runNo = process.env['GITHUB_RUN_NUMBER'];
    if (runNo == null) {
      core.setFailed(`GITHUB_RUN_NUMBER is not set`);
      return;
    }
    const sha = process.env['GITHUB_SHA'];
    if (sha == null) {
      core.setFailed(`GITHUB_SHA is not set`);
      return;
    }
    const ref = process.env['GITHUB_REF'];
    if (ref == null) {
      core.setFailed(`GITHUB_REF is not set`);
      return;
    }

    // Process the input
    const verInfo = await SemVer(baseVer, branchMappings, preReleasePrefix, github.context);

    // Log and push the values back to the workflow runner
    logAndOutput('ver.tag', verInfo.tag);
    logAndOutput('ver.semver', verInfo.semVer);
    logAndOutput('ver.major', verInfo.major.toString());
    logAndOutput('ver.minor', verInfo.minor.toString());
    logAndOutput('ver.patch', verInfo.patch.toString());
    logAndOutput('ver.preRelease', verInfo.preRelease);
    logAndOutput('ver.build', verInfo.build);

    // Labels
    //logAndOutput('oci.title', TODO);
    //logAndOutput('oci.description', TODO);
    //logAndOutput('oci.url', TODO);
    //logAndOutput('oci.source', TODO);
    //logAndOutput('oci.version', TODO);
    //logAndOutput('oci.created', TODO);
    //logAndOutput('oci.revision', TODO);
    //logAndOutput('oci.licenses', TODO);

    // Write out the version file
    const verFile = core.getInput('versionFile');
    fs.writeFile(verFile, verInfo.semVer, {encoding: 'utf8'}, function (err) {
      if (err) {
        throw err;
      }

      core.info(`Wrote semver to ${verFile}`);
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
