import type { NewsItem } from "../lib/api";
import { Badge } from "../design-system/Badge";

export const isFiling = (link: string) => /^https:\/\/[^/]*(bseindia|nseindia)\.com\/.*\.pdf$/i.test(link);

export default function FilingPDF({ pid, item }: { pid: string; item: NewsItem }) {
  if (!isFiling(item.link)) return null;
  return (
    <Badge icon="download" href={`/api/portfolios/${pid}/news/${item.id}/pdf`} download title="Download the filing as a PDF">
      PDF
    </Badge>
  );
}
