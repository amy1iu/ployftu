import { DocsView } from "@/components/docs/docs-view";

export default async function DocsPage({ params }: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await params;
  return <DocsView slug={slug?.[0]} />;
}
