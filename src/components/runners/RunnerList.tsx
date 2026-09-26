import {
    Alert,
    Avatar,
    Badge,
    Button,
    ColumnLayout,
    Content,
    Flex,
    Header,
    Heading,
    IconContainer,
    IllustratedMessage,
    Initials,
    Label,
    LabeledValue,
    Link,
    Radio,
    RadioGroup,
    SearchField,
    Section,
    Text,
    typedList,
} from "@mittwald/flow-remote-react-components";
import { useEffect, useMemo, useState } from "react";
import type { Provider, Runner, RunnerStatus } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";
import { toMemoryGb } from "@/runner-sizes.ts";
import { RunnerActions } from "./RunnerActions.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const REFRESH_INTERVAL_MS = 15_000;
const BUSY_REFRESH_INTERVAL_MS = 5_000;
const TOOLS_FROM = 4;
const transientStatuses: RunnerStatus[] = ["creating", "starting", "stopping"];

/**
 * Initials takes the first letter of every word, so the space produces the
 * two-letter mark.
 */
const providerInitials: Record<Provider, string> = {
    github: "Git Hub",
    gitlab: "Git Lab",
};

type ProviderFilter = Provider | "all";

interface TargetGroup {
    targetUrl: string;
    target: string;
    runners: Runner[];
}

function groupByTarget(runners: Runner[]): TargetGroup[] {
    const groups = new Map<string, TargetGroup>();
    for (const runner of runners) {
        const group = groups.get(runner.targetUrl) ?? {
            targetUrl: runner.targetUrl,
            target: runner.target,
            runners: [],
        };
        group.runners.push(runner);
        groups.set(runner.targetUrl, group);
    }
    for (const group of groups.values()) {
        group.runners.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...groups.values()].sort((a, b) =>
        a.target.localeCompare(b.target),
    );
}

function matches(runner: Runner, search: string): boolean {
    const needle = search.trim().toLowerCase();
    if (!needle) {
        return true;
    }
    return [runner.name, runner.target, ...runner.labels].some((value) =>
        value.toLowerCase().includes(needle),
    );
}

const Runners = typedList<Runner>();

const failedStatuses: RunnerStatus[] = ["error", "missing"];

function useSizeSummary(runner: Runner): string {
    const t = useTranslation();
    const parts = [
        t(`form.size.${runner.size}`),
        t("form.size.limits", {
            cpus: runner.cpus,
            memory: toMemoryGb(runner.memoryMb),
        }),
    ];
    if (runner.concurrency > 1) {
        parts.push(t("runners.concurrency", { jobs: runner.concurrency }));
    }
    return parts.join(", ");
}

/**
 * Only switched on features get a badge, so the row stays short. The off
 * state shows in the details of the expanded row.
 */
const FeatureBadges = ({ runner }: { runner: Runner }) => {
    const t = useTranslation();
    if (!runner.cache && !runner.imageBuilds && !runner.dockerApi) {
        return <Text>{t("runners.feature.none")}</Text>;
    }
    return (
        <Flex gap="xs" wrap="wrap">
            {runner.cache && (
                <Badge>
                    <Label>{t("runners.feature.cache")}</Label>
                    <Text>
                        {t("runners.cache.limit", { size: runner.cacheSizeGb })}
                    </Text>
                </Badge>
            )}
            {runner.imageBuilds && (
                <Badge>{t("runners.feature.imageBuilds")}</Badge>
            )}
            {runner.dockerApi && (
                <Badge>{t("runners.feature.dockerApi")}</Badge>
            )}
        </Flex>
    );
};

const RunnerDetails = ({ runner }: { runner: Runner }) => {
    const t = useTranslation();
    const size = useSizeSummary(runner);
    const details: { key: string; label: string; value: string }[] = [
        { key: "size", label: t("runners.column.size"), value: size },
        {
            key: "cache",
            label: t("runners.column.cache"),
            value: runner.cache
                ? t("runners.cache.limit", { size: runner.cacheSizeGb })
                : t("runners.cache.off"),
        },
        {
            key: "imageBuilds",
            label: t("runners.column.imageBuilds"),
            value: runner.imageBuilds
                ? t("runners.imageBuilds.on")
                : t("runners.imageBuilds.off"),
        },
        {
            key: "dockerApi",
            label: t("runners.column.dockerApi"),
            value: runner.dockerApi
                ? t("runners.dockerApi.on")
                : t("runners.dockerApi.off"),
        },
        {
            key: "version",
            label: t("runners.column.version"),
            value: `${
                runner.imageVersion ??
                runner.runnerVersion ??
                t("runners.version.unknown")
            }${
                runner.imageVersion && runner.runnerVersion
                    ? ` (${runner.runnerVersion})`
                    : ""
            }`,
        },
        {
            key: "auth",
            label: t("runners.column.auth"),
            value:
                runner.tokenType === "pat"
                    ? t("runners.auth.pat")
                    : t("runners.auth.registration"),
        },
    ];
    return (
        <ColumnLayout s={[1]} m={[1, 1, 1]}>
            {details.map((detail) => (
                <LabeledValue key={detail.key}>
                    <Label>{detail.label}</Label>
                    <Text>{detail.value}</Text>
                </LabeledValue>
            ))}
        </ColumnLayout>
    );
};

/**
 * Header plus one content column, so no breakpoint pushes a column into a
 * second row under the avatar. Everything the row does not show waits in the
 * expanded part.
 */
const RunnerRow = ({
    runner,
    onChanged,
}: {
    runner: Runner;
    onChanged: () => void;
}) => {
    const t = useTranslation();
    const size = useSizeSummary(runner);
    const version = runner.imageVersion ?? runner.runnerVersion;
    return (
        <Runners.ItemView s={[1]} m={[1, 1]} l={[3, 2]}>
            <Avatar color={runner.provider === "github" ? "violet" : "teal"}>
                <Initials>{providerInitials[runner.provider]}</Initials>
            </Avatar>
            <Heading>
                {runner.studioUrl ? (
                    <Link href={runner.studioUrl} target="_blank">
                        {runner.name}
                    </Link>
                ) : (
                    runner.name
                )}
                <StatusBadge status={runner.status} />
                {runner.ephemeral && (
                    <Badge color="violet">{t("runners.ephemeral")}</Badge>
                )}
                {runner.updateAvailable && (
                    <Badge color="blue">
                        {runner.latestImageVersion
                            ? t("runners.version.updateAvailable", {
                                  version: runner.latestImageVersion,
                              })
                            : t("runners.version.updateAvailablePlain")}
                    </Badge>
                )}
            </Heading>
            <Text>{t(`provider.${runner.provider}`)}</Text>
            <Text>{size}</Text>
            {version && <Text>{version}</Text>}

            <Content>
                <Flex gap="xl" wrap="wrap">
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
                    <LabeledValue>
                        <Label>{t("runners.column.features")}</Label>
                        <FeatureBadges runner={runner} />
                    </LabeledValue>
                </Flex>
            </Content>

            <Content slot="bottom">
                {runner.statusMessage &&
                    failedStatuses.includes(runner.status) && (
                        <Alert status="danger">
                            <Heading>{t(`status.${runner.status}`)}</Heading>
                            <Text>{runner.statusMessage}</Text>
                        </Alert>
                    )}
                <RunnerDetails runner={runner} />
            </Content>

            <RunnerActions runner={runner} onChanged={onChanged} />
        </Runners.ItemView>
    );
};

/**
 * Runners grouped by their registration target, one Flow list per group.
 * Flow's list switches between its column layout and stacked rows by
 * container width, so the same markup serves desktop and phone.
 */
export const RunnerList = ({ onCreate }: { onCreate: () => void }) => {
    const t = useTranslation();
    const { value: runners, invalidate } =
        RunnerClientGhost.listRunners().useGhost();
    const [search, setSearch] = useState("");
    const [provider, setProvider] = useState<ProviderFilter>("all");
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

    const groups = useMemo(
        () =>
            groupByTarget(
                runners.filter(
                    (runner) =>
                        (provider === "all" || runner.provider === provider) &&
                        matches(runner, search),
                ),
            ),
        [runners, provider, search],
    );

    const filtering = search !== "" || provider !== "all";

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
        <>
            {(runners.length >= TOOLS_FROM || filtering) && (
                <ColumnLayout s={[1]} m={[1, 1]}>
                    <SearchField
                        aria-label={t("runners.search")}
                        value={search}
                        onChange={setSearch}
                    />
                    <RadioGroup
                        aria-label={t("runners.filter.provider")}
                        value={provider}
                        onChange={(value) =>
                            setProvider(value as ProviderFilter)
                        }
                        s={[1, 1, 1]}
                    >
                        <Radio value="all">{t("runners.filter.all")}</Radio>
                        <Radio value="github">{t("provider.github")}</Radio>
                        <Radio value="gitlab">{t("provider.gitlab")}</Radio>
                    </RadioGroup>
                </ColumnLayout>
            )}
            {groups.length === 0 && (
                <IllustratedMessage>
                    <IconContainer />
                    <Heading>{t("runners.noMatch.heading")}</Heading>
                    <Text>{t("runners.noMatch.text")}</Text>
                </IllustratedMessage>
            )}
            {groups.map((group) => (
                <Section key={group.targetUrl}>
                    <Header>
                        <Heading level={3}>
                            <Link href={group.targetUrl} target="_blank">
                                {group.target}
                            </Link>
                            <Badge>
                                {group.runners.length === 1
                                    ? t("runners.group.one")
                                    : t("runners.group.many", {
                                          count: group.runners.length,
                                      })}
                            </Badge>
                        </Heading>
                    </Header>
                    <Runners.List
                        aria-label={group.target}
                        accordion
                        batchSize={50}
                        getItemId={(runner) => runner.id}
                        hidePagination
                    >
                        <Runners.StaticData data={group.runners} />
                        <Runners.Item
                            textValue={(runner) => runner.name}
                            defaultExpanded={(runner) =>
                                failedStatuses.includes(runner.status)
                            }
                        >
                            {(runner) => (
                                <RunnerRow
                                    runner={runner}
                                    onChanged={() => void invalidate()}
                                />
                            )}
                        </Runners.Item>
                    </Runners.List>
                </Section>
            ))}
        </>
    );
};
