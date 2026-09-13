import { LayoutCard } from "@mittwald/flow-remote-react-components";
import RemoteRoot from "@mittwald/flow-remote-react-components/RemoteRoot";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    Scripts,
} from "@tanstack/react-router";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";

interface RouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
    head: () => ({
        meta: [
            {
                charSet: "utf-8",
            },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1",
            },
            {
                title: "mittwald Extension",
            },
        ],
    }),

    component: RootComponent,
});

function RootComponent() {
    const { queryClient } = Route.useRouteContext();

    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                <QueryClientProvider client={queryClient}>
                    <RemoteRoot>
                        <ErrorBoundary
                            fallbackRender={(props) => (
                                <LayoutCard>
                                    <ErrorFallback
                                        error={props.error}
                                        resetErrorBoundary={
                                            props.resetErrorBoundary
                                        }
                                    />
                                </LayoutCard>
                            )}
                        >
                            <Outlet />
                        </ErrorBoundary>
                    </RemoteRoot>
                </QueryClientProvider>
                <Scripts />
            </body>
        </html>
    );
}
