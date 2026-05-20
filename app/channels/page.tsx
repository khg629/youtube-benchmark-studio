import { ChannelManager } from "@/components/ChannelManager";
import { listChannelCategories, listChannels } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function ChannelsPage() {
  const channels = listChannels();
  const categories = listChannelCategories();
  return <ChannelManager initialChannels={channels} initialCategories={categories} />;
}
