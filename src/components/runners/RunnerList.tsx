import {
    Avatar,
    Badge,
    Button,
    ColumnLayout,
    Content,
    Header,
    Heading,
    IconContainer,
    IllustratedMessage,
    Initials,
    Label,
    LabeledValue,
    Link,
    SearchField,
    Section,
    Segment,
    SegmentedControl,
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

const RunnerRow = ({
    runner,
    onChanged,
}: {
    runner: Runner;
    onChanged: () => void;
}) => {
    const t = useTranslation();
    return (
        <Runners.ItemView s={[12]} m={[6, 3, 3]} l={[4, 2, 2, 2, 2]}>
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
            <Text>
                {runner.tokenType === "pat"
                    ? t("runners.auth.pat")
                    : t("runners.auth.registration")}
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
                                  memory: toMemoryGb(runner.memoryMb),
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
                    <Label>{t("runners.column.imageBuilds")}</Label>
                    <Text>
                        {runner.imageBuilds
                            ? t("runners.imageBuilds.on")
                            : t("runners.imageBuilds.off")}
                    </Text>
                </LabeledValue>
            </Content>
            <Content>
                <LabeledValue>
                    <Label>{t("runners.column.version")}</Label>
                    <Text>
                        {runner.imageVersion ??
                            runner.runnerVersion ??
                            t("runners.version.unknown")}
                        {runner.imageVersion &&
                            runner.runnerVersion &&
                            ` (${runner.runnerVersion})`}
                    </Text>
                </LabeledValue>
            </Content>

            {runner.statusMessage &&
                (runner.status === "error" || runner.status === "missing") && (
                    <Content slot="bottom">
                        <Text>{runner.statusMessage}</Text>
                    </Content>
                )}

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
                    <SegmentedControl
                        aria-label={t("runners.filter.provider")}
                        value={provider}
                        onChange={(value) =>
                            setProvider(value as ProviderFilter)
                        }
                    >
                        <Segment value="all">{t("runners.filter.all")}</Segment>
                        <Segment value="github">{t("provider.github")}</Segment>
                        <Segment value="gitlab">{t("provider.gitlab")}</Segment>
                    </SegmentedControl>
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
                        batchSize={50}
                        getItemId={(runner) => runner.id}
                        hidePagination
                    >
                        <Runners.StaticData data={group.runners} />
                        <Runners.Item textValue={(runner) => runner.name}>
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
