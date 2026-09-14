import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    createRootRouteWithContext,
    HeadContent,
    Outlet,
    Scripts,
} from "@tanstack/react-router";
import { LocaleProvider } from "@/i18n/react.tsx";

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
                title: "mStudio CI Runner",
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
                    <LocaleProvider>
                        <Outlet />
                    </LocaleProvider>
                </QueryClientProvider>
                <Scripts />
            </body>
        </html>
    );
}
