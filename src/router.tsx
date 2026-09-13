import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
    const queryClient = new QueryClient();
    const router = createRouter({
        routeTree,
        scrollRestoration: true,
        context: {
            queryClient,
        },
    });

    setupRouterSsrQueryIntegration({
        router,
        queryClient,
        wrapQueryClient: false,
    });

    return router;
};
