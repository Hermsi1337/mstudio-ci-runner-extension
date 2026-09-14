import {
    Avatar,
    Badge,
    Button,
    Content,
    Heading,
    IconContainer,
    IllustratedMessage,
    Initials,
    Label,
    LabeledValue,
    Link,
    Text,
    typedList,
} from "@mittwald/flow-remote-react-components";
import { useEffect } from "react";
import type { Runner, RunnerStatus } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";
import { toMemoryGb } from "@/runner-sizes.ts";
import { RunnerActions } from "./RunnerActions.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const REFRESH_INTERVAL_MS = 15_000;
const BUSY_REFRESH_INTERVAL_MS = 5_000;
const transientStatuses: RunnerStatus[] = ["creating", "starting", "stopping"];

const providers: Runner["provider"][] = ["github", "gitlab"];
const statuses: RunnerStatus[] = [
    "running",
    "starting",
    "creating",
    "stopping",
    "stopped",
    "error",
    "missing",
];

/**
 * Initials takes the first letter of every word, so the space produces the
 * two-letter mark.
 */
const providerInitials: Record<Runner["provider"], string> = {
    github: "Git Hub",
    gitlab: "Git Lab",
};

const Runners = typedList<Runner>();

/**
 * One list row per runner. Flow's List switches between its column layout
 * and stacked rows by container width, so the same markup serves desktop and
 * phone. The header stays at the top left, the values follow in columns.
 */
export const RunnerList = ({ onCreate }: { onCreate: () => void }) => {
    const t = useTranslation();
    const { value: runners, invalidate } =
        RunnerClientGhost.listRunners().useGhost();
    const anyTransient = runners.some((r) =>
        transientStatuses.includes(r.status),
    );

    useEffect(() => {
        const timer = setInterval(
            () => void invalidate(),
            anyTransient ? BUSY_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS,
        );
        return () => clearInterval(timer);
    }, [invalidate, anyTransient]);

    const tools = runners.length > 3;

    if (runners.length === 0) {
        return (
            <IllustratedMessage>
                <IconContainer />
                <Heading>{t("runners.empty.heading")}</Heading>
                <Text>{t("runners.empty.text")}</Text>
                <Button color="primary" onPress={onCreate}>
                    {t("form.create.button")}
                </Button>
            </IllustratedMessage>
        );
    }

    return (
        <Runners.List
            aria-label={t("runners.heading")}
            batchSize={20}
            getItemId={(runner) => runner.id}
        >
            <Runners.StaticData data={runners} />
            {tools && (
                <>
                    <Runners.Search autoSubmit autoFocus={false} />
                    <Runners.Filter
                        property="provider"
                        name={t("runners.filter.provider")}
                        mode="some"
                        values={providers}
                    >
                        {(provider) => t(`provider.${provider}`)}
                    </Runners.Filter>
                    <Runners.Filter
                        property="status"
                        name={t("runners.filter.status")}
                        mode="some"
                        values={statuses}
                    >
                        {(status) => t(`status.${status}`)}
                    </Runners.Filter>
                    <Runners.Sorting
                        property="name"
                        name={t("runners.sort.name")}
                        defaultEnabled
                    />
                    <Runners.Sorting
                        property="provider"
                        name={t("runners.sort.provider")}
                    />
                </>
            )}
            <Runners.Item textValue={(runner) => runner.name}>
                {(runner) => (
                    <Runners.ItemView
                        s={[12]}
                        m={[6, 3, 3]}
                        l={[4, 2, 2, 2, 2]}
                    >
                        <Avatar
                            color={
                                runner.provider === "github" ? "violet" : "teal"
                            }
                        >
                            <Initials>
                                {providerInitials[runner.provider]}
                            </Initials>
                        </Avatar>
                        <Heading>
                            {runner.name}
                            <StatusBadge status={runner.status} />
                            {runner.ephemeral && (
                                <Badge color="violet">
                                    {t("runners.ephemeral")}
                                </Badge>
                            )}
                            {runner.updateAvailable && (
                                <Badge color="blue">
                                    {t("runners.version.updateAvailable", {
                                        version: runner.latestRunnerVersion,
                                    })}
                                </Badge>
                            )}
                        </Heading>
                        <Text>{t(`provider.${runner.provider}`)}</Text>
                        <Text>
                            <Link href={runner.targetUrl} target="_blank">
                                {runner.target}
                            </Link>
                        </Text>

                        <Content>
                            <LabeledValue>
                                <Label>
                                    {runner.provider === "gitlab"
                                        ? t("form.tags.label")
                                        : t("form.labels.label")}
                                </Label>
                                <Text>
                                    {runner.labels.length > 0
                                        ? runner.labels.join(", ")
                                        : t("runners.labels.inCiSystem")}
                                </Text>
                            </LabeledValue>
                        </Content>
                        <Content>
                            <LabeledValue>
                                <Label>{t("runners.column.size")}</Label>
                                <Text>
                                    {runner.size === "custom"
                                        ? t("form.size.customValue", {
                                              cpus: runner.cpus,
                                              memory: toMemoryGb(
                                                  runner.memoryMb,
                                              ),
                                          })
                                        : t(`form.size.${runner.size}`)}
                                    {runner.concurrency > 1 &&
                                        `, ${t("runners.concurrency", {
                                            jobs: runner.concurrency,
                                        })}`}
                                </Text>
                            </LabeledValue>
                        </Content>
                        <Content>
                            <LabeledValue>
                                <Label>{t("runners.column.cache")}</Label>
                                <Text>
                                    {runner.cache
                                        ? t("runners.cache.limit", {
                                              size: runner.cacheSizeGb,
                                          })
                                        : t("runners.cache.off")}
                                </Text>
                            </LabeledValue>
                        </Content>
                        <Content>
                            <LabeledValue>
                                <Label>{t("runners.column.version")}</Label>
                                <Text>
                                    {runner.runnerVersion ??
                                        t("runners.version.unknown")}
                                </Text>
                            </LabeledValue>
                        </Content>

                        {runner.statusMessage &&
                            (runner.status === "error" ||
                                runner.status === "missing") && (
                                <Content slot="bottom">
                                    <Text>{runner.statusMessage}</Text>
                                </Content>
                            )}

                        <RunnerActions
                            runner={runner}
                            onChanged={() => void invalidate()}
                        />
                    </Runners.ItemView>
                )}
            </Runners.Item>
        </Runners.List>
    );
};
