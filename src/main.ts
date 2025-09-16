import {getInput, setOutput, setFailed, info, platform} from '@actions/core'
import {downloadTool, cacheFile, find} from '@actions/tool-cache'
import {exec} from '@actions/exec'

async function run(): Promise<void> {
  try {
    if (platform.isWindows) {
      throw new Error('Apptainer is not supported on Windows')
    } else if (platform.isMacOS) {
      throw new Error('Apptainer is not supported on MacOS')
    }

    const {
      name: systemName, 
      version: systemVersion, 
    } = await platform.getDetails();
    if (systemName.toLowerCase() !== 'ubuntu') {
      throw new Error(`Action does not support ${systemName.toLowerCase()}`);
    }

    const versionSpec: string = getInput('apptainer-version')
    const url = `https://github.com/apptainer/apptainer/releases/download/v${versionSpec}/apptainer_${versionSpec}_amd64.deb`

    const toolName = 'apptainer'
    const fname = 'apptainer.deb'
    let cacheDir = find(toolName, versionSpec)

    if (cacheDir !== '') {
      info(`Found cache: ${cacheDir}/`)
    } else {
      info(`Dowloading ${url}`)
      const pathToDeb = await downloadTool(url)
      info('Adding deb to cache')
      cacheDir = await cacheFile(pathToDeb, fname, toolName, versionSpec)
      info(`... ${cacheDir}`)
    }

    const pathToCachedDeb = `${cacheDir}/${fname}`
    await exec('sudo', ['apt-get', 'install', '-y', pathToCachedDeb])

    const [systemMajorVersion, systemMinorVersion] = systemVersion.split('.').map(num => parseInt(num, 10));
    const [majorVersion, minorVersion] = versionSpec.split('.').map(num => parseInt(num, 10));
    // Disabling AppArmor when Singularity <= 1.3 and Ubuntu >= 23.10
    // https://github.com/apptainer/apptainer/pull/2368
    if ((majorVersion === 1 && minorVersion <= 3) && (systemMajorVersion > 23 || (systemMajorVersion === 23 && systemMinorVersion > 10))) {
      info('Disabling AppArmor restrictions on unprivileged user namespaces...');
      const sysctlConfigCommand = 'echo kernel.apparmor_restrict_unprivileged_userns=0 > /etc/sysctl.d/90-disable-userns-restrictions.conf';
      await exec('sudo', ['sh', '-c', sysctlConfigCommand]);
      await exec('sudo', ['sysctl', '-p', '/etc/sysctl.d/90-disable-userns-restrictions.conf']);
    }

    setOutput('apptainer-version', versionSpec)
  } catch (error) {
    if (error instanceof Error) setFailed(error.message)
  }
}

run()
