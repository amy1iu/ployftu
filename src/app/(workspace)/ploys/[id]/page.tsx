import { TaskPloy } from "@/components/task-ploy";

export default async function PloyPage({ params }: PageProps<"/ploys/[id]">) {
  const { id } = await params;
  return <TaskPloy id={id} />;
}
