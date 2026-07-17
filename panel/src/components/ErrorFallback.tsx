import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { FallbackProps } from 'react-error-boundary';
import { OctagonAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

//Used for global errors
export function AppErrorFallback({ error }: FallbackProps) {
    const refreshPage = () => {
        window.location.reload();
    };
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center">
            <GenericErrorBoundaryCard
                title="App Error:"
                description="Due to an unexpected error, the panel has crashed."
                error={error}
                resetButton={
                    <Button variant="outline" onClick={refreshPage}>
                        Refresh
                    </Button>
                }
            />
        </div>
    );
}

//Used for page errors (inside the shell)
export function PageErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <div className="flex w-full flex-col items-center justify-center">
            <GenericErrorBoundaryCard
                title="Page Error:"
                description="There was an error rendering this page."
                error={error}
                resetButton={
                    <Button variant="outline" onClick={resetErrorBoundary}>
                        Go Back
                    </Button>
                }
            />
        </div>
    );
}

type GenericErrorBoundaryCardProps = {
    title: string;
    description: string;
    error: unknown;
    resetButton: React.ReactNode;
};

function GenericErrorBoundaryCard(props: GenericErrorBoundaryCardProps) {
    const errorMessage = props.error instanceof Error ? props.error.message : String(props.error);
    const errorStack = props.error instanceof Error ? props.error.stack : undefined;

    return (
        <Card className="max-w-xl">
            <CardHeader>
                <h1 className="flex flex-row items-center justify-start pb-0 text-3xl text-red-500">
                    <OctagonAlertIcon className="mr-2 inline-block size-4" />
                    {props.title}
                </h1>
                <span className="text-muted-foreground pt-0 text-sm">{props.description}</span>
            </CardHeader>
            <CardContent>
                <p className="truncate">
                    Page:&nbsp;
                    <code className="text-muted-foreground">
                        {window.location.pathname ?? 'unknown'}
                        {window.location.search ?? ''}
                    </code>
                </p>
                <p>
                    Versions:&nbsp;
                    <code className="text-muted-foreground">
                        sxPanel v{window.txConsts.txaVersion} atop FXServer b{window.txConsts.fxsVersion}
                    </code>
                </p>
                <p>
                    Message:&nbsp;
                    <code className="text-muted-foreground">{errorMessage || 'unknown'}</code>
                </p>
                <p>Stack:</p>
                <pre className="mt-1">
                    <ScrollArea className="text-muted-foreground h-32 w-full rounded-sm border border-red-800 p-2 font-mono text-xs text-red-800">
                        {errorStack}
                    </ScrollArea>
                </pre>
            </CardContent>
            <CardFooter className="flex flex-row justify-between">
                {props.resetButton}
                <Button
                    asChild
                    variant="outline"
                    className="bg-discord hover:bg-discord-active animate-pulse hover:animate-none"
                >
                    <a href="https://discord.gg/hUM3pQeGFc" target="_blank" rel="noopener noreferrer">
                        Support Discord
                    </a>
                </Button>
            </CardFooter>
        </Card>
    );
}
