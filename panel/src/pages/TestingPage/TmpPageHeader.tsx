import { PageHeader, PageHeaderChangelog, PageHeaderLinks } from '@/components/page-header';
import { AmpersandIcon, Settings2Icon } from 'lucide-react';

const Divider = () => <AmpersandIcon className="mx-auto size-6" />;
const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="border border-transparent hover:border-fuchsia-500">{children}</div>
);

export default function TmpPageHeader() {
    return (
        <div className="flex h-full w-full flex-col gap-4">
            <Wrapper>
                <PageHeader title="Simple" icon={<Settings2Icon />} />
            </Wrapper>
            <Divider />
            <Wrapper>
                <PageHeader title="Simple + custom" icon={<Settings2Icon />}>
                    <div className="text-xs">example</div>
                </PageHeader>
            </Wrapper>
            <Divider />
            <Wrapper>
                <PageHeader title="Simple + links" icon={<Settings2Icon />}>
                    <PageHeaderLinks
                        topLabel="Documentation"
                        topLink="https://sxpanel.org/docs/"
                        bottomLabel="Support"
                        bottomLink="https://discord.gg/6FcqBYwxH5"
                    />
                </PageHeader>
            </Wrapper>
            <Divider />
            <Wrapper>
                <PageHeader title="Simple + changelog" icon={<Settings2Icon />}>
                    <PageHeaderChangelog changelogData={[{ author: 'snipz', keys: [], ts: 0 }]} />
                </PageHeader>
            </Wrapper>
            <Divider />
            <Wrapper>
                <PageHeader icon={<Settings2Icon />} title="Breadcrumbs" parentName="Parent" parentLink="/parent" />
            </Wrapper>
            <Divider />
            <Wrapper>
                <PageHeader icon={<Settings2Icon />} title="Breadcrumbs" parentName="Parent" parentLink="/parent">
                    <PageHeaderChangelog changelogData={[{ author: 'snipz', keys: [], ts: 1741168243520 }]} />
                </PageHeader>
            </Wrapper>
            <Divider />
            <Wrapper>
                <PageHeader title="Simple + empty changelog" icon={<Settings2Icon />}>
                    <PageHeaderChangelog changelogData={[]} />
                </PageHeader>
            </Wrapper>
        </div>
    );
}
