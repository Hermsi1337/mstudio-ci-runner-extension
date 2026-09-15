import { makeGhost } from "@mittwald/react-ghostmaker";
import { getChangelogServerFunction } from "@/serverFunctions/changelog/get-changelog.ts";
import { configureRunnerServerFunction } from "@/serverFunctions/runners/configure-runner.ts";
import { createRunnerServerFunction } from "@/serverFunctions/runners/create-runner.ts";
import { deleteRunnerServerFunction } from "@/serverFunctions/runners/delete-runner.ts";
import { getRunnerLogsServerFunction } from "@/serverFunctions/runners/get-runner-logs.ts";
import { listRunnersServerFunction } from "@/serverFunctions/runners/list-runners.ts";
import { restartRunnerServerFunction } from "@/serverFunctions/runners/restart-runner.ts";
import { updateRunnerServerFunction } from "@/serverFunctions/runners/update-runner.ts";

const runnerClient = {
    listRunners: listRunnersServerFunction,
    createRunner: createRunnerServerFunction,
    getRunnerLogs: getRunnerLogsServerFunction,
    restartRunner: restartRunnerServerFunction,
    updateRunner: updateRunnerServerFunction,
    configureRunner: configureRunnerServerFunction,
    deleteRunner: deleteRunnerServerFunction,
};

export const RunnerClientGhost = makeGhost(runnerClient);

export const ChangelogClientGhost = makeGhost({
    getChangelog: getChangelogServerFunction,
});
